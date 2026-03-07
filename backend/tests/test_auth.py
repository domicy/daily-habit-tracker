import pytest
from httpx import AsyncClient
from jose import jwt

from app.config import settings


@pytest.mark.asyncio
async def test_issue_token_valid_secret(client: AsyncClient):
    resp = await client.post("/auth/token", json={"secret": settings.jwt_secret})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    # Verify the token is a valid JWT
    payload = jwt.decode(
        data["access_token"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
    assert payload["sub"] == "user"
    assert "exp" in payload


@pytest.mark.asyncio
async def test_issue_token_invalid_secret(client: AsyncClient):
    resp = await client.post("/auth/token", json={"secret": "wrong-secret"})
    assert resp.status_code == 401
    assert "Invalid secret" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_issue_token_missing_secret(client: AsyncClient):
    resp = await client.post("/auth/token", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_protected_endpoint_no_token(client: AsyncClient):
    resp = await client.get("/habits/")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_protected_endpoint_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.get("/habits/", headers=expired_auth_header)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_invalid_token(client: AsyncClient):
    headers = {"Authorization": "Bearer not-a-real-jwt-token"}
    resp = await client.get("/habits/", headers=headers)
    assert resp.status_code == 401
