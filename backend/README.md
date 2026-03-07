# Habit Tracker — Backend

FastAPI application that powers the Habit Tracker mobile app.

## Quick Start

```bash
# Create a virtualenv and install dependencies
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Copy the example env file and edit as needed
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start the development server
uvicorn app.main:app --reload --port 8000
```

## Running with Docker Compose

```bash
docker compose up -d
```

This starts:
- **db** — MariaDB 11 on port 3306.
- **api** — FastAPI on port 8000.

## Running Tests

```bash
pytest
```

## Deployment

### Docker Compose (basic)

The default `docker-compose.yml` is suitable for single-server deployments.
Configure production secrets through a `.env` file rather than the example
defaults:

```bash
cp .env.example .env
# Edit .env with real database credentials, JWT secret, etc.
docker compose up -d
```

### Exposing the API with Cloudflare Tunnels

Cloudflare Tunnels let you securely expose `localhost:8000` to the internet
without opening inbound ports or configuring a reverse proxy.

**Option A — Docker Compose (recommended)**

1. Create a tunnel and download the credentials JSON from Cloudflare
   (see [`docs/cloudflare-tunnel-setup.md`](../docs/cloudflare-tunnel-setup.md)
   for the full walkthrough).
2. Edit `cloudflared-config.yml` — set your tunnel UUID and hostname.
3. Place your credentials JSON next to the compose file (or set
   `CLOUDFLARED_CREDENTIALS_FILE` to its path).
4. Start everything including the tunnel:

   ```bash
   docker compose --profile tunnel up -d
   ```

**Option B — Standalone `cloudflared` / systemd**

Install `cloudflared` on the host, authenticate, create a tunnel, and run it
as a systemd service. The full guide is at
[`docs/cloudflare-tunnel-setup.md`](../docs/cloudflare-tunnel-setup.md).
