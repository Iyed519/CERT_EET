# 09 — US-AUTH-11 · Contrôle d'accès par rôle (RBAC)

**Épopée :** E1 · **Points :** 5 · **Branche :** `feature/US-AUTH-11-rbac`
**Dépend de :** US-AUTH-01/03/04 · **Références :** ADR-08, DS-01, DS-15, Note Authentification & Sécurité

---

## 1. Objectif fonctionnel

Appliquer le contrôle d'accès par rôle sur chaque endpoint : un utilisateur authentifié dont le
rôle correspond accède ; sinon 403 (rôle insuffisant) ou 401 (non authentifié / jeton révoqué).
De plus, l'invalidation immédiate des sessions d'un utilisateur (ex. après un changement de rôle)
est rendue possible.

## 2. Résumé technique

- **JwtAuthGuard** (authentification, global) : vérifie l'access token (RS256, clé publique),
  consulte la denylist Redis par `jti` (jetons révoqués au logout, US-AUTH-04), vérifie le marqueur
  `sessions-valid-after` (invalidation immédiate), puis attache `req.user`.
- **@Roles + RolesGuard** (autorisation, global) : `@Roles(...)` pose les rôles requis ; RolesGuard
  les compare à `req.user.role` (403 sinon). Aucune contrainte -> route simplement authentifiée.
- **@Public()** : exempte les routes ouvertes du JwtAuthGuard global (login, refresh, logout, health).
  Sécurité par défaut : tout est protégé sauf marqué @Public.
- **GET /auth/me** : route protégée renvoyant l'utilisateur courant (démontre/teste le guard).
- **invalidateUserSessions(userId)** : passe tous les refresh de l'utilisateur en `active=false` et
  pose le marqueur Redis `sessions-valid-after=maintenant` (TTL = durée d'un access token). Appelé
  par US-ROL-01 (changement de rôle) plus tard ; testé directement ici.
- **Refactor** : les clés Redis (`denylist:access`, `denylist:refresh`, `sessions-valid-after`) sont
  centralisées dans `auth.keys.ts`, partagées par le guard ET AuthService (aucune divergence).

## 3. Fichiers

Nouveaux :
- `modules/auth/auth.keys.ts` — constructeurs de clés Redis.
- `modules/auth/auth.types.ts` — `AccessTokenPayload`, `AuthenticatedRequest`.
- `modules/auth/decorators/public.decorator.ts` — `@Public()`.
- `modules/auth/decorators/roles.decorator.ts` — `@Roles()`.
- `modules/auth/guards/jwt-auth.guard.ts` + `guards/roles.guard.ts`.
- Specs : `jwt-auth.guard.spec.ts`, `roles.guard.spec.ts`.

Modifiés :
- `modules/auth/auth.service.ts` — `invalidateUserSessions()` + refactor clés vers `auth.keys`.
- `modules/auth/auth.module.ts` — enregistrement APP_GUARD (JwtAuthGuard puis RolesGuard).
- `modules/auth/auth.controller.ts` — `@Public()` sur login/refresh/logout + `GET /auth/me`.
- `modules/health/health.controller.ts` — `@Public()` + seuil heap robuste (voir §5).
- `test/auth.e2e-spec.ts` — contrôleur de test RBAC + matrice + /me + invalidation.

## 4. Décisions

- **Guard fait main** (pas passport-jwt) : réutilise la vérif RS256 + denylist déjà en place, aucune
  dépendance ajoutée, cohérent avec AUTH-01/03/04. ADR-08 n'impose pas passport (mentionné seulement
  comme piste de mitigation dans le plan de sprint).
- **Guards globaux (APP_GUARD) + @Public** : sécurité par défaut. Enregistrés via APP_GUARD pour
  pouvoir injecter leurs dépendances (Reflector, JwtService, ConfigService, RedisService).
- **Invalidation via Redis (`sessions-valid-after`), pas de migration** : conforme à ADR-08 (Redis
  pour la révocation rapide). Mécanisme complet livré maintenant ; déclencheur = US-ROL-01.

## 5. Points délicats / corrections

- **La denylist access est enfin CONSULTÉE** : AUTH-04 l'alimentait, AUTH-11 la lit à chaque requête
  (JwtAuthGuard). La boucle de révocation est désormais effective de bout en bout.
- **health @Public OBLIGATOIRE** : sans ça, le JwtAuthGuard global bloquerait `/health` et le
  healthcheck Docker échouerait.
- **Seuil heap du health check** : re-cassé en e2e. Cause : le conteneur force `NODE_ENV=development`,
  donc jest ne le passe pas à `test` -> la branche "test" (basée sur NODE_ENV) ne se déclenchait pas.
  Corrigé en détectant le run de test via `JEST_WORKER_ID` (toujours défini par jest), seuil relevé
  à 4096 Mo sous test ; 300 Mo stricts en prod/dev.
- **Invalidation, granularité seconde** : le marqueur `sessions-valid-after` est en secondes ; le test
  e2e attend 1,1 s après le login pour que le marqueur soit strictement postérieur au `iat` du token
  (sinon un token émis la même seconde survivrait — limite connue, négligeable en prod).

## 6. Vérification

- Smoke test manuel : /me (200 avec token, 401 sans, 401 après logout via denylist).
- Unitaires : 30/30 (guards à 100 % de couverture : JwtAuthGuard 7, RolesGuard 4).
- E2e : 18/18 (matrice rôle×route 403/200, /me, invalidation -> 401, + login/refresh/logout).
- Lint : propre.

## 7. CI

Aucune modif `ci.yml` : pas de nouvelle dépendance ni de migration.

## 8. Suites

- **US-ROL-01** (changement de rôle) appellera `invalidateUserSessions()` après la mise à jour du rôle.
- Les vraies routes métier protégées utiliseront `@Roles(...)` (le contrôleur de test RBAC n'existe
  qu'en e2e).
