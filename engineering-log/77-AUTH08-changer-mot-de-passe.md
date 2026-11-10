# US-AUTH-08 — Changer mon mot de passe

## En une phrase
Un utilisateur connecté change son mot de passe depuis « Sécurité » en
donnant l'actuel : le nouveau suit la politique commune, TOUTES ses sessions
sont révoquées (jetons d'accès et refresh, en base et dans Redis), l'action est
journalisée et un email le prévient.

## Point de départ
Backlog E1, US-AUTH-08 (Must, 3 pts, DS-10 P2) : vérifier l'ancien mot de
passe (bcrypt.compare), hacher le nouveau (bcrypt, cost 12), invalider toutes
les sessions actives (Redis), journaliser MDP_CHANGE, informer ; ancien faux
-> 401 « mot de passe actuel incorrect », rien de modifié. Existant :
`AuthService.invalidateUserSessions` (US-AUTH-11, utilisé par US-ROL-01 et
US-CPT-03), denylists Redis (US-AUTH-03/04), page `/securite` (MFA, US-AUTH-09).
Première story du Sprint 5.

## Découpage
- **API** : `ChangerMotDePasseDto` + politique partagée
  `dto/politique-mot-de-passe.ts` (réutilisée par US-AUTH-06) ;
  `AuthService.changerMotDePasse` ; route `POST /auth/change-password` ;
  `invalidateUserSessions` met aussi chaque refresh token actif sur la denylist
  Redis et écrit le marqueur en millisecondes ; claim `tms` dans le jeton
  d'accès et comparaison `emisAvantMarqueur` dans le `JwtAuthGuard` ;
  `MailService.sendMotDePasseModifieEmail` + gabarit commun `gabaritEmail`.
- **Web** : composant `ChangementMotDePasse` en tête de `/securite` (la MFA
  passe dans son propre encart), client `changerMotDePasse` ; message sur
  `/login?motdepasse=modifie`.
- Pas de migration : aucun changement de schéma.

## Endpoint
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/auth/change-password` `{ motDePasseActuel, nouveauMotDePasse }` | tout utilisateur connecté | 200 `{ message, sessionsRevoquees }` + cookie refresh effacé ; 400 politique / identique / champ inconnu ; 401 non authentifié ou `code: MOT_DE_PASSE_ACTUEL_INCORRECT` ; 409 `code: SANS_MOT_DE_PASSE_LOCAL` |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Route | `POST /auth/change-password`, dans le style des routes d'authentification existantes (`verify-email`, `mfa/enable`). |
| D2 | Politique | Même règle que l'inscription (8 caractères, une lettre, un chiffre) + 72 caractères au plus (limite utile de bcrypt), dans un décorateur partagé. `RegisterDto` n'est pas touché (rien ne change pour l'inscription). Nouveau = actuel -> 400. |
| D3 | Concurrence | Ligne `users` verrouillée (`FOR UPDATE`) pendant la comparaison et la mise à jour ; le nouveau hash est calculé AVANT le verrou. Deux changements simultanés avec le même ancien mot de passe : le second compare contre le nouveau hash -> 401. |
| D4 | Ancien faux | 401 (critère du backlog) avec `code: MOT_DE_PASSE_ACTUEL_INCORRECT` : le frontend ne le confond pas avec une session expirée (qui déclenche refresh puis déconnexion). Audit `MDP_CHANGE` « Échec », sans le mot de passe saisi. |
| D5 | Compte OAuth | Sans mot de passe local -> 409 `SANS_MOT_DE_PASSE_LOCAL`, avec renvoi vers « Mot de passe oublié ? » (US-AUTH-06) pour en définir un. |
| D6 | Révocation | Toutes les sessions, celle de la requête comprise : refresh inactifs en base ET sur la denylist Redis (TTL restant), marqueur « sessions valides après », jeton d'accès courant sur la denylist par `jti`. La réponse efface le cookie refresh ; la page renvoie vers `/login`. |
| D7 | Précision du marqueur | Le marqueur était en secondes et comparé à `iat` (secondes) : un jeton émis dans la même seconde que le changement restait valable. Le marqueur est désormais en millisecondes et comparé au claim `tms` (instant d'émission en ms). Rétrocompatible : un ancien marqueur (secondes) est reconnu à sa taille, un jeton sans `tms` utilise `iat` × 1000. Profite aussi au changement de rôle et à la désactivation. |
| D8 | Email | Notification après COMMIT, non bloquante (erreur journalisée) : le changement est fait, un SMTP en panne ne doit pas faire croire à un échec. Aucun lien d'action dans l'email, seulement la connexion et la consigne en cas de doute. |
| D9 | Audit | `MDP_CHANGE` « Succès » avec `sessionsRevoquees` ; « Échec » avec le motif. Jamais de mot de passe ni de hash. |

## Fichiers
- `apps/api/src/modules/auth/` : `auth.service.ts`, `auth.controller.ts`, `auth.types.ts`, `guards/jwt-auth.guard.ts`, `dto/changer-mot-de-passe.dto.ts`, `dto/politique-mot-de-passe.ts`, `changer-mot-de-passe.spec.ts`
- `apps/api/src/mail/mail.service.ts` (+ spec)
- `apps/api/test/changer-mot-de-passe.e2e-spec.ts` (marqueur `E2E-AUTH08`)
- `apps/web/src/components/ChangementMotDePasse.tsx`, `app/securite/page.tsx`, `app/login/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- `apiFetch` rafraîchit puis déconnecte sur tout 401 : un mot de passe actuel
  mal saisi aurait déconnecté l'utilisateur. D'où le code stable (D4) et un
  client dédié qui ne passe par le refresh que pour un autre 401.
- Marqueur à la seconde (D7) : l'e2e « deux sessions puis changement » était
  instable par construction ; corrigé à la source plutôt qu'avec une attente.
- Machine neuve : pgvector et moto installés, services relancés à la main ;
  base de référence propre sur `main` avant tout changement (62 suites e2e /
  768 tests, 1 372 unitaires, build web).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **106 suites / 1 383 tests** (+ 11 :
  identique, verrou, ancien faux, compte OAuth, compte inactif, nominal complet,
  email en panne, comparaison du marqueur ×3, email), e2e complet en série
  **63 suites / 773 tests** (+ 1 ignoré), dont `E2E-AUTH08` (5 tests : accès et
  validation ; ancien faux sans effet ; compte OAuth 409 ; nominal — deux
  sessions coupées dans la même seconde, refresh refusés, denylist Redis, ancien
  mot de passe refusé, nouveau accepté, audit, email — ; 6 changements
  simultanés -> un seul succès, un seul mot de passe valable).
- Mutations : **13 / 13 tuées** — identique accepté, sans `FOR UPDATE`, ancien
  non vérifié, compte OAuth non détecté (réécrit deux fois : ne compilait pas),
  sessions non révoquées, refresh absents de Redis, marqueur en secondes, garde
  ignorant `tms`, jeton courant non révoqué, échec journalisé en succès, cookie
  non effacé, email au mauvais destinataire, longueur maximale relâchée.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium,
  apprenant de démonstration) : `/securite` avec les deux encarts ; ancien mot
  de passe faux -> message, toujours connecté ; changement réel -> retour sur
  `/login` avec le message, l'ancien mot de passe refusé ; pas de défilement
  horizontal, aucune erreur de page.

## CI
Voir la PR.

## Suites
- US-AUTH-06 : mot de passe oublié (réutilise la politique et le gabarit d'email).
