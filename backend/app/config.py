from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # No defaults for secrets: missing env vars should fail loudly at
    # startup rather than silently fall back to a hardcoded credential.
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 720

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
