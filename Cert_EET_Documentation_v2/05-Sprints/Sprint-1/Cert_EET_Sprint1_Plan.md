# Cert_EET — Plan de Sprint 1

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri
> **Sprint :** 1 — « Fondations backend & infrastructure »
> **Période :** 08 mai → 21 mai 2026 (2 semaines · 10 jours ouvrés)
> **Équipe :** 1 développeur (solo)
> **Objectif Gantt :** Docker Compose · CI/CD de base · authentification JWT/MFA · RBAC (3 rôles) · structure base de données
> 
> **Révision (juillet 2026) :** US-AUTH-03 livrée avec rotation des refresh tokens + détection de rejeu (mise en conformité avec l’ADR-08) et repointée 3 → 5 pts ; total engagé 39 → 41 pts. L’état d’avancement au jour le jour vit dans le Sprint Backlog.
>
> **Révision v2 (CHANGELOG §0) :** **US-CPT-01 et US-AUTH-05 retirées** (D4 — création de comptes par l'admin abandonnée ; auto-inscription + OAuth suffisent). Le Sprint Goal ci-dessous mentionne encore « un administrateur crée un compte, l'utilisateur l'active par email » — ce parcours est **abandonné** : lire « un visiteur crée lui-même son compte (email + mot de passe **ou** Google/GitHub), le vérifie par email, complète son profil apprenant, et se connecte ». Livré en avance : US-CPT-05, refonte UI, US-AUTH-14 (Google+GitHub), US-AUTH-15 (profil).

---

## 1. Objectif du Sprint (Sprint Goal)

> **À la fin du Sprint 1, un administrateur peut créer un compte ; l'utilisateur l'active par email et se connecte (avec MFA optionnelle) sur un backend entièrement conteneurisé, intégré en continu (CI), avec un contrôle d'accès par rôle et un schéma de base de données initial opérationnel.**

Ce but est **démontrable** de bout en bout en Sprint Review (cf. §7) et constitue le socle technique sur lequel s'appuieront tous les sprints fonctionnels suivants (QCM, ateliers, certification, IA).

---

## 2. Hypothèse de capacité

Premier sprint → **aucune vélocité historique** : la capacité ci-dessous est une hypothèse de planification, à recalibrer à la rétrospective.

- 10 jours ouvrés − temps de cérémonies (Planning, Review, Rétro) ≈ **9 jours productifs**.
- Une partie importante du sprint est de l'**outillage bien balisé** (Docker, CI, squelette) à faible incertitude.
- **Capacité de planification retenue : ~38 points en engagement ferme + ~22 points en objectif d'extension (stretch).**

> Le périmètre Gantt complet de Sprint 1 (≈ 55 pts) est ambitieux pour un solo sur 2 semaines. On le découpe donc en **noyau engagé** (indispensable au Sprint Goal) et **extension** (visée mais première à glisser au Sprint 2 si la vélocité réelle est plus basse).

---

## 3. Sprint Backlog

### 3.1 Engagé (noyau — chemin critique du Sprint Goal)

| Ordre | ID | Story | Épop. | Points | Pourquoi dans le noyau |
|---|---|---|---|---|---|
| 1 | US-INFRA-02 | Squelette NestJS + Next.js | E0 | 3 | Rien ne se construit sans le squelette |
| 2 | US-INFRA-03 | Docker Compose multi-services | E0 | 5 | Stack reproductible = prérequis de tout test |
| 3 | US-INFRA-04 | Schéma BDD + migrations | E0 | 5 | Sans entités `User`/`AuditLog`, pas d'auth |
| 4 | US-INFRA-07 | Gestion des secrets | E0 | 2 | Clés JWT RS256, mdp BDD injectés proprement |
| 5 | US-INFRA-05 | Pipeline CI (lint + tests) | E0 | 3 | Qualité dès la 1re PR |
| 6 | US-AUTH-01 | Se connecter (email + mot de passe) | E1 | 5 | Cœur du Sprint Goal |
| 7 | US-AUTH-03 | Rafraîchir la session (avec rotation) | E1 | 5 | Sessions utilisables sans re-login |
| 8 | US-AUTH-04 | Se déconnecter (révocation Redis) | E1 | 2 | Boucle de session complète |
| 9 | US-AUTH-11 | Contrôle d'accès par rôle (RBAC) | E1 | 5 | RBAC = objectif Gantt explicite |
| 10 | US-CPT-01 | Admin crée un compte | E2 | 3 | Source des comptes à connecter |
| 11 | US-AUTH-05 | Activer son compte (lien email) | E1 | 3 | Boucle « créer → activer → se connecter » |
| | | **Total engagé** | | **41** | |

### 3.2 Extension (stretch — visé, dans cet ordre de priorité)

| Ordre | ID | Story | Épop. | Points | Note |
|---|---|---|---|---|---|
| 12 | US-AUTH-12 | Journal d'audit immuable | E1 | 5 | Branche les logs des autres stories |
| 13 | US-ROL-01 | Admin change le rôle d'un utilisateur | E2 | 3 | Complète la démo RBAC |
| 14 | US-INFRA-06 | Pipeline CD (déploiement recette) | E0 | 5 | Objectif Gantt « CI/CD » — peut suivre la stabilisation |
| 15 | US-AUTH-09 + US-AUTH-02 | MFA : activation + à la connexion *(bundle)* | E1 | 6 | À traiter ensemble (02 dépend de 09) |
| 16 | US-INFRA-08 | Documentation API (OpenAPI/Swagger) | E0 | 3 | Continu ; formalisée si temps |
| | | **Total extension** | | **22** | |

### 3.3 Explicitement reporté au Sprint 2 (et au-delà)

- **Gestion de profil en self-service** : US-AUTH-06 (mot de passe oublié), US-AUTH-07 (profil), US-AUTH-08 (changer mot de passe), US-AUTH-10 (désactiver MFA) → dépendent d'une auth stabilisée, hors chemin critique de la démo Sprint 1.
- **Cycle de vie des comptes** : US-CPT-02 (import CSV), US-CPT-03 (désactivation), US-CPT-04 (anonymisation RGPD) → Sprint 2.
- **Formations & inscriptions** (E2) → Sprint 2 (prérequis aux modules d'évaluation).
- **Durcissement sécurité** US-AUTH-13 (TLS/HSTS/rate-limit) → **Sprint 10** (OWASP), avec une terminaison TLS minimale déjà posée par le reverse proxy en US-INFRA-03.

---

## 4. Découpage en tâches (Sprint Planning)

### US-INFRA-02 — Squelette NestJS + Next.js *(3)*
- Init NestJS (TypeScript strict, structure `src/modules`, ESLint/Prettier hérités du Sprint 0).
- Module de configuration avec **validation des variables d'env (fail-fast)**.
- Endpoint `GET /health`.
- Init Next.js (App Router), layout de base + coquille de la page `/login`.

### US-INFRA-03 — Docker Compose multi-services *(5)*
- Dockerfiles multi-stage `api` et `web`.
- `docker-compose.yml` : `api`, `web`, `postgres`, `redis`, `nginx` (reverse proxy).
- `depends_on` + **healthchecks** (l'API attend Postgres prêt).
- Fichiers d'override `dev` / `recette`.
- Config Nginx (routage `/api` → api, `/` → web, terminaison TLS de base).

### US-INFRA-04 — Schéma BDD + migrations *(5)*
- DataSource TypeORM + setup migrations.
- Entités : **`User`** (UUID, email, passwordHash, role, statut, mfaActive, mfaSecret, derniereConnexion), **`AuditLog`** (immuable), `Session`/refresh refs ; `Formation` (squelette).
- Enums : `Role` (APPRENANT / FORMATEUR / ADMIN), `StatutCompte`.
- 1re migration + **seed d'un compte admin bootstrap**.

### US-INFRA-07 — Gestion des secrets *(2)*
- `.env.example` + schéma de validation ; `.gitignore` des secrets.
- Génération de la **paire de clés RS256** (JWT) ; injection via env/secrets Docker.
- Démarrage **fail-fast** si un secret requis manque.

### US-INFRA-05 — Pipeline CI *(3)*
- Workflow GitHub Actions : install → lint → tests unitaires → tests d'intégration (services Postgres + Redis) → rapport de couverture.
- Protection de branche : **CI verte obligatoire** avant merge.

### US-AUTH-01 — Se connecter *(5)*
- `POST /auth/login` (DTO + validation), `bcrypt.compare()`.
- Émission **access RS256 (15 min)** + **refresh (7 j)** ; persistance de session ; `derniereConnexion`.
- **Message d'erreur générique** (compte inexistant = mauvais mot de passe = compte inactif).
- Frontend : formulaire login, stockage (access en mémoire, refresh en cookie `httpOnly`).
- Tests unitaires + intégration incluant les **branches d'erreur (DS-01)**.

### US-AUTH-03 — Rafraîchir la session *(5)*
- `POST /auth/refresh` : vérif RS256 + **consultation denylist Redis** → **rotation** (nouvelle paire access + refresh, ancien brûlé).
- **Détection de rejeu** : un refresh consommé représenté → révocation de toute la famille de tokens → `/login`.
- Frontend : intercepteur 401 → refresh silencieux → rejeu de la requête.
- Tests (rotation, rejeu, refresh expiré/révoqué → redirection `/login`).

### US-AUTH-04 — Se déconnecter *(2)*
- `POST /auth/logout` : **blacklist access + refresh** (Redis, TTL = durée restante) ; session `active=false`.
- Idempotence ; log `LOGOUT` (stub si US-AUTH-12 non encore livrée).
- Tests.

### US-AUTH-11 — RBAC (guards) *(5)*
- `JwtAuthGuard` + décorateur `@Roles` + `RolesGuard`.
- Application sur les routes protégées ; gestion **403 / 401**.
- Hook : **changement de rôle → invalidation immédiate des sessions**.
- Tests de la matrice (chaque rôle vs chaque route).

### US-CPT-01 — Admin crée un compte *(3)*
- `POST /admin/users` (DTO), **vérification unicité email**.
- Création `EN_ATTENTE_ACTIVATION` + token d'activation (UUID, **TTL 48 h**).
- Envoi email d'activation (**adaptateur SMTP ; Mailhog en dev**) ; log `COMPTE_CREE`.
- Tests (dont **409** email déjà utilisé).

### US-AUTH-05 — Activer son compte *(3)*
- `GET/POST /auth/activate` : validation token + TTL.
- Définition mot de passe (`bcrypt` cost 12) → statut `ACTIF`.
- Frontend : page d'activation.
- Branche d'erreur : token expiré (≥ 48 h) ou déjà consommé.
- Tests.

> *Tâches d'extension (12-16)* : journalisation via intercepteur global (US-AUTH-12) ; QR/secret TOTP + confirmation (US-AUTH-09) puis `mfaToken` 5 min + vérif TOTP (US-AUTH-02) ; workflow CD build/push/deploy recette (US-INFRA-06) ; décorateurs Swagger (US-INFRA-08).

---

## 5. Séquencement indicatif (jour par jour)

| Jour | Focus | Stories |
|---|---|---|
| **J1** | Sprint Planning (matin) + démarrage | US-INFRA-02 |
| **J2** | Conteneurisation | US-INFRA-03 |
| **J3** | Données & secrets | US-INFRA-04, US-INFRA-07 |
| **J4** | Qualité + début auth | US-INFRA-05, US-AUTH-01 (début) |
| **J5** | Auth cœur | US-AUTH-01 (fin), US-AUTH-03 · *Refinement Sprint 2 (fin de journée)* |
| **J6** | Session & accès | US-AUTH-04, US-AUTH-11 |
| **J7** | Boucle compte | US-CPT-01, US-AUTH-05 |
| **J8** | Extension | US-AUTH-12, US-ROL-01 |
| **J9** | Extension + intégration | US-INFRA-06 / bundle MFA · tests d'intégration · corrections |
| **J10** | Stabilisation + clôture | Finalisation tests/docs · **Sprint Review** · **Rétrospective** |

**Principe de séquencement :** l'**infrastructure est front-loadée (J1-J4)** car elle débloque tout le reste ; l'auth suit une fois la stack et la BDD prêtes ; l'extension n'est attaquée qu'après le noyau.

---

## 6. Dépendances & risques

| Risque | Impact | Mitigation |
|---|---|---|
| Goulot d'étranglement solo sur l'infra | Retard en cascade | Infra concentrée J1-J4 ; pas d'auth avant stack prête |
| Complexité clés JWT **RS256** + blocklist Redis | Auth instable | Libs éprouvées (passport-jwt) ; clé générée tôt (US-INFRA-07) ; tester le refresh/logout dès J5-J6 |
| **SMTP** indisponible pour les emails d'activation | US-CPT-01 / US-AUTH-05 bloquées | **Mailhog en dev** ; SMTP institutionnel = *question ouverte L4-6 du backlog* à confirmer |
| Périmètre dense (39 + 22 pts) | Sur-engagement | WIP strict ; re-priorisation quotidienne ; l'extension glisse **dans l'ordre** au Sprint 2 |
| MFA + CD plus longs que prévu | Objectif Gantt partiel | Traités en extension ; MFA livrable tôt en Sprint 2 sans rupture du Sprint Goal |

---

## 7. Plan de démonstration (Sprint Review)

1. `docker compose up` → **toute la stack démarre** (api, web, postgres, redis, nginx).
2. Une **PR avec CI verte** (lint + tests + couverture).
3. **Admin crée un compte** → email d'activation reçu (Mailhog) → l'utilisateur **active + définit son mot de passe**.
4. **Connexion** → obtention des jetons → accès à une route protégée par rôle (**RBAC**) → **refus** sur un rôle non autorisé.
5. **Refresh** transparent puis **déconnexion** (jeton révoqué, accès immédiatement coupé).
6. *(extension)* Connexion **MFA** (TOTP), entrées du **journal d'audit**, **déploiement recette** via CD.

---

## 8. Cérémonies Scrum

| Cérémonie | Quand | Objet |
|---|---|---|
| Sprint Planning | J1 (matin) | Valider le Sprint Goal et le sprint backlog ci-dessus |
| Daily (auto-point) | Chaque jour (≤ 15 min) | Avancement, blocages, re-priorisation |
| Backlog Refinement | J5 | Affiner/estimer les stories du Sprint 2 (formations, inscriptions, profil) |
| Sprint Review | J10 | Démo (§7) au commanditaire / encadrant |
| Rétrospective | J10 | Mesurer la vélocité réelle, ajuster le process |

---

## 9. Definition of Done (rappel)

Une story est *Done* si : développée selon ses critères d'acceptation · **testée** (unitaire + intégration, branches d'erreur couvertes) · règles transverses appliquées (RBAC, validation serveur, journalisation) · **API documentée** · **CI verte** · revue de code faite · **déployée en recette** · démontrable en Review. *(Référence : L1 du backlog produit.)*

---

*Plan de Sprint 1 · Cert_EET v1.0 — engagé 39 pts / extension 22 pts · Iyed Omri, PFE ESPRIT.*
