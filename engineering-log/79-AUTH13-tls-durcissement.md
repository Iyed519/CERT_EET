# US-AUTH-13 — TLS et durcissement des endpoints sensibles

## En une phrase
nginx termine un TLS moderne (1.2 / 1.3, HSTS, redirection HTTP -> HTTPS,
limitation de débit à l'entrée) et l'API se défend elle-même : en-têtes de
sécurité, CSP, tailles de corps, CORS strict et limites de débit par IP,
réglables, sur toutes les routes d'authentification.

## Point de départ
Backlog E1, US-AUTH-13 (Must, 3 pts, UC9 Admin / DEP-03) : TLS terminé au
reverse proxy, HSTS, rate-limiting des endpoints sensibles (connexion,
réinitialisation, vérification publique), HTTP redirigé vers HTTPS, excès
limité ou rejeté. Existant : nginx avec TLS 1.2/1.3 et redirection (INF03),
limitation de la vérification publique (US-CERT-05), garde générique
`LimiteRequetesGuard` (US-AUTH-06). Rien sur les en-têtes, les tailles de
corps ni le CORS au-delà d'une origine unique.

## Découpage
- **nginx** (`docker/nginx/nginx.conf`) : profil TLS « intermediate »
  (suites AEAD ECDHE, courbes, cache de session, tickets coupés, HTTP/2), HSTS
  2 ans, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `server_tokens off`,
  copies des en-têtes applicatifs masquées (une seule émission), zones
  `limit_req` (authentification, vérification publique), corps 10 Mo par
  défaut et 1,1 Gio sur les seules routes de dépôt ; chemins de certificat de
  remplacement ; agrafage OCSP prêt (commenté).
- **Script** `docker/nginx/verifier-durcissement.sh` : contrôle d'un déploiement.
- **API** : `common/securite/configurer-application.ts` (préfixe, cookies,
  trust proxy, helmet, tailles de corps, ValidationPipe, CORS), appelé par
  `main.ts` et par l'e2e ; limites de débit sur `login`, `mfa/verify`,
  `refresh`, `register`, `verify-email` ; limites réglables par `LIMITE_<NOM>`
  (`configuration.ts`), CORS `*` refusé par la validation de l'environnement ;
  dépendance `helmet` 8.3.0 (exacte, publiée le 12/07/2026, sans dépendance).
- **Web** (`next.config.mjs`) : CSP, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Powered-By` retiré.
- **Documentation** : `docs/DEPLOIEMENT_RECETTE.md` §7, `.env.example`.

## Endpoints
Aucune nouvelle route. Comportements ajoutés :

| Route | Avant | Après |
|---|---|---|
| `POST /api/auth/login`, `mfa/verify` | illimité | 30 / min / IP, puis 429 + `Retry-After` |
| `POST /api/auth/refresh` | illimité | 120 / min / IP |
| `POST /api/auth/register`, `verify-email` | illimité | 30 / 15 min / IP |
| toutes | corps JSON 100 ko implicite | 100 ko explicite, formulaire 20 ko, sinon 413 |
| toutes | aucun en-tête de sécurité | HSTS, CSP, `nosniff`, `DENY`, CORP, sans `X-Powered-By` |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Certificats | Aucun certificat ni clé dans le dépôt : chemins de remplacement, fichiers réels sur l'hôte (`docker/nginx/certs/`, déjà ignoré sauf `.gitkeep`), procédure documentée (autorité publique en production, auto-signé en recette). |
| D2 | Profil TLS | Mozilla « intermediate » : TLS 1.2 + 1.3, suites AEAD à confidentialité persistante, tickets de session coupés. HSTS 2 ans avec sous-domaines, sans `preload` (irréversible, à décider par l'exploitant). |
| D3 | Deux couches de limites | nginx (entrée, large : 30 / min, rafale 20) + API (fine, par route, journalisée). L'API reste protégée si elle est jointe sans nginx. |
| D4 | Valeurs | Choisies pour une salle de cours derrière une seule IP publique (30 connexions / min, 120 refresh / min) ; réglables par variable sans recompiler ; la documentation signale le cas du présentiel. |
| D5 | Limites en test | Sous `NODE_ENV=test`, connexion, MFA, refresh, inscription et vérification d'email sont relâchées SAUF variable posée : les 64 suites e2e se connectent sans cesse depuis 127.0.0.1. La suite `E2E-AUTH13` pose des limites basses avant de charger l'application et les retire en fin de suite ; les limites du mot de passe oublié ne sont jamais relâchées (US-AUTH-06 les prouve). |
| D6 | En-têtes | helmet (dépendance légère et standard) plutôt qu'un intergiciel maison. CSP de l'API compatible avec Swagger (scripts en ligne), sans source tierce. CORP `same-site` : le frontend lit les fichiers de l'API derrière le même nginx. |
| D7 | CSP du frontend | `script-src 'unsafe-inline'` imposé par l'hydratation de Next.js (un nonce par requête rendrait toutes les pages dynamiques) — limite documentée. Cadres : seulement YouTube sans cookie et Vimeo (US-FORM-05). `frame-ancestors 'none'` partout. `Permissions-Policy` ouvre la caméra à la plateforme seule (US-QCM-12). |
| D8 | Corps | JSON 100 ko (comportement inchangé, désormais explicite et testé), formulaire 20 ko. Les dépôts multipart gardent leurs limites par route ; nginx : 10 Mo par défaut, 1,1 Gio sur les trois routes de dépôt (avant : 1 Gio sur toute l'API). |
| D9 | CORS | Liste d'origines explicites, cookies autorisés, méthodes et en-têtes bornés ; `*` refusé au démarrage (validation Joi) et filtré en défense. |
| D10 | Réglages communs | `configurerApplication` extrait de `main.ts` : l'e2e éprouve l'application exactement comme en production (avant, chaque e2e recopiait une partie des réglages). |

## Fichiers
- `docker/nginx/nginx.conf`, `docker/nginx/verifier-durcissement.sh`
- `apps/api/src/common/securite/configurer-application.ts` (+ spec), `src/main.ts`
- `apps/api/src/common/limite-requetes/limite-requetes.guard.ts` (+ spec)
- `apps/api/src/config/configuration.ts`, `src/config/env.validation.ts`, `.env.example`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/package.json`, `package-lock.json` (helmet 8.3.0)
- `apps/api/test/durcissement.e2e-spec.ts` (marqueur `E2E-AUTH13`), `test/outils/limites-basses.ts`
- `apps/web/next.config.mjs`
- `docs/DEPLOIEMENT_RECETTE.md`

## Incidents
- La configuration est lue à l'import d'`AppModule` : les limites basses de
  l'e2e sont posées dans un module importé en premier.
- Chaque test parle depuis sa propre IP (`X-Forwarded-For`, cru depuis la
  boucle locale comme derrière nginx) : compteurs indépendants.
- nginx 1.24 local ne connaît pas `http2 on;` (image 1.27 en production) :
  la vérification locale utilise une copie adaptée.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **109 suites / 1 406 tests** (+ 5 :
  CORS, limites par défaut et réglées, relâche en test, CSP ; réglage de la
  garde par la configuration), e2e complet en série **65 suites / 789 tests** (+ 1 ignoré), dont
  `E2E-AUTH13` (9 tests : en-têtes sur succès et erreurs ; 413 JSON et
  formulaire, juste en dessous traité ; 429 sur connexion, MFA, refresh,
  inscription, vérification d'email avec Retry-After, audit du premier refus,
  autre IP non touchée ; 10 connexions simultanées pour une limite de 3 ->
  exactement 3 traitées ; CORS autorisé / refusé).
- Mutations : **14 / 14 tuées** — helmet retiré, HSTS 1 h, cadre autorisé,
  JSON 10 Mo, formulaire 10 Mo, CORS toute origine, `*` conservé, réglage de
  configuration ignoré, connexion sans garde, mauvais nom de limite (refresh),
  mot de passe oublié relâché en test, variable ignorée en test (réécrit : ne
  compilait pas), trust proxy retiré, `frame-ancestors 'self'`.
- nginx : `nginx -t`, puis la configuration réelle devant la pile locale
  (certificat auto-signé jetable dans `/tmp`) : `verifier-durcissement.sh`
  **10 / 10** (301, HSTS, `nosniff`, CSP, pas de version ni de `X-Powered-By`,
  TLS 1.2 et 1.3 acceptés, TLS 1.1 et `AES128-SHA` refusés) ; un seul en-tête
  HSTS par réponse (copies applicatives masquées) ; rafale de 30 connexions ->
  429 renvoyés par nginx.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px (Chromium,
  pile locale, CSP active) sur 18 pages des trois rôles et publiques (accueil,
  catalogue, mes formations / évaluations / certificats, sécurité avec le QR
  MFA en `data:`, tableau de bord, utilisateurs, formations, certificats,
  audit, espace formateur, alertes, rapports, vérification publique,
  inscription, connexion) : aucune violation de CSP, aucune erreur de page, pas
  de défilement horizontal ; cadre YouTube sans cookie accepté, cadre tiers
  bloqué ; Swagger (`/api/docs`) fonctionne sous la CSP de l'API.

## CI
Voir la PR.

## Suites
- US-CPT-02 : import CSV de comptes (activation par la primitive de lien d'US-AUTH-06).
