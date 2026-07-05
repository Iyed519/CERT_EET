# Cert_EET — Engineering Log

A running, plain-English record of **what we actually built, the exact commands we
ran, and the gotchas that bit us** — story by story. It is written for the next
engineer (including future-you) who opens this repo cold and needs to understand
*how the plumbing works* without reverse-engineering it from scratch.

This is **not** the design documentation. The design docs (UML, cahier des
charges, ADRs) say *what the system should be*. This log says *what we did to
build it and how to reproduce it*.

---

## How to read this folder

Files are numbered in the order the work happened. Each one covers one user
story (US) from Sprint 1 — "Fondations backend & infrastructure".

| File | Story | What it covers |
|---|---|---|
| `00-environment-and-workflow.md` | — | Machine setup, terminals, Git workflow, cross-cutting gotchas. **Read this first.** |
| `01-INF02-app-skeleton.md` | US-INFRA-02 | NestJS + Next.js skeleton, config module, `/health`, Swagger |
| `02-INF03-docker-compose.md` | US-INFRA-03 | The 5-service Docker Compose stack |
| `03-INF04-database-schema.md` | US-INFRA-04 | TypeORM entities, migrations, bootstrap admin seed |
| `04-INF07-secrets-management.md` | US-INFRA-07 | `.gitignore`/`.env.example` hygiene, RS256 keys, fail-fast validation |

---

## The note template (use this for every new story)

When we finish a story, add a new numbered file with these sections. Keep it
short and factual. Copy-pasteable commands beat prose.

```
# <ID> — <Story name>

## Goal (one plain-English sentence)
## What we built (files / components touched)
## Key commands (copy-pasteable, with WHERE to run them)
## How it works / why we chose it
## Gotchas (things that broke and the fix)
## Status & how to verify
```

---

## Conventions used throughout

- **French field/domain names** (`motDePasseHash`, `statut`, `derniereConnexion`)
  to match the design docs. English for code structure and comments.
- **One story = one branch = one Pull Request = one squash-merge.** See
  `00-environment-and-workflow.md`.
- **Secrets never leave the machine.** Real `.env` and all `*.pem` files are
  gitignored. Only `.env.example` (fake placeholders) is committed.

*Cert_EET · PFE ESPRIT · Iyed Omri.*
