# Cert_EET — Sprint 1 · Sprint Backlog

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri
> **Sprint :** 1 — « Fondations backend & infrastructure »
> **Période :** 08 mai → 21 mai 2026 (2 semaines · 10 jours ouvrés)
> **Équipe :** 1 développeur (solo)
>
> *Ce document est le **Sprint Backlog** (artefact Scrum, vivant) : il combine le **Sprint Goal** (pourquoi), les **éléments du Product Backlog sélectionnés** (quoi) et le **plan de réalisation en tâches** (comment), avec le suivi capacité/burndown. Les statuts sont à mettre à jour chaque jour.*

---

## 1. Sprint Goal (le « pourquoi »)

> **Un administrateur peut créer un compte ; l'utilisateur l'active par email et se connecte (MFA optionnelle) sur un backend entièrement conteneurisé, intégré en continu, avec contrôle d'accès par rôle et un schéma de base de données initial opérationnel.**

---

## 2. Éléments du Product Backlog sélectionnés (le « quoi »)

Stories tirées du Product Backlog (épopées E0/E1/E2) pour ce sprint.

### 2.1 Engagement ferme (committed)

| # | Story | Épop. | Points | Priorité |
|---|-------|-------|:-----:|:--------:|
| 1 | US-INFRA-02 — Squelette NestJS + Next.js | E0 | 3 | Must |
| 2 | US-INFRA-03 — Docker Compose multi-services | E0 | 5 | Must |
| 3 | US-INFRA-04 — Schéma BDD + migrations | E0 | 5 | Must |
| 4 | US-INFRA-07 — Gestion des secrets | E0 | 2 | Must |
| 5 | US-INFRA-05 — Pipeline CI (lint + tests) | E0 | 3 | Must |
| 6 | US-AUTH-01 — Se connecter (email + mot de passe) | E1 | 5 | Must |
| 7 | US-AUTH-03 — Rafraîchir la session | E1 | 3 | Must |
| 8 | US-AUTH-04 — Se déconnecter (révocation Redis) | E1 | 2 | Must |
| 9 | US-AUTH-11 — Contrôle d'accès par rôle (RBAC) | E1 | 5 | Must |
| 10 | US-CPT-01 — Admin crée un compte | E2 | 3 | Must |
| 11 | US-AUTH-05 — Activer son compte (lien email) | E1 | 3 | Must |
| | **Total engagé** | | **39 pts** | **≈ 60 h** |

### 2.2 Extension (stretch — tirée seulement si la marge le permet, dans cet ordre)

| Ordre | Story | Épop. | Points |
|:-----:|-------|-------|:-----:|
| 12 | US-AUTH-12 — Journal d'audit immuable | E1 | 5 |
| 13 | US-ROL-01 — Admin change le rôle d'un utilisateur | E2 | 3 |
| 14 | US-INFRA-06 — Pipeline CD (déploiement recette) | E0 | 5 |
| 15 | US-AUTH-09 + US-AUTH-02 — MFA (activation + connexion) *(bundle)* | E1 | 6 |
| 16 | US-INFRA-08 — Documentation API (OpenAPI/Swagger) | E0 | 3 |

> Les critères d'acceptation (Gherkin) de chaque story sont définis dans le **Backlog Produit** (réf. E0/E1/E2). Le Sprint Backlog se concentre sur le **plan de tâches** ci-dessous.

---

## 3. Plan de réalisation — décomposition en tâches (le « comment »)

Chaque tâche : code, estimation en heures, statut (`À faire` / `En cours` / `Terminé`).

### US-INFRA-02 — Squelette NestJS + Next.js *(5 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF02-1 | Init NestJS (TS strict, structure `src/modules`, lint/format) | 1,5 | À faire |
| INF02-2 | Module de configuration + validation des variables d'env (fail-fast) | 1,5 | À faire |
| INF02-3 | Endpoint `GET /health` | 0,5 | À faire |
| INF02-4 | Init Next.js (App Router) + layout + coquille `/login` | 1,5 | À faire |

### US-INFRA-03 — Docker Compose multi-services *(8 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF03-1 | Dockerfile multi-stage `api` | 1,5 | À faire |
| INF03-2 | Dockerfile multi-stage `web` | 1,5 | À faire |
| INF03-3 | `docker-compose.yml` (api, web, postgres, redis, nginx) | 2,0 | À faire |
| INF03-4 | Healthchecks + `depends_on` (l'API attend Postgres prêt) | 1,5 | À faire |
| INF03-5 | Config Nginx (routage `/api`↔`/` + terminaison TLS de base) | 1,0 | À faire |
| INF03-6 | Fichiers d'override `dev` / `recette` | 0,5 | À faire |

### US-INFRA-04 — Schéma BDD + migrations *(7 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF04-1 | DataSource TypeORM + setup migrations | 1,5 | À faire |
| INF04-2 | Entité `User` + enums `Role`, `StatutCompte` | 2,0 | À faire |
| INF04-3 | Entité `AuditLog` (immuable) | 1,0 | À faire |
| INF04-4 | Entité `Session`/refresh + `Formation` (squelette) | 1,0 | À faire |
| INF04-5 | 1re migration + seed admin bootstrap | 1,5 | À faire |

### US-INFRA-07 — Gestion des secrets *(3 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF07-1 | `.env.example` + schéma de validation + `.gitignore` secrets | 1,0 | À faire |
| INF07-2 | Génération paire de clés RS256 (JWT) + injection env/secrets | 1,0 | À faire |
| INF07-3 | Démarrage fail-fast si un secret requis manque | 1,0 | À faire |

### US-INFRA-05 — Pipeline CI *(5 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF05-1 | Workflow GitHub Actions (install + lint ESLint/Prettier) | 1,5 | À faire |
| INF05-2 | Job tests unitaires + intégration (services Postgres + Redis) | 2,0 | À faire |
| INF05-3 | Rapport de couverture + protection de branche (CI verte requise) | 1,5 | À faire |

### US-AUTH-01 — Se connecter *(8 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH01-1 | DTO + endpoint `POST /auth/login` + validation | 1,5 | À faire |
| AUTH01-2 | Vérif `bcrypt.compare()` + message d'erreur générique | 1,5 | À faire |
| AUTH01-3 | Émission tokens RS256 (access 15 min / refresh 7 j) | 1,5 | À faire |
| AUTH01-4 | Persistance session + `derniereConnexion` | 1,0 | À faire |
| AUTH01-5 | Frontend : formulaire login + stockage tokens | 1,5 | À faire |
| AUTH01-6 | Tests unit + intégration (branches d'erreur DS-01) | 1,0 | À faire |

### US-AUTH-03 — Rafraîchir la session *(5 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH03-1 | `POST /auth/refresh` + vérif refresh + consult. blocklist Redis | 2,0 | À faire |
| AUTH03-2 | Intercepteur 401 frontend → refresh silencieux → rejeu | 2,0 | À faire |
| AUTH03-3 | Tests (refresh expiré / blacklisté → `/login`) | 1,0 | À faire |

### US-AUTH-04 — Se déconnecter *(3 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH04-1 | `POST /auth/logout` + blacklist access/refresh Redis (TTL) | 1,5 | À faire |
| AUTH04-2 | Session `active=false` + idempotence + log `LOGOUT` | 1,0 | À faire |
| AUTH04-3 | Tests | 0,5 | À faire |

### US-AUTH-11 — Contrôle d'accès par rôle (RBAC) *(7 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH11-1 | `JwtAuthGuard` | 1,5 | À faire |
| AUTH11-2 | Décorateur `@Roles` + `RolesGuard` | 1,5 | À faire |
| AUTH11-3 | Application sur routes protégées + gestion 403/401 | 1,5 | À faire |
| AUTH11-4 | Hook : changement de rôle → invalidation immédiate des sessions | 1,5 | À faire |
| AUTH11-5 | Tests de la matrice rôles × routes | 1,0 | À faire |

### US-CPT-01 — Admin crée un compte *(5 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| CPT01-1 | DTO + `POST /admin/users` + vérification unicité email | 1,5 | À faire |
| CPT01-2 | Création `EN_ATTENTE_ACTIVATION` + token (UUID, TTL 48 h) | 1,5 | À faire |
| CPT01-3 | Adaptateur email SMTP (Mailhog en dev) + envoi activation | 1,5 | À faire |
| CPT01-4 | Log `COMPTE_CREE` + tests (409 email déjà utilisé) | 0,5 | À faire |

### US-AUTH-05 — Activer son compte *(4 h)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH05-1 | Endpoint `activate` + validation token / TTL | 1,5 | À faire |
| AUTH05-2 | Définition mot de passe (`bcrypt` cost 12) → statut `ACTIF` | 1,0 | À faire |
| AUTH05-3 | Frontend : page d'activation | 1,0 | À faire |
| AUTH05-4 | Branche d'erreur (token expiré/consommé) + tests | 0,5 | À faire |

> **48 tâches · 60 h engagées.**

---

## 4. Task board (instantané au démarrage)

| À faire | En cours | Terminé |
|---|---|---|
| **INF02** : 1, 2, 3, 4 | — | — |
| **INF03** : 1, 2, 3, 4, 5, 6 | | |
| **INF04** : 1, 2, 3, 4, 5 | | |
| **INF07** : 1, 2, 3 | | |
| **INF05** : 1, 2, 3 | | |
| **AUTH01** : 1, 2, 3, 4, 5, 6 | | |
| **AUTH03** : 1, 2, 3 | | |
| **AUTH04** : 1, 2, 3 | | |
| **AUTH11** : 1, 2, 3, 4, 5 | | |
| **CPT01** : 1, 2, 3, 4 | | |
| **AUTH05** : 1, 2, 3, 4 | | |

> À chaque Daily : déplacer les tâches entre colonnes et reporter les heures restantes dans le burndown (§6). Une seule tâche `En cours` à la fois (WIP = 1, contexte solo).

---

## 5. Ordre de réalisation conseillé (chemin critique)

Infrastructure **front-loadée** (rien ne se teste sans la stack), puis l'auth, puis la boucle compte ; l'extension n'est attaquée qu'après le noyau.

`INF02 → INF03 → INF04 + INF07 → INF05 → AUTH01 → AUTH03 → AUTH04 → AUTH11 → CPT01 → AUTH05 → [extension]`

Repère par jour : **J1-J2** INF02-03 · **J3** INF04+INF07 · **J4** INF05 + début AUTH01 · **J5** AUTH01-03 · **J6** AUTH04+AUTH11 · **J7** CPT01+AUTH05 · **J8-J9** extension + intégration · **J10** stabilisation + Review/Rétro.

---

## 6. Capacité & burndown

**Capacité :** 10 jours ouvrés − ~1 jour de cérémonies = **9 jours productifs × ~7 h ≈ 63 h disponibles**.
**Engagement :** **60 h** → marge ~3 h (tampon). L'extension ne consomme pas la capacité engagée : elle n'est tirée que si la marge ou une vélocité supérieure le permettent.

### Burndown (heures restantes — ligne idéale ; remplir « Réel » au Daily)

| Jour | Idéal restant | Réel restant |
|:--:|:--:|:--:|
| Début | 60 | 60 |
| J1 | 53 | |
| J2 | 47 | |
| J3 | 40 | |
| J4 | 33 | |
| J5 | 27 | |
| J6 | 20 | |
| J7 | 13 | |
| J8 | 7 | |
| J9 | 0 | |
| J10 | 0 (tampon) | |

---

## 7. Definition of Done (rappel)

Une story n'est `Terminé` que si : développée selon ses critères d'acceptation · **testée** (unitaire + intégration, branches d'erreur couvertes) · règles transverses appliquées (RBAC, validation serveur, journalisation) · **API documentée** · **CI verte** · revue de code faite · **déployée en recette** · démontrable en Sprint Review. *(Réf. L1 du Backlog Produit.)*

---

*Sprint Backlog · Cert_EET — Sprint 1 · 11 stories engagées · 48 tâches · 60 h / 63 h · Iyed Omri, PFE ESPRIT.*
