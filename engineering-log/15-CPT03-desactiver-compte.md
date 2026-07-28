# 15 — US-CPT-03 · Désactiver / bannir un compte

**Épopée :** E2 (Gestion des comptes) · **Points :** 3 · **Branche :** `feature/US-CPT-03-desactiver-compte`
**Dépend de :** US-ROL-01 (console admin), US-AUTH-01 (login refuse tout statut ≠ ACTIF) · **Réf :** DS-15 (P2), ADR-08-R1

## 0. En une phrase
Un administrateur désactive (bannit) ou réactive un compte, avec motif obligatoire à la désactivation,
sans jamais pouvoir se verrouiller hors de la plateforme (anti-lockout sur le dernier admin actif).

## 1. Découpage
- **A** — backend : `ChangeStatutDto` ; `AdminUsersService.desactiverCompte` / `reactiverCompte` ;
  anti-lockout factorisé + invalidation des sessions + audit ; route `PATCH /admin/users/:id`.
- **B** — frontend : badge de statut + bouton « Désactiver »/« Réactiver » par ligne sur
  `/admin/utilisateurs`, modale de saisie du motif à la désactivation.
- **C** — tests (unitaires service + validation DTO) ; journal ; PR → squash-merge après CI verte.

## 2. Endpoints
`PATCH /api/admin/users/:id` — corps `{ statut: 'DESACTIVE' | 'ACTIF', motif? }`.
- Route de **gestion de compte** sur la ressource `:id` (PAS de sous-route `/statut`) : le corps porte
  l'intention. Coexiste avec `PATCH /admin/users/:id/role` (US-ROL-01), chemins distincts.
- `@Roles(ADMINISTRATEUR)` hérité de la classe (RolesGuard global, US-AUTH-11) → 403 pour tout non-admin.
- `motif` requis si `statut = DESACTIVE` (400 sinon), ignoré si `ACTIF`.
- **Aucun mot de passe admin** exigé (différence assumée avec ROL-01 / CPT-04 : pas de step-up ici).

## 3. Flux
**Désactivation :** existence de la cible (404) → déjà désactivée ? (400) → anti-lockout : dernier admin
actif ? (403, **avant toute écriture**) → `statut = DESACTIVE` → `invalidateUserSessions(cible)` (ADR-08-R1)
→ audit `COMPTE_DESACTIVE` (motif dans `detailsAvantApres`) → 200.
**Réactivation :** existence (404) → déjà active ? (400) → `statut = ACTIF` → audit `COMPTE_REACTIVE`
(pas de motif, pas d'invalidation de session) → 200.

## 4. Décisions
- **Route ressource, pas sous-route `/statut`** : `PATCH /admin/users/:id` est LA route de gestion de
  compte ; le statut est un champ du corps. Évite la prolifération de sous-routes par attribut.
- **Anti-lockout factorisé** : la brique `COUNT WHERE role=ADMINISTRATEUR AND statut=ACTIF` est extraite en
  `private compterAdminsActifs()`, réutilisée par `changeRole` (US-ROL-01) et `desactiverCompte`. Chaque
  appelant garde son **message** propre (« rétrograder » vs « désactiver »).
- **Vérification anti-lockout AVANT écriture** : sur 403, aucune ligne n'est modifiée (critère d'acceptation).
- **Pas de step-up mot de passe** : conforme au handoff — une session admin valide suffit. La réauth par
  mot de passe reste réservée aux actions de ROL-01 / CPT-04.
- **Invalidation à la désactivation seulement** : un compte banni doit perdre l'accès sur-le-champ ; la
  réactivation ne révoque rien (le compte n'avait plus de session active).
- **Motif tracé dans l'audit** (`detailsAvantApres.motif`) : traçabilité de la décision (départ / suspension).
- **Pas de migration** : la colonne `statut` (enum `StatutCompte`) et l'entité `AuditLog` existent déjà ;
  les nouvelles actions (`COMPTE_DESACTIVE` / `COMPTE_REACTIVE`) sont de simples valeurs de chaîne.
- **Statuts administrables restreints** : `@IsIn([ACTIF, DESACTIVE])` — `EN_ATTENTE_ACTIVATION` (US-CPT-05)
  et `ANONYMISE` (US-CPT-04) relèvent d'autres flux et sont refusés à l'entrée.

## 5. Fichiers
**Nouveaux — backend :** `modules/admin/dto/change-statut.dto.ts` ;
`modules/admin/dto/change-statut.dto.spec.ts`.
**Modifiés — backend :** `modules/admin/admin-users.service.ts` (`desactiverCompte`, `reactiverCompte`,
`compterAdminsActifs`, `toVue` ; `changeRole` refactoré sur les briques partagées) ;
`modules/admin/admin-users.controller.ts` (`PATCH :id`) ;
`modules/admin/admin-users.service.spec.ts` (suites CPT-03).
_`admin.module.ts` inchangé : `User`, `AuditLog` et `AuthModule` (donc `AuthService`) sont déjà câblés._
**Modifiés — frontend :** `lib/api.ts` (`changeUserStatut`) ;
`app/admin/utilisateurs/page.tsx` (badge statut, boutons Désactiver/Réactiver, `DesactiverModal`) ;
`app/globals.css` (badges `.statut-*`, `.row-actions`, `.btn-danger`, `.btn-danger-solid`).

## 6. Incidents & corrections
- **Piège Docker/Windows — watcher (confirmé, comme US-AUTH-15)** : les fichiers ajoutés/modifiés hors
  éditeur ne déclenchent pas le rebuild à chaud. Symptômes rencontrés : (1) côté `web`, Next servait un
  `api.ts` en cache → `Attempted import error: 'changeUserStatut' is not exported` et modale en « Une
  erreur est survenue » ; (2) côté `api`, la nouvelle route n'était pas mappée → `Cannot PATCH
  /api/admin/users/:id`. **Correctif** : `docker compose … restart web` puis `restart api` (recompilation
  au boot + remapp des routes). En cas de cache incrémental tenace : `up -d --build <service>`.
- **Accès par nginx (port 80), pas le dev server** : ouvrir `http://localhost/...`, pas `:3001`. Le proxy
  `/api/*` (et donc login mot de passe **et** callbacks OAuth) n'existe que derrière nginx ; sur `:3001`
  tout `/api/*` renvoie 404 (« Une erreur est survenue » au login).

## 7. Vérification
- **Unitaires — service (`admin-users.service.spec.ts`)** : désactivation nominale (statut → DESACTIVE,
  `invalidateUserSessions` appelé, audit `COMPTE_DESACTIVE` avec motif) ; 404 cible introuvable ;
  400 déjà désactivé ; **403 dernier admin actif (aucune écriture)** ; désactivation autorisée s'il reste
  d'autres admins ; réactivation (statut → ACTIF, audit `COMPTE_REACTIVE`, **pas** d'invalidation) ;
  404 / 400 déjà actif.
- **Unitaires — DTO (`change-statut.dto.spec.ts`)** : **motif manquant → erreur** ; motif vide → erreur ;
  motif > 500 → erreur ; réactivation sans motif → OK ; statut non administrable → erreur.
- **Résultat CI locale** : `npm run lint` → 0 problème ; `npm run test` → **7 suites, 72 tests OK**
  (dont les suites CPT-03 service + DTO).
- **Manuel (bout en bout, via `http://localhost/admin/utilisateurs`)** : désactivation d'un apprenant avec
  motif → route `PATCH /api/admin/users/:id` (200), badge « Désactivé ». _(Restent à confirmer avant
  merge : dernier admin → 403, et réactivation → badge « Actif ».)_

## 8. CI
Aucune variable d'environnement ni migration nouvelle. Les suites unitaires ajoutées tournent dans le job
`test` existant ; la couverture couvre les branches désactivation / réactivation / anti-lockout.

## 9. Suites
- **US-CPT-04** — anonymisation / effacement RGPD (`ANONYMISE`), avec step-up mot de passe.
- Exposer le **motif** et l'auteur de la dernière désactivation dans la vue admin (colonne / info-bulle).
- Notification e-mail à l'utilisateur désactivé (optionnel, selon politique RH).
