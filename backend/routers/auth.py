import re

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from db import get_db
from models import User
from schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from logging_config import get_logger

logger = get_logger("auth_router")

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):

    email = payload.email.strip().lower()

    if not EMAIL_RE.match(email):
        return JSONResponse(status_code=400, content={"success": False, "message": "Invalid email address."})

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return JSONResponse(status_code=409, content={"success": False, "message": "An account with this email already exists."})

    user = User(email=email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("user registered user_id=%s", user.id)

    token = create_access_token(user.id)
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):

    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Constant-shape response regardless of which check fails, to avoid
    # leaking whether an email is registered.
    if user is None or not verify_password(payload.password, user.password_hash):
        logger.info("login failed email=%s", email)
        return JSONResponse(status_code=401, content={"success": False, "message": "Invalid email or password."})

    logger.info("login success user_id=%s", user.id)

    token = create_access_token(user.id)
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # JWTs are stateless; logout is a client-side token discard. This
    # endpoint exists for a consistent API surface / future blacklist hook.
    logger.info("logout user_id=%s", current_user.id)
    return {"success": True, "message": "Logged out."}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"success": True, "user": UserOut.model_validate(current_user)}
