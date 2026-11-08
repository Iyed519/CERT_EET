# US-ATEL-03 — Publier l'atelier

## En une phrase
Le formateur affecté publie un atelier en brouillon dont la grille est validée
et la date limite encore future : l'atelier passe à PUBLIE, se fige avec sa
grille, apparaît dans « Mon espace » des apprenants inscrits et s'ouvre sur une
fiche qui montre l'énoncé, les modalités de dépôt et la grille en lecture.

## Découpage
- **A — API formateur.** `PATCH /ateliers/:atelierId/publier` (DS-13 partie 3),
  règle pure `verifierPublicationAtelier` dans `atelier.regles.ts`,
  `AteliersService.publier` sous le verrou de la ligne de l'atelier, audit
  `ATELIER_PUBLIE`.
- **B — API apprenant.** « Mon espace » liste les ateliers PUBLIÉS par module
  (sans énoncé, avec l'état du dépôt) ; nouvelle route
  `GET /mes-ateliers/:atelierId` (fiche + grille en lecture).
- **C — Web.** Bouton « Publier l'atelier » et confirmation sur la fiche
  formateur ; ateliers dans « Mon espace » ; nouvelle page
  `/mes-ateliers/[atelierId]` avec le composant `GrilleLecture`.
- Pas de migration, pas d'infrastructure.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| PATCH | `/api/ateliers/:atelierId/publier` | FORMATEUR affecté, ADMINISTRATEUR | 200 · 400 date passée / UUID · 401 · 403 · 404 · 409 grille non validée, déjà publié, archivé, formation archivée |
| GET | `/api/formations/:formationId/mon-espace` | APPRENANT | inchangé + `modules[].ateliers[]` |
| GET | `/api/mes-ateliers/:atelierId` | APPRENANT | 200 · 400 · 401 · 403 non inscrit / suspendu (tracé) · 404 inconnu ou brouillon |

## Flux
1. Le formateur valide la grille (US-ATEL-02) ; la fiche reçoit l'état de la
   grille par `onChange` et active « Publier l'atelier ».
2. Confirmation → `PATCH …/publier`. Dans UNE transaction : verrou FOR UPDATE de
   l'atelier (`AteliersService.verrouiller` : 404, 409 formation archivée),
   lecture de la grille, `now()` de PostgreSQL, `verifierPublicationAtelier`,
   `UPDATE statut = PUBLIE`. Audit après le COMMIT.
3. La fiche affiche « Atelier publié ✅ », désactive Modifier / Supprimer et
   remonte l'éditeur de grille (clé = statut) en lecture seule.
4. L'apprenant inscrit voit l'atelier sous son module (« Dépôt ouvert »,
   « Tolérance de retard » ou « Dépôt clos ») et ouvre sa fiche.

## Décisions
- **D1 — Grille absente ou non validée : 409** (DS-13 dit 400). C'est l'état
  qui bloque, comme pour la publication d'un QCM (US-QCM-04).
- **D2 — Date limite passée à la publication : 400**, comme à la création
  (journal 36) : c'est la date saisie qu'il faut repousser. Message dédié.
- **D3 — Pas de date d'ouverture.** UC3 parle d'une visibilité « dès la date
  d'ouverture », ni le Backlog ni DS-13 n'en prévoient : publier = ouvrir.
- **D4 — Pas de dépublication** (aucun document ne la prévoit) ; atelier et
  grille sont figés par les contrôles existants (409 hors brouillon).
- **D5 — Côté apprenant : `GET /mes-ateliers/:atelierId`** (comme
  `/mes-inscriptions`), contrôleur à part car le `@Roles` de classe
  d'`AteliersController` est réservé aux formateurs. Brouillon et inconnu
  donnent le même 404 (un brouillon n'est jamais révélé) ; l'accès suit
  l'inscription comme « Mon espace » (EN_COURS ou TERMINEE), via
  `EspaceFormationService.exigerAccesContenu`, extrait de `monEspace` et
  exporté par `InscriptionsModule`.
- **D6 — État du dépôt** (`OUVERT` / `EN_RETARD` / `CLOS`) calculé par la règle
  pure `etatDepot` à l'heure de PostgreSQL ; purement informatif : le dépôt
  (US-ATEL-04) revérifiera.
- **D7 —** Les ateliers ne comptent pas encore dans l'avancement du module :
  ce sera la note d'un livrable (US-ATEL-07).
- Réponses en liste blanche : ni `formateurId`, ni statut interne, ni
  horodatages ; l'énoncé n'est jamais dans « Mon espace ».

## Fichiers
- `apps/api/src/modules/ateliers/` : `atelier.regles.ts` (publication,
  `etatDepot`), `ateliers.service.ts` (`publier`, `maintenant` public),
  `ateliers.controller.ts`, `ateliers-apprenant.{service,controller}.ts`,
  `ateliers.module.ts`, `grille/grilles.service.ts` (`criteresDeLAtelier`).
- `apps/api/src/modules/inscriptions/` : `espace-formation.service.ts`
  (ateliers, `exigerAccesContenu`), `inscriptions.module.ts`.
- Tests : `atelier-publication.regles.spec.ts`,
  `ateliers-apprenant.service.spec.ts`, `ateliers.service.spec.ts`,
  `espace-formation.service.spec.ts`, `test/ateliers-publication.e2e-spec.ts`
  (marqueur `E2E-ATELPUB`).
- Web : `app/formateur/ateliers/[id]/page.tsx`,
  `app/mes-inscriptions/[formationId]/page.tsx`,
  `app/mes-ateliers/[atelierId]/page.tsx`, `components/GrilleNotation.tsx`
  (`onChange`), `components/GrilleLecture.tsx`, `lib/api.ts`, `lib/format.ts`,
  `app/globals.css`.

## Incidents
- Premier verrou de test : `LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` ne bloque
  pas un `SELECT … FOR UPDATE` (ROW SHARE). Le test de concurrence prend
  `EXCLUSIVE MODE`, qui le bloque tout en laissant passer les lectures simples.
- Trois mutants ne compilaient pas (import devenu inutilisé, comparaison sans
  recouvrement de types) : réécrits pour compiler, puis tués.

## Vérification
- API : lint propre, `tsc` propre, unitaires **44 suites / 629 tests**, e2e
  `--runInBand` **25 suites / 357 tests** (+1 suite, +13 tests). Pas de
  migration (down/up sans objet).
- Web : `tsc --noEmit` et `next lint` propres.
- Navigateur (Playwright Chromium, 1280 px et 390 px, captures relues, aucun
  défilement horizontal) : bouton désactivé tant que la grille n'est pas
  validée ; validation → bouton actif ; confirmation → « Atelier publié ✅ »,
  boutons et grille figés ; erreur serveur 400 (date passée) affichée dans la
  modale ; « Mon espace » apprenant : seul l'atelier publié, « Dépôt ouvert » ;
  fiche apprenant complète avec grille ; brouillon → « Atelier introuvable. ».
- Mutations (toutes tuées par l'e2e) : publication sans verrou (test de
  concurrence), contrôle de la grille, contrôle de la date, contrôle « déjà
  publié », filtre PUBLIE de la fiche apprenant, contrôle d'inscription,
  filtre PUBLIE de « Mon espace ».

## CI
Verte avant la fusion (job API : lint, unitaires + couverture, migrations,
e2e).

## Suites
- US-ATEL-04 : dépôt d'un livrable (MinIO, SHA-256) sur la fiche
  `/mes-ateliers/[atelierId]`, avec l'état du dépôt revérifié par le serveur.
- Documents à aligner : DS-13 P3 (409 pour la grille, route PATCH conservée),
  UC3 (pas de date d'ouverture).
