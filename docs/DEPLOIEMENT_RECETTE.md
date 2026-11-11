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

## 7. TLS et durcissement (US-AUTH-13)

### 7.1 Certificats TLS

nginx termine le TLS. La configuration (`docker/nginx/nginx.conf`) n'utilise que
des **chemins de remplacement** ; les fichiers réels sont déposés **sur l'hôte**,
jamais dans le dépôt ni dans une image :

| Fichier attendu (dans `./docker/nginx/certs/`) | Contenu |
|---|---|
| `fullchain.pem` | certificat du serveur + chaîne intermédiaire |
| `privkey.pem` | clé privée (droits `600`, propriétaire root) |
| `chain.pem` | chaîne seule — seulement si l'agrafage OCSP est activé |

- **Production** : certificat d'une autorité reconnue (par exemple Let's Encrypt
  via certbot sur l'hôte, renouvellement automatique), puis décommenter les
  trois lignes `ssl_stapling*` de `nginx.conf`.
- **Recette** : un certificat auto-signé suffit :

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=<hôte>" \
  -keyout docker/nginx/certs/privkey.pem -out docker/nginx/certs/fullchain.pem
chmod 600 docker/nginx/certs/privkey.pem
```

### 7.2 Ce que fait nginx (DMZ)

- **HTTP -> HTTPS** : tout le port 80 est redirigé (301), sauf la sonde `/healthz`.
- **TLS 1.2 et 1.3 seulement**, suites AEAD à confidentialité persistante (profil
  « intermediate » de Mozilla), tickets de session désactivés, HTTP/2.
- **En-têtes** sur toutes les réponses (y compris les erreurs) : HSTS 2 ans avec
  sous-domaines (sans `preload`, engagement irréversible laissé à l'exploitant),
  `nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra limitée à la
  plateforme, pour la surveillance webcam). `server_tokens off`.
- **Limitation de débit à l'entrée** : 30 requêtes / min par IP (rafale de 20) sur
  connexion, refresh, inscription, vérification d'email, MFA, mot de passe oublié
  et réinitialisation ; 30 / min (rafale de 10) sur la vérification publique.
  Au-delà : 429.
- **Taille des corps** : 10 Mo par défaut ; 1,1 Gio sur les seules routes de dépôt
  de fichiers (livrables, supports IA, ressources de module).

### 7.3 Ce que fait l'API (défense en profondeur)

| Mesure | Valeur |
|---|---|
| En-têtes (helmet 8.3.0) | HSTS, `nosniff`, `X-Frame-Options: DENY`, CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), CORP `same-site`, pas de `X-Powered-By` |
| Corps JSON / formulaire | 100 ko / 20 ko, puis 413 (les dépôts multipart gardent leurs limites par route) |
| CORS | origines explicites `CORS_ORIGIN` (liste séparée par des virgules ; `*` refusé au démarrage), cookies autorisés, méthodes et en-têtes bornés |
| Validation | `whitelist` + `forbidNonWhitelisted` : tout champ inconnu -> 400 |

**Limites de débit par IP** (429 + `Retry-After`, premier refus journalisé
`LIMITE_REQUETES_ATTEINTE`) — réglables sans recompiler :

| Route | Limite par défaut | Variable |
|---|---|---|
| `POST /api/auth/login` | 30 / minute | `LIMITE_CONNEXION` |
| `POST /api/auth/mfa/verify` | 30 / minute | `LIMITE_MFA` |
| `POST /api/auth/refresh` | 120 / minute | `LIMITE_RAFRAICHISSEMENT` |
| `POST /api/auth/register` | 30 / 15 minutes | `LIMITE_INSCRIPTION` |
| `POST /api/auth/verify-email` | 30 / 15 minutes | `LIMITE_VERIFICATION_EMAIL` |
| `POST /api/auth/forgot-password` | 5 / 15 minutes | `LIMITE_MDP_OUBLIE` |
| `POST /api/auth/reset-password` | 10 / 15 minutes | `LIMITE_MDP_REINITIALISATION` |
| `GET /api/verification/*` | 20 / minute | `VERIFICATION_LIMITE_PAR_MINUTE` (US-CERT-05) |

> **Salle de cours derrière une seule adresse publique** : toute la promotion
> partage alors la même IP. Relever `LIMITE_CONNEXION`, `LIMITE_INSCRIPTION` et la
> zone `auth_sensible` de nginx pour les séances en présentiel.

### 7.4 Frontend

`apps/web/next.config.mjs` pose une CSP (`default-src 'self'`, lecteurs vidéo
YouTube sans cookie et Vimeo seuls autorisés en cadre, `frame-ancestors 'none'`),
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, et
retire `X-Powered-By`. Limite connue : Next.js (App Router) injecte des scripts en
ligne pour l'hydratation, d'où `script-src 'unsafe-inline'` (un nonce par requête
rendrait toutes les pages dynamiques).

### 7.5 Vérifier un déploiement

```bash
INSECURE=1 ./docker/nginx/verifier-durcissement.sh <hôte>   # recette (auto-signé)
./docker/nginx/verifier-durcissement.sh <hôte>              # production
```

Le script contrôle la redirection HTTP -> HTTPS, HSTS, les en-têtes, l'absence de
version serveur, TLS 1.2 / 1.3 acceptés, TLS 1.1 et une suite faible refusés.
Complément conseillé : un test externe (par exemple SSL Labs) une fois le
certificat public en place.
