# 10 — US-CPT-05 · Créer son propre compte (auto-inscription publique)

**Épopée :** E1 (Comptes & Authentification) · **Points :** 5 · **Branche :** `feature/US-CPT-05-register`
**Dépend de :** E0/E1 (INF02→07, AUTH-01/03/04/11) + un service d'envoi d'email
**Références :** Backlog Produit v1.1 (ligne + Gherkin), ADR-11 (inscription ouverte mais curée), ADR-08 (auth/sécurité), Sprint 1 Backlog

---

## 0. En une phrase (version non technique)

Un visiteur qui n'est pas connecté peut **créer lui-même** un compte en saisissant nom, prénom, email
et mot de passe. Le système fabrique un compte « apprenant » **en attente**, envoie un **email de
vérification**, et le compte ne devient réellement utilisable (connexion possible) **qu'après** que la
personne a cliqué sur le lien reçu. Personne ne peut, au passage, se fabriquer un compte administrateur.

**L'image mentale :** c'est le « Créer un compte » classique d'un site web. On s'inscrit, on reçoit un
mail « confirmez votre adresse », on clique, et alors seulement on peut se connecter.

---

## 1. Objectif fonctionnel (Gherkin, Backlog v1.1)

- **Nominal :** visiteur non authentifié -> soumet nom, prénom, email, mot de passe -> le système vérifie
  l'unicité de l'email, crée le compte avec rôle **APPRENANT (forcé côté serveur)** et statut
  **EN_ATTENTE_ACTIVATION**, hache le mot de passe (bcrypt cost 12), génère un jeton de vérification
  (UUID, TTL 48 h), envoie l'email, journalise **COMPTE_CREE**, renvoie **201 sans connecter** l'utilisateur.
- **Erreur (email déjà pris) :** **409** « Cet email est déjà utilisé », rien n'est créé.
- **Sécurité (pas d'élévation) :** tout champ `role` dans la requête est **ignoré/refusé** -> le compte
  auto-inscrit est **toujours** APPRENANT.
- **Vérification :** jeton valide et non expiré -> compte **ACTIF** ; jeton expiré/consommé -> refusé,
  le compte reste EN_ATTENTE_ACTIVATION.

---

## 2. Le parcours en 4 parties

| Partie | Contenu | Commit |
|--------|---------|--------|
| **A** | Infrastructure email : nodemailer + Mailhog + `MailModule`/`MailService` + config/validation SMTP | `a83d20d` |
| **B1** | Colonnes `nom`/`prenom` sur `users` + migration TypeORM manuelle | `81d9560` |
| **B2** | `POST /auth/register` (@Public) : DTO, 409, rôle forcé, bcrypt, jeton Redis, email, audit, 201 | `cfc0031` |
| **C1** | `POST /auth/verify-email` (@Public) : consomme le jeton, passe le compte ACTIF | `fe11445` |
| **C2** | Frontend : page `/register` + page `/verifier-email` + helpers `lib/api` | `e71d663` |
| **D** | Tests unitaires + e2e, ajustement CI, ce journal | (ce commit) |

---

## 3. Résumé technique

Le flux complet, de bout en bout :

1. **Frontend** `/register` (Next.js, client component) -> `POST /api/auth/register` (chemin relatif,
   proxifié par Nginx vers l'API).
2. **AuthService.register()** :
   - unicité email (`userRepository.findOne`) -> sinon `ConflictException` (409) ;
   - `bcrypt.hash(password, 12)` ;
   - `userRepository.create({ ..., role: Role.APPRENANT, statut: EN_ATTENTE_ACTIVATION })` puis `save` ;
   - jeton = `crypto.randomUUID()` ; `redis.set(verify-email:<uuid>, userId, 48h)` (TTL = auto-expiration) ;
   - `mailService.sendVerificationEmail(email, token)` -> lien `APP_BASE_URL/verifier-email?token=<uuid>` ;
   - audit `COMPTE_CREE` ; retour **201 sans jeton** (aucune session ouverte).
3. **Email** capté par Mailhog en dev (aucun mail réel n'est envoyé).
4. **Frontend** `/verifier-email?token=...` -> au montage, `POST /api/auth/verify-email`.
5. **AuthService.verifyEmail()** : `redis.get(verify-email:<uuid>)` -> si absent 400 ; sinon compte
   ACTIF, `redis.del` (usage unique), audit `EMAIL_VERIFIE`.
6. **Connexion** désormais possible (le login n'accepte que le statut ACTIF, gate héritée d'AUTH-01).

**Pourquoi Redis et pas une table ?** Le jeton est éphémère (48 h) et à usage unique. Redis expire la
clé tout seul : pas de table, pas de migration, pas de ménage. Cohérent avec l'usage Redis d'AUTH-03/04.

**Pourquoi le rôle est-il « forcé » ?** Le rôle n'est **jamais** lu depuis la requête. Deux barrières :
(1) le `ValidationPipe` global (`forbidNonWhitelisted:true`) **refuse** tout champ inconnu comme `role`
(-> 400) ; (2) même si un champ passait, `register()` écrit `role: Role.APPRENANT` en dur.

---

## 4. Le processus, étape par étape (avec commandes)

> Convention de travail : chaque fichier est écrit au terminal via `cat > fichier << 'EOF' … EOF`
> (heredoc **quoté**) pour éviter le bug d'enregistrement silencieux de Notepad, puis vérifié sur disque.

### Partie A — Infrastructure email
1. Installer la lib d'envoi : `npm install nodemailer` + `npm install -D @types/nodemailer` (dans `apps/api`).
2. Créer `src/mail/` sur le modèle EXACT de `src/redis/` : jeton `MAIL_TRANSPORTER` (factory) + façade
   `MailService` (`mail.constants.ts`, `mail.service.ts`, `mail.module.ts`, `@Global`).
3. Câbler la config : interface `MailConfig` dans `configuration.ts` + validation Joi des variables
   SMTP dans `env.validation.ts` (`SMTP_HOST` requis = fail-fast).
4. Enregistrer `MailModule` dans `app.module.ts`.
5. Ajouter le service **Mailhog** à `docker-compose.dev.yml` (+ variables SMTP côté api).
6. Rebuild indispensable après un nouveau paquet npm :
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate -V -d`
   (`-V` recrée le volume anonyme `node_modules`, sinon nodemailer n'est pas vu par le conteneur).
7. Vérifier au boot : `MailModule dependencies initialized`, `Transporteur SMTP configuré (mailhog:1025)`,
   UI Mailhog sur http://localhost:8025.

### Partie B — Migration + endpoint register
- **B1** : ajout `nom`/`prenom` (nullable) dans `user.entity.ts` + migration manuelle
  `1784900000000-AddNomPrenomToUsers.ts` (simple `ADD COLUMN`, sûr sur table peuplée car nullable).
  Appliquée dans le conteneur : `docker compose … exec api npm run migration:run`
  puis contrôle `… exec api npm run typeorm -- migration:show` (les 3 migrations `[X]`).
- **B2** : `verifyEmailKey` ajouté à `auth.keys.ts` ; `RegisterDto` (class-validator, politique de mot
  de passe : min 8 + 1 lettre + 1 chiffre) ; méthode `register()` dans `auth.service.ts` ; route
  `@Public() @Post('register')` (201) dans `auth.controller.ts`. Test manuel via un script jetable
  `_smoke-register.mjs` exécuté dans le conteneur avec `node` (Node 20 = `fetch` intégré, pas de curl).

### Partie C — Verify + frontend
- **C1** : `VerifyEmailDto` (UUID v4) ; `verifyEmail()` dans le service ; route `@Public() @Post('verify-email')`.
  Boucle testée bout en bout (`_smoke-verify.mjs`, avec lecture du jeton depuis Redis via `ioredis`) :
  register -> token -> 400 (invalide) -> 200 (valide) -> 400 (rejeu) -> **login 200** (preuve du passage ACTIF).
- **C2** : `lib/api.ts` (helpers `registerRequest`/`verifyEmailRequest`, chemins relatifs `/api/...`) ;
  page `/register` (formulaire) ; page `/verifier-email` (consomme le token). Test navigateur réel via
  **https://localhost** (origine Nginx).

### Partie D — Tests + CI + journal
- Unitaires (`auth.service.spec.ts`) : suites `register` (2) et `verifyEmail` (3) + correction DI (voir §7).
- E2e (`test/register.e2e-spec.ts`) : `MailService` **remplacé par un mock** -> aucun SMTP requis ; le
  jeton est récupéré depuis l'appel capté (`mock.calls`). 8 cas couvrant tout le Gherkin.
- CI (`ci.yml`) : ajout des variables SMTP (dont `SMTP_HOST`) pour que le boot d'AppModule passe la
  validation ; **pas** de serveur Mailhog en CI (le mock suffit).
- Commandes : `docker compose … exec api npm run test` (unit), `… npm run test:e2e` (e2e),
  `… npm run lint` (lint --max-warnings 0).

---

## 5. Fichiers

**Nouveaux — backend :**
- `src/mail/mail.constants.ts`, `src/mail/mail.service.ts`, `src/mail/mail.module.ts`
- `src/database/migrations/1784900000000-AddNomPrenomToUsers.ts`
- `src/modules/auth/dto/register.dto.ts`, `src/modules/auth/dto/verify-email.dto.ts`
- `test/register.e2e-spec.ts`

**Nouveaux — frontend :**
- `apps/web/src/app/register/page.tsx`, `apps/web/src/app/verifier-email/page.tsx`

**Modifiés :**
- `src/config/configuration.ts` (+`MailConfig`, section `mail`) ; `src/config/env.validation.ts` (SMTP)
- `src/app.module.ts` (import `MailModule`)
- `src/database/entities/user.entity.ts` (`nom`, `prenom`)
- `src/modules/auth/auth.keys.ts` (`verifyEmailKey`) ; `auth.service.ts` (`register`, `verifyEmail`) ;
  `auth.controller.ts` (routes register + verify-email) ; `auth.service.spec.ts` (mock MailService + tests)
- `apps/web/src/lib/api.ts` (`registerRequest`, `verifyEmailRequest`)
- `docker-compose.dev.yml` (Mailhog + réseau + `APP_BASE_URL`) ; `.github/workflows/ci.yml` (SMTP)
- `apps/api/package.json` / `package-lock.json` (nodemailer)

---

## 6. Décisions

- **`nom`/`prenom` NULLABLE en base, requis au niveau DTO.** La table `users` est déjà peuplée (admin
  seedé) : on ne peut pas ajouter une colonne NOT NULL sans backfill, et un backfill imposerait de
  toucher au seed. Nullable = migration additive sûre ; le `RegisterDto` garantit que tout inscrit
  fournit les deux. La modélisation « profil » riche (date de naissance, diplôme, établissement…) fera
  l'objet d'une **story dédiée** (progressive profiling), pas de l'histoire d'authentification.
- **Anti-élévation = Option A (pipe global strict).** Le `ValidationPipe` global a `forbidNonWhitelisted:true` :
  un champ `role` injecté renvoie **400** (rejeté), pas « ignoré silencieusement ». La garantie de
  sécurité (compte toujours APPRENANT) est intacte, et c'est même plus strict. Noté ici car le Gherkin
  disait « ignoré » : réalisé comme « rejeté (400) ».
- **Jeton de vérification dans Redis** (`verify-email:<uuid>` -> userId, EX 48 h), pas de table/migration ;
  suppression = consommation (usage unique).
- **409 explicite** sur email déjà pris (UX d'inscription standard ; compromis d'énumération assumé, ADR-11).
- **Mot de passe créé à l'inscription** (bcrypt 12). L'email **vérifie** l'adresse, il ne sert pas à
  poser le mot de passe (différence avec US-CPT-01/AUTH-05 où l'admin crée le compte).
- **E2e : `MailService` mocké** plutôt qu'un Mailhog en CI. Plus déterministe, aucune dépendance réseau,
  et le transport SMTP réel a de toute façon été vérifié manuellement (email visible dans Mailhog).

---

## 7. Incidents & corrections (la partie la plus instructive)

Le poste de travail avait été « nettoyé » : plusieurs fichiers **non versionnés** (gitignored) avaient
disparu. Ils ne reviennent PAS avec un `git checkout` (git ne les suit pas) — il a fallu les recréer.

- **`.env` racine manquant** -> au boot : `Config validation error: "DB_USERNAME" ... empty`. Les
  variables `${POSTGRES_*}` de Docker Compose venaient d'un `.env` disparu. **Fix :** recréer `.env`
  (récupéré dans la corbeille : `POSTGRES_PASSWORD=cert_eet_database_password_test`, etc.), ce qui a
  évité de réinitialiser le volume Postgres (les identifiants correspondaient au volume existant).
- **Clés JWT (`secrets/*.pem`) manquantes** -> dossier `secrets/` vide. **Fix :** restaurées depuis la
  corbeille (paire validée : `openssl rsa -check` + comparaison `-pubout`).
- **Certificat TLS Nginx manquant** -> `nginx: [emerg] cannot load certificate ".../fullchain.pem"` ;
  le conteneur `nginx` ne démarrait pas, donc `https://localhost` -> `ERR_CONNECTION_REFUSED`.
  **Fix :** régénérer un cert auto-signé de dev :
  `MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -keyout docker/nginx/certs/privkey.pem
   -out docker/nginx/certs/fullchain.pem -days 365 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"`
  (`MSYS_NO_PATHCONV=1` empêche Git Bash de transformer `/CN=localhost` en chemin Windows).
- **`getaddrinfo ENOTFOUND mailhog`** au premier envoi réel : l'inscription créait le compte mais
  renvoyait 500. Le service Mailhog avait été ajouté **sans** `networks:`, il atterrissait sur le réseau
  `default` alors que le reste de la stack est sur le réseau custom `cert_eet_net`. **Fix :** ajouter
  `networks: [cert_eet_net]` au service `mailhog`, puis `up -d` (recrée le conteneur sur le bon réseau).
- **`APP_BASE_URL` pointait sur `http://localhost:3001`** (conteneur web direct) alors que les appels
  frontend sont en chemins relatifs `/api/...` qui ne fonctionnent QUE via Nginx. Le lien de l'email
  ouvrait donc une page où `/api` n'existe pas. **Fix :** `APP_BASE_URL=https://localhost` (origine Nginx).
- **`docker-compose.dev.yml` écrit dans `apps/`** (mauvais `cwd` au moment du heredoc) : la stack lisait
  l'ancien fichier racine. **Fix :** `mv apps/docker-compose.dev.yml docker-compose.dev.yml`.
- **Double vérification en dev (React StrictMode)** : la page `/verifier-email` appelait l'endpoint deux
  fois au montage ; le 2e appel consommait un jeton déjà utilisé et affichait une erreur malgré un
  succès. **Fix :** garde `useRef` pour n'exécuter l'effet qu'une fois.
- **Test unitaire cassé par B2 (DI)** : ajouter `MailService` au constructeur d'`AuthService` a cassé
  `auth.service.spec.ts` (module de test sans provider `MailService`). Le serveur dev ne le voyait pas
  (DI runtime différente). **Fix :** ajouter le mock `MailService` (+ `create` sur le mock userRepo) au
  `TestingModule` du spec — sinon `npm run test` échoue en CI.
- **Cache de build Docker** : `RUN npm ci` servi en CACHE lors du rebuild -> vérifié que `nodemailer`
  était bien dans `package-lock.json` (6 occurrences) et présent dans le conteneur.

**Leçon :** tout ce qui est gitignored (`.env`, `secrets/`, `docker/nginx/certs/`) est reconstruisible
mais absent du dépôt ; un `README`/checklist « machine fraîche » (openssl clés + cert + copie `.env.example`)
évite ce genre de mésaventure.

---

## 8. Vérification

- **Unitaires :** 35/35 (dont `register` 2 et `verifyEmail` 3). `docker compose … exec api npm run test`.
- **E2e :** 26/26 (dont `register.e2e` 8 : 201/409/400 role/400 mdp/400 token/200 verify/400 rejeu/200 login).
  `docker compose … exec api npm run test:e2e`.
- **Lint :** propre (`npm run lint`, `--max-warnings 0`).
- **Manuel (navigateur, via Nginx `https://localhost`) :** inscription -> email dans Mailhog -> clic sur le
  lien -> page « adresse vérifiée » -> connexion réussie. Contrôles SQL : compte `APPRENANT` /
  `EN_ATTENTE_ACTIVATION` puis `ACTIF` ; audit `COMPTE_CREE` puis `EMAIL_VERIFIE` ; clé `verify-email:*`
  présente puis supprimée après vérification.

---

## 9. CI

`ci.yml` — **seule modification** : ajout des variables SMTP dans le bloc `env` (`SMTP_HOST=localhost`,
`SMTP_PORT`, `MAIL_FROM`, `APP_BASE_URL`). Raison : l'e2e boote `AppModule`, dont la validation Joi
exige `SMTP_HOST` (fail-fast). Comme l'e2e **mocke** `MailService`, aucun serveur mail n'est nécessaire —
`SMTP_HOST` factice suffit à satisfaire la validation. L'étape « Run database migrations » existante
applique désormais aussi la migration `AddNomPrenom` sur la base neuve de CI.

---

## 10. Suites (ordre logique)

- **US-AUTH-14** (OAuth social, Google d'abord) : réutilise le modèle « compte + vérification ».
- **US-CPT-01** (admin crée un compte) : réutilise `MailService` (`@Roles(ADMINISTRATEUR)`).
- **US-AUTH-05** (activation) et **US-AUTH-06** (reset mot de passe) : réutilisent `MailService`.
- **Story « Profil apprenant »** : date de naissance (-> âge dérivé, jamais stocké), niveau d'études
  (enum), établissement (référentiel), collectés APRÈS l'inscription (progressive profiling), avec
  décision RGPD au niveau ADR.
- **Renvoi d'email de vérification** : flux dédié (non couvert ici).
