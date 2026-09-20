# US-INFRA-08 — Documentation API (OpenAPI/Swagger)

## En une phrase
La doc OpenAPI est finalisée sur `/api/docs` : tous les endpoints sont groupés
par tag, décrits et testables, et le bouton « Authorize » injecte un access
token JWT sur les seules routes protégées (cadenas), pour servir de contrat
d'API et faciliter la démo Sprint Review et l'intégration front (Definition of
Done « API documentée »).

## Découpage
- **A — Audit de couverture.** Inventaire des 7 contrôleurs / routes / DTO :
  `@ApiTags` (7/7), `@ApiOperation` (1 par route, 100 %), `@ApiResponse`
  (présent partout sauf `health`), `@ApiProperty` (12/12 DTO). Seul vrai manque :
  `@ApiBearerAuth` absent partout → aucun cadenas, « Authorize » sans effet.
- **B — Complétion.** `@ApiBearerAuth('access-token')` sur les routes protégées
  (classe pour les contrôleurs 100 % protégés, route pour `auth` mixte) ;
  réponses ajoutées à `health`.
- **C — Réglages UI/config.** Schéma bearer nommé, `persistAuthorization`,
  exposition du JSON, descriptions de tags.
- **D — Journal + PR.**

## Config (main.ts)
- **Schéma bearer nommé `access-token`** : `addBearerAuth({ type:'http',
  scheme:'bearer', bearerFormat:'JWT', name:'Authorization', in:'header',
  description:… }, 'access-token')`. Un seul schéma JWT, référencé par tous les
  `@ApiBearerAuth('access-token')`.
- **`SwaggerModule.setup(..., { swaggerOptions:{ persistAuthorization:true },
  jsonDocumentUrl:'api/docs-json' })`** : le token collé survit au rafraîchissement
  (confort démo) ; le contrat brut est exposé pour smoke test.
- **5 `addTag()`** avec descriptions : `auth`, `admin`, `role-requests`,
  `referentiel`, `health` (regroupement + ordre lisibles).

## Flux (Authorize)
1. L'utilisateur récupère un access token via `POST /auth/login` (puis
   `POST /auth/mfa/verify` si MFA active).
2. Bouton « Authorize » → collage du token → Swagger l'ajoute en
   `Authorization: Bearer <token>` sur toute route portant
   `@ApiBearerAuth('access-token')`.
3. Les routes `@Public` (aucun `@ApiBearerAuth`) n'affichent pas de cadenas et
   n'envoient pas de token. `persistAuthorization` conserve le token entre deux
   rechargements de page.

## Cartographie du cadenas
| Portée | Cible | Cadenas |
|---|---|---|
| Classe | `admin-users`, `audit`, `referentiel`, `admin-role-requests`, `role-requests` | oui |
| Route | `auth` : `me`, `profile`, `mfa/setup`, `mfa/enable`, `mfa/disable` | oui |
| Route | `auth` : register, verify-email, oauth×4, login, mfa/verify, refresh, logout | non (`@Public`) |
| Route | `health` | non (`@Public`) |

## Décisions
- **Application ciblée plutôt que sécurité globale.** Les guards sont globaux
  (`JwtAuthGuard` + `RolesGuard` via `APP_GUARD`) avec opt-out `@Public`. Une
  sécurité globale dans le `DocumentBuilder` aurait affiché un cadenas aussi sur
  les routes publiques. On applique donc `@ApiBearerAuth` route par route (ou
  classe pour les contrôleurs 100 % protégés) → cadenas exactement là où une
  session est requise.
- **Schéma nommé `access-token`** (au lieu du `bearer` par défaut) : identifiant
  explicite et lisible dans le JSON OpenAPI. Impact strictement Swagger : aucun
  effet runtime (guards, header réel, JWT, front, DB inchangés) ; seul risque en
  cas de nom incohérent = cadenas non affiché.
- **Niveau classe pour les contrôleurs 100 % protégés** : une annotation par
  contrôleur au lieu d'une par route, moins de bruit, pas d'oubli possible.
- **`health` documenté mais sans cadenas** : `@ApiOkResponse` (payload Terminus)
  + `@ApiServiceUnavailableResponse`, en gardant `@Public` (healthcheck Docker
  sans jeton).

## Fichiers
Backend (aucune modif front — story backend/infra)
- `apps/api/src/main.ts` (schéma bearer nommé, persistAuthorization,
  jsonDocumentUrl, 5 addTag)
- `src/modules/admin/admin-users.controller.ts` (@ApiBearerAuth classe)
- `src/modules/audit/audit.controller.ts` (@ApiBearerAuth classe)
- `src/modules/referentiel/referentiel.controller.ts` (@ApiBearerAuth classe)
- `src/modules/role-requests/admin-role-requests.controller.ts` (@ApiBearerAuth classe)
- `src/modules/role-requests/role-requests.controller.ts` (@ApiBearerAuth classe)
- `src/modules/auth/auth.controller.ts` (@ApiBearerAuth sur 5 routes protégées)
- `src/modules/health/health.controller.ts` (@ApiOkResponse + @ApiServiceUnavailableResponse)

## Incidents
- **Watcher aveugle au bind-mount (Windows).** `nest --watch` ne détecte pas les
  modifs faites sur l'hôte → `restart api` pour recompiler. Aucune dépendance npm
  ajoutée (décorateurs déjà fournis par `@nestjs/swagger`) → pas de rebuild ni de
  `--renew-anon-volumes`.

## Vérification
- **Audit statique (couverture)** : `@ApiBearerAuth('access-token')` = 10
  décorateurs (5 classes + 5 routes `auth`) ; `@ApiTags` 7/7 ; `@ApiOperation`
  1/route ; `@ApiResponse` désormais présent sur `health`.
- **Introspection du contrat généré** (`GET /api/docs-json`, 20/09/2026) : schéma
  de sécurité `access-token` = `http/bearer/JWT` ; 5 tags décrits ; **17 routes
  protégées** (cadenas) / **11 publiques** — mapping conforme au tableau
  ci-dessus (chaque route `@Public` sans cadenas, toutes les autres avec).
- **lint** : clean (0 erreur ; warning « TypeScript version non supportée »
  préexistant, sans incidence). **test:cov** : 11 suites / 110 tests verts
  (aucune régression ; le `db down` du test d'interceptor audit est simulé).
- **Pas de test unitaire Swagger** (conforme au périmètre) : vérification
  manuelle + smoke JSON.
- **Manuel** (`http://localhost:3000/api/docs`) : endpoints groupés par tag avec
  descriptions ; cadenas présents/absents conformes à la cartographie ci-dessus ;
  « Authorize » + access token → route protégée (ex. `GET /api/me`) en `200`.
- **Smoke** : `GET /api/docs-json` → `200`, OpenAPI valide.

## CI
Pipeline inchangé (`.github/workflows/ci.yml`, scope `apps/api`) :
`lint → test:cov → migration:run → test:e2e`. Aucune migration. `apps/web` hors
périmètre (non touché).

## Suites
- Exemples de requêtes/réponses (`@ApiBody` examples) sur les DTO complexes.
- Génération d'un client TypeScript pour le front à partir de `docs-json`.
- Regroupement des réponses d'erreur communes (401/403) via un décorateur maison.
