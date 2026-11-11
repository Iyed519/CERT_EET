# US-AUTH-06 — Mot de passe oublié

## En une phrase
Depuis « Mot de passe oublié ? » sur la page de connexion, un utilisateur
reçoit par email un lien à usage unique valable 30 minutes ; il choisit un
nouveau mot de passe, toutes ses sessions sont fermées et chaque étape est
journalisée — sans jamais révéler si une adresse correspond à un compte.

## Point de départ
Backlog E1, US-AUTH-06 (Must, 3 pts) : lien de réinitialisation à usage unique
et à durée limitée, « même mécanisme que le lien d'activation » ; message
neutre identique pour un email inconnu (anti-énumération) ; lien expiré ou
consommé refusé ; toutes les sessions invalidées ; audit MDP_RESET. US-AUTH-13
demande en plus une limitation de débit sur la réinitialisation. Existant :
lien de vérification d'email (US-CPT-05 : UUID en clair dans Redis, 48 h),
`invalidateUserSessions` (renforcé par US-AUTH-08), politique de mot de passe
et gabarit d'email partagés (US-AUTH-08). US-AUTH-05 a été retirée en v1.2 :
la « primitive de lien » à réutiliser est donc celle de la vérification
d'email, généralisée ici.

## Découpage
- **Migration** `1788600000000-AddJetonsLienEmail` : table `jetons_lien_email`
  (empreinte SHA-256 unique, objet en liste fermée `REINITIALISATION_MDP` /
  `ACTIVATION_COMPTE`, échéance, date d'utilisation, CASCADE sur le compte).
- **API** : primitive `JetonsLienService` (émettre / consommer) ;
  `MotDePasseOublieService` ; routes `POST /auth/forgot-password` et
  `POST /auth/reset-password` ; limitation de débit générique
  `common/limite-requetes` (garde + décorateur `@AppliquerLimite`, réutilisée
  par US-AUTH-13) ; email `sendReinitialisationMotDePasseEmail`.
- **Web** : pages `/mot-de-passe-oublie` et `/reinitialiser-mot-de-passe`
  (sans Referer, non indexée, jeton retiré de la barre d'adresse) ; lien
  « Mot de passe oublié ? » sur `/login`.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/auth/forgot-password` `{ email }` | public | 200 message neutre (toujours le même) ; 400 email mal formé ; 429 au-delà de 5 demandes / 15 min par IP |
| POST | `/api/auth/reset-password` `{ token, nouveauMotDePasse }` | public | 200 ; 400 lien invalide / expiré / déjà utilisé / autre usage, ou mot de passe non conforme ; 429 au-delà de 10 essais / 15 min par IP |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Stockage | Table PostgreSQL plutôt que Redis : le jeton survit à un redémarrage de Redis, sa consommation est un seul UPDATE conditionnel (atomique), et la même table sert à l'activation des comptes importés (US-CPT-02). Le lien de vérification d'email d'US-CPT-05 n'est pas touché. |
| D2 | Jeton | 256 bits aléatoires en base64url (43 caractères) ; seule l'empreinte SHA-256 est enregistrée. Un nouveau lien supprime les liens encore valables du même compte : seul le dernier fonctionne. |
| D3 | Durée | 30 minutes (le backlog laissait la durée « à valider »). |
| D4 | Anti-énumération | Réponse identique (même corps, même statut) pour une adresse inconnue, un compte en attente, désactivé ou actif. Seul un compte ACTIF reçoit un lien. L'email est envoyé sans attendre (la durée de la réponse ne dépend pas du SMTP). Rien n'est écrit pour une adresse inconnue (aucune donnée sur un tiers). Le léger écart dû à l'insertion du jeton (quelques millisecondes) est accepté. |
| D5 | Limites | Par IP, garde générique Redis à fenêtre fixe : 5 demandes / 15 min, 10 réinitialisations / 15 min, puis 429 + Retry-After ; premier refus journalisé `LIMITE_REQUETES_ATTEINTE`. Par adresse : 3 liens / heure, refus SILENCIEUX (même réponse 200) pour ne rien révéler. Redis injoignable : ouvert, incident dans les logs. |
| D6 | Réinitialisation | Transaction : jeton consommé, compte verrouillé (`FOR UPDATE`) et ACTIF, hash mis à jour, autres liens clos. Après COMMIT : toutes les sessions révoquées (base + Redis, US-AUTH-08), audit, email de confirmation (non bloquant). Six clics simultanés sur le même lien -> une seule réussite. |
| D7 | Compte sans mot de passe | Un compte Google / GitHub actif peut définir un mot de passe local par ce chemin (renvoi prévu par US-AUTH-08, D5). |
| D8 | Audit | `MDP_RESET_DEMANDE` (Succès, ou Échec « quota atteint »), `MDP_RESET` (Succès avec `sessionsRevoquees`, ou Échec sans acteur), `LIMITE_REQUETES_ATTEINTE`. Jamais de jeton ni d'adresse saisie. |
| D9 | Page web | Le jeton est lu dans l'URL puis retiré de l'historique ; `referrer: no-referrer` et `noindex` sur la page ; politique vérifiée à la saisie, l'API restant la barrière. |

## Fichiers
- `apps/api/src/database/migrations/1788600000000-AddJetonsLienEmail.ts`
- `apps/api/src/common/limite-requetes/` (garde, décorateur, règles, spec)
- `apps/api/src/modules/auth/` : `jetons-lien.service.ts`, `mot-de-passe-oublie.service.ts`, `mot-de-passe-oublie.spec.ts`, `dto/mot-de-passe-oublie.dto.ts`, `auth.controller.ts`, `auth.module.ts`
- `apps/api/src/mail/mail.service.ts` (+ spec)
- `apps/api/test/mot-de-passe-oublie.e2e-spec.ts` (marqueur `E2E-AUTH06`)
- `apps/web/src/app/mot-de-passe-oublie/page.tsx`, `app/reinitialiser-mot-de-passe/{layout,page}.tsx`, `app/login/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Les gardes passent avant le `ValidationPipe` : une requête mal formée compte
  dans la limite par IP. Voulu (elle coûte autant au serveur) ; l'e2e vide les
  compteurs entre deux tests.
- Story commencée sur la branche d'US-AUTH-08 (politique et gabarit partagés),
  rebasée sur `main` après la fusion de #90.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **108 suites / 1 401 tests** (+ 18 :
  garde générique ×6, primitive ×2, service ×9, email), migration run + revert
  + run (**36 migrations**), e2e complet en série **64 suites / 780 tests** (+ 1 ignoré), dont
  `E2E-AUTH06` (7 tests : réponse identique et lien pour l'actif seul ;
  empreinte seule en base, 30 min ; 400 lien mal formé / inconnu / mot de passe
  faible sans consommer le lien ; nouveau lien qui remplace l'ancien, lien
  expiré, jeton d'un autre usage ; nominal — deux sessions coupées, ancien mot
  de passe refusé, usage unique, audit, email — ; 429 à la 6e demande et
  quota silencieux de 3 liens ; 6 réinitialisations simultanées -> une seule).
- Mutations : **13 / 13 tuées** — compte non actif servi, quota désactivé,
  jeton en clair, usage unique retiré, expiration ignorée, objet non contrôlé,
  ancien lien conservé, sessions non révoquées (réécrit : ne compilait pas),
  compte inactif réinitialisable (tué par l'unitaire), limite IP relâchée,
  échec journalisé en succès (unitaire), route de demande non publique, durée
  30 min -> 30 h.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium,
  pile locale) : lien « Mot de passe oublié ? » sur `/login` ; demande -> message
  neutre ; page sans jeton -> invitation à redemander ; lien valide -> jeton
  retiré de la barre d'adresse, `referrer: no-referrer`, nouveau mot de passe
  enregistré, lien réutilisé refusé, connexion avec le nouveau mot de passe ;
  pas de défilement horizontal, aucune erreur de page.

## CI
Voir la PR.

## Suites
- US-AUTH-13 : TLS et durcissement (la garde générique s'étend à la connexion,
  au refresh, à l'inscription et à la vérification d'email).
