# INF05 — CI Pipeline (US-INFRA-05)

> branch `feature/US-INFRA-05-ci-pipeline` · PR pending at time of writing.

## Goal
Set up **Continuous Integration**: a robot on GitHub that automatically runs
checks on every push to `main` and every Pull Request into `main`, so broken code
can never reach `main`. The checks, in order: install dependencies → lint → unit
tests (with coverage) → integration tests. Integration tests get a real,
throwaway Postgres + Redis. Finally, turn on **branch protection** so a PR cannot
be merged unless the checks are green.

**Terms:**
- **CI (Continuous Integration)** = automation that installs and tests your code on
  every change, catching breakage early.
- **GitHub Actions** = GitHub's built-in automation engine. A **workflow** is a
  YAML file under `.github/workflows/` describing steps that run on chosen events.
- **Lint** = an automated style/error check (here ESLint + Prettier).
- **Coverage** = how much of the code the tests actually exercise, as a %.
- **Service container** = a throwaway database (Postgres, Redis) that GitHub spins
  up just for one run and destroys afterwards. On the runner it's reached at
  `localhost`.
- **Branch protection** = a GitHub rule on `main` that blocks merges unless the
  required checks pass.

## What we built / changed
1. **Created `.github/workflows/ci.yml`** — one job (`api`) on `ubuntu-latest`,
   scoped to `apps/api` only (backend). `apps/web` can be added later.
2. **Triggers**: `push` to `main` and `pull_request` targeting `main`.
3. **Service containers**: `pgvector/pgvector:pg16` (same image as prod) +
   `redis:7-alpine`, each with a health check so steps wait until the service is
   actually answering.
4. **Env wiring**: `DB_*` / `REDIS_*` point at the service containers
   (`localhost`); `ADMIN_*` + the two JWT key paths are provided so the app can
   boot during tests.
5. **Generate throwaway RS256 keys inside the run** (the key fix — see Gotchas).
6. **Steps**: checkout → setup-node (Node 20, npm cache) → `npm ci` → generate
   keys → `npm run lint` → `npm run test:cov` → `npm run test:e2e` → upload the
   `coverage/` folder as a downloadable artifact.
7. **Branch protection on `main`**: require a PR before merging + require the
   `API (lint + tests + coverage)` check to pass.

## The workflow file (`.github/workflows/ci.yml`) — key parts
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/api        # every run: step executes here
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: cert_eet
          POSTGRES_PASSWORD: cert_eet
          POSTGRES_DB: cert_eet
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U cert_eet"
          --health-interval 10s --health-timeout 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DB_HOST: localhost
      DB_PORT: '5432'
      DB_USERNAME: cert_eet
      DB_PASSWORD: cert_eet
      DB_NAME: cert_eet
      REDIS_HOST: localhost
      REDIS_PORT: '6379'
      ADMIN_EMAIL: admin@cert-eet.test
      ADMIN_PASSWORD: ChangeMe_CI_123
      JWT_PRIVATE_KEY_PATH: /tmp/jwt_private.pem
      JWT_PUBLIC_KEY_PATH: /tmp/jwt_public.pem
```

Steps (abridged):
```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: apps/api/package-lock.json
      - run: npm ci
      - name: Generate throwaway RS256 keys for tests
        run: |
          openssl genrsa -out "$JWT_PRIVATE_KEY_PATH" 2048
          openssl rsa -in "$JWT_PRIVATE_KEY_PATH" -pubout -out "$JWT_PUBLIC_KEY_PATH"
      - run: npm run lint
      - run: npm run test:cov -- --passWithNoTests
      - run: npm run test:e2e -- --passWithNoTests
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-api
          path: apps/api/coverage
          if-no-files-found: ignore
```

## How it works / why we chose it
- **`npm ci`, not `npm install`.** `ci` does a clean, exact install straight from
  `package-lock.json` — reproducible and faster in CI. It needs the lockfile to
  exist (it does, at `apps/api/package-lock.json`).
- **`working-directory: apps/api`.** The monorepo gives each app its own
  `node_modules`; the API is self-contained, so all `run:` steps execute inside
  `apps/api`. Caveat: `working-directory` only affects `run:` steps — for `uses:`
  steps like `upload-artifact`, the path is written from the repo root, hence
  `apps/api/coverage`.
- **Service containers matching prod.** Using the same `pgvector/pgvector:pg16`
  image as production keeps CI honest. Health checks make steps wait until the DB
  actually answers. They are set up now even though no test uses them yet —
  integration tests arrive in AUTH-01.
- **One coverage run doubles as the unit-test run.** `test:cov` (`jest --coverage`)
  already runs the unit specs, so there is no separate "unit test" step — that
  would just run them twice.
- **Coverage as an artifact.** `upload-artifact` saves the `coverage/` folder as a
  downloadable file on the run — no external service (Codecov etc.) needed yet. A
  coverage *threshold* that fails the build comes later, alongside the critical
  modules (auth, QCM, certification) that don't exist yet.

## Gotchas
- **The e2e test boots the whole app, so CI needs the JWT keys.** First red run:
  `Config validation error: "JWT_PRIVATE_KEY_PATH" is required`. Cause: the health
  end-to-end test (from INF02) starts the full app; on boot the Joi validator
  (INF07) demands the two key paths. CI is a fresh Linux box with **no `.env` and
  no `secrets/`** (both correctly gitignored), so the app refused to boot. **Fix:**
  a step that generates a throwaway RS256 key pair with `openssl` into `/tmp` plus
  two env vars pointing at them — same key idea as INF07, but created on-the-fly
  for the run instead of mounted. Nothing secret enters the repo.
- **The `app.close()` TypeError was a symptom, not a second bug.** `Cannot read
  properties of undefined (reading 'close')` appeared *because* the app never
  started, so `afterAll` had no app to close. It vanished the moment the app
  booted. One root cause, not two.
- **`--passWithNoTests` was needed, then turned out moot.** We expected zero tests,
  so the flag tells Jest "no tests is fine, don't fail." Turned out INF02 had
  already left a health unit spec + a health e2e test, so tests actually ran. The
  flag is harmless to keep — it only matters if a suite is ever empty.
- **Reading the wrong (old) run's log.** GitHub keeps every run's log forever. After
  pushing the fix, the *old* failed run still showed the old JWT error, which
  looked like the fix hadn't worked. **Fix:** always open the newest run (top of the
  **Actions** tab) and confirm its commit hash matches your latest `git log` before
  reading.
- **"Node.js 20 is deprecated … forced to run on Node.js 24" warning.** Cosmetic.
  It refers to the internal Node the *actions* (checkout, setup-node) run on, not
  our `node-version: '20'`. It failed nothing. Bump action versions someday; not
  part of INF05.

## Status & how to verify
- Workflow runs on every push/PR to `main`. Latest run **green**: install → keys →
  lint → unit+coverage → e2e all pass; `GET /health -> 200` passes end-to-end.
- Coverage report uploaded as the `coverage-api` artifact on each run.
- Branch protection active on `main`: PR required + `API (lint + tests + coverage)`
  must be green to merge. ("Require branches up to date" left off — solo project.)
- To verify: repo **Actions** tab → newest run is green; on any PR the check
  appears and blocks the merge button until it passes.

## Next
Wrap up in Git: commit → push → self-review "Files changed" (only
`.github/workflows/ci.yml` + this note; **no** `.env`, **no** `*.pem`) →
squash-merge. After INF05: US-AUTH-01 (login) — which adds the first real auth
tests, at which point the "generate RS256 keys" step becomes load-bearing.