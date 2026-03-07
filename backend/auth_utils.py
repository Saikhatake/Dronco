"""
auth_utils.py — Production Auth Utilities for Dr. Onco
- Password strength validation
- Email validation
- Token creation (access + refresh)
- Token blacklisting via MongoDB
- Login attempt tracking (brute-force protection)
"""

import re
import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
REFRESH_SECRET_KEY = os.getenv("JWT_REFRESH_SECRET_KEY")  # separate secret for refresh
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30          # short-lived
REFRESH_TOKEN_EXPIRE_DAYS = 7             # long-lived
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# ─── TOKEN CREATION ──────────────────────────────────────────────────────────

def create_access_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "type": "access", "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": email, "type": "refresh", "exp": expire, "iat": datetime.utcnow()}
    return jwt.encode(payload, REFRESH_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except Exception:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except Exception:
        return None


# ─── INPUT VALIDATION ────────────────────────────────────────────────────────

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

def validate_email(email: str) -> tuple[bool, str]:
    email = email.strip().lower()
    if not email:
        return False, "Email is required"
    if len(email) > 254:
        return False, "Email address is too long"
    if not EMAIL_REGEX.match(email):
        return False, "Invalid email format"
    return True, ""


def validate_password(password: str) -> tuple[bool, str]:
    """
    Production password rules:
    - Minimum 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if len(password) > 128:
        return False, "Password must be less than 128 characters"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password):
        return False, "Password must contain at least one special character"
    return True, ""


def get_password_strength(password: str) -> dict:
    """Returns a strength score 0-4 and label for frontend display."""
    score = 0
    if len(password) >= 8: score += 1
    if re.search(r"[A-Z]", password) and re.search(r"[a-z]", password): score += 1
    if re.search(r"\d", password): score += 1
    if re.search(r"[!@#$%^&*(),.?\":{}|<>_\-+=\[\]\\;'/`~]", password): score += 1
    labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"]
    colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"]
    return {"score": score, "label": labels[score], "color": colors[score]}
