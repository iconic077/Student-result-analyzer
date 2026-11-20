"""
auth_extra.py
=========================================================
Real email/password REGISTER and LOGIN routes.
Separate from the existing Google OAuth login in main.py —
these routes also create the session used by the app's task APIs.
=========================================================
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

from security import hash_password, verify_password, create_access_token

from datetime import datetime
from email.message import EmailMessage
import hashlib
import hmac
import logging
import mysql.connector
import os
import secrets
import smtplib
import ssl

router = APIRouter(prefix="/auth", tags=["auth-extra"])
logger = logging.getLogger(__name__)
RESET_CODE_TTL_MINUTES = 10
RESET_CODE_COOLDOWN_SECONDS = 60
RESET_CODE_MAX_ATTEMPTS = 5
RESET_REQUEST_MESSAGE = (
    "If an account exists for that email, a verification code has been sent."
)


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )


def _ensure_student_profile(cursor, user_id, name):
    cursor.execute(
        "SELECT student_id FROM users WHERE user_id = %s",
        (user_id,)
    )
    user = cursor.fetchone()
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if user["student_id"] is not None:
        return user["student_id"]

    cursor.execute(
        """
        INSERT INTO students (roll_no, name)
        VALUES (%s, %s)
        """,
        (f"SS-{user_id}", name or f"StudySync Student {user_id}")
    )
    student_id = cursor.lastrowid
    cursor.execute(
        "UPDATE users SET student_id = %s WHERE user_id = %s",
        (student_id, user_id)
    )
    return student_id


# =========================================================
# REQUEST SCHEMAS
# =========================================================

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str


def _ensure_reset_table(cursor):
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            email VARCHAR(254) NOT NULL PRIMARY KEY,
            code_hash CHAR(64) NOT NULL,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            attempts TINYINT UNSIGNED NOT NULL DEFAULT 0
        ) ENGINE=InnoDB
        """
    )


def _smtp_settings():
    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM_EMAIL")

    if not all((host, username, password, sender)):
        raise HTTPException(
            status_code=503,
            detail="Password recovery is not configured. Please contact support."
        )

    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail="Password recovery email service is misconfigured."
        ) from error

    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
    return host, port, username, password, sender, use_tls


def _send_reset_code(email, code, settings):
    host, port, username, password, sender, use_tls = settings
    message = EmailMessage()
    message["Subject"] = "Your StudySync password reset code"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        "Use this verification code to reset your StudySync password: "
        f"{code}\n\nThe code expires in {RESET_CODE_TTL_MINUTES} minutes. "
        "If you did not request a reset, you can ignore this email."
    )

    with smtplib.SMTP(host, port, timeout=15) as server:
        if use_tls:
            server.starttls(context=ssl.create_default_context())
        server.login(username, password)
        server.send_message(message)


def _hash_reset_code(email, code):
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is required to hash password reset codes")

    return hmac.new(
        secret.encode("utf-8"),
        f"{email}:{code}".encode("utf-8"),
        hashlib.sha256
    ).hexdigest()


# =========================================================
# REGISTER
# =========================================================

@router.post("/register")
def register(data: RegisterRequest, request: Request):

    if data.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only student accounts can be created through public registration"
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long"
        )

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    email = str(data.email).strip().lower()
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT user_id FROM users WHERE LOWER(email) = %s",
            (email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=409,
                detail="Email already registered"
            )

        hashed = hash_password(data.password)

        cursor.execute(
            """
            INSERT INTO users (name, email, password, role)
            VALUES (%s, %s, %s, %s)
            """,
            (name, email, hashed, data.role)
        )

        user_id = cursor.lastrowid
        _ensure_student_profile(cursor, user_id, name)
        conn.commit()

        token = create_access_token(
            user_id=user_id,
            role=data.role,
            name=name
        )
        request.session.clear()
        request.session["user_id"] = user_id
        request.session["user_name"] = name
        request.session["user_email"] = email

        return {
            "success": True,
            "user_id": user_id,
            "token": token,
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "role": data.role
            }
        }

    finally:
        cursor.close()
        conn.close()


# =========================================================
# LOGIN
# =========================================================

@router.post("/login")
def login(data: LoginRequest, request: Request):
    email = str(data.email).strip().lower()

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT user_id, name, email, password, role
            FROM users
            WHERE LOWER(email) = %s
            """,
            (email,)
        )

        user = cursor.fetchone()

        if not user or not user.get("password"):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        if not verify_password(data.password, user["password"]):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        token = create_access_token(
            user_id=user["user_id"],
            role=user["role"] or "student",
            name=user["name"]
        )

        if (user["role"] or "student") == "student":
            _ensure_student_profile(
                cursor,
                user["user_id"],
                user["name"]
            )
            conn.commit()

        request.session.clear()
        request.session["user_id"] = user["user_id"]
        request.session["user_name"] = user["name"]
        request.session["user_email"] = user["email"]

        return {
            "success": True,
            "token": token,
            "user": {
                "id": user["user_id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"] or "student"
            }
        }

    finally:
        cursor.close()
        conn.close()


# =========================================================
# PASSWORD RESET
# =========================================================

@router.post("/password-reset/request")
def request_password_reset(data: PasswordResetRequest):
    email = str(data.email).strip().lower()
    smtp = _smtp_settings()
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        _ensure_reset_table(cursor)
        cursor.execute(
            "SELECT user_id FROM users WHERE LOWER(email) = %s",
            (email,)
        )
        if cursor.fetchone() is None:
            return {"message": RESET_REQUEST_MESSAGE}

        cursor.execute(
            """
            SELECT 1
            FROM password_reset_codes
            WHERE email = %s
              AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL %s SECOND)
            """,
            (email, RESET_CODE_COOLDOWN_SECONDS)
        )
        if cursor.fetchone():
            return {"message": RESET_REQUEST_MESSAGE}

        cursor.execute(
            "DELETE FROM password_reset_codes WHERE email = %s",
            (email,)
        )
        cursor.execute(
            """
            INSERT INTO password_reset_codes
                (email, code_hash, created_at, expires_at, attempts)
            VALUES
                (%s, %s, UTC_TIMESTAMP(),
                 DATE_ADD(UTC_TIMESTAMP(), INTERVAL %s MINUTE), 0)
            """,
            (email, _hash_reset_code(email, code), RESET_CODE_TTL_MINUTES)
        )
        conn.commit()

        try:
            _send_reset_code(email, code, smtp)
        except (OSError, smtplib.SMTPException) as error:
            logger.exception("Could not send password reset email")
            cursor.execute(
                "DELETE FROM password_reset_codes WHERE email = %s",
                (email,)
            )
            conn.commit()
            raise HTTPException(
                status_code=503,
                detail="Password reset email could not be sent. Please try again later."
            ) from error

        return {"message": RESET_REQUEST_MESSAGE}
    finally:
        cursor.close()
        conn.close()


@router.post("/password-reset/confirm")
def confirm_password_reset(data: PasswordResetConfirm):
    email = str(data.email).strip().lower()
    if len(data.code) != 6 or not data.code.isdecimal():
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long"
        )

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        _ensure_reset_table(cursor)
        cursor.execute(
            """
            SELECT code_hash, attempts
            FROM password_reset_codes
            WHERE email = %s AND expires_at > UTC_TIMESTAMP()
            """,
            (email,)
        )
        reset = cursor.fetchone()
        if reset is None or reset["attempts"] >= RESET_CODE_MAX_ATTEMPTS:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        expected_hash = _hash_reset_code(email, data.code)
        if not hmac.compare_digest(expected_hash, reset["code_hash"]):
            cursor.execute(
                """
                UPDATE password_reset_codes
                SET attempts = attempts + 1
                WHERE email = %s
                """,
                (email,)
            )
            conn.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        cursor.execute(
            "UPDATE users SET password = %s WHERE LOWER(email) = %s",
            (hash_password(data.new_password), email)
        )
        if cursor.rowcount != 1:
            raise HTTPException(status_code=400, detail="Invalid or expired reset code")

        cursor.execute(
            "DELETE FROM password_reset_codes WHERE email = %s",
            (email,)
        )
        conn.commit()
        return {"success": True, "message": "Password reset successfully"}
    finally:
        cursor.close()
        conn.close()