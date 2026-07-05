# 00 — Environment & Workflow

Cross-cutting setup that every story depends on. Read this before the story
notes.

---

## Machine & tools

- **OS:** Windows.
- **Docker Desktop** with the **WSL2 backend** (WSL2 = Windows Subsystem for
  Linux 2, the engine that lets Docker run Linux containers on Windows).
  **It must be running before any `docker` command** — check for the steady
  whale icon in the system tray.
- **Node.js** installed on the host.

### Two terminals — know which is which

| Terminal | Use it for | Why |
|---|---|---|
| **Git Bash** | `git`, `openssl` | Unix-style shell; `openssl` only lives here |
| **PowerShell** or Git Bash | `docker` / `docker compose` | Docker works from either |

---

## Monorepo layout

One Git repo holds two apps. **Each app has its own `node_modules`.**

```
CERT_EET/
├─ apps/
│  ├─ api/        # NestJS backend  (TypeScript, strict mode)
│  └─ web/        # Next.js 14 frontend (App Router)
├─ docker/nginx/  # reverse-proxy config + self-signed certs
├─ secrets/       # RS256 .pem keys — GITIGNORED, never pushed (see INF07)
├─ docs/engineering-log/   # this folder
├─ docker-compose.yml      # base stack
├─ docker-compose.dev.yml  # dev override (hot reload, debug ports)
├─ .env                    # REAL secrets — GITIGNORED
├─ .env.example            # fake placeholders — committed
└─ .gitignore
```

## Run the whole project (from repo root)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

`exec api <cmd>` runs a command **inside** the running `api` container (the box
holding the NestJS app). Migrations and seeds run there, not on the host:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api <cmd>
```

---

## Git workflow — GitHub Flow (locked in)

- **`main`** is the only permanent branch. It holds **finished work only**.
- **One user story → one branch → one Pull Request (PR) → one squash-merge.**
  A squash-merge combines all the branch's commits into one clean entry on `main`.
- Branch names: `feature/US-XXX-shortname` (e.g. `feature/US-INFRA-07-secrets`).
- Commit message prefixes: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
- Repo: `https://github.com/Iyed519/CERT_EET`

### The per-story loop

```bash
git checkout main
git pull                      # start from the latest finished work
git checkout -b feature/US-...-shortname
# ... do the work, commit as you go ...
git push -u origin feature/US-...-shortname
# open a PR on GitHub → review the "Files changed" tab → squash-merge
git checkout main
git pull                      # bring the merged work back down
```

### Self-review checklist before merging (solo project)

Open the PR's **"Files changed"** tab and confirm:
- [ ] **No** real `.env` file included.
- [ ] **No** `*.pem` key files included.
- [ ] No stray junk (build output, `node_modules`, editor files).

---

## Cross-cutting gotchas (these bit us; here are the fixes)

### 1. Git Bash mangles absolute paths on Windows
When a command contains a path starting with `/` (e.g. `/run/secrets`), Git Bash
"helpfully" rewrites it into a Windows path like
`C:/Program Files/Git/run/secrets` **before** the command runs — so the command
never sees the path you meant.

**Symptom:** `ls: C:/Program Files/Git/... : No such file or directory`.

**Fix:** prefix the command with `MSYS_NO_PATHCONV=1`, which disables the
rewrite for that one command:
```bash
MSYS_NO_PATHCONV=1 docker compose ... exec api ls -l /run/secrets
```
(Same family of quirk as `openssl -subj "/CN=..."` needing a double slash
`//CN=...` in Git Bash.) Running the command in **PowerShell** instead also
avoids it.

### 2. Line endings (LF vs CRLF)
The project uses **LF** line endings. Settings are already in place so this is
handled:
- `.gitattributes` → `* text=auto eol=lf`
- `.prettierrc` → `"endOfLine": "lf"`
- VS Code → `files.eol = "\n"`
- `git config core.autocrlf false`

If red **"Delete ␍ / CRLF"** squiggles ever reappear, they are **cosmetic**, not
code errors.

### 3. YAML is space-sensitive
`docker-compose.yml` uses **spaces, never tabs**, and indentation depth carries
meaning. When editing, prefer replacing a whole block (or the whole file) over
splicing loose lines, so indentation can't drift. Top-level services
(`postgres:`, `redis:`, `api:`, `web:`, `nginx:`) sit at **2 spaces**.

### 4. Docker mounts on Windows show `rwxrwxrwx`
Files mounted into a container from Windows report permissions as `rwxrwxrwx`.
That's just how Docker Desktop on Windows displays them — **cosmetic**, not a
real permissions problem.

### 5. Harmless Git noise
- `warning: There are too many unreachable loose objects; run 'git prune'` —
  just clutter. Ignore, or run `git prune` later.
- `npm audit fix --force` — **do not run it.** It breaks pinned versions.
