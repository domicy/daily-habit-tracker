from pydantic import ValidationError
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # No defaults for secrets: missing env vars should fail loudly at
    # startup rather than silently fall back to a hardcoded credential.
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 720

    model_config = {"env_file": ".env", "extra": "ignore"}


try:
    settings = Settings()
except ValidationError as exc:
    missing = sorted(
        {
            str(err["loc"][0]).upper()
            for err in exc.errors()
            if err.get("type") == "missing" and err.get("loc")
        }
    )
    if not missing:
        raise
    raise RuntimeError(
        "Missing required environment variable(s): "
        + ", ".join(missing)
        + ". Set them in the process environment or a .env file "
        "(see backend/.env.example)."
    ) from exc
