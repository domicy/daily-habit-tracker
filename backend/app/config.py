from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+asyncmy://root:secret@db:3306/habits"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 720

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
