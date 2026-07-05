# INF02 — App Skeleton (US-INFRA-02)

> PR #1 · branch `feature/US-INFRA-02...` · merged to `main`.

## Goal
Stand up the empty-but-runnable NestJS backend and Next.js frontend, so every
later story has a place to put code.

## What we built
- **`apps/api`** — NestJS (a TypeScript framework for building APIs), TypeScript
  in **strict mode**, structure under `src/modules`. ESLint/Prettier inherited
  from Sprint 0.
- **Config module** with **fail-fast env validation** — the app validates its
  environment variables at startup and **refuses to boot** if a required one is
  missing, instead of starting half-broken.
  - `apps/api/src/config/configuration.ts` — reads env values into typed config.
  - `apps/api/src/config/env.validation.ts` — the **Joi** schema (Joi = a
    library that validates env vars and rejects boot on a bad/missing one).
- **`GET /health`** — a simple endpoint to prove the API is alive (used later by
  Docker healthchecks in INF03).
- **Swagger / OpenAPI** docs served at **`/api/docs`** (Swagger = an
  auto-generated, browsable API reference).
- **`apps/web`** — Next.js 14 (App Router), base layout + a **shell of the
  `/login` page** (visual only; inactive until US-AUTH-01 wires up auth).

## Key commands
Run inside each app folder during setup (host, any terminal):
```bash
# backend
cd apps/api && npm install

# frontend
cd apps/web && npm install
```
Health check once running:
```bash
curl http://localhost:3000/health
```

## How it works / why we chose it
- **Fail-fast config** is an explicit rule from ADR-02: a missing required
  variable must stop startup with a clear message rather than causing a
  confusing runtime crash later. Every subsequent story extends the same Joi
  schema rather than inventing a new mechanism.
- **Strict TypeScript** catches whole classes of bugs at compile time.

## Gotchas
- None specific to this story beyond the cross-cutting line-ending setup (see
  `00-environment-and-workflow.md`).

## Status & how to verify
- API boots, `GET /health` returns OK, Swagger renders at `/api/docs`.
- Frontend serves the `/login` shell.
- Merged to `main` as PR #1.
