import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_issue_token(client: AsyncClient):
    resp = await client.post("/auth/token", json={"device_id": "phone-1"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
