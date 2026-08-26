import hmac
import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import RegisterRequest, TokenRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    salt = uuid.uuid4().hex
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 240_000)
    return f"pbkdf2_sha256$240000${salt}${digest.hex()}"


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split("$", 3)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
        return algorithm == "pbkdf2_sha256" and hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _email(value: str) -> str:
    value = value.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise HTTPException(status_code=422, detail="Invalid email")
    return value


def _token(user_id: str) -> TokenResponse:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    return TokenResponse(access_token=jwt.encode({"sub": user_id, "exp": expire}, settings.jwt_secret, algorithm=settings.jwt_algorithm))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    email = _email(body.email)
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, password_hash=_hash_password(body.password))
    db.add(user)
    await db.commit()
    return _token(user.id)


@router.post("/token", response_model=TokenResponse)
async def issue_token(body: TokenRequest) -> TokenResponse:
    if body.secret is not None:
        if not hmac.compare_digest(body.secret, settings.jwt_secret):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid secret")
        return _token("user")
    raise HTTPException(status_code=422, detail="Email and password are required")


@router.post("/login", response_model=TokenResponse)
async def login(body: TokenRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not body.email or not body.password:
        raise HTTPException(status_code=422, detail="Email and password are required")
    user = await db.scalar(select(User).where(User.email == _email(body.email)))
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _token(user.id)
