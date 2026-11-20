"""
auth_extra.py
=========================================================
Real email/password REGISTER and LOGIN routes.
Separate from the existing Google OAuth login in main.py —
this gives the frontend's email/password form (currently
fake/localStorage-only) a real backend to talk to.

Add to main.py:
    from auth_extra import router as auth_extra_router
    app.include_router(auth_extra_router)
=========================================================
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from security import hash_password, verify_password, create_access_token

import mysql.connector
import os

router = APIRouter(prefix="/auth", tags=["auth-extra"])


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )


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


# =========================================================
# REGISTER
# =========================================================

@router.post("/register")
def register(data: RegisterRequest):

    if data.role not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT user_id FROM users WHERE email = %s",
            (data.email,)
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
            (data.name, data.email, hashed, data.role)
        )

        conn.commit()
        user_id = cursor.lastrowid

        return {
            "success": True,
            "user_id": user_id,
            "role": data.role
        }

    finally:
        cursor.close()
        conn.close()


# =========================================================
# LOGIN
# =========================================================

@router.post("/login")
def login(data: LoginRequest):

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT user_id, name, email, password, role FROM users WHERE email = %s",
            (data.email,)
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

        return {
            "success": True,
            "token": token,
            "user": {
                "id": user["user_id"],
                "name": user["name"],
                "role": user["role"] or "student"
            }
        }

    finally:
        cursor.close()
        conn.close()