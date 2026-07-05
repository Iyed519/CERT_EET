# INF07 — Secrets Management (US-INFRA-07)

> branch `feature/US-INFRA-07-secrets` · PR pending at time of writing.

## Goal
Keep every sensitive value (DB password, JWT keys) out of Git, generate the
RS256 key pair the auth story will need, inject those keys into the api
container, and make the app **fail-fast** (refuse to boot) if a required secret
is missing.

**Terms:**
- **Secret** = any sensitive value that must never be committed to GitHub
  (passwords, cryptographic keys).
- **RS256** = the signing method for JWT (JSON Web Token) login tokens. It uses a
  **key pair**: a **private key** (kept secret, *signs* tokens) and a **public
  key** (shareable, *verifies* tokens). They only work together. Both are `.pem`
  files.

## What we built / changed
1. **Verified `.gitignore`** already excludes secrets — no change needed. The
   lines that matter:
   ```gitignore
   .env
   .env.*
   !.env.example      # exception: DO commit the fake template
   *.pem              # blocks every key file (the RS256 keys)
   secrets/
   ```
2. **Generated the RS256 key pair** into `secrets/` (a gitignored folder).
3. **Injected the keys** into the api container in `docker-compose.yml`: two path
   env vars + a read-only mount of `secrets/` at `/run/secrets`.
4. **Hardened `env.validation.ts`**: the two key-path vars are now `.required()`,
   so the app won't boot without them.
5. **Completed `.env.example`**: added the bootstrap-admin vars that were missing
   and documented (as comments) how to regenerate the keys.

## Key commands (in order)

**Generate the key pair** — in **Git Bash**, from repo root:
```bash
mkdir -p secrets
openssl genrsa -out secrets/jwt_private.pem 2048
openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem
ls -l secrets     # expect jwt_private.pem (~1732 B) + jwt_public.pem (~460 B)
```
> `openssl` may print dots or `writing RSA key` — that's success, not an error.

**Rebuild the stack so the new mount + env vars take effect** — from repo root:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**Verify the container can see the keys** (note the `MSYS_NO_PATHCONV=1` guard):
```bash
MSYS_NO_PATHCONV=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api ls -l /run/secrets
# expect both jwt_private.pem and jwt_public.pem listed
```

## The exact file changes

**`docker-compose.yml`** — added inside the `api` service:
```yaml
    environment:
      # ... existing DB / Redis / admin vars ...
      # --- JWT RS256 keys (INF07) ---
      JWT_PRIVATE_KEY_PATH: /run/secrets/jwt_private.pem
      JWT_PUBLIC_KEY_PATH: /run/secrets/jwt_public.pem
    volumes:
      - ./secrets:/run/secrets:ro          # RS256 keys, read-only (INF07)
```

**`apps/api/src/config/env.validation.ts`** — added after the Redis vars:
```ts
  JWT_PRIVATE_KEY_PATH: Joi.string().required(),
  JWT_PUBLIC_KEY_PATH: Joi.string().required(),
```

**`.env.example`** — completed to list every variable Compose consumes, with the
keys documented as a comment (they are files, not `.env` values):
```dotenv
# --- JWT RS256 keys (INF07) ---
# NOT stored here. They are .pem files generated once with openssl into the
# gitignored  secrets/  folder, then mounted read-only into the api container
# at /run/secrets. On a fresh machine, regenerate them with:
#   mkdir -p secrets
#   openssl genrsa -out secrets/jwt_private.pem 2048
#   openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem
```

## How it works / why we chose it
- **Keys as mounted files, not inline env values.** The `.pem` contents are
  multi-line and awkward to stuff into env vars. Instead the files live in
  `secrets/` on the host and are shown to the container through a **read-only**
  bind mount (`:ro` = the app can read them but never modify or delete them). The
  env vars only carry the **paths** to the files.
- **Paths hardcoded in Compose, not in `.env`.** The in-container paths never
  change per-machine, so they belong in `docker-compose.yml`. That's why
  `.env.example` documents the keys as a comment rather than listing
  `JWT_PRIVATE_KEY_PATH=...`.
- **`.required()` = fail-fast.** With the Joi rule in place, a missing path
  variable stops startup with a clear message instead of failing mysteriously
  later when auth tries to sign a token.

## Gotchas
- **Git Bash path mangling.** `... exec api ls -l /run/secrets` failed with
  `ls: C:/Program Files/Git/run/secrets: No such file or directory` — Git Bash
  rewrote the container path into a Windows path before Docker saw it. **Fix:**
  prefix with `MSYS_NO_PATHCONV=1` (or run the command in PowerShell).
- **`rwxrwxrwx` on the mounted keys** is just how Docker Desktop on Windows
  displays mounted-file permissions — cosmetic, not a real permission problem.
- **`secrets/` sits at the repo root, outside `apps/api`.** Since the container's
  app dir is `/app` (= `apps/api`), the keys are **not** visible there — that's
  exactly why the explicit `./secrets:/run/secrets:ro` mount is needed.

## Status & how to verify
- Keys generated and present in `secrets/` on the host.
- `MSYS_NO_PATHCONV=1 ... exec api ls -l /run/secrets` lists both `.pem` files —
  the container sees them.
- App boots with the two path vars `.required()` in the Joi schema (proven by the
  stack coming up healthy and being `exec`-able).
- `.env.example` lists every variable Compose needs; real `.env` and all `*.pem`
  remain gitignored.

## Next
Wrap up in Git: commit → push → open PR → self-review "Files changed" (confirm
**no** real `.env`, **no** `*.pem`) → squash-merge.
