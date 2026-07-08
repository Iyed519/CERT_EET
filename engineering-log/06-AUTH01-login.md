# AUTH-01 — Connexion (US-AUTH-01)

> branche `feature/US-AUTH-01-login` · PR à venir au moment de la rédaction.

## Objectif

**En une phrase simple :** permettre à quelqu'un qui a déjà un compte de taper son
email et son mot de passe, et d'obtenir l'accès à la plateforme — de façon sûre,
pour que personne ne puisse deviner ou voler l'accès de quelqu'un d'autre.

**Techniquement :** implémenter `POST /auth/login` : validation du DTO,
vérification du mot de passe via `bcrypt.compare()`, vérification du statut de
compte (`ACTIF` requis), émission d'un access token JWT RS256 (15 min) et d'un
refresh token RS256 (7 jours), persistance de la session en base
(`refresh_tokens`), mise à jour de `derniereConnexion`. Toutes les branches
d'erreur (email inconnu, mauvais mot de passe, compte inactif) renvoient un
message **strictement identique** ("sécurité par opacité", DS-01). Le frontend
câble enfin le formulaire de connexion laissé inactif depuis INF02.

**Termes :**
- **JWT (JSON Web Token)** = un petit "badge" numérique signé, prouvant qui est
  connecté, sans que le serveur ait besoin de se souvenir de chaque connexion en
  mémoire. Il contient des informations (qui est l'utilisateur, son rôle) et une
  signature qui prouve que personne ne l'a modifié.
- **RS256** = la méthode de signature utilisée pour ce badge. Elle utilise DEUX
  clés : une clé **privée** (secrète, ne quitte jamais le serveur, sert à signer)
  et une clé **publique** (peut être partagée, sert seulement à vérifier qu'un
  badge est authentique). C'est comme un cachet de cire : seul le serveur a le
  sceau (clé privée) pour l'apposer, mais n'importe qui peut voir la forme du
  cachet (clé publique) pour vérifier qu'il n'est pas faux.
- **Access token** = le badge de courte durée (15 min) que le frontend envoie à
  chaque requête pour prouver "je suis bien connecté". Courte durée = si jamais
  il est volé, la fenêtre de danger est petite.
- **Refresh token** = un badge de longue durée (7 jours), utilisé UNIQUEMENT pour
  obtenir un nouvel access token une fois que l'ancien a expiré, sans obliger la
  personne à retaper son mot de passe toutes les 15 minutes.
- **bcrypt** = l'algorithme qui transforme un mot de passe en une empreinte
  illisible ("hash") avant de le stocker en base. Même si la base de données
  fuitait, personne ne pourrait retrouver le vrai mot de passe à partir du hash.
  `bcrypt.compare()` vérifie qu'un mot de passe tapé correspond au hash stocké,
  sans jamais "dé-hacher" quoi que ce soit (c'est mathématiquement impossible
  dans l'autre sens, par conception).
- **Sécurité par opacité (anti-énumération)** = ne JAMAIS donner d'indice sur ce
  qui a précisément échoué. Si le message "email inconnu" est différent du
  message "mauvais mot de passe", un attaquant peut tester des milliers d'emails
  et savoir lesquels existent réellement sur la plateforme, sans même connaître
  un seul mot de passe. En renvoyant TOUJOURS le même message, cette fuite
  d'information est fermée.
- **DTO (Data Transfer Object)** = une petite classe qui décrit la forme attendue
  d'une requête (ici : `email` + `password`). Sert de "videur à l'entrée" : une
  requête mal formée est rejetée avant même d'atteindre le code métier.
- **Cookie httpOnly** = une donnée stockée par le navigateur, mais qu'AUCUN script
  JavaScript sur la page ne peut lire (même un script malveillant injecté via une
  faille XSS). Seul le navigateur et le serveur peuvent la voir. C'est la manière
  la plus sûre de stocker un jeton de longue durée côté client.
- **XSS (Cross-Site Scripting)** = une attaque où quelqu'un parvient à faire
  exécuter du JavaScript non prévu sur votre page (par exemple via un champ de
  texte mal filtré ailleurs sur le site). Si un jeton sensible était accessible en
  JavaScript (ex: `localStorage`), ce script pourrait le voler. `httpOnly` ferme
  cette porte pour le refresh token.
- **Repository (TypeORM)** = l'objet qui permet de lire/écrire dans une table de
  la base de données depuis le code TypeScript, sans écrire de SQL à la main pour
  les cas courants (`findOne`, `save`, `create`...).
- **Mock (test unitaire)** = un faux objet qui imite le comportement d'un vrai
  objet (ex: une fausse base de données) pour tester UNE SEULE pièce de code en
  isolation, rapidement, sans dépendre de Docker ni d'une vraie base.

## Ce que nous avons construit — backend

### 1. Le DTO (`dto/login.dto.ts`)

**Simple :** un formulaire avec des règles écrites dessus — "l'email doit être un
vrai email, le mot de passe ne peut pas être vide" — vérifié automatiquement
avant que le reste du code ne s'en occupe.

**Technique :** classe `LoginDto` avec `@IsEmail()` et `@IsNotEmpty()`
(`class-validator`). Le `ValidationPipe` global déjà posé en INF02
(`whitelist: true, forbidNonWhitelisted: true, transform: true`) l'applique
automatiquement : toute requête mal formée est rejetée en 400 AVANT d'atteindre
`AuthController`.

### 2. Le service (`auth.service.ts`)

**Simple :** le "cerveau" de la connexion. C'est lui qui vérifie le mot de passe,
regarde si le compte est actif, et fabrique les badges (tokens) si tout est bon.

**Technique :** `AuthService.login(dto, context)` :
1. Cherche l'utilisateur par email (`userRepository.findOne`).
2. Compare le mot de passe via `bcrypt.compare()` — **même si l'utilisateur
   n'existe pas** (contre un hash factice), pour que le TEMPS de réponse ne
   trahisse pas si l'email existe (protection temporelle, en plus du message
   générique — voir Gotchas).
3. Si pas d'utilisateur OU mot de passe incorrect → `UnauthorizedException`
   générique.
4. Si `statut !== ACTIF` → même exception, même message.
5. Signe l'access token (RS256, 15 min, payload `{ sub, email, role }`) et le
   refresh token (RS256, 7 j, payload `{ sub, type: 'refresh' }`) via
   `JwtService.signAsync()`.
6. Hache le refresh token en **SHA-256** (pas bcrypt — voir Gotchas) et le
   persiste dans `refresh_tokens` (`tokenHash`, `adresseIp`, `userAgent`, `active`,
   `dateExpiration`).
7. Met à jour `derniereConnexion` sur l'utilisateur.

### 3. Le contrôleur (`auth.controller.ts`)

**Simple :** la "porte d'entrée" HTTP. Il reçoit la requête, la passe au cerveau
(le service), et renvoie la réponse — sans lui-même décider qui a le droit de se
connecter.

**Technique :** `POST /auth/login`, `@HttpCode(200)` (un login réussi n'est pas une
"création de ressource" au sens REST, donc 200 plutôt que le 201 par défaut de
NestJS sur un POST). Pose le refresh token en cookie `httpOnly` via
`res.cookie()` (voir section cookie ci-dessous) et renvoie `{ accessToken, user }`
en JSON — **sans** le refresh token dans le corps.

### 4. Le module (`auth.module.ts`)

**Simple :** la "boîte" qui assemble toutes les pièces ci-dessus et les branche au
reste de l'application.

**Technique :** `TypeOrmModule.forFeature([User, RefreshToken])` — **premier**
module du projet à enregistrer des repositories spécifiques (`DatabaseModule` ne
fait que la connexion racine via `forRoot`, un pattern NestJS standard où chaque
module métier déclare ensuite les entités dont il a besoin). `JwtModule.register({})`
enregistré vide à dessein : la clé privée RS256 est lue à la demande dans
`AuthService`, pas au démarrage du module, pour ne pas bloquer tout le module si
la lecture du fichier échouait.

### 5. Extension de la configuration (`configuration.ts`)

**Simple :** on a appris à l'application où trouver les "cachets" de signature
(les clés RS256), d'une façon propre et cohérente avec le reste du projet.

**Technique :** ajout d'une section `jwt` à l'objet de config typé (`JwtConfig`),
lue via `ConfigService` (jamais `process.env` directement, règle déjà posée en
INF02). `accessTokenExpiresIn`/`refreshTokenExpiresIn` sont des **nombres de
secondes** (900 / 604800), pas des chaînes comme `'15m'` — voir Gotchas.

## Ce que nous avons construit — le cookie httpOnly (correction de sécurité)

**Simple :** au tout début, le badge longue-durée (refresh token) était renvoyé
en clair dans la réponse, comme un mot écrit sur un post-it visible par tout le
monde. On a corrigé ça : maintenant il est mis dans une "boîte scellée" que seul
le navigateur peut manipuler, invisible pour n'importe quel script sur la page.

**Technique :** le cahier des charges (DS-01) spécifie explicitement : *"access
token en mémoire JavaScript, refresh token en cookie httpOnly"*. Un cookie
`httpOnly` ne peut être posé QUE par le serveur (`Set-Cookie`), jamais par du
JavaScript côté client — donc le contrat devait être respecté côté backend dès le
départ. Correction apportée à `auth.controller.ts` :

```typescript
res.cookie('refreshToken', result.refreshToken, {
  httpOnly: true,
  secure: true,      // TLS toujours terminé à Nginx (INF03)
  sameSite: 'strict',// même origine frontend/API (routage Nginx)
  path: '/api/auth',  // envoyé uniquement vers /auth/*, pas toute l'API
  maxAge: jwtConfig.refreshTokenExpiresIn * 1000, // secondes -> millisecondes
});
```

Le corps JSON ne contient plus que `{ accessToken, user }`. Vérifié visuellement
dans Chrome DevTools → Application → Cookies : `HttpOnly` ✓, `Secure` ✓,
`SameSite: Strict`, `Path: /api/auth`, expiration ≈ 7 jours.

## Ce que nous avons construit — frontend

### 1. Le client API (`lib/api.ts`)

**Simple :** un unique petit outil réutilisable qui sait "comment parler au
serveur" pour se connecter, pour que chaque page n'ait pas à réinventer cette
logique.

**Technique :** **premier** fichier de ce type dans le projet. `loginRequest()`
appelle `POST /api/auth/login` en chemin RELATIF (frontend et API sont derrière le
même reverse proxy Nginx — pas de CORS, pas d'URL de base à configurer).
`credentials: 'include'` est nécessaire pour que le navigateur envoie/accepte le
cookie httpOnly. En cas d'échec, lève une `LoginError` avec le message générique
du backend — jamais reformulé côté frontend (pour ne pas réintroduire une fuite
d'information après l'avoir fermée côté backend).

### 2. Le contexte d'authentification (`contexts/AuthContext.tsx`)

**Simple :** une "mémoire partagée" de l'application qui retient qui est
actuellement connecté, accessible depuis n'importe quelle page.

**Technique :** `AuthProvider` (Context React) + hook `useAuth()`. L'access token
et l'utilisateur sont gardés en `useState` — **mémoire JavaScript uniquement,
jamais `localStorage`/`sessionStorage`** (exigence DS-01 explicite, cf. XSS
ci-dessus). Conséquence assumée : un rafraîchissement de page (F5) efface la
session en mémoire — ce sera résolu par US-AUTH-03 (rafraîchissement automatique
via le refresh token en cookie), pas par cette story.

### 3. Le layout racine (`app/layout.tsx`)

**Simple :** on a enveloppé toute l'application dans cette "mémoire partagée",
pour que n'importe quelle page future puisse savoir qui est connecté sans
reconfiguration.

**Technique :** `<AuthProvider>` enveloppe `{children}`. `RootLayout` reste un
Server Component (pas de `'use client'`) — Next.js App Router autorise un Server
Component à rendre un Client Component parmi ses enfants.

### 4. La page de connexion (`app/login/page.tsx`)

**Simple :** le vrai formulaire, enfin fonctionnel — on tape son email et son mot
de passe, on clique, et soit on est connecté, soit un message d'erreur clair
apparaît.

**Technique :** `'use client'` (formulaire interactif). `handleSubmit` appelle
`loginRequest()`, stocke la session via `setSession()` (AuthContext) en cas de
succès, redirige vers `/` via `next/navigation`. En cas d'échec, affiche
`error.message` tel quel (déjà générique par construction côté backend).

**Point d'extension noté dans le code :** le Gherkin du backlog prévoit une
redirection "vers son espace selon son rôle" (`/apprenant`, `/formateur`,
`/administrateur`). Ces pages n'existent pas encore dans le projet à ce stade —
aucune story ne les a créées. Redirection vers `/` pour l'instant, avec un
commentaire marquant où l'aiguillage par rôle viendra se brancher plus tard.

## Tests

### Unitaires (`auth.service.spec.ts`) — 6 tests

**Simple :** on teste le "cerveau" (AuthService) tout seul, avec une fausse base
de données, pour vérifier sa logique très rapidement, sans avoir besoin de
Docker.

**Technique :** repositories TypeORM et `JwtService` remplacés par des
`jest.fn()`. Un vrai hash bcrypt est généré une fois (`beforeAll`, coût réduit à
4 au lieu de 12 — un vrai hash valide, mais sans payer le coût de calcul de
production à chaque test). Couvre : cas nominal (tokens émis + session
persistée + `derniereConnexion` mis à jour), email inconnu, mauvais mot de
passe, compte inactif, et un test dédié qui vérifie que **les trois messages
d'erreur sont byte-for-byte identiques** (preuve directe de la sécurité par
opacité, pas juste "renvoie 401 dans les trois cas").

### End-to-end (`test/auth.e2e-spec.ts`) — 5 tests

**Simple :** on démarre l'application pour de vrai, avec une vraie base de
données, et on lui envoie de vraies requêtes, exactement comme le ferait un vrai
navigateur.

**Technique :** `Test.createTestingModule({ imports: [AppModule] })` + vraie
connexion Postgres. Deux comptes de test créés en `beforeAll` (un `ACTIF`, un
`DESACTIVE`), supprimés en `afterAll`. Couvre : 200 + accessToken en JSON +
refreshToken en cookie httpOnly (et absent du JSON), 401 email inconnu, 401
mauvais mot de passe, 401 compte inactif, 400 champ manquant (validation DTO).

## Gotchas (dans l'ordre où on les a rencontrés)

- **`expiresIn` refusé par TypeScript.** `@nestjs/jwt` attend un `number`
  (secondes) ou un format de chaîne très spécifique pour `expiresIn` — notre
  `JwtConfig` déclarait `string`, trop vague pour que TypeScript fasse confiance.
  **Fix :** `accessTokenExpiresIn`/`refreshTokenExpiresIn` en `number` (secondes),
  pas en chaînes comme `'15m'`.

- **`node_modules` désynchronisé entre Windows et le conteneur Docker.** Après
  `npm install @nestjs/jwt` sur Windows, le conteneur ne le voyait pas — le
  dev mount partage le code source, mais `node_modules` reste un volume séparé
  côté conteneur pour éviter les conflits de binaires Windows/Linux. **Fix :**
  `docker compose up --build --force-recreate -V` (le `-V` recrée les volumes
  anonymes, donc `node_modules` côté conteneur, à partir du `package.json` à
  jour).

- **Fichiers "collés" dans Notepad mais jamais réellement sauvegardés sur
  disque.** Plusieurs fois (`auth.controller.ts`, `dto/login.dto.ts`,
  `app.module.ts`, `test/auth.e2e-spec.ts`), le contenu semblait collé mais
  l'erreur de compilation indiquait un fichier vide ou l'ancienne version.
  Cause : quand Notepad ouvre un chemin qui n'existe pas encore, il propose "créer
  ce fichier ?" — une confirmation manquée, ou une sauvegarde (Ctrl+S) oubliée,
  laisse le fichier vide ou périmé sur disque alors que l'éditeur semble à jour.
  **Fix systématique :** après un edit important, `cat` ou `grep` le fichier
  depuis le terminal pour confirmer ce qui est RÉELLEMENT sur disque, plutôt que
  de faire confiance à l'état visuel de l'éditeur.

- **`bcrypt` vs `SHA-256` pour le refresh token.** Le refresh token JWT est une
  chaîne longue et déjà aléatoire (haute entropie) — contrairement à un mot de
  passe humain (faible entropie, potentiellement réutilisé/deviné). `bcrypt`
  tronque silencieusement tout ce qui dépasse 72 caractères ET est
  délibérément lent (voulu pour un mot de passe, inutile pour un jeton déjà
  aléatoire). **Décision :** hachage du refresh token via `crypto` (Node,
  SHA-256) — rapide, déterministe, sans limite de longueur. `bcrypt` reste
  réservé au mot de passe utilisateur (`motDePasseHash`), cohérent avec ADR-08.

- **`AppModule` compilé mais `AuthModule` absent du boot log.** Après avoir créé
  tous les fichiers d'auth, le log de démarrage ne montrait ni
  `AuthModule dependencies initialized` ni la route `/api/auth/login`. Même cause
  que le gotcha "fichier non sauvegardé" ci-dessus : l'édit de `app.module.ts`
  ajoutant `AuthModule` aux imports n'avait pas persisté sur disque. **Fix :**
  recréation complète du fichier plutôt qu'un edit partiel, puis vérification via
  `cat`.

- **`curl` absent dans le conteneur `api`.** L'image de base Node est allégée et
  n'inclut pas `curl`. **Fix :** utiliser `node -e "fetch(...)"` (fetch natif de
  Node 18+) pour tester des endpoints HTTP depuis l'intérieur du conteneur.

- **404 sur `GET /health` via Nginx (mais 200 en direct sur le conteneur).**
  Nginx route ce chemin précis vers le conteneur `web` (Next.js) au lieu de
  `api` — un détail de configuration pré-existant d'INF03, sans rapport avec
  AUTH-01 (login passe par `/api/auth/login`, correctement routé vers `api`,
  comme `/api/docs`). Non bloquant pour cette story ; à noter pour un futur
  nettoyage.

- **Désynchronisation admin seed / `.env`.** Le script `seed.ts` est
  volontairement **idempotent dans un seul sens** : s'il trouve un admin
  existant par email, il ne fait RIEN (ne met jamais à jour le mot de passe).
  Résultat : le mot de passe réel en base ne correspondait plus à
  `ADMIN_PASSWORD` dans `.env` (modifié après le premier `docker compose up` de
  la story). Confirmé en isolant `bcrypt.compare()` directement (sans passer par
  HTTP), qui renvoyait `false`. **Fix (dev uniquement) :** suppression de la
  ligne admin (`DELETE FROM users WHERE email=...`) puis ré-exécution de
  `seed.ts`. **Ce n'est PAS un bug** : un vrai changement de mot de passe (future
  story AUTH-08) passera par `UPDATE` direct en base, sans dépendre du seed.

- **Apostrophes françaises échappées (`\'`) cassant le parseur TypeScript.**
  Dans `auth.service.spec.ts` et un endroit d'`AuthContext.tsx`, des chaînes du
  type `'l\'email'` (apostrophe échappée dans une chaîne à guillemets simples)
  ont provoqué une cascade d'erreurs de syntaxe sans rapport apparent (variables
  "jamais lues", parenthèse manquante loin du vrai problème). **Fix :** reformuler
  sans apostrophe (`'l email'`) dans les noms de test, ou utiliser un template
  literal (`` `...` ``) qui n'a pas besoin d'échappement pour une apostrophe.

- **`as any` refusé par ESLint (`@typescript-eslint/no-explicit-any`).** Pour
  espionner (`jest.spyOn`) une méthode PRIVÉE (`getPrivateKey`) depuis un test,
  un cast était nécessaire, mais `any` désactive toute vérification de type sur
  l'objet entier. **Fix :** cast vers un type structurel local minimal
  (`{ getPrivateKey: () => string }`) — documente précisément ce dont le test a
  besoin, sans tout désactiver.

- **Bash : `!` dans un mot de passe cassait la commande (`event not found`).**
  Bash interprète `!` comme un déclencheur d'historique de commandes, même entre
  guillemets doubles. **Fix :** échapper avec `\!` (ex: `Admin123\!`).

- **404 partout dans le premier run du test e2e — préfixe global oublié.**
  `main.ts` appelle `app.setGlobalPrefix('api', { exclude: ['health'] })`, ce qui
  fait exister la route à `/api/auth/login`. Le test e2e construit l'app "à la
  main" (`Test.createTestingModule` + `app.init()`) et avait copié la config du
  `ValidationPipe` depuis `main.ts`, mais pas cette ligne — la route existait
  donc à `/auth/login` (sans `/api`) dans le contexte du test uniquement,
  d'où un 404 sur les 5 tests. **Fix :** ajout de la même ligne
  `app.setGlobalPrefix(...)` dans `beforeAll` du test.

## Commandes clés utilisées (reproductibilité)

Regroupées par usage, dans l'ordre où elles reviennent le plus souvent pendant
cette story.

**Démarrer / reconstruire la stack :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# Après un changement de dépendance npm (ex: ajout de @nestjs/jwt), le
# conteneur peut avoir un node_modules périmé -> forcer sa reconstruction :
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate -V
```

**Installer une dépendance (toujours dans apps/api, pas à la racine) :**
```bash
cd apps/api
npm install @nestjs/jwt
cd ../..
```

**Lancer les tests unitaires (un seul fichier, rapide) :**
```bash
cd apps/api
npx jest auth.service.spec.ts
```

**Lancer lint + toute la suite unitaire avec couverture (ce que CI exécute) :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run test:cov
```

**Lancer le test e2e (a besoin de Postgres réel -> dans le conteneur) :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npx jest --config ./test/jest-e2e.json auth.e2e-spec.ts
```

**Tester l'endpoint à la main depuis l'intérieur du conteneur (pas de curl
installé -> on utilise le fetch natif de Node) :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api node -e "fetch('http://localhost:3000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@cert-eet.local',password:'Admin123\!'})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))"
# Le \! est nécessaire : Bash interprète ! comme un déclencheur d'historique
# de commandes, même entre guillemets doubles.
```

**Interroger Postgres directement (vérifier une ligne, un statut...) :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U cert_eet -d cert_eet -c "SELECT email, statut FROM users WHERE email='admin@cert-eet.local';"

# Forcer temporairement un statut pour tester une branche d'erreur :
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U cert_eet -d cert_eet -c "UPDATE users SET statut='DESACTIVE' WHERE email='admin@cert-eet.local';"
# ... tester ... puis TOUJOURS remettre ACTIF :
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U cert_eet -d cert_eet -c "UPDATE users SET statut='ACTIF' WHERE email='admin@cert-eet.local';"
```

**Ré-exécuter le seed admin après une désynchronisation .env (dev uniquement) :**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec postgres \
  psql -U cert_eet -d cert_eet -c "DELETE FROM users WHERE email='admin@cert-eet.local';"
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api \
  npx ts-node -r tsconfig-paths/register src/database/seed.ts
```

**Confirmer ce qui est RÉELLEMENT sur disque (après un edit suspect) :**
```bash
cat apps/api/src/modules/auth/auth.controller.ts
grep -n "refreshToken" apps/api/test/auth.e2e-spec.ts
```

## Statut & comment vérifier

- **Backend :** `POST /auth/login` fonctionnel — testé manuellement (mauvais mdp
  → 401 générique ; bon mdp + compte ACTIF → tokens réels ; bon mdp + compte
  inactif → même 401 générique) ET via 11 tests automatisés (6 unitaires + 5
  e2e), tous verts. Lint propre.
- **Frontend :** page `/login` fonctionnelle — testée dans Chrome : mauvais mot
  de passe affiche le message générique en rouge dans le formulaire ; bons
  identifiants redirigent vers `/`. Cookie `refreshToken` confirmé visuellement
  dans DevTools → Application → Cookies : `HttpOnly` ✓, `Secure` ✓,
  `SameSite: Strict`, `Path: /api/auth`.
- **Pour vérifier :**
  - Backend seul : `docker compose ... exec api npm run lint` puis
    `npm run test:cov` puis `npx jest --config ./test/jest-e2e.json auth.e2e-spec.ts`.
  - Bout en bout : `docker compose up --build`, ouvrir `https://localhost/login`
    (accepter le certificat auto-signé), tester avec de mauvais identifiants puis
    avec `admin@cert-eet.local` / le mot de passe réel de `.env`.

## Prochaine étape

Boucle Git : commit → push → self-review "Files changed" (aucun `.env`, aucun
`*.pem`) → PR → CI verte → squash-merge. Ensuite : **US-AUTH-03** (rafraîchir la
session) — c'est cette story qui utilisera enfin le refresh token posé en cookie
httpOnly aujourd'hui, jusque-là inutilisé après sa création.