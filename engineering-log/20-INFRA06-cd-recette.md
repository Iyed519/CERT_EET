# US-INFRA-06 — Pipeline CD (déploiement recette)

## En une phrase
À chaque CI verte sur `main`, un pipeline CD construit les images Docker de
production (api + web) et les publie sur GHCR ; le déploiement en recette reste
manuel et documenté, tant qu'aucune VM de staging n'existe (souveraineté
Tunisie prévue plus tard).

## Découpage
- **A — Décision de cible.** Pas de serveur recette disponible → périmètre =
  **build + push** uniquement, déploiement manuel documenté. Registry = **GHCR**
  (gratuit, intégré au repo, auth via `GITHUB_TOKEN`, aucun secret externe).
- **B — Workflow CD.** `.github/workflows/cd.yml` : build + push des 2 images
  `production`, déclenché **après** la CI verte sur `main`.
- **C — Cohérence recette.** L'override `docker-compose.recette.yml` référence
  les images GHCR (`image:`) pour un `pull && up -d` direct.
- **D — Doc + journal.** `docs/DEPLOIEMENT_RECETTE.md` ; journal 20.

## Config (cd.yml)
- **Déclencheur `workflow_run`** sur le workflow `CI` (`types:[completed]`,
  `branches:[main]`) + condition `conclusion == 'success'` → le CD ne tourne
  **que si la CI est verte** (plutôt qu'un `on: push` parallèle sans garantie).
  `workflow_dispatch` ajouté pour un lancement manuel.
- **Checkout du commit validé** : `github.event.workflow_run.head_sha` → on
  publie exactement le commit testé par la CI.
- **Auth GHCR** : `docker/login-action` avec `GITHUB_TOKEN` et
  `permissions: packages: write`. Aucun secret à créer.
- **Matrice api/web** (`fail-fast: false`) : contextes `./apps/api` et
  `./apps/web`, cible `production`.
- **Tags** : `latest` + **SHA court** (traçabilité + rollback). Cache `type=gha`.
- Actions : `metadata-action` (nom d'image mis en minuscules, requis par GHCR),
  `setup-buildx`, `build-push-action`.

## Flux
1. Push sur `main` → la **CI** s'exécute (lint + tests + migrations + e2e, scope api).
2. CI verte → `workflow_run` déclenche le **CD**.
3. Le CD checkout le `head_sha`, se connecte à GHCR, build + push
   `cert_eet-api` et `cert_eet-web` (`latest` + SHA court).
4. **Déploiement (manuel)** sur l'hôte recette :
   `docker compose -f docker-compose.yml -f docker-compose.recette.yml pull && up -d`
   (voir `docs/DEPLOIEMENT_RECETTE.md`).

## Décisions
- **Build + push seulement** (pas de déploiement auto) : aucune VM recette pour
  l'instant → périmètre sûr, sans secret SSH ni infra externe. Le déploiement
  réel restera souverain (hôte Tunisie) et manuel, documenté.
- **GHCR plutôt que Docker Hub** : gratuit, lié au repo, auth `GITHUB_TOKEN`
  native → zéro secret à gérer.
- **`workflow_run` plutôt que `on: push`** : garantit « après CI verte » sans
  dupliquer les étapes de test dans le CD.
- **`image:` dans l'override recette** : aligne la sortie du CD et le
  déploiement → `pull` tire les images publiées, `build` reste un secours local.
- **`fail-fast: false`** : si le build web échoue (lint `next build`), l'image
  api est quand même publiée (les deux legs sont indépendants).

## Fichiers
- `.github/workflows/cd.yml` (nouveau)
- `docker-compose.recette.yml` (ajout `image:` GHCR pour api et web)
- `docs/DEPLOIEMENT_RECETTE.md` (nouveau — runbook manuel)

## Incidents
- **Risque build web levé.** La CI ne teste pas `apps/web` et `next build` lance
  ESLint par défaut → crainte d'un build d'image web cassé. Test local des deux
  images `production` effectué avant push : `docker build --target production`
  réussit pour api ET web (`next build` OK, aucune erreur de lint). Risque non
  matérialisé ; plan B (`eslint: { ignoreDuringBuilds: true }`) non nécessaire.

## Vérification
- **YAML valide** : `cd.yml` et `docker-compose.recette.yml` parsés sans erreur.
- **Statique** : déclencheur `workflow_run` conditionné à `conclusion=='success'`
  (+ `workflow_dispatch`) ; `permissions: packages: write` ; matrice api/web
  cible `production` ; tags `latest` + SHA court.
- **Test local des images production (avant push)** :
  `docker build --target production` → **api** et **web** construites avec
  succès (web : `npm run build`/`next build` OK en ~54s, sans erreur de lint).
  C'est l'étape que le CD exécute ; seul le `push` GHCR (auth `GITHUB_TOKEN`)
  n'est pas testable en local.
- **À confirmer au premier run post-merge** : exécution du CD après CI verte,
  présence des 2 paquets sur GHCR (`cert_eet-api`, `cert_eet-web`) avec les bons
  tags ; `docker compose ... pull` fonctionnel sur un hôte.

## CI
Pipeline CI inchangé (scope `apps/api`). Le CD construit **en plus** l'image
`web` (hors CI). Le CD ne modifie pas la CI ; il s'y enchaîne via `workflow_run`.

## Suites
- Étape SSH de déploiement automatique quand la VM recette existera.
- Déclenchement sur tags `v*` pour des releases versionnées.
- Passage de la CI (lint + tests) sur `apps/web`.
- Scan de vulnérabilités des images (ex. Trivy) avant push.
