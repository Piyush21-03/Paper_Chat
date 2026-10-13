# PaperChat — Deployment Guide

## 1. Local Development (SQLite, quickest path)

```bash
cp .env.example .env
# Edit .env: set GOOGLE_API_KEY at minimum. Leave DATABASE_URL as the
# sqlite default and REDIS_URL empty for local dev.

docker compose up -d          # starts Qdrant only
pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000` → you'll land on `login.html` (the shell
requires auth). Register an account, then use the app normally.

## 2. Environment Variables

All configuration is centralized in `backend/config.py`, env-driven with
safe local-dev defaults. See `.env.example` for the full list:

| Variable | Purpose | Local default |
|---|---|---|
| `GOOGLE_API_KEY` | Gemini access | — (required) |
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./paperchat.db` |
| `QDRANT_URL` | Vector DB | `http://localhost:6333` |
| `REDIS_URL` | Rate limiting + RQ jobs | empty (disabled) |
| `JOB_BACKEND` | `inline` or `rq` | `inline` |
| `JWT_SECRET` | Token signing | insecure dev default — **must** change in prod |
| `JWT_EXPIRE_MINUTES` | Session length | 10080 (7 days) |
| `CORS_ORIGINS` | Comma-separated allowed origins | `*` |
| `MAX_UPLOAD_MB` | Upload size limit | 20 |
| `RATE_LIMIT_PER_MINUTE` | General API limit | 60 |
| `AUTH_RATE_LIMIT_PER_MINUTE` | Login/register limit | 10 |
| `ENVIRONMENT` | `development` / `production` | `development` |

## 3. Docker (full production stack)

```bash
cp .env.example .env   # fill in GOOGLE_API_KEY, JWT_SECRET, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

This starts: `api` (FastAPI, port 8000), `postgres`, `redis`, `qdrant`.
Local dev's plain `docker-compose.yml` (Qdrant only) is untouched and
still works for SQLite-based development.

To run background jobs through Redis/RQ instead of in-process:

```bash
JOB_BACKEND=rq docker compose -f docker-compose.prod.yml --profile rq up -d --build
```

This additionally starts a `worker` container running
`rq worker paperchat`. If `JOB_BACKEND=rq` but Redis is unreachable, the
API automatically falls back to inline processing (logged as a
warning) rather than dropping jobs.

## 4. PostgreSQL Setup

Managed by `docker-compose.prod.yml` automatically. To point at an
external Postgres instead:

```
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME
```

Tables are created automatically on API startup (`init_db()` — no
separate migration tool is wired in yet; see Limitations). For a fresh
Postgres instance, no manual schema setup is needed.

## 5. Qdrant Setup

```bash
docker run -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

or use the `qdrant` service in either compose file. Set `QDRANT_URL`
accordingly. No collection setup needed — it's created lazily on first
document upload.

## 6. Redis Setup (optional)

Only needed for: (a) rate limiting that's consistent across multiple
API instances, (b) the `rq` background job backend.

```bash
docker run -p 6379:6379 redis:7-alpine
```

Without Redis, rate limiting falls back to a per-process in-memory
counter (fine for a single instance) and jobs run inline.

## 7. Production Startup

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # check health
curl http://localhost:8000/health                     # liveness
curl http://localhost:8000/health/ready                # readiness (DB/Qdrant/Redis)
```

Set `ENVIRONMENT=production` and a real `JWT_SECRET` — the app logs a
warning at startup if it detects the insecure default secret in
production.

## 8. Health Checks

- `GET /health` — liveness, no dependencies checked.
- `GET /health/ready` — checks database, Qdrant, and Redis (if
  configured); returns 503 if any required check fails.
- Docker healthchecks are wired to `/health` for the `api` service and
  native healthchecks for `postgres`/`redis`.

## 9. "Migration" Procedure

There is no Alembic/versioned migration tool yet — `init_db()` runs
`Base.metadata.create_all()` on startup, which creates any missing
tables but does **not** alter existing ones. For schema changes in a
running production database, either:

- Wipe and recreate (fine pre-launch), or
- Add columns manually via `ALTER TABLE` matching the new model, or
- Introduce Alembic (recommended before real production traffic —
  noted as a limitation below, not yet implemented).

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| `401` on every request | Token missing/expired — log in again via `login.html` |
| Upload always fails with 413 | `MAX_UPLOAD_MB` too low, or file genuinely too large |
| `/health/ready` shows `qdrant: error` | Qdrant container not running / wrong `QDRANT_URL` |
| `/health/ready` shows `database: error` | Check `DATABASE_URL`, Postgres container health |
| Rate limited unexpectedly | Check `RATE_LIMIT_PER_MINUTE`/`AUTH_RATE_LIMIT_PER_MINUTE`; multiple instances without `REDIS_URL` each keep their own counter |
| Background jobs never run with `JOB_BACKEND=rq` | Confirm a `worker` container/process is running (`rq worker paperchat`); check logs for "Redis/RQ unavailable" fallback warnings |
| Docs stuck in "processing" | Check API container logs for the `paperchat.jobs` logger; retry via the dashboard's Retry button once fixed |
| CORS errors in browser | Set `CORS_ORIGINS` to your actual frontend origin(s), not `*`, once credentials or a stricter policy is needed |

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec postgres psql -U paperchat -d paperchat
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```
