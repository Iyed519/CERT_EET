# US-ATEL-02 — Définir une grille de notation pondérée

## En une phrase
Sur la fiche d'un atelier en brouillon, le formateur affecté (ou un
administrateur) compose une grille de critères pondérés en % — chacun avec
ses 4 niveaux Insuffisant / Acceptable / Bon / Excellent et leurs plages de
points — dont le total reste ≤ 100 % à chaque écriture et doit valoir
exactement 100 % pour être validée ; la grille s'enregistre comme modèle
réutilisable et un modèle se copie dans un autre atelier.

## Découpage
- **A — API.** Migration `1786500000000-AddGrillesNotation` (tables
  `grilles`, `criteres`, `niveaux_performance`, CHECK sur chaque borne) ;
  entités `Grille`, `Critere`, `NiveauPerformance` ; règles pures
  (`grille/grille.regles.ts`) ; DTO ; `GrillesService` + `GrillesController`
  dans `AteliersModule` ; `AteliersService.verrouiller` rendu public ;
  Swagger ; audit ; tests unitaires et e2e.
- **B — UI.** Éditeur de grille sur `/formateur/ateliers/[id]` (remplace le
  « À définir ») : barre de total, critères et niveaux, modale de critère,
  modèles (enregistrer, partir d'un modèle, supprimer).
- **C — Journal + PR.**

Une migration, aucune dépendance ajoutée, aucune infrastructure nouvelle.

## Endpoints
Routes de l'atelier : FORMATEUR affecté à la formation, ou ADMINISTRATEUR
(`@FormateurDeLaFormation({ atelierId })`). Routes de modèles : FORMATEUR ou
ADMINISTRATEUR, propriétaire vérifié par le service.

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/ateliers/:atelierId/grille` | 200 grille (`id: null` si jamais écrite ; n'écrit rien) ; 403 ; 404 |
| POST | `/ateliers/:atelierId/grille/criteres` | 201 grille ; 400 saisie, plages, > 20 critères, total > 100 % ; 403 ; 404 ; 409 |
| PATCH | `/ateliers/:atelierId/grille/criteres/:critereId` | 200 grille ; 400 corps vide, champ vidé, plages, total > 100 % ; 404 critère hors grille ; 409 |
| DELETE | `/ateliers/:atelierId/grille/criteres/:critereId` | 200 grille (rangs resserrés) ; 404 ; 409 |
| PUT | `/ateliers/:atelierId/grille/criteres/ordre` | 200 grille ; 400 pas une permutation exacte ; 409 |
| POST | `/ateliers/:atelierId/grille/valider` | 200 grille validée ; 400 « Total des pondérations = X % (doit être 100 %). » ; 409 |
| POST | `/ateliers/:atelierId/grille/modele` | 201 modèle ; 400 nom, grille ≠ 100 % ; 409 nom déjà pris |
| POST | `/ateliers/:atelierId/grille/copier` | 200 grille ; 404 modèle inconnu ou d'un autre ; 409 |
| GET | `/grilles/modeles` | 200 mes modèles (administrateur : tous) ; 403 apprenant |
| DELETE | `/grilles/modeles/:modeleId` | 204 ; 404 inconnu ou d'un autre |

409 = atelier hors brouillon ou formation archivée. Audit : `GRILLE_CRITERE_AJOUTE`,
`GRILLE_CRITERE_MODIFIE` (avant / après), `GRILLE_CRITERE_SUPPRIME`,
`GRILLE_CRITERES_REORDONNES`, `GRILLE_VALIDEE` (cible : l'atelier) ;
`GRILLE_MODELE_ENREGISTRE`, `GRILLE_MODELE_SUPPRIME` (cible : le modèle) ;
`GRILLE_MODELE_COPIE` (cible : l'atelier, avec `modeleId`).

## Flux
1. Écriture sur la grille d'un atelier : transaction ; ligne de l'atelier
   verrouillée (`FOR UPDATE`, `AteliersService.verrouiller` : 404, 409
   formation archivée) ; 409 hors BROUILLON ; grille lue ou créée vide ;
   critères + niveaux lus en une requête ; règle pure ; écriture ; toute
   modification réelle remet `validee = false` ; audit après le COMMIT ;
   grille à jour renvoyée.
2. Ajout : intitulé rogné (≥ 3), niveaux normalisés (défaut 0–25 / 25–50 /
   50–75 / 75–100), ≤ 20 critères, Σ + nouvelle ≤ 100 sinon 400 « Total des
   pondérations : X % (au-delà de 100 %). Réduisez une pondération. ».
3. Validation : ≥ 1 critère et Σ == 100, sinon 400 (message de DS-13) ;
   déjà validée → 200 sans écriture ni trace.
4. Modèle : copie profonde de la grille (100 % exigé) en une grille
   `est_modele` sans atelier, au nom unique par formateur (casse ignorée :
   pré-contrôle + index unique pour la course). Copie : la grille de
   l'atelier est vidée puis reçoit une copie profonde, non validée.

## Décisions
- **D1 Modèle de données** (appliqué). `grilles` : `atelier_id` UNIQUE en
  **CASCADE** (la grille d'un brouillon supprimé part avec lui ; le modèle,
  lui, n'a pas d'atelier et survit), `formateur_id` SET NULL ; CHECK
  `CHK_grilles_nature` : un modèle n'a ni atelier ni validation et a un nom ;
  une grille d'atelier n'a pas de nom. `criteres.ordre` unique par grille en
  contrainte **DIFFÉRÉE** (permutation dans une seule transaction).
  `niveaux_performance` : libellé lié au rang par CHECK. Les règles sur
  plusieurs lignes (Σ, contiguïté) sont dans le service, sous verrou.
- **D2 Routes sous l'atelier** (écart assumé avec DS-13
  `/grilles/:grilleId/...` et `PATCH /grilles/:id { estModele }`) : une
  grille par atelier, l'URL suffit et le garde existant s'applique. Les
  modèles sont sous `/grilles/modeles`. Affinage : **GET n'écrit jamais**
  (`id: null` tant que vide) ; la grille naît au premier critère.
- **D3 Niveaux** : exactement 4, libellés de l'UC4 et du Backlog
  (Insuffisant / Acceptable / Bon / Excellent — DS-13 dit « Correct / Bien » :
  écart de libellé, l'UC4 fait foi). Plages entières, contiguës, de 0 à 100 %.
  L'UI ne fait saisir que les 3 bornes intérieures : la contiguïté est
  garantie par construction, le serveur revérifie.
- **D4 Pondérations** : entiers 1–100 ; 400 au-delà de 100 % (ajout ou
  modification), 400 à la validation si ≠ 100 % ; 20 critères au plus.
- **D5 Concurrence** : le verrou est pris sur la **ligne de l'atelier**,
  parent unique de la grille — il sérialise la somme, la création de la
  grille au premier critère et, demain, la publication (US-ATEL-03).
- **D6 État** : écriture seulement en BROUILLON (409). Toute modification
  réelle retire la validation ; **le réordonnancement ne la retire pas**
  (l'ordre n'entre pas dans la note — affinage de D6). Copier un modèle
  remplace la grille et donne une grille non validée.
- **D7 Modèles** : copie indépendante, propriétaire = acteur ; nom unique par
  formateur (409) ; **seule une grille à 100 % devient un modèle** (on ne
  réutilise pas une grille à moitié faite) ; enregistrement permis quel que
  soit le statut de l'atelier (réutiliser la grille d'un atelier publié).
  Le modèle d'un autre formateur répond **404** (on ne révèle pas son
  existence) ; l'administrateur voit, copie et supprime tous les modèles.
- **D8 Audit** : liste du handoff + `GRILLE_CRITERES_REORDONNES`.
- **D9** : aucune visibilité apprenant (US-ATEL-03).
- **D10 UI** : critères en cartes (4 niveaux en grille, 2 colonnes sous
  760 px) plutôt qu'en tableau — lisible à 390 px sans défilement
  horizontal ; « + Ajouter » désactivé à 100 % ; « Enregistrer comme modèle »
  actif à 100 % ; total en temps réel aussi dans la modale (bouton bloqué
  au-delà de 100 %). Grille en lecture seule hors brouillon.

## Fichiers
- API : `database/migrations/1786500000000-AddGrillesNotation.ts` ;
  `database/entities/{grille,critere,niveau-performance}.entity.ts` ;
  `modules/ateliers/grille/{grille.regles,grilles.service,grilles.controller}.ts`
  + `dto/{critere,grille-actions}.dto.ts` + 2 specs ;
  `modules/ateliers/{ateliers.module,ateliers.service,ateliers.controller}.ts`
  (enregistrement, `verrouiller` public, commentaires) ; `atelier.entity.ts`
  (commentaire) ; `test/grilles.e2e-spec.ts`.
- Web : `components/{GrilleNotation,CritereModal,ModeleGrilleModals}.tsx` ;
  `app/formateur/ateliers/[id]/page.tsx` ; `lib/api.ts` ; `globals.css`.

## Incidents
- **Test de CHECK mal choisi** : la plage 30–50 d'un seul niveau est valide
  pour la base (la contiguïté est une règle du service) ; remplacé par
  60–50 (min > max), refusé par `CHK_niveaux_performance_plage`.
- **Bordures des niveaux dans la modale** : le raccourci `border-left`
  écrasait la couleur par niveau (bordures noires) ; vu sur la capture,
  corrigé en `border-left-width` / `border-left-style`.
- **Mutant non compilable** : retirer `aChange` le rendait inutilisé (tsc
  refuse) ; remplacé par un mutant qui compile.
- Les 401 en console après un rechargement complet de page sont le
  rafraîchissement silencieux habituel du jeton (inchangé).

## Vérification
- **Lint** : propre. **tsc** : propre. **Migration** : up, down (`typeorm
  migration:revert`), up ; aucune dérive de colonnes (seuls les CHECK / FK
  non déclarés dans les entités, comme pour `ateliers`).
- **Tests unitaires** : 42 suites, 609 tests (+2 suites, +69) — règles
  (plafond 100 / 101, validation 99 / 100 / 101 / vide, 10 cas de plages,
  409 statut, invalidation, permutation, nom, modèle complet, migration
  alignée) ; service (verrou, rang, création au 1er critère, invalidation
  tracée, rien écrit si refus, PATCH sans effet, niveaux remplacés,
  suppression + rangs, ordre sans invalidation, validation idempotente,
  modèles : copie, 400 incomplet, 409 pré-contrôle et course, 404 autre
  formateur, administrateur).
- **e2e** : 24 suites, 344 tests, dont `grilles` (37, marqueur
  `E2E-GRILLE`) — GET sans écriture ; 403 / 404 / 400 ; ajouts avec plages
  par défaut et choisies ; 101 % → 400 message exact ; 9 saisies invalides ;
  validation 70 % / vide → 400, 100 % → 200 tracée une fois ; invalidation
  par PATCH, PATCH sans effet, ordre conservant la validation, suppression ;
  modèles (incomplet 400, copie, nom en double 409 casse ignorée, listes par
  rôle, copie profonde indépendante, 404 modèle d'autrui, survie à la
  suppression de l'atelier, suppression) ; 409 sur 6 écritures hors
  brouillon et en formation archivée ; CHECK en base ; **concurrence
  forcée** (verrou de table sur `criteres`) : 2 × 60 % → un 201, un 400,
  total 60 %.
- **Mutations** (toutes tuées) : plafond `> 100` → `> 101` (3 unit, 25 e2e) ;
  plafond supprimé (3 / 27) ; validation `!== 100` → `< 100` (1 unit) et
  → `> 100` (3 / 2) ; invalidation neutralisée (2 / 9) ; `FOR UPDATE` retiré
  (concurrence e2e en échec).
- **Front** : `tsc --noEmit`, `next lint` propres ; Chromium 1280 px et
  390 px, captures regardées : grille vide, modale d'ajout, total 116 %
  (bouton bloqué), barre verte à 100 %, validation, invalidation à 95 %
  (orange), réordonnancement, modèle enregistré, nom en double (409 affiché),
  confirmation de suppression, liste des modèles, remplacement, copie à
  valider, atelier publié en lecture seule ; aucun débordement horizontal.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
```

## CI
Pipeline inchangé (scope `apps/api`) : la migration passe par
`migration:run`, la suite `grilles` s'ajoute. Front hors CI.

## Suites
- US-ATEL-03 — publier : exiger `grilles.validee = true` sous le même verrou
  de l'atelier ; afficher la grille aux apprenants inscrits.
- US-ATEL-06 — corriger : un niveau puis des points dans sa plage, par
  critère ; note pondérée = Σ (points % × pondération).
- Documents à aligner : DS-13 partie 2 (routes sous l'atelier, libellés des
  niveaux, modèle = copie, 404 modèle d'autrui) ; Backlog v1.8.
