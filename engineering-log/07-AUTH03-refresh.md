# 07 — US-AUTH-03 · Rafraîchir la session (rotation des refresh tokens)

**Épopée :** E1 (Authentification) · **Points :** 3 · **Branche :** `feature/US-AUTH-03-refresh`
**Dépend de :** US-AUTH-01 (login)
**Références :** ADR-08, DS-01 (ét. 4), Note Authentification & Sécurité, Note Redis & Bull

---

## 1. Objectif fonctionnel

Après le login, l'access token (15 min) expire vite. Sans rafraîchissement, l'utilisateur est
déconnecté en pleine activité. En AUTH-01, le refresh token (cookie httpOnly, 7 j) était posé
mais **jamais relu**. Cette story le lit enfin pour émettre un nouvel access token de façon
transparente, et sécurise le tout par **rotation** + **détection de rejeu**.

Livré :
- `POST /auth/refresh` : vérifie le refresh token (signature RS256, clé publique), consulte la
  denylist Redis, contrôle la session en base, puis émet une **nouvelle paire access + refresh
  (rotation)** en brûlant l'ancien.
- **Détection de rejeu** : si un refresh token déjà consommé est represente, toute la **famille**
  de tokens de la connexion est révoquée → reconnexion forcée.
- Chemins d'erreur (absent, invalide, expiré, révoqué, rejeu) → 401 → redirection `/login` via un
  intercepteur 401 côté frontend.

## 2. Décision de conception (à tracer pour la soutenance)

Le Gherkin initial d'US-AUTH-03 disait « **sans** renouveler le refresh token » (pas de rotation).
Or ADR-08 et la Note Authentification & Sécurité imposent la **rotation avec reuse detection**
(défense recommandée OWASP). Contradiction interne aux documents. **Décision : suivre l'ADR**
(rotation), et réécrire US-AUTH-03 en conséquence. La version « sans rotation » est remplacée.
À réconcilier ensuite : Backlog Produit, Sprint Backlog, DS-01 (ét. 4).

## 3. Déroulé de la réalisation (par parties)

- **Partie A — Brancher Redis.** Premier branchement réel de Redis du projet (jusqu'ici : conteneur
  lancé mais aucun client NestJS). Module global `src/redis/`, connexion ioredis unique ouverte au
  boot, `RedisService` avec helpers. `REDIS_HOST` passé en requis.
- **Partie B — Colonne `famille_id`.** Ajout à l'entité + migration manuelle (backfill) pour
  permettre la révocation de famille.
- **Partie C — Endpoint refresh.** `refresh()` dans le service + `POST /auth/refresh` dans le
  contrôleur + `cookie-parser` dans `main.ts`.
- **Partie D — Intercepteur 401 frontend.** `apiFetch` (refresh silencieux, single-flight, rejeu,
  ou redirection `/login`).
- **Partie E — Tests.** Unitaires + e2e, plus corrections induites (voir §6).

## 4. Changements détaillés — classes EXISTANTES modifiées

- **`config/configuration.ts`** — avant : sections `app` + `jwt`. Après : ajout d'une interface
  `RedisConfig` et d'une section `redis` (`host`, `port`) lue depuis `REDIS_HOST`/`REDIS_PORT`.
  Raison : Redis devient load-bearing, il lui faut une config typée (comme `jwt`).
- **`config/env.validation.ts`** — `REDIS_HOST` passe de `.optional()` à `.required()`
  (le commentaire d'INF02 annonçait déjà ce durcissement « à sa propre story »).
- **`app.module.ts`** — ajout de l'import et de `RedisModule` dans `imports`.
- **`database/entities/refresh-token.entity.ts`** — ajout de `familleId`
  (`@Index @Column({ name: 'famille_id', type: 'uuid' })`). Regroupe les tokens d'une même
  connexion.
- **`main.ts`** — ajout de `import * as cookieParser` et `app.use(cookieParser())`. Sans ça,
  `req.cookies` est undefined et `/auth/refresh` ne peut pas lire le cookie.
- **`modules/auth/auth.controller.ts`** — ajout de `POST /auth/refresh` (lit le cookie, 401 si
  absent, sinon délègue au service et repose le cookie roté). Refactor : la pose du cookie
  (auparavant en ligne dans `login`) est factorisée dans `setRefreshTokenCookie()`, réutilisée par
  login ET refresh. Ajout de l'import `UnauthorizedException`.
- **`modules/auth/auth.service.ts`** — changements majeurs :
  - le constructeur **injecte désormais `RedisService`** ;
  - `login()` génère un `familleId` (racine de famille) et le passe à la persistance ;
  - `persistRefreshToken()` prend un paramètre `familleId` ;
  - nouvelle méthode `refresh()` (vérif clé publique + type `refresh`, denylist Redis, lookup base,
    reuse detection, rotation) ;
  - `signAccessToken()`/`signRefreshToken()` ajoutent un `jti` unique (voir §6) ;
  - nouveaux helpers privés : `burnRefreshToken()`, `revokeFamille()`, `hashToken()`,
    `denylistKey()`, `getPublicKey()` ;
  - nouvelle constante `GENERIC_REFRESH_ERROR`.
- **`modules/health/health.controller.ts`** — injecte `ConfigService` ; le seuil du `memory_heap`
  check devient **test-aware** (300 Mo en prod/dev, 1024 Mo en `NODE_ENV=test`). Voir §6.

## 5. Classes / fichiers NOUVEAUX

- `src/redis/redis.constants.ts` — jeton d'injection `REDIS_CLIENT`.
- `src/redis/redis.service.ts` — façade `set/get/exists/del` + fermeture propre (`onModuleDestroy`).
- `src/redis/redis.module.ts` — `@Global`, provider factory ioredis + logs connexion/erreur.
- `src/database/migrations/1784500000000-AddFamilleIdToRefreshTokens.ts` — migration manuelle.
- `apps/web/src/lib/api.ts` (étendu) + `apps/web/src/contexts/AuthContext.tsx` (étendu) — intercepteur.
- `apps/api/package.json` — deps : `ioredis`, `cookie-parser`, `@types/cookie-parser`.

## 6. Problèmes rencontrés et corrections (le vrai déroulé)

1. **`app.module.ts` non sauvegardé (bug d'éditeur).** Après avoir créé le module Redis, le boot
   ne montrait NI `RedisModule` NI `Connecté à Redis`. Diagnostic : `grep -n "Redis" src/app.module.ts`
   renvoyait vide → l'import n'avait jamais été écrit sur disque (même bug silencieux qu'en AUTH-01).
   Correction : réécriture du fichier **depuis le terminal** (`cat > … << 'EOF'`), qui contourne
   l'éditeur. Leçon : après édition, toujours vérifier le disque avant de conclure.

2. **Tokens identiques à la même seconde → `jti` (découvert au smoke test).** Un script jetable
   (login → refresh → rejeu) a montré `access token changed: false`. Cause : deux JWT signés dans la
   MÊME seconde sont byte-identiques (`iat` en secondes, RS256 déterministe). Problème plus grave côté
   refresh : deux tokens identiques → même empreinte SHA-256 → **deux lignes de même hash** en base →
   détection de rejeu ambiguë (quel `findOne` gagne ?). Correction : ajout d'un `jti` aléatoire
   (`crypto.randomUUID()`) à chaque token → unicité garantie. Bénéfice : prépare la révocation ciblée
   d'un access token précis en US-AUTH-04. Après correction : `access token changed: true`, rejeu → 401.

3. **`cookie-parser` manquant — deux fois.** (a) Dans `main.ts` : AUTH-01 ne faisait que POSER le
   cookie (natif Express), jamais le LIRE ; il fallait ajouter le middleware. (b) Dans l'app e2e :
   le test reconstruit l'app à la main et ne rejouait que `setGlobalPrefix` + `ValidationPipe` ; sans
   `app.use(cookieParser())` dans le `beforeAll`, TOUS les tests de refresh auraient renvoyé 401.

4. **Migration `NOT NULL` sur table déjà peuplée.** On ne peut pas ajouter directement une colonne
   `famille_id NOT NULL` si `refresh_tokens` contient déjà des lignes. Migration manuelle en 4 temps :
   add nullable → backfill (`uuid_generate_v4()`) → `SET NOT NULL` → index. `migration:generate` ne
   sait pas produire le backfill : d'où l'écriture à la main.

5. **Health check qui casse la CI e2e.** Après ajout de Redis, `health.e2e-spec.ts` échouait (503,
   `memory_heap` : « Used heap exceeded the set threshold »). Cause : PAS une fuite — sous jest+ts-jest
   le process garde le compilateur TS en mémoire et démarre l'app plusieurs fois ; le heap dépasse
   300 Mo. Correction : seuil `memory_heap` test-aware (1024 Mo en test, 300 Mo strict en prod/dev).

## 7. Changements détaillés — TESTS (par rapport aux versions AUTH-01)

- **`auth.service.spec.ts`** — changement **obligatoire** : le constructeur d'`AuthService` injecte
  maintenant `RedisService`. Sans fournir un mock `RedisService` dans le module de test, même les 6
  tests de login existants ne pouvaient plus instancier le service (« Nest can't resolve
  dependencies »). Ajouts : mock `RedisService` (+ provider), `verifyAsync` sur le mock `JwtService`,
  `findOne`/`update` sur le mock du repo refresh, spy sur `getPublicKey()`, valeurs par défaut de
  `verifyAsync`/`exists` dans `beforeEach`, helper `sessionActive()`, et un `describe('refresh')` de
  8 tests (nominal, rejeu → révocation famille, denylist, inconnu, mauvais type, signature invalide,
  expiré, compte inactif). Total : 6 → 14 tests auth.
- **`test/auth.e2e-spec.ts`** — ajout de `import * as cookieParser` et `app.use(cookieParser())` dans
  `beforeAll` (sinon refresh toujours 401), helper `loginEtRecupererCookieRefresh()`, et 4 tests
  refresh (rotation + cookie roté, sans cookie → 401, cookie invalide → 401, rejeu → 401). Le
  nettoyage `afterAll` s'appuie sur la CASCADE FK (supprimer les users supprime leurs refresh_tokens).
- **`test/jest-e2e.json`** — inchangé.
- **`.github/workflows/ci.yml`** — inchangé : service Redis et `REDIS_HOST=localhost` déjà présents
  (INF05), et l'étape `migration:run` (AUTH-01) exécute automatiquement la migration `famille_id`.
  Cette story est la première à réellement exercer le service Redis et une migration incrémentale en CI.

## 8. Vérification

- **Smoke test manuel** (script jetable, supprimé ensuite) : login → refresh (nouvel access ≠ ancien,
  nouveau cookie) → rejeu de l'ancien cookie → 401.
- **Unitaires** : `docker compose … exec api npm run test` → 16/16.
- **E2e** : `docker compose … exec api npm run test:e2e` → 10/10.
- **Lint** : `docker compose … exec api npm run lint` → propre.

## 9. Suites

- **US-AUTH-04 (logout)** réutilisera la denylist Redis (blacklist access + refresh, TTL) et le `jti`.
- À réconcilier : Backlog Produit, Sprint Backlog, DS-01 (ét. 4) pour refléter la rotation.
