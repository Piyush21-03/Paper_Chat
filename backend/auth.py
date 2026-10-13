"""Authentication: password hashing (stdlib pbkdf2, no extra native
dependency), JWT issuing/verification, and FastAPI dependencies for
protecting routes. Modular by design so an OAuth provider can be added
later alongside (not instead of) password auth.
"""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from config import settings
from db import get_db
from models import User
from logging_config import get_logger

logger = get_logger("auth")

PBKDF2_ITERATIONS = 260_000
_bearer_scheme = HTTPBearer(auto_error=False)


# ========================================
# Password hashing (PBKDF2-HMAC-SHA256, stdlib only)
# ========================================

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        scheme, iterations, salt, digest_hex = stored_hash.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        computed = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(computed.hex(), digest_hex)
    except Exception:
        return False


# ========================================
# JWT
# ========================================

def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Returns the user_id (sub) if the token is valid and unexpired,
    else None. Never raises to the caller."""

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ========================================
# FastAPI dependencies
# ========================================

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user_id = decode_access_token(credentials.credentials)

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        return None
    return db.get(User, user_id)
