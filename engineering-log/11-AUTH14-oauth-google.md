# 11 — US-AUTH-14 · Connexion sociale (OAuth 2.0 — Google d'abord)

**Épopée :** E1 (Comptes & Authentification) · **Points :** 5 · **Branche :** `feature/US-AUTH-14-oauth-google`
**Dépend de :** E0/E1 (INF02→07, AUTH-01/03/04/11, CPT-05) + un fournisseur OAuth externe (Google)
**Références :** Backlog Produit v1.1, ADR-08 (auth/sécurité — JWT RS256, rotation, denylist), ADR-11 (inscription ouverte mais curée)

---

## 0. En une phrase (version non technique)

Un visiteur peut se connecter (ou créer son compte) en cliquant sur **« Continuer avec Google »**, sans
saisir de mot de passe. Google confirme son identité et son email ; l'application ouvre alors une session
normale, exactement comme après un login classique. Si c'est sa première venue, un compte **« apprenant »**
est créé automatiquement et **déjà actif** (l'email est réputé vérifié par Google). Personne ne peut, au
passage, se fabriquer un compte administrateur.

**L'image mentale :** le bouton « Se connecter avec Google » qu'on voit partout. On clique, on choisit son
compte Google, on est de retour sur le site, connecté.

---

## 1. Objectif fonctionnel

- **Nominal (identité déjà liée) :** l'utilisateur a déjà utilisé Google ici -> on retrouve le lien
  identité↔compte, on ouvre une session, aucune création.
- **Nominal (email déjà connu) :** l'email Google correspond à un compte local existant -> on **rattache**
  l'identité Google à ce compte (pas de doublon), puis session.
- **Nominal (nouvel utilisateur) :** ni lien, ni compte -> création d'un compte **APPRENANT (forcé)**,
  statut **ACTIF** (email vérifié par le fournisseur), sans mot de passe, enregistrement du lien, session.
- **Sécurité (pas d'élévation) :** un compte auto-créé via OAuth est **toujours** APPRENANT.
- **Sécurité (compte non actif) :** un compte DÉSACTIVÉ/ANONYMISÉ lié à une identité Google **ne peut pas**
  se connecter -> **401**.
- **Garde (email absent) :** si le fournisseur ne renvoie pas d'email et qu'aucun lien n'existe -> **401**
  (impossible de rattacher ou créer un compte sans email).

---

## 2. Le parcours en 4 parties

> Aucune de ces parties n'a été committée séparément : la story part directement de `main`, tout le
> travail est réuni et **squashé en un seul commit** au moment de la PR (convention : 1 story = 1 PR =
> 1 commit squash + CI verte). Le tableau décrit donc le contenu, pas des hashes.

| Partie | Contenu |
|--------|---------|
| **A** | Modèle de données : `mot_de_passe_hash` nullable + table de liaison `comptes_oauth` + migration TypeORM |
| **B** | Backend OAuth : Passport (`passport-google-oauth20`), `GoogleStrategy`, `loginWithOauth()`, 2 routes Google |
| **C** | Frontend : boutons « Continuer avec Google » (login + register), page-relais `/oauth/callback`, `bootstrapSession()` |
| **D** | Tests unitaires (5 cas `loginWithOauth`), variables CI factices, ce journal, PR |

---

## 3. Résumé technique

Le flux complet, de bout en bout :

1. **Frontend** (`/login` ou `/register`) : lien « Continuer avec Google » -> `GET /api/auth/oauth/google`
   (`@Public`, `@UseGuards(AuthGuard('google'))`). Passport déclenche la **redirection** vers l'écran de
   consentement Google (scopes `email`, `profile`).
2. **Google** authentifie l'utilisateur puis redirige vers `GET /api/auth/oauth/google/callback`
   (`@Public`, `AuthGuard('google')`).
3. **`GoogleStrategy.validate()`** normalise le profil Google brut en un `OauthProfile` minimal
   (`provider`, `providerId`, `email`, `nom`, `prenom`) -> attaché à `req.user` par Passport.
4. **`AuthService.loginWithOauth()`** — *find-link-or-create* :
   - cherche un lien dans `comptes_oauth` par (`provider`, `providerId`) ;
   - **lien trouvé** -> charge le compte par `lien.userId` (aucune création) ;
   - **sinon** : email obligatoire (sinon 401) ; recherche d'un compte par email ->
     - **compte trouvé** -> on **lie** l'identité Google à ce compte (pas de doublon) ;
     - **aucun compte** -> création `APPRENANT` / `ACTIF` / `motDePasseHash: null`, audit `COMPTE_CREE`,
       puis enregistrement du lien ;
   - un compte `EN_ATTENTE_ACTIVATION` devient `ACTIF` (l'email est vérifié par le fournisseur) ;
   - un compte non-`ACTIF` (DÉSACTIVÉ/ANONYMISÉ) -> **401** ;
   - émission de la **session JWT identique au login classique** (access + refresh RS256, rotation,
     `persistRefreshToken`), audit `CONNEXION_OAUTH`.
5. **Contrôleur** : pose le **cookie refresh httpOnly** (`setRefreshTokenCookie`) puis **redirige** vers
   `APP_BASE_URL/oauth/callback` (côté frontend). En cas d'échec -> `redirect(.../login?erreur=oauth)`.
6. **Frontend** `/oauth/callback` : au montage (garde `useRef`), appelle `bootstrapSession()` ->
   `POST /api/auth/refresh` (cookie envoyé, `credentials: 'include'`) -> récupère l'access token,
   `setSession`, puis `router.replace('/')`. Sinon -> `/login?erreur=oauth`.

**Pourquoi ce relais par cookie et pas un token dans l'URL ?** Une redirection ne peut pas transporter de
JSON, et mettre l'access token dans l'URL l'exposerait (historique, logs, referer). On pose donc le
**refresh** en cookie httpOnly (jamais lisible par le JS), et le frontend l'échange contre un access token
frais via `/auth/refresh` — le même mécanisme éprouvé qu'AUTH-03.

---

## 4. Le processus, étape par étape

> Convention de travail : chaque fichier est écrit au terminal via `cat > fichier << 'EOF' … EOF`
> (heredoc **quoté**), puis vérifié sur disque. Le gros fichier de test a fait exception (voir §7).

### Partie A — Modèle de données
1. `user.entity.ts` : `mot_de_passe_hash` passe **nullable** (`nullable: true`, type `string | null`) —
   un compte OAuth n'a pas de mot de passe local.
2. Nouvelle entité `compte-oauth.entity.ts` (`@Entity('comptes_oauth')`) : `id` (uuid), `userId`,
   `@ManyToOne(() => User, { onDelete: 'CASCADE' })`, `provider` (varchar 30), `providerId` (varchar 255),
   `email` (nullable), `createdAt` ; index **unique** sur (`provider`, `providerId`).
3. Migration manuelle `1785400000000-AddOauthAccounts.ts` :
   `ALTER TABLE "users" ALTER COLUMN "mot_de_passe_hash" DROP NOT NULL` + `CREATE TABLE comptes_oauth` +
   index (dont l'unique) + FK cascade. Appliquée dans le conteneur (`npm run migration:run`), contrôlée
   avec `migration:show` (les 4 migrations `[X]`).

### Partie B — Backend OAuth
1. `npm install @nestjs/passport passport passport-google-oauth20` (+ `@types/passport-google-oauth20`),
   puis rebuild indispensable : `docker compose … up --build --force-recreate -V -d` (`-V` recrée le
   volume anonyme `node_modules`, sinon les nouveaux paquets ne sont pas vus par le conteneur).
2. Config typée : `OauthGoogleConfig` (`clientId`, `clientSecret`, `callbackUrl`) dans `configuration.ts` ;
   validation Joi dans `env.validation.ts` (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` requis = fail-fast,
   `GOOGLE_CALLBACK_URL` avec défaut). Variables réelles dans `.env` (gitignored), factices en CI.
3. `OauthProfile` ajouté à `auth.types.ts`. `strategies/google.strategy.ts` : `PassportStrategy(Strategy,
   'google')`, `super({ clientID, clientSecret, callbackURL, scope: ['email','profile'] })`, `validate()`
   qui normalise le profil.
4. `auth.module.ts` : `PassportModule`, `TypeOrmModule.forFeature([… , CompteOauth])`, provider
   `GoogleStrategy`.
5. `auth.service.ts` : injection du repo `CompteOauth`, méthode `loginWithOauth()` (voir §3).
6. `auth.controller.ts` : `@Get('oauth/google')` (déclenche la redirection) et
   `@Get('oauth/google/callback')` (pose le cookie, redirige vers le frontend), toutes deux `@Public`
   sous `AuthGuard('google')`.

### Partie C — Frontend
1. `lib/api.ts` : `bootstrapSession()` (`POST /api/auth/refresh`, `credentials: 'include'`).
2. `app/oauth/callback/page.tsx` (nouveau, client component) : garde `useRef`, `bootstrapSession()` ->
   `setSession` + `router.replace('/')`, sinon `/login?erreur=oauth`. Spinner « Connexion en cours… ».
3. `login/page.tsx` et `register/page.tsx` : séparateur « ou » + bouton `btn-oauth` (lien `href=
   "/api/auth/oauth/google"`) avec le **G** officiel multicolore en SVG. Styles `.oauth-sep`/`.btn-oauth`
   ajoutés à `globals.css`.

### Partie D — Tests + CI + journal
1. `auth.service.spec.ts` : ajout du provider `CompteOauth` au `TestingModule` (**correction DI**, voir §7)
   + suite `loginWithOauth` (5 cas : identité liée, email connu, création complète, compte désactivé 401,
   email absent 401).
2. `ci.yml` : variables `GOOGLE_*` factices dans le bloc `env` (le boot valide les variables — fail-fast).
3. Ce journal + la PR.

---

## 5. Fichiers

**Nouveaux — backend :**
- `src/database/entities/compte-oauth.entity.ts`
- `src/database/migrations/1785400000000-AddOauthAccounts.ts`
- `src/modules/auth/strategies/google.strategy.ts`

**Nouveaux — frontend :**
- `apps/web/src/app/oauth/callback/page.tsx`

**Modifiés — backend :**
- `src/config/configuration.ts` (`OauthGoogleConfig`, section `oauthGoogle`) ; `src/config/env.validation.ts`
  (`GOOGLE_*`)
- `src/database/entities/user.entity.ts` (`mot_de_passe_hash` nullable)
- `src/modules/auth/auth.types.ts` (`OauthProfile`) ; `auth.module.ts` (Passport + `CompteOauth` +
  `GoogleStrategy`) ; `auth.service.ts` (`loginWithOauth`) ; `auth.controller.ts` (2 routes Google) ;
  `auth.service.spec.ts` (provider `CompteOauth` + suite `loginWithOauth`)
- `apps/api/package.json` / `package-lock.json` (Passport + `passport-google-oauth20`)

**Modifiés — frontend :**
- `apps/web/src/lib/api.ts` (`bootstrapSession`) ; `app/login/page.tsx` ; `app/register/page.tsx` ;
  `app/globals.css` (`.oauth-sep`, `.btn-oauth`)

**Modifiés — infra :**
- `docker-compose.dev.yml` (`GOOGLE_*` côté api) ; `.github/workflows/ci.yml` (`GOOGLE_*` factices)

---

## 6. Décisions

- **Passport pour l'acquisition d'identité UNIQUEMENT ; la session JWT reste « faite maison » (ADR-08).**
  Passport gère très bien la mécanique OAuth 2.0 (échange de code, redirections, `state`), fastidieuse et
  facile à rater à la main. Mais on **ne** l'utilise **pas** pour les sessions : pas de `passport-jwt`, pas
  de middleware de session. Une fois l'identité Google validée, on repasse sur **notre** modèle éprouvé
  (RS256, rotation refresh, denylist Redis, reuse detection). Frontière nette : Passport s'arrête à
  `validate()` qui renvoie un `OauthProfile`, le reste est notre code.
- **Table de liaison `comptes_oauth` séparée, pas des colonnes sur `users`.** Permet le **multi-fournisseur**
  (Google aujourd'hui, GitHub/Facebook ensuite) sans changer le schéma, et qu'un même compte lie plusieurs
  identités. Unicité garantie par l'index (`provider`, `providerId`).
- **`mot_de_passe_hash` nullable.** Un compte OAuth n'a pas de mot de passe local. **Sans impact sécurité :**
  le `login()` classique garde déjà le cas « hash nul » via une comparaison bcrypt sur un **hash factice**
  (temps constant) — un compte purement OAuth ne peut donc jamais se connecter par mot de passe, et il n'y a
  pas de branche qui « court-circuite » la vérification.
- **Rattachement par email (ADR-11).** Si l'email Google correspond à un compte existant, on **lie** plutôt
  que de créer un doublon. Hypothèse assumée : l'email Google est vérifié par Google.
- **Compte auto-créé = APPRENANT / ACTIF, sans email de vérification.** L'email étant déjà vérifié par le
  fournisseur, on saute l'étape de vérification de CPT-05 et le compte est directement utilisable. Le rôle
  est **forcé** côté serveur (jamais APPRENANT -> pas d'élévation).
- **Relais de session par cookie refresh httpOnly** (voir §3) plutôt que token dans l'URL de redirection.

---

## 7. Incidents & corrections

- **Test unitaire cassé par l'injection de `CompteOauth` (DI).** Ajouter le repo `CompteOauth` au
  constructeur d'`AuthService` a cassé `auth.service.spec.ts` : le `TestingModule` ne fournissait pas ce
  provider -> `Nest can't resolve dependencies of AuthService … argument "CompteOauthRepository" at index [3]`,
  **les 22 tests** de la suite échouaient (le serveur dev, lui, ne voyait rien : DI runtime différente).
  **Exactement le même piège qu'en CPT-05 avec `MailService`.** **Fix :** ajouter le mock
  `mockCompteOauthRepository` (+ son provider `getRepositoryToken(CompteOauth)`) au module de test.
  **Leçon récurrente :** tout nouveau paramètre du constructeur d'un service doit être répercuté dans le
  `TestingModule` de son spec, sinon la CI passe au rouge alors que l'app tourne.
- **Paste terminal corrompu sur le gros fichier de test (~24 Ko).** Le heredoc du spec a été tronqué en
  cours de route (bloc du milieu perdu) : `grep -c describe` renvoyait 7 au lieu de 8, et la CI locale
  échouait comme ci-dessus. **Fix :** écrire ce fichier **directement sur disque** (hors terminal) plutôt
  que par heredoc, ce qui a supprimé le risque de troncature. Enseignement : au-delà d'un certain volume,
  le collage terminal n'est pas fiable.
- **Double appel au montage (React StrictMode)** sur `/oauth/callback` : l'effet partait deux fois et le
  2e `bootstrapSession` pouvait échouer. **Fix :** garde `useRef` (même remède que la page `/verifier-email`
  de CPT-05).
- **404 initial sur `/oauth/callback`** : la page-relais n'existait pas encore côté frontend au premier
  essai de bout en bout. **Fix :** création de `app/oauth/callback/page.tsx`.

---

## 8. Vérification

- **Unitaires :** 40/40 (dont la suite `loginWithOauth` : identité liée, email connu, création complète,
  compte désactivé -> 401, email absent -> 401). `docker compose … exec api npm run test`.
- **Manuel (bout en bout, vrai compte Google, via Nginx `https://localhost`) :** clic « Continuer avec
  Google » -> consentement Google -> retour connecté sur l'accueil. Contrôles SQL : compte créé
  **APPRENANT / ACTIF**, ligne correspondante dans `comptes_oauth` (`provider = google`), et sessions
  présentes dans `refresh_tokens` (3 connexions successives observées).
- **Pas d'e2e automatisé pour le flux OAuth :** la redirection réelle vers l'écran de consentement Google
  ne peut pas s'exécuter sans navigateur ni compte Google dans la CI (pas de mode « headless » possible
  ici). La logique métier (`loginWithOauth`, toutes ses branches) est couverte par les **tests unitaires** ;
  la poignée de main OAuth elle-même a été validée **manuellement**. Écart assumé et documenté.
- **Lint :** propre (`npm run lint`, `--max-warnings 0`).

---

## 9. CI

`ci.yml` — **seule modification** : ajout des variables `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_CALLBACK_URL` (valeurs **factices**) dans le bloc `env`. Raison : `GoogleStrategy` s'instancie au
boot d'`AppModule` et la validation Joi exige `CLIENT_ID`/`SECRET` (fail-fast). Comme l'e2e ne déclenche
jamais le vrai flux OAuth (aucune redirection vers Google), des valeurs factices suffisent à laisser l'app
démarrer. Même logique que le `SMTP_HOST` factice de CPT-05. L'étape « Run database migrations » existante
applique désormais aussi la migration `AddOauthAccounts` sur la base neuve de CI.

---

## 10. Suites (ordre logique)

- **GitHub** puis **Facebook** : réutiliser exactement ce socle (nouvelle `Strategy` + une entrée dans
  `comptes_oauth` ; `loginWithOauth` est déjà générique par `provider`).
- **Durcissement OAuth (`state` / PKCE explicites)** : `passport-google-oauth20` gère le paramètre `state`,
  mais un magasin `state` explicite (anti-CSRF sur le retour) est à formaliser dans un ADR dédié — noté
  comme story de durcissement (style Sprint 10).
- **Déliaison d'un fournisseur** (« retirer Google de mon compte ») : flux dédié non couvert ici.
- **Story « Profil apprenant »** (progressive profiling) : date de naissance, niveau d'études, établissement,
  collectés après la première connexion — indépendante du moyen de connexion (mot de passe ou OAuth).
