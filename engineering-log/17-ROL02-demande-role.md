# US-ROL-02 — Demande de changement de rôle (self-service)

## En une phrase
Un utilisateur authentifié soumet une demande de montée en rôle (→ FORMATEUR ou
ADMINISTRATEUR) qu'un administrateur approuve (le rôle est appliqué en
réutilisant le cœur d'US-ROL-01) ou rejette avec motif — chaque décision étant
tracée (NF3).

## Découpage
- **A — Modèle & migration.** Enums `RoleDemande` (FORMATEUR/ADMINISTRATEUR) et
  `StatutDemande` (EN_ATTENTE/APPROUVEE/REJETEE) ; entité `DemandeRole` (table
  `demandes_role`) ; migration idempotente `1785800000000`.
- **B — Création & consultation (utilisateur).** `POST /role-requests`,
  `GET /role-requests/me`.
- **C — Traitement (admin).** `GET /admin/role-requests`,
  `PATCH /admin/role-requests/:id/approve`, `.../reject`.
- **D — UI.** Page admin `/admin/role-requests` (+ onglet), page utilisateur
  `/mon-role` (+ lien d'en-tête), client API, badges de statut.
- **E — Tests + journal + PR.**

## Endpoints
| Méthode | Route | Accès | Rôles |
|---|---|---|---|
| POST | `/role-requests` | authentifié | tous |
| GET | `/role-requests/me` | authentifié | tous |
| GET | `/admin/role-requests` | admin | ADMINISTRATEUR |
| PATCH | `/admin/role-requests/:id/approve` | admin | ADMINISTRATEUR |
| PATCH | `/admin/role-requests/:id/reject` | admin | ADMINISTRATEUR |

Codes : création `201` / `400` (rôle déjà détenu ou justification invalide) /
`409` (demande déjà en attente) / `401` (sans token) ; traitement `200` /
`403` (non-admin) / `404` (introuvable) / `409` (déjà traitée) ; rejet `400`
(motif manquant).

## Flux
1. **Créer.** `RoleRequestsService.creer` : existence de l'auteur → rôle déjà
   détenu (400) → demande EN_ATTENTE déjà présente (409) → insertion EN_ATTENTE.
2. **Approuver.** `approuver` : charge la demande (404), refuse si non
   EN_ATTENTE (409), appelle `AdminUsersService.appliquerChangementRole`
   (maj rôle + invalidation des sessions + audit `ROLE_CHANGE` + anti-lockout,
   SANS step-up), puis passe la demande à APPROUVEE (+ `traitePar`, `traiteAt`).
3. **Rejeter.** `rejeter` : charge la demande (404/409), passe à REJETEE
   (+ motif), audit `DEMANDE_ROLE_TRAITEE`. Aucun changement de rôle.

## Décisions
- **Extraction du cœur ROL-01.** `AdminUsersService.changeRole` a été scindé :
  `changeRole` fait le step-up mot de passe puis délègue à une méthode publique
  `appliquerChangementRole(adminId, cibleId, nouveauRole, context)` qui porte la
  logique commune. C'est le SEUL émetteur de l'audit `ROLE_CHANGE` → l'approbation
  ne le ré-émet pas (pas de double trace pour une seule décision). `AdminModule`
  exporte désormais `AdminUsersService` ; `RoleRequestsModule` l'importe.
- **`RoleDemande` = enum restreint** (distinct de `Role`) → `@IsEnum` rejette en
  400 toute autre valeur, y compris APPRENANT : on ne demande qu'une montée en
  rôle. L'anti-lockout hérité reste intact mais ne se déclenche jamais sur une
  montée.
- **Pas d'audit à la création** : seules les décisions admin (approbation via
  `ROLE_CHANGE`, rejet via `DEMANDE_ROLE_TRAITEE`) sont tracées.
- **Entité sans relation ManyToOne** : `user_id`/`traite_par` en colonnes uuid
  (comme `audit_logs`), FK contraintes en base (CASCADE sur l'auteur, SET NULL
  sur l'admin). La liste admin joint l'identité des demandeurs en une 2e requête
  (`In(userIds)`).
- **Module dédié `role-requests`** (cohésion), deux contrôleurs séparés
  (utilisateur vs admin) par préfixe de route et protection.

## Fichiers
Backend
- `src/database/enums/role-demande.enum.ts`, `statut-demande.enum.ts`
- `src/database/entities/demande-role.entity.ts`
- `src/database/migrations/1785800000000-AddDemandesRole.ts`
- `src/modules/role-requests/{role-requests.module,role-requests.controller,admin-role-requests.controller,role-requests.service}.ts`
- `src/modules/role-requests/dto/{create-role-request,list-role-requests,reject-role-request}.dto.ts`
- `src/modules/role-requests/role-requests.service.spec.ts`
- `src/modules/admin/admin-users.service.ts` (refactor), `admin.module.ts` (export)
- `src/app.module.ts` (enregistrement `RoleRequestsModule`)
- `test/role-requests.e2e-spec.ts`

Frontend
- `web/src/lib/api.ts` (types + `createRoleRequest`, `getMesDemandesRole`,
  `getAdminRoleRequests`, `approveRoleRequest`, `rejectRoleRequest`)
- `web/src/app/admin/role-requests/page.tsx`, `web/src/app/mon-role/page.tsx`
- `web/src/components/RoleRequestNav.tsx`
- `web/src/app/admin/layout.tsx` (onglet), `web/src/app/layout.tsx` (lien),
  `web/src/app/globals.css` (badges EN_ATTENTE/APPROUVEE/REJETEE)

## Incidents
- **Collision de classe CSS.** Le garde d'idempotence de l'ajout des badges a
  fait un faux positif : `.statut-EN_ATTENTE` est contenu dans le
  `.statut-EN_ATTENTE_ACTIVATION` déjà présent (US-CPT-03). Corrigé en gardant
  sur `.statut-APPROUVEE`. Les deux classes coexistent sans conflit (noms
  distincts).
- **Piège Docker/Windows confirmé.** Rebuild `up -d --build api` +
  `migration:run` obligatoires après ajout du module/route/migration ; le
  watcher ne mappe pas les nouvelles routes à chaud.

## Vérification
- **Unit** : `role-requests.service.spec.ts` (création 201/400/409/404,
  approbation réutilise le cœur sans double audit + mapping des rôles, rejet +
  audit, 404/409, `listerAdmin`). `admin-users.service.spec.ts` inchangé et
  toujours vert (refactor transparent). → `test:cov` : **11 suites / 99 tests**.
- **e2e** : `role-requests.e2e-spec.ts` (401/201/409/400, 403/200 admin,
  approve → rôle changé + APPROUVEE + `ROLE_CHANGE` unique, 409 re-approve,
  reject → REJETEE + `DEMANDE_ROLE_TRAITEE`, 400 sans motif). Teardown :
  `demandes_role` (DELETE normal) → `audit_logs` (bypass GUC
  `app.audit_maintenance`) → users. → `test:e2e` : **5 suites / 46 tests**.
- **Smoke manuel** (curl) : mêmes codes, `role_change=1` en base après approve.

## CI
Pipeline inchangé (`.github/workflows/ci.yml`, scope `apps/api`) :
`lint → test:cov → migration:run → test:e2e`. La migration `demandes_role`
(idempotente) est jouée avant les e2e → la table est présente dans le pipeline.
`apps/web` n'est toujours pas linté/testé en CI.

## Suites
- Notification au demandeur (email) à l'approbation/rejet — non couvert ici.
- Historique/annulation d'une demande par l'utilisateur.
- Lint/tests `apps/web` en CI.
