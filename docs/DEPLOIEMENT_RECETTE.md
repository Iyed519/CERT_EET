# Déploiement en recette (staging) — Cert_EET

Ce document décrit comment déployer la plateforme en recette à partir des
images **production** publiées automatiquement sur **GHCR** par le pipeline CD
(`.github/workflows/cd.yml`, US-INFRA-06).

> **Périmètre actuel.** Le CD s'arrête au **build + push** des images. Le
> déploiement ci-dessous est **manuel**, à exécuter sur l'hôte de recette (par
> ex. une VM en Tunisie, pour la souveraineté des données). L'automatisation du
> déploiement (SSH) pourra être ajoutée quand la VM sera disponible.

## 1. Ce que le CD produit

À chaque CI verte sur `main`, deux images sont publiées sur GHCR :

| Image | Tags |
|---|---|
| `ghcr.io/iyed519/cert_eet-api` | `latest` + SHA court du commit |
| `ghcr.io/iyed519/cert_eet-web` | `latest` + SHA court du commit |

Le tag `latest` suit le dernier commit de `main` ; le tag SHA court permet de
revenir à une version précise (rollback).

## 2. Prérequis sur l'hôte de recette

- Docker + Docker Compose installés.
- Le dépôt (ou au minimum : `docker-compose.yml`, `docker-compose.recette.yml`,
  `docker/nginx/nginx.conf`).
- Les **secrets**, **jamais committés** :
  - `./secrets/jwt_private.pem` et `./secrets/jwt_public.pem` (clés RS256, montées en lecture seule).
  - `./docker/nginx/certs/` (certificats TLS pour nginx).
- Un fichier **`.env`** à la racine, fournissant les variables consommées par le compose :

```dotenv
# Base de données
POSTGRES_USER=cert_eet
POSTGRES_PASSWORD=<mot_de_passe_fort>
POSTGRES_DB=cert_eet
# Compte admin initial (seed)
ADMIN_EMAIL=admin@cert-eet.tn
ADMIN_PASSWORD=<mot_de_passe_fort>
```

> Si le boot de l'API échoue sur la validation de configuration, fournir en plus
> les variables SMTP / OAuth attendues par l'environnement (voir
> `apps/api/.env.example`).

## 3. Déploiement (pull des images GHCR)

```bash
# 1. S'authentifier auprès de GHCR (une fois) — PAT avec scope read:packages
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user_github> --password-stdin

# 2. Récupérer les dernières images publiées + (re)démarrer la stack
docker compose -f docker-compose.yml -f docker-compose.recette.yml pull
docker compose -f docker-compose.yml -f docker-compose.recette.yml up -d

# 3. Vérifier l'état
docker compose -f docker-compose.yml -f docker-compose.recette.yml ps
```

> L'override recette référence directement les images GHCR (`image:`), donc
> `pull` récupère les images publiées sans rien reconstruire. En secours, un
> `up -d --build` reconstruit localement depuis les sources.

## 4. Vérification post-déploiement

```bash
# Santé de l'API (via nginx, HTTPS auto-signé en recette -> -k)
curl -k https://<hôte>/api/docs-json -o /dev/null -w "docs-json: %{http_code}\n"
curl     http://<hôte>/healthz        -o /dev/null -w "health:    %{http_code}\n"
```

Attendu : `200`. Les conteneurs doivent être `Up` (et `healthy` pour ceux qui
ont un healthcheck).

## 5. Rollback

Pour revenir à une version précise, cibler le **tag SHA court** au lieu de
`latest` (dans `.env` ou en surchargeant `image:`), puis `pull` + `up -d`.
Les anciennes images restent disponibles sur GHCR.

## 6. Secrets — rappel

Aucun secret (clés RS256, mots de passe DB, `.env`, certificats) n'est versionné
dans le dépôt ni dans les images. Ils sont fournis **sur l'hôte uniquement**.
L'authentification GHCR utilise un PAT personnel (scope `read:packages`) côté
hôte, ou `GITHUB_TOKEN` côté CI (déjà géré par le workflow).
