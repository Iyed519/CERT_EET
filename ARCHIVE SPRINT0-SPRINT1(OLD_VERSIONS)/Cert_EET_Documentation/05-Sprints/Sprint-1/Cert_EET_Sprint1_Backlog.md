# Cert_EET — Sprint 1 · Sprint Backlog

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri
> **Sprint :** 1 — « Fondations backend & infrastructure »
> **Période :** 08 mai → 21 mai 2026 (2 semaines · 10 jours ouvrés)
> **Équipe :** 1 développeur (solo)
> **Version :** révisée en cours de sprint (statuts réels + décisions de périmètre, juillet 2026)
>
> *Ce document est le **Sprint Backlog** (artefact Scrum, vivant) : il combine le **Sprint Goal** (pourquoi), les **éléments du Product Backlog sélectionnés** (quoi) et le **plan de réalisation en tâches** (comment). Les statuts ci-dessous reflètent l'état réel d'avancement.*

---

## 1. Sprint Goal (le « pourquoi »)

> **Un backend entièrement conteneurisé, intégré en continu, avec authentification JWT complète (connexion, rafraîchissement avec rotation, déconnexion), contrôle d'accès par rôle (RBAC) et un schéma de base de données initial opérationnel — le socle sur lequel s'appuieront la création et l'activation de comptes.**

> *Note : le Sprint Goal initial mentionnait « un administrateur crée un compte, l'utilisateur l'active par email ». Ce parcours (US-CPT-01 + US-AUTH-05) reste engagé ; une décision produit prise en cours de sprint ouvre par ailleurs l'inscription publique en self-service (ADR-11) — les stories correspondantes (US-CPT-05, US-AUTH-14) sont ajoutées au Product Backlog et visées pour le Sprint 2.*

---

## 2. Éléments du Product Backlog sélectionnés (le « quoi »)

### 2.1 Engagement ferme (committed) — état réel

| # | Story | Épop. | Points | Priorité | Statut |
|---|-------|-------|:-----:|:--------:|:------:|
| 1 | US-INFRA-02 — Squelette NestJS + Next.js | E0 | 3 | Must | Terminé |
| 2 | US-INFRA-03 — Docker Compose multi-services | E0 | 5 | Must | Terminé |
| 3 | US-INFRA-04 — Schéma BDD + migrations | E0 | 5 | Must | Terminé |
| 4 | US-INFRA-07 — Gestion des secrets | E0 | 2 | Must | Terminé |
| 5 | US-INFRA-05 — Pipeline CI (lint + tests) | E0 | 3 | Must | Terminé |
| 6 | US-AUTH-01 — Se connecter (email + mot de passe) | E1 | 5 | Must | Terminé |
| 7 | US-AUTH-03 — Rafraîchir la session (avec rotation) | E1 | **5** | Must | Terminé |
| 8 | US-AUTH-04 — Se déconnecter (révocation Redis) | E1 | 2 | Must | Terminé |
| 9 | US-AUTH-11 — Contrôle d'accès par rôle (RBAC) | E1 | 5 | Must | Terminé |
| 10 | US-CPT-01 — Admin crée un compte | E2 | 3 | Must | À faire |
| 11 | US-AUTH-05 — Activer son compte (lien email) | E1 | 3 | Must | À faire |
| | **Total engagé** | | **41 pts** | | **9/11 terminées** |

> *Repointing : US-AUTH-03 passe de 3 à **5 pts** — le périmètre réellement livré (rotation des refresh
> tokens + détection de rejeu + premier branchement applicatif de Redis) est nettement supérieur au
> « simple refresh » estimé initialement. Total engagé : 39 → 41 pts.*

### 2.2 Extension (stretch — tirée seulement si la marge le permet, dans cet ordre)

| Ordre | Story | Épop. | Points | Statut |
|:-----:|-------|-------|:-----:|:------:|
| 12 | US-AUTH-12 — Journal d'audit immuable | E1 | 5 | À faire |
| 13 | US-ROL-01 — Admin change le rôle d'un utilisateur | E2 | 3 | À faire *(le mécanisme d'invalidation immédiate est déjà livré par AUTH-11)* |
| 14 | US-INFRA-06 — Pipeline CD (déploiement recette) | E0 | 5 | À faire |
| 15 | US-AUTH-09 + US-AUTH-02 — MFA (activation + connexion) *(bundle)* | E1 | 6 | À faire |
| 16 | US-INFRA-08 — Documentation API (OpenAPI/Swagger) | E0 | 3 | Partiel *(décorateurs posés au fil des stories)* |

### 2.3 Évolution de périmètre (décisions prises en cours de sprint)

Traçabilité des décisions actées pendant la réalisation — le détail (lignes de backlog + Gherkin)
est porté au **Product Backlog v1.1** ; l'architecture est actée dans l'**ADR v2.2** :

1. **US-AUTH-03 livrée avec rotation + détection de rejeu** (mise en conformité avec l'ADR-08 ; la
   première rédaction de la story disait l'inverse et a été réécrite). Révision consignée : **ADR-08-R1**.
2. **Inscription publique en self-service** (décision produit, modèle ouvert curaté type Coursera/edX) :
   nouvelle story **US-CPT-05 — Créer son propre compte** (rôle APPRENANT forcé, vérification email).
   US-CPT-01 (création par l'admin) est conservée pour les comptes internes. → **Sprint 2**.
3. **Authentification sociale** : nouvelle story **US-AUTH-14 — OAuth2 Google / Facebook / GitHub**
   (Google en premier, liaison de compte). → **Sprint 2**, après le register email.
4. **Onboarding formateur curaté** (nouvel **ADR-11**) : rôle FORMATEUR = éligibilité globale accordée
   sur dossier ; droits d'enseignement **par cours** ; domaine « Demande » (workflows d'approbation).
   Stories à rédiger avec l'épopée Cours/Formations — introduira une **autorisation par ressource**
   complémentaire au RBAC global.

---

## 3. Plan de réalisation — décomposition en tâches (le « comment »)

Chaque tâche : code, estimation en heures, statut (`À faire` / `En cours` / `Terminé`).

### US-INFRA-02 — Squelette NestJS + Next.js *(5 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF02-1 | Init NestJS (TS strict, structure `src/modules`, lint/format) | 1,5 | Terminé |
| INF02-2 | Module de configuration + validation des variables d'env (fail-fast) | 1,5 | Terminé |
| INF02-3 | Endpoint `GET /health` | 0,5 | Terminé |
| INF02-4 | Init Next.js (App Router) + layout + coquille `/login` | 1,5 | Terminé |

### US-INFRA-03 — Docker Compose multi-services *(8 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF03-1 | Dockerfile multi-stage `api` | 1,5 | Terminé |
| INF03-2 | Dockerfile multi-stage `web` | 1,5 | Terminé |
| INF03-3 | `docker-compose.yml` (api, web, postgres, redis, nginx) | 2,0 | Terminé |
| INF03-4 | Healthchecks + `depends_on` (l'API attend Postgres prêt) | 1,5 | Terminé |
| INF03-5 | Config Nginx (routage `/api`↔`/` + terminaison TLS de base) | 1,0 | Terminé |
| INF03-6 | Fichiers d'override `dev` / `recette` | 0,5 | Terminé |

### US-INFRA-04 — Schéma BDD + migrations *(7 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF04-1 | DataSource TypeORM + setup migrations | 1,5 | Terminé |
| INF04-2 | Entité `User` + enums `Role`, `StatutCompte` | 2,0 | Terminé |
| INF04-3 | Entité `AuditLog` (immuable) | 1,0 | Terminé |
| INF04-4 | Entité `RefreshToken` + `Formation` (squelette) | 1,0 | Terminé |
| INF04-5 | 1re migration + seed admin bootstrap | 1,5 | Terminé |

### US-INFRA-07 — Gestion des secrets *(3 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF07-1 | `.env.example` + schéma de validation + `.gitignore` secrets | 1,0 | Terminé |
| INF07-2 | Génération paire de clés RS256 (JWT) + injection env/secrets | 1,0 | Terminé |
| INF07-3 | Démarrage fail-fast si un secret requis manque | 1,0 | Terminé |

### US-INFRA-05 — Pipeline CI *(5 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INF05-1 | Workflow GitHub Actions (install + lint ESLint/Prettier) | 1,5 | Terminé |
| INF05-2 | Job tests unitaires + intégration (services Postgres + Redis) | 2,0 | Terminé |
| INF05-3 | Rapport de couverture + protection de branche (CI verte requise) | 1,5 | Terminé |

### US-AUTH-01 — Se connecter *(8 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH01-1 | DTO + endpoint `POST /auth/login` + validation | 1,5 | Terminé |
| AUTH01-2 | Vérif `bcrypt.compare()` + message d'erreur générique | 1,5 | Terminé |
| AUTH01-3 | Émission tokens RS256 (access 15 min / refresh 7 j) | 1,5 | Terminé |
| AUTH01-4 | Persistance session + `derniereConnexion` | 1,0 | Terminé |
| AUTH01-5 | Frontend : formulaire login + stockage tokens (mémoire + cookie httpOnly) | 1,5 | Terminé |
| AUTH01-6 | Tests unit + e2e (branches d'erreur DS-01) | 1,0 | Terminé |

### US-AUTH-03 — Rafraîchir la session *(≈ 8 h)* — Terminé *(réécrite : rotation, ADR-08)*
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH03-1 | Client + module Redis (premier branchement applicatif) ; `REDIS_HOST` → requis | 1,5 | Terminé |
| AUTH03-2 | `POST /auth/refresh` : vérif RS256 + expiration + consultation denylist Redis | 1,5 | Terminé |
| AUTH03-3 | Rotation : nouvelle paire émise, ancien refresh brûlé (base + denylist) | 1,5 | Terminé |
| AUTH03-4 | Détection de rejeu : colonne `famille_id` (+ migration avec backfill) + révocation de famille | 1,5 | Terminé |
| AUTH03-5 | Intercepteur 401 frontend → refresh silencieux (single-flight) → rejeu | 1,5 | Terminé |
| AUTH03-6 | Tests unit + e2e (rotation, rejeu, expiré/révoqué → `/login`) | 1,5 | Terminé |

### US-AUTH-04 — Se déconnecter *(3 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH04-1 | `POST /auth/logout` + blacklist access (par `jti`) et refresh (Redis, TTL) | 1,5 | Terminé |
| AUTH04-2 | Session `active=false` + idempotence + log `LOGOUT` (écriture minimale `audit_logs`) | 1,0 | Terminé |
| AUTH04-3 | Tests unit + e2e (dont rejeu idempotent) | 0,5 | Terminé |

### US-AUTH-11 — Contrôle d'accès par rôle (RBAC) *(7 h)* — Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH11-1 | `JwtAuthGuard` (vérif RS256 + denylist `jti` + marqueur sessions-valid-after) | 1,5 | Terminé |
| AUTH11-2 | Décorateur `@Roles` + `RolesGuard` + décorateur `@Public` | 1,5 | Terminé |
| AUTH11-3 | Application globale (APP_GUARD) + gestion 403/401 + `GET /auth/me` | 1,5 | Terminé |
| AUTH11-4 | `invalidateUserSessions()` : invalidation immédiate (hook changement de rôle) | 1,5 | Terminé |
| AUTH11-5 | Tests matrice rôles × routes + denylist + invalidation | 1,0 | Terminé |

### US-CPT-01 — Admin crée un compte *(5 h)* — À faire
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| CPT01-1 | DTO + `POST /admin/users` (protégé `@Roles(ADMINISTRATEUR)`) + unicité email (409) | 1,5 | À faire |
| CPT01-2 | Création `EN_ATTENTE_ACTIVATION` + token d'activation (UUID, TTL 48 h) | 1,5 | À faire |
| CPT01-3 | Envoi email d'activation (adaptateur SMTP ; Mailhog en dev) | 1,5 | À faire |
| CPT01-4 | Log `COMPTE_CREE` + tests (409 email déjà utilisé) | 0,5 | À faire |

> *Réutilisera l'infrastructure email montée par US-CPT-05 (auto-inscription) si celle-ci passe en premier ;
> la protection `@Roles(ADMINISTRATEUR)` est fournie par US-AUTH-11.*

### US-AUTH-05 — Activer son compte *(4 h)* — À faire
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH05-1 | Endpoint `activate` + validation token / TTL | 1,5 | À faire |
| AUTH05-2 | Définition mot de passe (`bcrypt` cost 12) → statut `ACTIF` | 1,0 | À faire |
| AUTH05-3 | Frontend : page d'activation | 1,0 | À faire |
| AUTH05-4 | Branche d'erreur (token expiré/consommé) + tests | 0,5 | À faire |

> **49 tâches engagées.** Réalisé : 9 stories (toutes tâches terminées). Reste : CPT-01 + AUTH-05 (~9 h).

---

## 4. Task board (instantané courant)

| À faire | En cours | Terminé |
|---|---|---|
| **CPT01** : 1, 2, 3, 4 · **AUTH05** : 1, 2, 3, 4 | — | **INF02** · **INF03** · **INF04** · **INF07** · **INF05** · **AUTH01** · **AUTH03** · **AUTH04** · **AUTH11** (toutes tâches) |

> WIP = 1 (contexte solo).

---

## 5. Ordre de réalisation (chemin critique) — réalisé et reste à faire

`INF02 → INF03 → INF04 + INF07 → INF05 → AUTH01 → AUTH03 → AUTH04 → AUTH11` **(réalisé)**
`→ CPT01 → AUTH05` **(reste committed)** `→ [extension · nouvelles stories Sprint 2 : US-CPT-05, US-AUTH-14]`

---

## 6. Definition of Done (rappel)

Une story n'est `Terminé` que si : développée selon ses critères d'acceptation · **testée** (unitaire +
intégration, branches d'erreur couvertes) · règles transverses appliquées (RBAC, validation serveur,
journalisation) · **API documentée** · **CI verte** · revue de code faite · démontrable en Sprint Review.
*(Réf. L1 du Backlog Produit. Le déploiement en recette dépend de US-INFRA-06, en extension.)*

---

*Sprint Backlog · Cert_EET — Sprint 1 · 9/11 stories terminées · 41 pts engagés · Iyed Omri, PFE ESPRIT.*
