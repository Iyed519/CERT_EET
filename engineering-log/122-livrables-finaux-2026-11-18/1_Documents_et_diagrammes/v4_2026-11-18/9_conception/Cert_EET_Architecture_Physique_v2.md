# Cert_EET — Architecture physique (v2.0, état réalisé)

> **Version :** 2.0 — 18/11/2026 (v1.0 : juin 2026, conception) · Iyed Omri · PFE ESPRIT 2026
> **Figure :** `10_diagrammes/deploiement/Cert_EET_DEP01_Deploiement_Reel.png`
> **Sources :** `docker-compose.yml`, `docker-compose.dev.yml`, `deploy/hetzner/`, `docker/nginx/nginx.conf`,
> journaux 120 et 121.

## 1. Style
**Client–serveur, déploiement conteneurisé.** Les postes clients (navigateur, ordinateur ou mobile) parlent
en HTTPS à un **seul point d'entrée**, nginx ; tous les services tournent dans des conteneurs Docker
orchestrés par **Docker Compose** sur un même hôte, reliés par un réseau privé (`cert_eet_net`).

## 2. Ce qui tourne réellement (démonstration en ligne, depuis le 16/11/2026)

| Nœud | Image / technologie | Exposition | Rôle |
|---|---|---|---|
| Hôte | Hetzner Cloud **CPX32** — 4 vCPU, 8 Go, 160 Go, Ubuntu 24.04, Helsinki | pare-feu : TCP 22, 80, 443, ICMP | serveur unique |
| nginx | `nginx:1.27-alpine` | **80** (redirection 301) et **443** | TLS 1.2/1.3, HSTS, CSP, limites de débit, routage `/` et `/api/` |
| web | Next.js 14 (build local) | 127.0.0.1:3001 | interfaces des quatre rôles |
| api | NestJS 10 (build local) | 127.0.0.1:3000 | REST + SSE, 20 modules, workers BullMQ (6 files), balayages planifiés |
| ml | FastAPI + LightGBM `risque_v1` | réseau interne seulement | `GET /sante`, `POST /predire` |
| postgres | `pgvector/pgvector:pg16` | interne | 48 tables, 43 migrations, vecteurs 384 |
| redis | `redis:7-alpine` (AOF) | interne | files BullMQ, denylists, limites |
| minio | `bitnamilegacy/minio:2025.4.22` | interne | objets privés (S3) |
| mailhog | `mailhog/mailhog` | 127.0.0.1:8025 | boîte de test (pile dev) |

**7 conteneurs** dans la pile de base, **8 services** sur le serveur (Mailhog vient du fichier de
développement). Volumes persistants : `pgdata`, `redisdata`, `miniodata`. Secrets : `.env` (droits 600)
et `secrets/` (clés JWT RS256), jamais dans le dépôt.

**Côté client :** le modèle **MediaPipe EfficientDet-Lite0** et son moteur WASM sont téléchargés depuis la
plateforme et s'exécutent dans le navigateur de l'apprenant pendant un QCM surveillé (ADR-15).

**Services externes (HTTPS) :** API Anthropic (Claude Sonnet 5.5) ; Gmail SMTP (587, STARTTLS,
authentifié) ; OAuth Google et GitHub (applications dédiées au domaine) ; Let's Encrypt et DuckDNS ;
GitHub (mises à jour par `git pull`).

## 3. Écarts avec la v1.0 (conception de juin 2026)

| Conception (v1.0) | Réalisé (v2.0) | Raison |
|---|---|---|
| Conteneur **worker** séparé | Workers BullMQ **dans le processus de l'API** | un seul processus à exploiter ; travaux dans Redis, déplaçables plus tard |
| API « en cluster » multi-instances | **Une instance** | suffisant pour la démonstration ; l'API reste sans état (JWT) |
| LLM « GPT-4o, Claude ou Mistral » | **Claude Sonnet 5.5** (adaptateur compatible OpenAI disponible) | ADR-05-R1 |
| — | **Service `ml`** (FastAPI, LightGBM) | ADR-14 |
| — | **IA de vision dans le navigateur** | ADR-15 |
| Hébergement local ou VPS tunisien | **Hetzner (Helsinki)** pour la démonstration | ADR-16 ; la Tunisie reste la cible de production |

## 4. Limites assumées
Pile lancée en **mode développement** (rechargement à chaud) ; un seul serveur ; pas de sauvegarde
automatique (`sauvegarder.sh` à la demande, instantané Hetzner) ; certificat Let's Encrypt à renouveler
avant le 13/02/2027 ; hébergement en Europe.

*Cert_EET — Architecture physique v2.0 · 18/11/2026*
