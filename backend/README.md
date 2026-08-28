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
PYTHONPATH=. alembic upgrade head

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

### Backend verification in CI / Codex

The authoritative backend verification is the `backend-tests` GitHub Actions
job. It installs the backend requirements, applies the Alembic migrations, and
runs the complete pytest suite with the coverage gate.

In the restricted Codex sandbox, the local `aiosqlite` test path can hang while
its worker thread tries to wake the asyncio event loop. This is a sandbox
process-isolation limitation, not an application test result. For local
verification, run the backend suite with unrestricted execution, or rely on
the required GitHub Actions backend check before merging:

```bash
pytest --cov=app --cov-report=term-missing --cov-fail-under=85
```

Do not treat a restricted-sandbox hang as a passing or failing backend result;
use unrestricted execution or CI verification instead.

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

### Legacy data: claiming pre-multi-user habits and logs

**This applies to any deployment that ran before the multi-user migration (004),
including production, which held real habits and logs at the time of this change.
Skip it only for a brand-new, empty database.**

Migration `004` adds ownership to `habits` and `habit_logs` and assigns every
pre-existing row to a sentinel user, `00000000-0000-0000-0000-000000000000`. That
account cannot be logged into — its password is PBKDF2 of a constant with a salt
the migration discards — and every API read is scoped to the caller's own user id.
Until the rows are claimed they are intact in the database and reachable by nobody.

Deploy in this order:

```bash
# 1. Count what you have, before touching anything.
docker compose exec db mariadb -uroot -p habits \
  -e "SELECT (SELECT COUNT(*) FROM habits) AS habits,
             (SELECT COUNT(*) FROM habit_logs) AS logs;"

# 2. Migrate.
docker compose exec api sh -c "PYTHONPATH=. alembic upgrade head"

# 3. Register the account that should own the data (mobile app, or curl).
curl -X POST https://your-host/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'

# 4. Preview the claim, then run it.
docker compose exec api python -m app.claim_legacy --email you@example.com --dry-run
docker compose exec api python -m app.claim_legacy --email you@example.com

# 5. Confirm the counts match step 1 and nothing is left on the sentinel.
docker compose exec db mariadb -uroot -p habits \
  -e "SELECT user_id, COUNT(*) FROM habits GROUP BY user_id;
      SELECT COUNT(*) AS stranded FROM habits
       WHERE user_id = '00000000-0000-0000-0000-000000000000';"
```

The claim runs in one transaction and is idempotent — a second run reports zero
rows. It moves ownership only; it never deletes habits or logs. It refuses an
email that is not already registered, so a typo fails loudly rather than
stranding the data under a new empty account.

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
