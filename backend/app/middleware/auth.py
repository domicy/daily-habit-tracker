from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User

_scheme = HTTPBearer()


async def require_token(
    creds: HTTPAuthorizationCredentials = Depends(_scheme),
) -> dict:
    try:
        payload = jwt.decode(
            creds.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload


def user_id_from_token(payload: dict) -> str:
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token subject missing")
    return user_id


async def current_user(
    token: dict = Depends(require_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the token subject to a real account.

    A well-formed signature is not enough: every write stamps ``user_id`` from
    the subject, so a subject naming no row in ``users`` produces data owned by
    nobody and visible to nobody. Rejecting it here means no request handler has
    to remember the check, and a token for a since-deleted account fails with a
    401 instead of an integrity error.
    """
    user = await db.scalar(select(User).where(User.id == user_id_from_token(token)))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is not a known account",
        )
    return user
