# 12 — US-AUTH-14 · Connexion sociale GitHub (2e fournisseur)

**Épopée :** E1 (Comptes & Authentification) · **Branche :** `feature/US-AUTH-14-oauth-github`
**Dépend de :** US-AUTH-14 (socle OAuth + Google, journal 11) déjà mergé sur `main`
**Références :** Backlog Produit v1.1, ADR-08 (auth/sécurité), ADR-11 (inscription curée)

---

## 0. En une phrase (version non technique)

On ajoute un deuxième bouton de connexion sociale : **« Continuer avec GitHub »**, à côté de Google. Le
comportement est identique — l'utilisateur s'authentifie chez GitHub, revient connecté, et s'il est nouveau
un compte « apprenant » actif est créé automatiquement.

**L'image mentale :** exactement le bouton Google d'avant, mais pour GitHub.

---

## 1. Objectif fonctionnel

Mêmes règles que Google (voir journal 11) : identité déjà liée -> session directe ; email déjà connu ->
rattachement ; nouvel utilisateur -> compte APPRENANT/ACTIF ; compte non-actif -> 401 ; email absent -> 401.
La seule différence est le fournisseur (`provider = 'github'`).

---

## 2. Pourquoi c'est une petite story

Le gros du travail avait été fait pour Google et conçu **générique dès le départ** :

- `comptes_oauth` est **multi-fournisseur** (clé `provider` + `providerId`) — **aucune migration** ici.
- `AuthService.loginWithOauth(oauth, …)` ne connaît pas le fournisseur : il lit `oauth.provider`. **Aucune
  modification du service** — la preuve que la conception Google était bonne.
- Le relais de session (cookie refresh httpOnly -> `/oauth/callback` -> `/auth/refresh`) est réutilisé tel quel.

Il ne restait donc que : une **stratégie Passport GitHub**, **deux routes**, **deux boutons**, la **config**,
et un **test**.

---

## 3. Ce qui a été ajouté / modifié

**Nouveau — backend :**
- `src/modules/auth/strategies/github.strategy.ts` — `PassportStrategy(Strategy, 'github')`
  (`passport-github2`), scope `user:email`, `validate()` qui normalise le profil GitHub en `OauthProfile`.
- `src/modules/auth/strategies/github.strategy.spec.ts` — 4 tests unitaires de `validate()`.

**Modifié — backend :**
- `src/config/configuration.ts` — interface `OauthGithubConfig` + section `oauthGithub` (avec défaut de callback).
- `src/config/env.validation.ts` — `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` requis (fail-fast),
  `GITHUB_CALLBACK_URL` avec défaut.
- `src/modules/auth/auth.module.ts` — provider `GithubStrategy` ajouté.
- `src/modules/auth/auth.controller.ts` — deux routes `@Public` `/auth/oauth/github` et
  `/auth/oauth/github/callback`. **Refactor** au passage : la logique commune des callbacks (Google + GitHub)
  est extraite dans un helper privé `completeOauthLogin(req, res)` — plus de duplication.

**Modifié — frontend :**
- `apps/web/src/app/login/page.tsx` et `register/page.tsx` — bouton « Continuer avec GitHub » (marque
  Octocat SVG), sous le bouton Google.
- `apps/web/src/app/globals.css` — variante sombre `.btn-oauth-github` + espacement entre deux boutons OAuth.

**Modifié — infra :**
- `docker-compose.dev.yml` — variables `GITHUB_*` (depuis le `.env` racine, jamais committé).
- `.github/workflows/ci.yml` — `GITHUB_*` factices (le boot valide les variables, fail-fast).
- `.env.example` — section « OAuth social login » documentant Google **et** GitHub (elle manquait).
- `apps/api/package.json` / `package-lock.json` — `passport-github2` + `@types/passport-github2`.

---

## 4. Le processus, étape par étape

### Partie A — Config
1. OAuth App enregistrée sur https://github.com/settings/developers
   (callback `https://localhost/api/auth/oauth/github/callback`), Client ID/Secret dans le `.env` racine.
2. `OauthGithubConfig` + validation Joi `GITHUB_*` + `GITHUB_*` dans `docker-compose.dev.yml`.
3. Recreate api pour charger la nouvelle config ; boot vérifié (aucune erreur Joi).

### Partie B — Backend
1. `npm install passport-github2` + `npm install -D @types/passport-github2` (dans `apps/api`),
   puis rebuild `--build --force-recreate -V` (nouveau paquet -> volume `node_modules` recréé).
2. `github.strategy.ts` (normalisation), provider dans `auth.module.ts`, deux routes dans
   `auth.controller.ts` + extraction du helper `completeOauthLogin`.
3. `tsc --noEmit` propre.

### Partie C — Frontend
- Bouton « Continuer avec GitHub » sur les deux pages + style `.btn-oauth-github`. Hot reload du conteneur
  web (voir §6 : watcher à relancer).

### Partie D — Tests + CI + journal
- `github.strategy.spec.ts` (4 cas). CI : `GITHUB_*` factices. Ce journal. PR.

---

## 5. Décisions

- **`passport-github2`** (et non `passport-github`) : maintenu, typé, compatible Passport 0.6+.
- **Scope `user:email`** : GitHub ne renvoie l'email que si on le demande explicitement (beaucoup
  d'utilisateurs le gardent privé). Sans email exploitable et sans lien existant, `loginWithOauth` refuse
  (401) — garde déjà en place. On prend le **premier email** renvoyé (généralement le principal).
- **Découpage nom/prénom depuis `displayName`** : GitHub ne fournit pas de nom structuré. On coupe sur le
  premier espace (prénom = 1er mot, nom = le reste) ; à défaut de `displayName`, on retombe sur `username`.
  Champs facultatifs (nullable en base), non bloquants.
- **Refactor `completeOauthLogin`** : plutôt que dupliquer le callback pour chaque fournisseur, la logique
  commune (profil -> `loginWithOauth` -> cookie -> redirection ; échec -> `/login?erreur=oauth`) est dans un
  seul helper privé. Google **et** GitHub l'appellent. Ajouter Facebook = juste 2 routes de plus.

---

## 6. Incidents & corrections

- **Watcher de fichiers du conteneur web (flaky sur Windows/Docker)** : après écriture des pages, le bouton
  GitHub ne s'affichait pas — Next.js n'avait pas recompilé. **Fix :** `docker compose … restart web`, puis
  hard refresh du navigateur. (Même classe de souci que le watcher api noté au journal 00.)
- **Callback URL défini par défaut dans le code** : `GITHUB_CALLBACK_URL` a un défaut
  (`https://localhost/api/auth/oauth/github/callback`) — il faut que ça corresponde **exactement** à l'URL
  enregistrée dans l'OAuth App GitHub, sinon GitHub renvoie une erreur et le callback repart en
  `/login?erreur=oauth`.

---

## 7. Vérification

- **Unitaires :** 44/44 (dont `GithubStrategy` : 4 cas — displayName -> prénom/nom, nom composé, repli
  username, email privé null). `docker compose … exec api npm run test`.
- **Manuel (bout en bout, vrai compte GitHub, via Nginx `https://localhost`) :** clic « Continuer avec
  GitHub » -> autorisation GitHub -> retour connecté. Contrôle SQL : compte
  **`omri.iyed@esprit.tn` APPRENANT / ACTIF**, lien `comptes_oauth` `provider = github`.
- **Lint :** propre (`npm run lint`, `--max-warnings 0`).
- **Pas d'e2e automatisé** sur le flux OAuth (redirection GitHub impossible en CI headless) — logique
  couverte par les unitaires, poignée de main validée manuellement. Écart assumé (cohérent avec Google).

---

## 8. CI

`ci.yml` — ajout des variables `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_CALLBACK_URL`
(factices) à côté des `GOOGLE_*`. Raison identique : `GithubStrategy` s'instancie au boot et la validation
Joi exige CLIENT_ID/SECRET (fail-fast) ; aucun vrai flux OAuth n'est déclenché en CI.

---

## 9. Suites

- **Facebook** : dernier fournisseur prévu — même recette (nouvelle `Strategy` + 2 routes ; `loginWithOauth`
  et `completeOauthLogin` déjà génériques).
- **Déliaison d'un fournisseur** et **durcissement OAuth (`state`/PKCE explicites)** : stories dédiées.
- **Story « Profil apprenant »** : indépendante du moyen de connexion.
