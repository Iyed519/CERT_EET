# US-AUTH-09 + US-AUTH-02 — MFA (activation self-service + connexion en 2 temps)

## En une phrase
Un utilisateur active la double authentification TOTP depuis un QR code
(US-AUTH-09) ; ensuite, sa connexion se fait en deux temps — mot de passe puis
code à 6 chiffres (US-AUTH-02) — pour protéger les comptes sensibles contre le
vol de mot de passe (NF3, ADR-08).

## Découpage
- **A — Dépendances.** `otplib@^12` (TOTP) + `qrcode@^1.5` + `@types/qrcode` dans
  `apps/api`. Aucune migration (colonnes `mfa_active`/`mfa_secret` déjà en base).
- **B — Enrôlement (utilisateur authentifié).** `POST /auth/mfa/setup`,
  `POST /auth/mfa/enable`, `POST /auth/mfa/disable`.
- **C — Défi à la connexion.** `login` bascule en `mfaRequired` si MFA active ;
  `POST /auth/mfa/verify` (@Public) émet les jetons via une méthode partagée.
- **D — UI.** `/login` en 2 écrans, page `/securite` (QR + activation /
  désactivation), lien d'en-tête, client API, `mfaActive` exposé par `/auth/me`.
- **E — Tests + journal + PR.**

## Endpoints
| Méthode | Route | Accès |
|---|---|---|
| POST | `/auth/mfa/setup` | authentifié |
| POST | `/auth/mfa/enable` | authentifié |
| POST | `/auth/mfa/disable` | authentifié |
| POST | `/auth/mfa/verify` | @Public |

Codes : setup `200` / `401` / `409` (déjà active) ; enable `200` / `400` (code
invalide ou activation expirée) / `409` ; disable `200` / `400` (MFA non active
ou code invalide) ; verify `200` / `401` (mfaToken inconnu/expiré, compte
inéligible ou code invalide) ; login `200` (soit `{accessToken,user}`, soit
`{mfaRequired:true, mfaToken}`).

## Flux
1. **setup.** Vérifie que la MFA n'est pas déjà active (409) → génère un secret
   base32 EN ATTENTE stocké en Redis (`mfa:setup:<userId>`, TTL 10 min, JAMAIS
   en base) → renvoie `otpauthUrl` + `qrDataUrl` (PNG data URL).
2. **enable.** Lit le secret en attente (400 si absent/expiré) → vérifie le code
   TOTP → persiste `mfa_secret` + `mfa_active=true` → supprime la clé Redis →
   audit `MFA_ACTIVEE`.
3. **disable.** Exige un code TOTP valide (anti-abus : une session volée ne peut
   pas retirer la protection) → `mfa_active=false` + secret effacé → audit
   `MFA_DESACTIVEE`.
4. **login (MFA active).** Mot de passe OK + compte ACTIF → crée une session MFA
   temporaire (`mfa:<mfaToken>` = userId, TTL 5 min) → renvoie
   `{mfaRequired, mfaToken}` SANS aucun jeton.
5. **verify.** Lit la session MFA (401 si absente) → vérifie le compte
   (ACTIF + mfa active + secret) et le code TOTP → SUPPRIME la session AVANT
   d'émettre (usage unique, anti-rejeu) → émet access+refresh via la méthode
   partagée (audit `LOGIN`).

## Décisions
- **Émission des jetons partagée.** Extraction depuis `login` d'une méthode
  privée `issueSession(user, context, auditAction)` (signAccess + signRefresh +
  persistRefresh + `derniereConnexion` + audit). Appelée par `login` (chemin
  sans MFA, action `LOGIN`) ET `mfaVerify` (après MFA, action `LOGIN`) → une
  seule source d'émission, pas de double-audit. `loginWithOauth` reste inchangé
  (hors périmètre, non régressé).
- **Retour de `login` = union discriminée** `LoginResult | MfaChallengeResult`
  (`mfaRequired`), côté service et contrôleur. Le contrôleur ne pose PAS le
  cookie refresh sur un défi.
- **Secret en attente hors base.** Tant que l'utilisateur n'a pas confirmé un
  code, le secret vit uniquement en Redis (TTL court) → aucun secret orphelin en
  base si l'enrôlement est abandonné.
- **Stockage du secret** : `mfa_secret` en base32 CLAIR (simple, suffisant pour
  le PFE). Durcissement possible (chiffrement au repos AES + clé d'env) noté en
  suite (Sprint 10 OWASP).
- **Usage unique du mfaToken** : la clé Redis est supprimée AVANT l'émission des
  jetons (anti-rejeu). Un code invalide ne supprime PAS la session (l'utilisateur
  peut réessayer jusqu'au TTL).
- **Tolérance d'horloge** : fenêtre TOTP ±1 pas (`authenticator.options =
  { window: 1 }`) réglée une fois dans le constructeur.
- **Désactivation protégée par code** (et non par mot de passe) : cohérent avec
  la possession de l'app d'authentification.
- **Codes de secours** : hors périmètre (nécessiteraient une table dédiée +
  migration). Noté en suite.
- **MFA non imposée** aux admins pour l'instant (self-service optionnel).
- **`mfaActive` exposé par `/auth/me`** : nécessaire au front pour afficher le
  bon écran (activer vs désactiver).

## Fichiers
Backend
- `apps/api/package.json` + `package-lock.json` (otplib, qrcode, @types/qrcode)
- `src/modules/auth/auth.keys.ts` (+ `mfaSetupKey`, `mfaSessionKey`)
- `src/modules/auth/dto/mfa-code.dto.ts`, `dto/mfa-verify.dto.ts` (nouveaux)
- `src/modules/auth/auth.service.ts` (setup/enable/disable, login refactoré,
  `mfaVerify`, `issueSession`, `verifierTotp`, `mfaActive` dans `/me`)
- `src/modules/auth/auth.controller.ts` (4 routes + login gère `mfaRequired`)
- `src/modules/auth/auth.service.spec.ts` (tests MFA + garde-type login)
- `test/mfa.e2e-spec.ts` (nouveau)

Frontend
- `web/src/lib/api.ts` (`MfaChallenge`, `isMfaChallenge`, `mfaVerifyRequest`,
  `mfaSetup`/`mfaEnable`/`mfaDisable`, `mfaActive` dans `ProfilResponse`)
- `web/src/app/login/page.tsx` (2 écrans), `web/src/app/securite/page.tsx` (nouveau)
- `web/src/components/SecuriteNav.tsx` (nouveau), `web/src/app/layout.tsx` (lien)

## Incidents
- **Volume anonyme `node_modules` (Docker/dev).** Après ajout des deps, `up
  --build` seul ne suffit pas : le volume anonyme `/app/node_modules` persiste et
  masque le `node_modules` de l'image → `Cannot find module 'otplib'`. Fix :
  `up -d --build --force-recreate --renew-anon-volumes api` (le volume est
  recréé puis repeuplé depuis l'image).
- **Watcher aveugle au bind-mount (Windows).** `nest --watch` (et Next Fast
  Refresh) ne détectent pas les modifs faites sur l'hôte Windows → il faut
  `restart api` / `restart web` après chaque changement de code pour recompiler.
- **Lint front `react/no-unescaped-entities`.** Les apostrophes droites en texte
  JSX cassent `next lint` (règle non détectée avant car le front n'est pas en
  CI). Corrigé par apostrophes typographiques ; 3 erreurs préexistantes dans
  `ProfilGate.tsx` corrigées au passage.
- **Boutons du design system.** `btn-ghost` seul (fond transparent, sans forme)
  et `btn btn-danger` (texte rouge sur fond vert = illisible) : corrigés en
  `btn-sm btn-ghost`, `btn-sm btn-danger` (entrée) et `btn btn-danger-solid`
  (confirmation destructive), combos déjà utilisés ailleurs.
- **Accent audit.** Les audits `MFA_ACTIVEE`/`MFA_DESACTIVEE` écrivaient
  `resultat: 'Succes'` (sans accent) — incohérent avec le reste du journal
  (`'Succès'`). Corrigé ; détecté par les tests unitaires.

## Vérification
- **Unit** (`auth.service.spec.ts`) : setup (secret en attente + QR, pas
  d'écriture base), 409 déjà active ; enable (code valide → actif + audit, 400
  sans activation, 400 code invalide) ; disable (code valide → inactif + audit,
  400 non active) ; login bascule en `mfaRequired` sans émettre de jeton ;
  mfaVerify (usage unique + audit LOGIN, 401 token inconnu, 401 code invalide
  sans suppression de session). TOTP calculé via `otplib`. → `test:cov` :
  **11 suites / 110 tests**.
- **e2e** (`test/mfa.e2e-spec.ts`) : parcours complet setup → enable → login MFA
  en 2 temps → rejeu du mfaToken (401) → disable ; setup 409 si déjà active ;
  login sans MFA inchangé (accessToken + cookie httpOnly). Teardown users +
  `audit_logs` (bypass GUC). → `test:e2e` : **6 suites / 49 tests**.
- **Front** : `tsc --noEmit` (0 erreur) + `next lint` (clean).

## CI
Pipeline inchangé (`.github/workflows/ci.yml`, scope `apps/api`) :
`lint → test:cov → migration:run → test:e2e`. Aucune migration ajoutée
(colonnes MFA déjà présentes). `apps/web` toujours hors CI (vérifié à la main :
tsc + lint).

## Suites
- Codes de secours (recovery codes) : table dédiée + migration.
- Chiffrement au repos du `mfa_secret` (AES + clé d'env) — durcissement OWASP.
- Politique d'imposition de la MFA aux rôles sensibles (Formateur/Admin).
- Lint/tests `apps/web` en CI.
