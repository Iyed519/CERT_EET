# US-ATEL-01 — Créer un atelier

## En une phrase
Un formateur affecté à la formation (ou un administrateur) crée, dans un
module, un atelier pratique — titre, énoncé, compétences visées, date limite,
types de livrables, taille et nombre de fichiers, tolérance de retard — qui
naît en BROUILLON ; il le consulte, le modifie et le supprime tant qu'il reste
en brouillon, et une date limite déjà passée (horloge de PostgreSQL) est
refusée en 400 sans rien enregistrer.

## Découpage
- **A — API.** Enum `StatutAtelier`, entité `Atelier`, migration
  `1786300000000-AddAteliers` (table `ateliers`, CHECK sur les bornes) ;
  règles pures (`atelier.regles.ts`) ; `AteliersService`,
  `AteliersController`, `AteliersModule` ; garde `@FormateurDeLaFormation`
  étendu à `{ atelierId }` ; suppression d'un module refusée s'il porte un
  atelier ; Swagger ; audit ; tests unitaires et e2e.
- **B — UI.** Page formateur d'une formation (ateliers sous chaque module,
  bouton « Nouvel atelier ») ; modale de création / modification ; fiche
  `/formateur/ateliers/[id]`.
- **C — Journal + PR.**

Une migration, aucune dépendance ajoutée. Premier élément du module F2
(ateliers) : la grille (US-ATEL-02), la publication (US-ATEL-03), le dépôt
(US-ATEL-04) et la correction s'y accrochent.

## Endpoints
Rôles : FORMATEUR affecté à la formation du module, ou ADMINISTRATEUR.

| Méthode | Route | Réponse |
|---|---|---|
| POST | `/modules/:moduleId/ateliers` | 201 fiche ; 400 saisie (bornes, type, date passée, champ inconnu) ; 403 ; 404 module ; 409 formation archivée |
| GET | `/modules/:moduleId/ateliers` | 200 liste (sans énoncé) ; 403 ; 404 |
| GET | `/ateliers/:atelierId` | 200 fiche (avec `formationId`, `moduleTitre`) ; 403 ; 404 |
| PATCH | `/ateliers/:atelierId` | 200 fiche ; 400 corps vide, champ vidé, date passée ; 403 ; 404 ; 409 hors brouillon ou formation archivée |
| DELETE | `/ateliers/:atelierId` | 204 ; 403 ; 404 ; 409 hors brouillon ou formation archivée |

Corps (création) : `titre` (3–200), `enonce` (10–20 000), `competencesVisees`
(facultatif, ≤ 2 000), `dateLimite` (ISO 8601), `typesLivrables` (au moins un
parmi `pdf, zip, docx, pptx, xlsx, txt, md, png, jpg`), `tailleMaxMo` (1–100,
défaut 20), `nbMaxFichiers` (1–10, défaut 1), `toleranceRetardHeures` (0–168,
défaut 0). Audit : `ATELIER_CREE`, `ATELIER_MODIFIE` (avant / après),
`ATELIER_SUPPRIME` ; refus d'affectation : `ACCES_RESSOURCE_REFUSE`
(`ressource: 'atelier'` ou `'module'`).

## Flux
1. Le garde remonte de la ressource à la formation (module, ou atelier ->
   module) : administrateur → passe ; formateur non affecté → audit puis 403 ;
   apprenant → 403 (RolesGuard).
2. Création : module lu (404), formation vérifiée (409 archivée), saisie
   nettoyée (textes rognés, types dédoublonnés et rangés dans l'ordre de la
   liste), `SELECT now()` puis règle « date dans le futur » ; INSERT au
   statut BROUILLON (imposé), audit, fiche renvoyée.
3. Modification / suppression : transaction, ligne verrouillée
   (`FOR UPDATE`), formation vérifiée, statut BROUILLON exigé (409), puis
   corps (400) et date (400, horloge de PostgreSQL) ; seules les valeurs qui
   changent sont écrites et tracées ; audit après le COMMIT.
4. Suppression d'un module (admin) : 409 s'il porte un QCM **ou un atelier**
   (la FK RESTRICT l'interdirait de toute façon, avec une erreur 500).

## Décisions
Tableau D du handoff appliqué tel quel (recommandations D1–D10).
- **D1 — `POST /modules/:moduleId/ateliers`** (écart avec DS-13 :
  `POST /ateliers` avec `moduleId` et `formationId` dans le corps). La
  formation se déduit du module ; une `formationId` fournie par le client
  pourrait la contredire — elle est même refusée (400, champ inconnu).
- **D2 — Brouillon géré en entier** (liste, fiche, modification,
  suppression), comme pour les QCM ; 409 hors brouillon.
- **D3 — Champs et bornes** vérifiés deux fois : DTO (messages français) et
  CHECK en base (même liste d'extensions).
- **D4 — Date limite passée → 400** (saisie incohérente, pas un état),
  comparée à `now()` de PostgreSQL, à la création comme au PATCH. Une date
  égale à maintenant est refusée.
- **D5 — `StatutAtelier`** = BROUILLON, PUBLIE, ARCHIVE (réservé) ; seul
  BROUILLON est atteignable dans cette story.
- **D6 — Autorisation** : garde existant étendu à `atelierId`
  (`AutorisationRessourceService.formationDe('atelier', …)`).
- **D7 — Audit** `ATELIER_CREE` / `ATELIER_MODIFIE` / `ATELIER_SUPPRIME`.
- **D8 — Aucune visibilité apprenant** (arrive avec US-ATEL-03).
- **D9 / D10** — UI et tests comme prévu.

Désaccords entre documents relevés à l'étape 0 (UC3 Formateur v2.0 contre
Backlog v1.7), recommandation appliquée :
- **Livrables « liens externes » et « texte libre »** (UC3, UC4 Apprenant) :
  non modélisés ici ; le Backlog (US-ATEL-01 et 04) ne parle que de fichiers
  (types, taille). À décider avec US-ATEL-04.
- **« Ressources fournies »** (UC3) : déjà couvertes par les ressources du
  module (révision v1.5) ; pas de pièces jointes sur l'atelier.
- **« Compétences visées » en tags du référentiel** (UC3) : aucun référentiel
  de compétences n'existe ; texte libre (DS-13 l'appelle simplement
  `competencesVisees`).
- **« Date d'ouverture »** (UC3, étape 4) : pas dans le Backlog ; à trancher
  avec la publication (US-ATEL-03).
- **Ajout — Verrou `FOR UPDATE`** sur PATCH / DELETE dès maintenant : la
  publication (US-ATEL-03) ne pourra pas se glisser entre la vérification du
  statut et l'écriture.
- **Ajout — Message d'erreur ramené à l'écran** dans la modale (formulaire
  long : l'erreur, en haut, sortait de la zone visible).

## Fichiers
- `apps/api/src/database/` : `enums/statut-atelier.enum.ts`,
  `entities/atelier.entity.ts`, `migrations/1786300000000-AddAteliers.ts`
  (nouveaux)
- `apps/api/src/modules/ateliers/` (nouveau) : `atelier.regles.ts` (+ spec),
  `ateliers.service.ts` (+ spec), `ateliers.controller.ts`,
  `ateliers.module.ts`, `dto/create-atelier.dto.ts`,
  `dto/update-atelier.dto.ts`
- `apps/api/src/modules/formations/` : `autorisation/` (source `atelierId`,
  type `'atelier'`, 404 « Atelier introuvable. » ; spec du garde),
  `formation-modules.service.ts` (+ spec : module avec atelier → 409),
  `formations.module.ts` (`Atelier` en lecture)
- `apps/api/src/app.module.ts` (`AteliersModule`)
- `apps/api/test/ateliers.e2e-spec.ts` (nouveau, marqueur `E2E-ATEL01`)
- `apps/web/src/` : `lib/api.ts` (types, `EXTENSIONS_LIVRABLE`, 5 appels),
  `lib/format.ts` (`LIBELLES_STATUT_ATELIER`),
  `components/AtelierModal.tsx` (nouveau),
  `app/formateur/formations/[id]/page.tsx` (ateliers par module),
  `app/formateur/ateliers/[id]/page.tsx` (nouveau), `app/globals.css`

## Incidents
- **Accès GitHub rétabli** (§0 du handoff) : tout le git (branche, commit,
  push, PR, CI, fusion) est fait dans l'espace de travail de Claude.
- **Cas de test évalué trop tôt** : dans `it.each`, `{ formationId }` était lu
  avant le `beforeAll` (donc `undefined`) ; la requête passait (201) et
  faussait la liste. Remplacé par un UUID constant.
- **Prettier sur un dossier entier** : il a reformaté des fichiers non
  modifiés de `formations/` ; remis à l'identique, seuls les fichiers de la
  story gardent le formatage.

## Vérification
- **Lint** : propre. **Tests unitaires** : 40 suites, 532 tests (+2 suites,
  +30) — règles (date future, borne « égale à maintenant », date invalide,
  types dédoublonnés / hors liste / vide, statut) ; service (création en
  brouillon avec valeurs par défaut et audit, date passée sans écriture via
  `SELECT now()`, titre rogné trop court, 404, 409 archivée, vue en liste
  blanche, PATCH : verrou, seul le changement écrit et tracé, rien si rien ne
  change, corps vide, date passée, champ vidé, compétences effacées, 409 hors
  brouillon ; suppression et 409) ; garde (atelier inconnu → 404) ; module
  portant un atelier → 409.
- **e2e** : 23 suites, 305 tests, dont `ateliers` (24) — 201 + audit ;
  date passée → 400, rien en base ; 9 saisies invalides → 400, rien en base
  (dont `formationId` fourni) ; 403 + audit (formateur non affecté), 403
  apprenant ; administrateur ; 404 / 400 identifiant ; 409 formation
  archivée ; liste triée sans énoncé ; fiche ; PATCH + audit avant/après ;
  PATCH date passée / vide / titre null → 400, date intacte ; 409 module
  porteur ; 409 PATCH / DELETE hors brouillon (statut posé en SQL) ; 204 +
  audit puis 404.
- **Mutations** : `<=` remplacé par `<` dans la règle de date → 1 échec
  (borne) ; règle neutralisée → 4 échecs unitaires et 3 e2e.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; dans Chromium,
  1280 px et 390 px : création avec date passée (message du serveur, ramené
  à l'écran), puis valide → fiche ; modification (taille 50 Mo) ; liste sous
  le module ; suppression d'un brouillon ; atelier publié (SQL) → boutons
  désactivés ; aucun débordement horizontal.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart web
# attendre ~30 s et ouvrir une page avant tsc
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : la migration passe par
`migration:run`, la nouvelle suite e2e s'ajoute aux autres. Front hors CI.

## Suites
- Documents à aligner : Backlog v1.8 et DS-13 partie 1 (route sous le module,
  bornes, 400 date passée, gestion du brouillon) ; UC3 Formateur (liens /
  texte libre, ressources, tags, date d'ouverture : voir Décisions).
- Sprint 3 (périmètre A confirmé, B en bonus) : US-ATEL-02 — grille de
  notation pondérée — ensuite.
