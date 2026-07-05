# INF03 — Docker Compose Multi-Service Stack (US-INFRA-03)

> PR #2 · branch `feature/US-INFRA-03...` · merged to `main`.

## Goal
One command spins up the entire backend stack — app, database, cache, and
reverse proxy — reproducibly, in the right order. This is a prerequisite for any
integration testing.

## What we built
Five services, defined in **`docker-compose.yml`** (base) with a
**`docker-compose.dev.yml`** override for development:

| Service | Image | Role |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | PostgreSQL 16 **with pgvector** ready (for AI/RAG later, ADR-04/05) |
| `redis` | `redis:7-alpine` | Cache / sessions / token blacklist / queues. `--appendonly yes` = AOF persistence (ADR-08) |
| `api` | built from `apps/api` | NestJS backend |
| `web` | built from `apps/web` | Next.js frontend |
| `nginx` | `nginx:1.27-alpine` | Reverse proxy; **the only service published to the host** (ports 80/443) |

Key wiring:
- **Multi-stage Dockerfiles** for `api` and `web` (a `development` target with
  hot reload, a `production` target that's lean). The dev override selects the
  `development` target and bind-mounts source for live reload.
- **`depends_on` + healthchecks** enforce start order: the API waits until
  Postgres **and** Redis report healthy before it starts (an INF03 acceptance
  criterion). Healthchecks: Postgres `pg_isready`, Redis `redis-cli ping`,
  api/web `wget` their own health URL, nginx `nginx -t`.
- **Named volumes** `pgdata` and `redisdata` persist database and cache data on
  the host across restarts (ADR-07).
- **Private network** `cert_eet_net` (bridge) — every service talks over it;
  only nginx is exposed outward.
- **Nginx** terminates **TLS** (HTTPS) with a **self-signed** certificate and
  routes `/api` → api, `/` → web.

## Key commands
From the repo root (`CERT_EET/`), any docker-capable terminal:
```bash
# Dev (hot reload, foreground)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Detached (background), then check status
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose ps
```

## How it works / why we chose it
- The **base + override** pattern keeps one source of truth. `docker-compose.yml`
  describes the production-shaped stack; `docker-compose.dev.yml` layers on the
  dev-only bits (hot reload, exposed debug ports). You always pass both `-f`
  flags in dev.
- **Healthcheck-gated `depends_on`** avoids the classic race where the API
  starts before the database is accepting connections.

## Gotchas
- The self-signed TLS cert makes the browser show a security warning on
  `https://localhost`. **Expected** — click *Advanced → Proceed*. (A properly
  signed cert / HSTS hardening is deferred to a later security story.)
- YAML indentation is space-sensitive (see `00-environment-and-workflow.md`).

## Status & how to verify
- `docker compose ... up` brings all five services to **healthy**.
- `https://localhost` reaches the app through nginx (after accepting the cert
  warning).
- Merged to `main` as PR #2.
