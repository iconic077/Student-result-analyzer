"""
security.py
=========================================================
Password hashing + JWT auth + role-based access control
for FastAPI. Works alongside the existing Google OAuth /
session-based login already in main.py — this is a SEPARATE
auth path for email/password login.
=========================================================
"""

import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET missing. Set it in backend/.env")

bearer_scheme = HTTPBearer(auto_error=False)


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(plain_password: str) -> str:
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


# =========================================================
# JWT CREATE / VERIFY
# =========================================================

def create_access_token(user_id: int, role: str, name: str) -> str:
    payload = {
        "id": user_id,
        "role": role,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid token"
        )


# =========================================================
# DEPENDENCIES (use these in route signatures)
# =========================================================

def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> dict:
    """
    Usage in a route:
        @app.get("/something")
        def route(user = Depends(verify_token)):
            user["id"], user["role"], user["name"]
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No token provided"
        )

    token = credentials.credentials
    return decode_access_token(token)


def require_role(*allowed_roles: str):
    """
    Usage in a route:
        @app.post("/students")
        def route(user = Depends(require_role("teacher", "admin"))):
            ...
    """
    def role_checker(user: dict = Depends(verify_token)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied for this role"
            )
        return user

    return role_checker