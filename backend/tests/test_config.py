import importlib

import pytest


def test_missing_env_vars_raises_clear_error(monkeypatch, tmp_path):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    # pydantic-settings reads a sibling .env if present; chdir to an
    # empty tmp dir so the test doesn't pick up a developer's local one.
    monkeypatch.chdir(tmp_path)

    import app.config

    with pytest.raises(RuntimeError) as exc_info:
        importlib.reload(app.config)

    message = str(exc_info.value)
    assert "DATABASE_URL" in message
    assert "JWT_SECRET" in message
    assert ".env.example" in message

    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite://")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    importlib.reload(app.config)
