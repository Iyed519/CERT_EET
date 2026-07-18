# 08 — US-AUTH-04 · Se déconnecter (logout, révocation Redis)

**Épopée :** E1 (Authentification) · **Points :** 2 · **Branche :** `feature/US-AUTH-04-logout`
**Dépend de :** US-AUTH-01 (login), US-AUTH-03 (rotation/denylist) · **Références :** ADR-08, DS-01 (ét. 5)

---

## 1. Objectif fonctionnel

Permettre à l'utilisateur de se déconnecter et de révoquer immédiatement ses jetons, pour
qu'aucune session ne reste exploitable. `POST /auth/logout` :
- place l'**access token** ET le **refresh token** sur la denylist Redis (TTL = durée restante) ;
- met la session courante à `active = false` (via le refresh token) ;
- journalise un événement `LOGOUT` en base ;
- reste **idempotent** : rejouer un logout (jeton déjà révoqué / session déjà fermée) renvoie 200
  sans erreur exploitable.

## 2. Résumé technique

- **Endpoint** `POST /auth/logout` (auth.controller.ts) : lit l'access token dans l'en-tête
  `Authorization: Bearer` (pas encore de JwtAuthGuard — voir §4), le refresh token dans le cookie
  httpOnly, délègue à `AuthService.logout()`, efface le cookie, renvoie toujours 200.
- **AuthService.logout()** :
  1. access token -> `denylist:access:<jti>` dans Redis, TTL calculé depuis `exp` ;
  2. refresh token -> `burnRefreshToken()` (réutilisé d'AUTH-03 : `active=false` + `denylist:refresh:<hash>`) ;
  3. audit `LOGOUT` écrit une seule fois, uniquement si quelque chose a réellement été révoqué.
- **Audit** : écriture minimale et isolée dans un helper `journaliserLogout()` (repository AuditLog),
  pour que US-AUTH-12 puisse la remplacer par un AuditService sans toucher au reste.
- **Frontend** : fonction `logout()` (lib/api.ts) — appelle l'endpoint avec l'access token, puis
  nettoie la session locale et redirige vers `/login` (dans un `finally` : la déconnexion ne doit
  jamais échouer côté utilisateur). Réutilise le `forceLogout()` de l'intercepteur 401 (AUTH-03).

## 3. Fichiers touchés

- `apps/api/src/modules/auth/auth.service.ts` — `logout()`, `decodeAccessToken()`, `accessDenylistKey()`,
  `remainingSeconds()`, `journaliserLogout()` ; injection du repository `AuditLog` ; renommage
  `denylistKey` -> `refreshDenylistKey` (+ ajout de `accessDenylistKey`) pour distinguer les deux denylists.
- `apps/api/src/modules/auth/auth.controller.ts` — endpoint `POST /auth/logout` + `res.clearCookie`.
- `apps/api/src/modules/auth/auth.module.ts` — ajout de `AuditLog` à `TypeOrmModule.forFeature`.
- `apps/web/src/lib/api.ts` — fonction `logout()`.
- `apps/api/src/modules/auth/auth.service.spec.ts` — mock `AuditLog` (obligatoire, sinon même les
  tests existants ne s'instancient plus) + 3 tests logout.
- `apps/api/test/auth.e2e-spec.ts` — cookie-parser déjà présent ; 3 tests logout + nettoyage
  explicite des `audit_logs` (voir §4) + helper `seConnecter()`.

## 4. Points délicats / décisions

- **Pas de JwtAuthGuard avant US-AUTH-11.** Le logout lit donc l'access token à la main dans
  l'en-tête. Conséquence assumée : on ÉCRIT l'access token sur la denylist dès maintenant, mais rien
  ne la CONSULTE à chaque requête tant que le JwtAuthGuard (US-AUTH-11) n'existe pas. La révocation
  du refresh est, elle, pleinement effective immédiatement. Séquencement voulu, pas un bug.
- **Clé denylist access = `denylist:access:<jti>`**, TTL = secondes jusqu'à `exp`. Le `jti` ajouté en
  AUTH-03 sert exactement à ça (révocation ciblée d'un access token précis).
- **Audit LOGOUT = écriture réelle minimale** (et non un simple stub) : l'entité `audit_logs` existe
  déjà (INF04) et le Gherkin demande « journalise LOGOUT ». Isolé dans un helper pour évoluer
  proprement vers l'AuditService d'US-AUTH-12.
- **Idempotence** : on ne blackliste l'access que s'il n'est pas déjà sur la denylist, on ne brûle le
  refresh que s'il est encore actif, et on ne journalise QUE si quelque chose a été révoqué. Un rejeu
  ne fait donc rien de plus et ne lève aucune erreur (200).
- **Nettoyage des audit_logs en e2e** : contrairement à `refresh_tokens` (FK `onDelete CASCADE`),
  `audit_logs` n'a pas de cascade — c'est voulu (l'audit doit survivre à la suppression d'un compte).
  Le `afterAll` supprime donc explicitement les `audit_logs` des comptes de test (par `userId IN (...)`).

## 5. Vérification

- **Smoke test manuel** (script jetable) : login -> logout (200) -> refresh avec l'ancien cookie
  (401, refresh brûlé) -> logout rejoué (200, idempotent).
- **Unitaires** : `npm run test:cov` -> 19/19 (dont 3 logout : révocation+audit, idempotence, sans jetons).
- **E2e** : `npm run test:e2e` -> 13/13 (dont 3 logout : invalide le refresh, idempotent, sans jeton).
- **Lint** : propre.

## 6. CI

Aucune modification de `ci.yml` : Redis, `REDIS_HOST` et `migration:run` déjà en place. Pas de
nouvelle migration dans cette story (la colonne `famille_id` d'AUTH-03 suffit ; l'audit LOGOUT
utilise la table `audit_logs` existante).

## 7. Suites

- **US-AUTH-11 (RBAC guards)** : c'est là que la `denylist:access:<jti>` écrite ici sera enfin
  CONSULTÉE à chaque requête (JwtAuthGuard), rendant la révocation d'access token pleinement effective.
- **US-AUTH-12 (journal d'audit)** : remplacera `journaliserLogout()` par un AuditService dédié + immuabilité.
