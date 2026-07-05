# INF04 — Database Schema, Migrations & Bootstrap Admin (US-INFRA-04)

> PR #3 · branch `feature/US-INFRA-04-db-schema` · merged to `main`.

## Goal
Create the initial database structure (tables) via reviewed **migrations**, and
seed one bootstrap admin account so there's someone to log in as once auth
exists.

**Terms:**
- **TypeORM** = the tool that maps TypeScript classes ("entities") to database
  tables.
- **Migration** = a versioned, reviewable script that changes the DB schema. The
  schema **only** ever changes through a migration (never automatically).
- **Seed** = a script that inserts initial rows (here, the bootstrap admin).

## What we built
Everything under **`apps/api/src/database/`**:

- **`data-source.ts`** — the TypeORM DataSource, **shared by both the running app
  and the migration CLI** (so app and migrations always agree on connection +
  entity list).
- **`database.module.ts`** — `TypeOrmModule.forRoot(...)`, wiring the DataSource
  into NestJS.
- **`entities/`**:
  - `User` — UUID id, email, `motDePasseHash`, `role`, `statut`, `mfaActive`,
    `mfaSecret`, `derniereConnexion`. **Field names are French** to match the
    design docs.
  - `RefreshToken` — refresh-session references.
  - `AuditLog` — **immutable** (no `updated_at`; append-only).
  - `Formation` — skeleton only, fleshed out in a later sprint.
- **`enums/`** (match the class diagram exactly):
  - `Role` = `APPRENANT` / `FORMATEUR` / `ADMINISTRATEUR`
  - `StatutCompte` = `EN_ATTENTE_ACTIVATION` / `ACTIF` / `DESACTIVE` / `ANONYMISE`
- **`migrations/`** — the first migration `InitSchema` creates the tables.
- **`seed.ts`** — inserts one bootstrap admin (`ADMINISTRATEUR` / `ACTIF`) with a
  bcrypt-hashed password read from `.env`.

**Migration scripts** are defined in `apps/api/package.json`: `typeorm`,
`migration:generate`, `migration:run`.

## Key commands
Migrations and seeds run **inside the api container**, from the repo root:
```bash
# apply pending migrations (creates the tables)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run

# seed the bootstrap admin
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run seed
```

Verify the tables exist (inside the postgres container):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U cert_eet -d cert_eet -c "\dt"
```

## How it works / why we chose it
- **`synchronize: false` everywhere.** TypeORM can auto-sync entities to the DB,
  but that's dangerous (silent, unreviewable schema drift). We turn it off — the
  schema changes **only** via reviewed migrations.
- **Password hashing lib = `bcryptjs`** (pure JavaScript). Same bcrypt algorithm
  and cost as the native `bcrypt`, but **no Windows native-build pain**.
- **Immutable `AuditLog`** (append-only, no update timestamp) supports a
  tamper-evident audit trail.

## Gotchas
- `data-source.ts` still carries fallback DB values `'certeet'` (should be
  `'cert_eet'`). **Harmless** because Docker always injects the real values from
  `.env`, but tidy it if you touch that file.

## Status & how to verify
- **5 tables** confirmed: `users`, `refresh_tokens`, `audit_logs`, `formations`,
  `migrations`.
- **One admin row** seeded (`ADMINISTRATEUR` / `ACTIF`, bcrypt-hashed password).
- Merged to `main` as PR #3.
