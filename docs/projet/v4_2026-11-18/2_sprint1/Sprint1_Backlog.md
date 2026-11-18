# Cert_EET — Sprint 1 · Sprint Backlog (version détaillée)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 1 — « Fondations backend & infrastructure »
> **Période :** 08 → 21 mai 2026 (2 semaines) · **Équipe :** 1 développeur (solo)
> **Statut :** ✅ **CLÔTURÉ** — committed **9/9** + stretch **6/6** terminées (15 stories livrées).

---

## 0. À quoi sert ce document (et comment le lire)

Le **Sprint Backlog** est l'un des trois artefacts de Scrum. C'est un document **vivant** : il évolue
pendant le sprint et reflète la réalité à la fin. Il répond à trois questions :

- **Pourquoi** ce sprint existe → le **Sprint Goal** (§1).
- **Quoi** on s'est engagé à faire → les **stories sélectionnées** (§2).
- **Comment** on l'a réalisé → le **plan de tâches** (§3).

> **Mini-lexique Scrum** (détail complet dans la Revue de Sprint) :
> **Story** = une fonctionnalité vue par l'utilisateur · **Points** = estimation de complexité (pas des
> heures) · **Committed** = engagement ferme du sprint · **Stretch** = bonus si marge · **DoD** =
> Definition of Done, la checklist qui définit « terminé » · **PR** = Pull Request, une modification
> relue avant intégration.

---

## 1. Sprint Goal (le « pourquoi »)

> **Un backend entièrement conteneurisé, intégré en continu, avec authentification JWT complète
> (connexion, rafraîchissement avec rotation, déconnexion), contrôle d'accès par rôle (RBAC) et un schéma
> de base de données initial opérationnel — le socle sur lequel s'appuieront la création et l'activation
> de comptes.**

*En clair :* poser les fondations techniques (boîtes Docker, robot de vérification, connexion sécurisée,
rôles, base de données) avant de construire les fonctionnalités métier (cours, QCM, certificats) des
sprints suivants.

> *Note : le Sprint Goal initial mentionnait « un administrateur crée un compte, l'utilisateur l'active
> par email ». Une décision produit en cours de sprint (ADR-11) a ouvert l'inscription publique en
> self-service, rendant ce parcours obsolète (voir §2.1, décision D4).*

---

## 2. Stories sélectionnées (le « quoi »)

### 2.1 Engagement ferme (committed) — état réel

| # | Story | Épop. | Points | Priorité | Statut |
|---|-------|-------|:-----:|:--------:|:------:|
| 1 | US-INFRA-02 — Squelette NestJS + Next.js | E0 | 3 | Must | ✅ Terminé |
| 2 | US-INFRA-03 — Docker Compose multi-services | E0 | 5 | Must | ✅ Terminé |
| 3 | US-INFRA-04 — Schéma BDD + migrations | E0 | 5 | Must | ✅ Terminé |
| 4 | US-INFRA-07 — Gestion des secrets | E0 | 2 | Must | ✅ Terminé |
| 5 | US-INFRA-05 — Pipeline CI (lint + tests) | E0 | 3 | Must | ✅ Terminé |
| 6 | US-AUTH-01 — Se connecter (email + mot de passe) | E1 | 5 | Must | ✅ Terminé |
| 7 | US-AUTH-03 — Rafraîchir la session (avec rotation) | E1 | **5** | Must | ✅ Terminé |
| 8 | US-AUTH-04 — Se déconnecter (révocation Redis) | E1 | 2 | Must | ✅ Terminé |
| 9 | US-AUTH-11 — Contrôle d'accès par rôle (RBAC) | E1 | 5 | Must | ✅ Terminé |
| 10 | US-CPT-01 — Admin crée un compte | E2 | 3 | Must | ❌ Retirée (D4) |
| 11 | US-AUTH-05 — Activer son compte (lien email) | E1 | 3 | Must | ❌ Retirée (D4) |
| | **Total engagé** | | **41 pts** | | **9/9 terminées** *(2 retirées)* |

> *Repointing : US-AUTH-03 passe de 3 à **5 pts** — le périmètre réellement livré (rotation des refresh
> tokens + détection de rejeu + premier branchement de Redis) est nettement supérieur au « simple
> refresh » estimé au départ. Total engagé : 39 → 41 pts. (Honnêteté d'estimation, assumée en soutenance.)*

### 2.2 Extension (stretch) — ✅ intégralement livrée (6/6)

| Ordre | Story | Épop. | Points | Statut |
|:-----:|-------|-------|:-----:|:------:|
| 12 | US-AUTH-12 — Journal d'audit immuable | E1 | 5 | ✅ Terminé (PR #17) |
| 13 | US-ROL-01 — Admin change le rôle d'un utilisateur | E2 | 3 | ✅ Terminé (PR #15) |
| 13b | US-ROL-02 — Demande de changement de rôle *(nouvelle story, v2)* | E2 | 3 | ✅ Terminé (PR #18) |
| 14 | US-INFRA-06 — Pipeline CD (build + push GHCR) | E0 | 5 | ✅ Terminé (mergé, CD #1 vert) |
| 15 | US-AUTH-09 + US-AUTH-02 — MFA (TOTP + connexion en 2 temps) | E1 | 6 | ✅ Terminé (PR #19) |
| 16 | US-INFRA-08 — Documentation API (OpenAPI/Swagger) | E0 | 3 | ✅ Terminé (PR #20) |
| + | US-CPT-03 — Désactiver / réactiver un compte (anti-lockout) | E2 | 3 | ✅ Terminé (PR #16) |
| — | US-CPT-05 · UI auth · US-AUTH-14 (Google+GitHub) · US-AUTH-15 profil | E1/E2 | — | ✅ Terminé (Sprint 2 tiré, PR #10–#14) |

> **Détail des deux derniers items d'infra (fin de stretch) :**
> - **US-INFRA-08 (doc API).** `/api/docs` complet : `@ApiBearerAuth('access-token')` ciblé —
>   **17 routes protégées avec cadenas / 11 publiques** sans — schéma bearer nommé, `persistAuthorization`
>   (le jeton collé survit au rafraîchissement), `/api/docs-json` exposé, 5 tags décrits, réponses du
>   endpoint `health`. Lint propre + 110 tests verts.
> - **US-INFRA-06 (CD).** Workflow `.github/workflows/cd.yml` : après **CI verte sur `main`**
>   (`workflow_run`), build + push des images `production` api+web sur **GHCR** (`cert_eet-api`,
>   `cert_eet-web` ; tags `latest` + SHA court ; auth `GITHUB_TOKEN`, zéro secret externe).
>   `docker-compose.recette.yml` référence les images GHCR (`pull && up -d` direct). Déploiement recette
>   **manuel documenté** (`docs/DEPLOIEMENT_RECETTE.md`). **Validé : CD #1 vert en 4 min 07 s.**

### 2.3 Évolution de périmètre (décisions prises en cours de sprint)

Traçabilité Scrum des décisions (un changement de périmètre se documente, il ne s'improvise pas) :

1. **US-AUTH-03 livrée avec rotation + détection de rejeu** — mise en conformité avec l'ADR-08 (la
   première rédaction disait l'inverse). Révision consignée : **ADR-08-R1**.
2. **Inscription publique en self-service** (modèle ouvert type Coursera/edX) → nouvelle story
   **US-CPT-05**. US-CPT-01 (admin crée un compte) retirée (D4).
3. **Authentification sociale** → nouvelle story **US-AUTH-14** (Google, puis GitHub).
4. **Onboarding formateur curaté** (nouvel **ADR-11**) : éligibilité globale sur dossier + droits
   d'enseignement par cours (autorisation par ressource). Stories à rédiger avec l'épopée Cours.

> **D4 (retrait assumé).** US-CPT-01 et US-AUTH-05 retirées : tous les comptes viennent désormais de
> l'auto-inscription (US-CPT-05) ou d'OAuth (US-AUTH-14). Sans compte créé vide, l'activation par email
> n'a plus d'objet.

---

## 3. Plan de réalisation — décomposition en tâches (le « comment »)

Chaque tâche : description, estimation (heures), statut.

### US-INFRA-02 — Squelette NestJS + Next.js *(5 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF02-1 | Init NestJS (TS strict, structure `src/modules`, lint/format) | 1,5 | ✅ |
| INF02-2 | Module de configuration + validation des variables d'env (fail-fast) | 1,5 | ✅ |
| INF02-3 | Endpoint `GET /health` | 0,5 | ✅ |
| INF02-4 | Init Next.js (App Router) + layout + coquille `/login` | 1,5 | ✅ |

### US-INFRA-03 — Docker Compose multi-services *(8 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF03-1 | Dockerfile multi-stage `api` | 1,5 | ✅ |
| INF03-2 | Dockerfile multi-stage `web` | 1,5 | ✅ |
| INF03-3 | `docker-compose.yml` (api, web, postgres, redis, nginx) | 2,0 | ✅ |
| INF03-4 | Healthchecks + `depends_on` (l'API attend Postgres prêt) | 1,5 | ✅ |
| INF03-5 | Config Nginx (routage `/api`↔`/` + terminaison TLS de base) | 1,0 | ✅ |
| INF03-6 | Fichiers d'override `dev` / `recette` | 0,5 | ✅ |

### US-INFRA-04 — Schéma BDD + migrations *(7 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF04-1 | DataSource TypeORM + setup migrations | 1,5 | ✅ |
| INF04-2 | Entité `User` + enums `Role`, `StatutCompte` | 2,0 | ✅ |
| INF04-3 | Entité `AuditLog` (immuable) | 1,0 | ✅ |
| INF04-4 | Entité `RefreshToken` + `Formation` (squelette) | 1,0 | ✅ |
| INF04-5 | 1re migration + seed admin bootstrap | 1,5 | ✅ |

### US-INFRA-07 — Gestion des secrets *(3 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF07-1 | `.env.example` + schéma de validation + `.gitignore` secrets | 1,0 | ✅ |
| INF07-2 | Génération paire de clés RS256 (JWT) + injection env/secrets | 1,0 | ✅ |
| INF07-3 | Démarrage fail-fast si un secret requis manque | 1,0 | ✅ |

### US-INFRA-05 — Pipeline CI *(5 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF05-1 | Workflow GitHub Actions (install + lint ESLint/Prettier) | 1,5 | ✅ |
| INF05-2 | Job tests unitaires + intégration (services Postgres + Redis) | 2,0 | ✅ |
| INF05-3 | Rapport de couverture + protection de branche (CI verte requise) | 1,5 | ✅ |

### US-AUTH-01 — Se connecter *(8 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH01-1 | DTO + endpoint `POST /auth/login` + validation | 1,5 | ✅ |
| AUTH01-2 | Vérif `bcrypt.compare()` + message d'erreur générique | 1,5 | ✅ |
| AUTH01-3 | Émission tokens RS256 (access 15 min / refresh 7 j) | 1,5 | ✅ |
| AUTH01-4 | Persistance session + `derniereConnexion` | 1,0 | ✅ |
| AUTH01-5 | Frontend : formulaire login + stockage tokens (mémoire + cookie httpOnly) | 1,5 | ✅ |
| AUTH01-6 | Tests unit + e2e (branches d'erreur DS-01) | 1,0 | ✅ |

### US-AUTH-03 — Rafraîchir la session *(≈ 8 h)* — ✅ Terminé *(réécrite : rotation, ADR-08)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH03-1 | Client + module Redis (premier branchement) ; `REDIS_HOST` requis | 1,5 | ✅ |
| AUTH03-2 | `POST /auth/refresh` : vérif RS256 + expiration + consultation denylist Redis | 1,5 | ✅ |
| AUTH03-3 | Rotation : nouvelle paire émise, ancien refresh brûlé (base + denylist) | 1,5 | ✅ |
| AUTH03-4 | Détection de rejeu : colonne `famille_id` (+ migration backfill) + révocation de famille | 1,5 | ✅ |
| AUTH03-5 | Intercepteur 401 frontend → refresh silencieux (single-flight) → rejeu | 1,5 | ✅ |
| AUTH03-6 | Tests unit + e2e (rotation, rejeu, expiré/révoqué → `/login`) | 1,5 | ✅ |

### US-AUTH-04 — Se déconnecter *(3 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH04-1 | `POST /auth/logout` + blacklist access (par `jti`) et refresh (Redis, TTL) | 1,5 | ✅ |
| AUTH04-2 | Session `active=false` + idempotence + log `LOGOUT` | 1,0 | ✅ |
| AUTH04-3 | Tests unit + e2e (dont rejeu idempotent) | 0,5 | ✅ |

### US-AUTH-11 — Contrôle d'accès par rôle (RBAC) *(7 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH11-1 | `JwtAuthGuard` (vérif RS256 + denylist `jti` + marqueur sessions-valid-after) | 1,5 | ✅ |
| AUTH11-2 | Décorateur `@Roles` + `RolesGuard` + décorateur `@Public` | 1,5 | ✅ |
| AUTH11-3 | Application globale (APP_GUARD) + gestion 403/401 + `GET /auth/me` | 1,5 | ✅ |
| AUTH11-4 | `invalidateUserSessions()` : invalidation immédiate (hook changement de rôle) | 1,5 | ✅ |
| AUTH11-5 | Tests matrice rôles × routes + denylist + invalidation | 1,0 | ✅ |

### Stretch livré (résumé) — ✅ Terminé
| Story | Points | PR | Notes |
|---|:--:|:--:|---|
| US-AUTH-12 — Journal d'audit immuable | 5 | #17 | Writer unique + trigger BDD (immuabilité) + intercepteur global + consultation/export CSV + UI |
| US-CPT-03 — Désactiver / réactiver un compte | 3 | #16 | Motif obligatoire + garde anti-lockout du dernier admin |
| US-ROL-01 — Admin change le rôle | 3 | #15 | Invalidation immédiate de session (réutilise AUTH-11) |
| US-ROL-02 — Demande de changement de rôle | 3 | #18 | Demande utilisateur → approbation/rejet admin |
| US-AUTH-09 + US-AUTH-02 — MFA (TOTP) | 6 | #19 | Activation QR code + connexion en 2 temps (secret en attente Redis, usage unique anti-rejeu) |
| US-INFRA-08 — Documentation API (Swagger) | 3 | #20 | `/api/docs` complet, cadenas ciblés (17/11), `docs-json`, tags |
| US-INFRA-06 — Pipeline CD (GHCR) | 5 | mergé | Build + push images production après CI verte ; déploiement recette manuel documenté ; CD #1 vert |

> **Pilotage :** 1 story = 1 branche = 1 PR = squash-merge, **CI verte obligatoire** avant intégration.
> Un **journal technique** par story dans `engineering-log/` (14 → 20).

### US-CPT-01 — Admin crée un compte — ❌ Retirée (D4)
*Création par l'admin abandonnée : tous les comptes viennent de l'auto-inscription (US-CPT-05) ou d'OAuth
(US-AUTH-14). Conservée pour mémoire.*

### US-AUTH-05 — Activer son compte — ❌ Retirée (D4)
*Sans compte créé vide, l'activation par lien email est sans objet.*

> **Bilan tâches.** Committed : 9 stories, toutes tâches terminées. Stretch : 6 stories + US-CPT-03.
> **Total livré Sprint 1 : 15 stories.**

---

## 4. Task board (instantané de clôture)

| À faire | En cours | Terminé |
|---|---|---|
| — *(CPT-01 / AUTH-05 retirées)* | — | **INF02 · INF03 · INF04 · INF07 · INF05 · AUTH01 · AUTH03 · AUTH04 · AUTH11** (committed) · **AUTH12 · CPT03 · ROL01 · ROL02 · MFA · INFRA08 · INFRA06** (stretch) · **CPT05 · UI auth · AUTH14 · AUTH15** (Sprint 2 tiré) |

> WIP = 1 (contexte solo). **Sprint clôturé : plus rien en « À faire ».**

---

## 5. Ordre de réalisation (chemin critique) — réalisé

`INF02 → INF03 → INF04 + INF07 → INF05 → AUTH01 → AUTH03 → AUTH04 → AUTH11` **(committed)**
`→ [Sprint 2 tiré : CPT05 · UI auth · AUTH14 · AUTH15]`
`→ [stretch : CPT03 · AUTH12 · ROL01 · ROL02 · MFA · INFRA08 · INFRA06]`
CPT-01 et AUTH-05 **retirées** (D4).

---

## 6. Definition of Done (rappel)

Une story n'est `Terminé` que si : développée selon ses critères d'acceptation · **testée** (unitaire +
intégration, branches d'erreur) · règles transverses appliquées (RBAC, validation serveur,
journalisation) · **API documentée** · **CI verte** · revue de code faite · démontrable en Sprint Review.
*(Le déploiement en recette est désormais outillé par US-INFRA-06 — build + push GHCR ; le déploiement SSH
automatique reste à ajouter avec la VM de staging.)*

---

*Sprint Backlog · Cert_EET — Sprint 1 · **CLÔTURÉ** · committed 9/9 + stretch 6/6 · 41 pts committed +
25 pts stretch · Iyed Omri, PFE ESPRIT.*
