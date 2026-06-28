Cert_EET — INF03 (US-INFRA-03) — Docker Compose
================================================

WHERE EACH FILE GOES (extract this zip at the repo ROOT — all files are new):

  CERT_EET/
  ├── docker-compose.yml              <- base (5 services)
  ├── docker-compose.dev.yml          <- dev override (hot reload)
  ├── docker-compose.recette.yml      <- recette/staging override
  ├── .env.example                    <- copy to .env locally
  ├── apps/
  │   ├── api/
  │   │   ├── Dockerfile              <- NestJS multi-stage
  │   │   └── .dockerignore
  │   └── web/
  │       ├── Dockerfile              <- Next.js multi-stage
  │       └── .dockerignore
  └── docker/
      └── nginx/
          ├── nginx.conf             <- routing + TLS
          └── certs/                 <- self-signed certs go here (gitignored)

ONE-LINE API CHANGE (so /api routing is clean):
  In apps/api/src/main.ts, before app.listen(...), add:

      app.setGlobalPrefix('api', { exclude: ['health'] });

  -> all API routes move under /api  (Nginx routes /api -> api)
  -> /health stays at the root (used by the container healthcheck)
  -> Swagger stays at /api/docs

SETUP (Windows, run from the repo root):

  1) copy .env.example .env

  2) Generate a self-signed cert (Git Bash):
       mkdir -p docker/nginx/certs
       openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
         -keyout docker/nginx/certs/privkey.pem \
         -out    docker/nginx/certs/fullchain.pem \
         -subj "/CN=localhost"

  3) Start everything (dev):
       docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

  4) Verify:
       https://localhost          -> frontend (accept the self-signed warning)
       https://localhost/api/docs  -> Swagger
       docker compose ps          -> all services "healthy"

  5) Stop:
       docker compose -f docker-compose.yml -f docker-compose.dev.yml down

  Recette (detached, production images):
       docker compose -f docker-compose.yml -f docker-compose.recette.yml up --build -d

ALSO: append the lines in GITIGNORE_add_these_lines.txt to your root .gitignore.
