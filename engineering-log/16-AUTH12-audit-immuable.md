# Journal 16 — US-AUTH-12 · Journal d'audit immuable (E1 · NF3)

## En une phrase
Rendre la trace des actions sensibles **inviolable et exploitable** : un writer d'audit unique (`AuditService.record`), l'immuabilité garantie au niveau BDD par un trigger, une consultation admin filtrable/paginée + un export CSV, et un intercepteur générique `@Audit` — le tout couvert par des tests unitaires et e2e, avec une page web `/admin/audit`.

## Découpage
- **A — Cœur.** `AuditModule` (`@Global`) exposant `AuditService.record(...)` (writer unique) ; décorateur `@Audit('ACTION')` + `AuditInterceptor` (APP_INTERCEPTOR) ; refactor de toutes les écritures dispersées (auth + admin) vers `record()`.
- **B — Immuabilité.** Migration idempotente : trigger `BEFORE UPDATE OR DELETE` sur `audit_logs` qui `RAISE EXCEPTION`, avec bypass maintenance via GUC `app.audit_maintenance`.
- **C — Consultation.** `GET /admin/audit-logs` + `AuditQueryDto` (filtres + pagination + tri DESC).
- **C-bis — Export.** `GET /admin/audit-logs/export` : CSV de tout le résultat filtré.
- **C-web — UI.** Page `/admin/audit` (tableau filtrable + téléchargement) + barre d'onglets admin.
- **D — Tests + journal + PR.** Unit + e2e ; correction des teardown e2e ; ce journal.

## Endpoints
| Méthode | Route | Rôle | Annotation | Réponse |
|--------|-------|------|-----------|---------|
| GET | `/api/admin/audit-logs` | ADMINISTRATEUR | `@Audit('AUDIT_CONSULTE')` | `{ items, total, page, limit }`, tri horodatage DESC |
| GET | `/api/admin/audit-logs/export` | ADMINISTRATEUR | `@Audit('AUDIT_EXPORTE')` | `text/csv` (pièce jointe, BOM UTF-8), toutes les lignes filtrées |

Filtres communs (optionnels) : `action`, `userId`, `from`, `to` (ISO), `page=1`, `limit=50` (max 200). Aucune route UPDATE/DELETE sur les audit logs.

## Flux
1. Action sensible (LOGIN, LOGOUT, ROLE_CHANGE, COMPTE_DESACTIVE/REACTIVE, COMPTE_CREE, EMAIL_VERIFIE, CONNEXION_OAUTH, PROFIL_COMPLETE) → le service appelle `AuditService.record({ action, acteur, cible?, adresseIp?, resultat?, detailsAvantApres? })` → un `INSERT` dans `audit_logs`.
2. Routes annotées `@Audit` (consultation/export) → `AuditInterceptor` journalise sur succès/échec (acteur = `req.user.sub`, IP = `req.ip`) — best-effort (un échec d'audit est loggé, jamais propagé).
3. Toute tentative d'`UPDATE`/`DELETE` sur `audit_logs` → rejetée par le trigger (`audit_logs est immuable : … interdit`), sauf si `current_setting('app.audit_maintenance', true) = 'on'` (maintenance/tests uniquement).

## Décisions
- **Writer unique (`AuditService.record`).** La trace n'a de valeur probante que centralisée : on retire l'injection directe du repo `AuditLog` d'`auth`/`admin` et on route tout par `record()`. `acteur` (langage métier) est mappé vers la colonne `userId`. Champs absents normalisés à `null`.
- **Immuabilité par trigger** (et non `REVOKE UPDATE,DELETE`) : plus démonstrable et indépendant du rôle applicatif. Bypass par GUC de session `app.audit_maintenance`, activée seulement en `SET LOCAL` dans une transaction (reset automatique au `COMMIT`) — jamais exposée par une route.
- **Périmètre `@Audit`.** L'intercepteur n'est appliqué QU'aux deux nouvelles routes (consulter/exporter le journal est lui-même sensible et non journalisé ailleurs) → **zéro double-log** avec les écritures fines des services.
- **`LOGIN` ajouté** comme écriture fine dans `login()` : action sensible nominale qui n'était pas tracée auparavant.
- **Export** : renvoie **toutes** les lignes correspondant aux filtres (pas une page), garde-fou `MAX_EXPORT = 100000` ; CSV RFC 4180 + BOM UTF-8 (accents lisibles dans Excel).
- **UI** : la page réutilise `apiFetch`/`AdminError` et les tokens CSS existants ; un `app/admin/layout.tsx` ajoute une barre d'onglets (Utilisateurs · Journal d'audit).

## Fichiers
**Backend — nouveaux**
- `src/modules/audit/audit.service.ts` (`record`, `list`, `export`, `buildWhere`)
- `src/modules/audit/audit.module.ts` (`@Global`, controller + interceptor)
- `src/modules/audit/audit.controller.ts` (consultation + export)
- `src/modules/audit/audit.interceptor.ts`
- `src/modules/audit/decorators/audit.decorator.ts`
- `src/modules/audit/dto/audit-query.dto.ts`
- `src/modules/audit/audit-csv.util.ts`
- `src/database/migrations/1785700000000-AddAuditImmutabilityTrigger.ts`
- Tests : `audit.service.spec.ts`, `audit.interceptor.spec.ts`, `audit-csv.util.spec.ts`, `test/audit.e2e-spec.ts`

**Backend — modifiés**
- `src/app.module.ts` (import `AuditModule`)
- `src/modules/auth/auth.service.ts` + `auth.module.ts` + `auth.service.spec.ts` (délégation à `record`, LOGIN, retrait repo `AuditLog`)
- `src/modules/admin/admin-users.service.ts` + `admin.module.ts` + `admin-users.service.spec.ts` (idem)
- `test/auth.e2e-spec.ts`, `test/register.e2e-spec.ts` (teardown via bypass GUC)

**Frontend**
- `src/app/admin/audit/page.tsx` (nouveau), `src/app/admin/layout.tsx` (nouveau)
- `src/lib/api.ts` (`getAuditLogs`, `downloadAuditLogsCsv`), `src/app/globals.css` (styles onglets/filtres/pagination/badges)

## Incidents
- **Migration jamais écrite (coupure réseau).** Le fichier de migration n'a pas été committé sur le disque lors d'une coupure ; `migration:run` a affiché « No migrations are pending » → le trigger n'existait pas → un `UPDATE` de test **réussissait** (faux négatif d'immuabilité). Corrigé en réécrivant le fichier puis en rejouant `migration:run` ; l'`UPDATE`/`DELETE` est ensuite bien rejeté.
- **Teardown e2e bloqués par le trigger.** Trois specs (`auth`, `register`, et le nouveau `audit`) nettoyaient `audit_logs` par un `DELETE` — désormais interdit. Correctif uniforme : encadrer le `DELETE` par une transaction `SET LOCAL app.audit_maintenance='on'` (bypass maintenance).

## Vérification
- **Unit** : `10 suites / 88 tests` verts — `AuditService` (record/list/export), `AuditInterceptor` (annoté/non-annoté, succès/échec, best-effort), util CSV, + specs auth/admin migrées vers le mock `AuditService`.
- **e2e** : `4 suites` vertes (health, register, audit, auth) — INSERT autorisé, `UPDATE`/`DELETE` rejetés par le trigger, `401` sans token, `403` non-admin, filtres + pagination + tri DESC, filtre invalide `400`, `AUDIT_CONSULTE` tracé par l'intercepteur, export `200` (admin) / `403` (non-admin).
- **Manuel psql** : `INSERT` ok ; `UPDATE`/`DELETE` → `ERROR: audit_logs est immuable` ; nettoyage via bypass ok.
- **Manuel HTTP** : `GET /health` → 200 ; `GET /api/admin/audit-logs` sans token → 401.
- **Web** : `/admin/audit` fonctionnel (filtres, pagination, téléchargement CSV).

## CI
Pipeline (`.github/workflows/ci.yml`, scope `apps/api`) : `lint → test:cov → migration:run → test:e2e`. La migration d'immuabilité (idempotente) est jouée **avant** les e2e, donc le trigger est présent en CI et les tests d'immuabilité s'appuient dessus. `apps/web` n'est pas encore linté/testé en CI.

## Suites
- **UI** : redesign éventuel (navbar/header global) — story dédiée ; la page réutilise déjà des tokens/layout centralisés.
- **Audit des échecs de LOGIN** (connexions suspectes, alertes DS-16) : écriture `LOGIN`/`Échec` possible ultérieurement.
- **Tamper-evidence renforcée** : chaînage/hachage des entrées (empreinte de la ligne précédente) pour détecter une altération au niveau stockage, au-delà du blocage applicatif.
