# 14 — US-ROL-01 · Un admin change le rôle d'un utilisateur

**Épopée :** E2 (Comptes & habilitations) · **Points :** 3 · **Branche :** `feature/US-ROL-01-admin-change-role`
**Dépend de :** US-AUTH-11 (RBAC + `invalidateUserSessions`), US-AUTH-01 · **Réf :** ADR-08, DS-15, US-CPT-03 (anti-lockout)

## 0. En une phrase
Un administrateur consulte la liste des utilisateurs et change le rôle de l'un d'eux ; l'action exige
une ré-authentification par mot de passe, refuse de rétrograder le dernier admin actif, invalide
immédiatement les sessions de la cible et journalise `ROLE_CHANGE`.

## 1. Découpage
- **A** — backend : module `admin`, `GET /admin/users` + `PATCH /admin/users/:id/role`.
- **B** — frontend : page `/admin/utilisateurs` (tableau + modale), lien header réservé aux admins.
- **C** — tests + journal + PR.

## 2. Endpoints / contrat
- `GET /api/admin/users` -> liste (id, email, nom, prénom, rôle, statut). **Sélection explicite des
  colonnes** : le hash du mot de passe et le secret MFA ne quittent jamais la base (moindre privilège).
- `PATCH /api/admin/users/:id/role`, corps `{ nouveauRole, motDePasseAdmin }`. Codes : 200 · 400 (rôle
  déjà appliqué) · 401 (mdp admin faux) · 403 (dernier admin actif) · 404 (cible introuvable).

## 3. Flux (`changeRole`, ordre volontaire)
1. ré-auth admin (`bcrypt.compare`, step-up) -> 401 si faux ;
2. existence de la cible -> 404 ;
3. rôle déjà appliqué -> 400 (évite un kill de session + un audit inutiles) ;
4. anti-lockout : cible ADMINISTRATEUR **ACTIF** et dernier admin actif -> 403 ;
5. mise à jour du rôle ;
6. `invalidateUserSessions(cible)` -> le nouveau rôle s'applique tout de suite ;
7. audit `ROLE_CHANGE` (Succès). Aucune mutation avant que toutes les gardes ne passent.

## 4. Décisions
- **Réutilisation de `invalidateUserSessions`** (US-AUTH-11 / ADR-08-R1) : `AuthModule` **exporte**
  désormais `AuthService`, `AdminModule` l'importe. Le déclencheur annoncé en US-AUTH-11 est branché ici,
  sans réimplémentation.
- **Step-up mot de passe à temps constant** : `bcrypt.compare` est exécuté même quand l'admin n'a pas de
  mot de passe local (compte OAuth) via un hash factice -> résultat toujours faux, pas d'oracle de timing
  (même défense que `AuthService.login`).
- **Anti-lockout** (cohérent US-CPT-03) : refus seulement si la cible est ADMINISTRATEUR ACTIF **et** qu'il
  ne reste qu'un admin actif (`count <= 1`). Couvre aussi l'auto-rétrogradation du dernier admin.
- **Audit** : `userId` = auteur, `cible` = impacté, `detailsAvantApres = { ancienRole, nouveauRole,
  cibleEmail }`. La tentative avec **mot de passe erroné** est journalisée en `Échec` (signal de sécurité).
- **No-op explicite** : rôle identique -> 400, plutôt qu'une opération vide.
- **`ParseUUIDPipe` sur `:id`** -> 400 sur UUID malformé.
- **`@Roles(ADMINISTRATEUR)` au niveau classe** : le RolesGuard global (US-AUTH-11) renvoie 403 pour tout
  autre rôle ; le JwtAuthGuard global exige déjà une session valide.

## 5. Fichiers
**Nouveaux — backend :** `modules/admin/dto/change-role.dto.ts` ; `modules/admin/{admin-users.service,
admin-users.controller,admin.module}.ts` ; `modules/admin/admin-users.service.spec.ts`.
**Modifiés — backend :** `modules/auth/auth.module.ts` (exporte `AuthService`) ; `app.module.ts`
(enregistre `AdminModule`).
**Nouveaux — frontend :** `app/admin/utilisateurs/page.tsx` ; `components/AdminNav.tsx`.
**Modifiés — frontend :** `lib/api.ts` (`getAdminUsers`, `changeUserRole`, `AdminError`) ;
`app/layout.tsx` (montage `AdminNav`) ; `app/globals.css` (tableau, badges, boutons).

## 6. Incidents & corrections
- **Fichiers gitignorés absents au démarrage** : `.env` racine et certificats TLS Nginx
  (`fullchain.pem`/`privkey.pem`) avaient disparu du poste, restaurés depuis la corbeille ; clés JWT
  (`secrets/*.pem`) intactes. Aucun n'est touché par `git checkout`/`pull` (ignorés) ni par le code.
- **Watcher web (Windows/Docker)** : la nouvelle route `/admin/utilisateurs` restait en 404 tant que le
  conteneur `web` n'était pas **recréé** (`up --build` / `force-recreate`) — même souci que les US
  précédentes. Enchaîner plusieurs commandes Compose recrée le conteneur et vide la session en mémoire
  (relogin nécessaire).
- **Interaction `apiFetch`** : un mauvais mot de passe admin (401) déclenche le refresh silencieux + rejeu
  -> l'erreur remonte correctement, au prix d'une rotation du refresh token. Bénin (rotation +
  reuse-detection en place).

## 7. Vérification
- **Manuel (bout en bout)** : login `admin@cert-eet.local` -> lien « Administration » -> tableau ; la modale
  exige le mot de passe admin.
- **Unitaires (`admin-users.service.spec.ts`) : 7/7** — succès (rôle + invalidation + audit `Succès`), 401
  mdp faux + audit `Échec`, 404 cible, 400 rôle identique, 403 dernier admin actif, rétrogradation
  autorisée s'il reste d'autres admins actifs.
- **Build** : `nest build` 0 erreur (routes `GET /api/admin/users` + `PATCH /api/admin/users/:id/role`
  mappées) ; frontend `tsc --noEmit` 0 erreur.

## 8. CI
Aucune dépendance ni migration nouvelle. Check **« CI / API (lint + tests + coverage) » vert** sur la PR (~1 min).

## 9. Suites
- **US-CPT-03** (désactivation de compte) partagera la logique anti-lockout « dernier admin actif ».
- **US-AUTH-12** (journal d'audit consultable) exposera les entrées `ROLE_CHANGE` produites ici.
