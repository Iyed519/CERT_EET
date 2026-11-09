# US-ATEL-06 — Corriger un livrable critère par critère

## En une phrase
Sur la page d'un atelier publié, le formateur affecté voit la liste des
livrables ; « Corriger » ouvre la correction (SOUMIS -> EN_CORRECTION, sous le
verrou de la ligne du livrable : l'apprenant ne peut plus agir), puis, critère
par critère, il choisit le niveau atteint, des points dans la plage de ce
niveau et un commentaire ; le score pondéré se recalcule en direct et le
serveur le confirme à chaque enregistrement. Les fichiers du livrable se
téléchargent depuis la page, relayés en flux par l'API et tracés.

## Découpage
- **A — Données.** Migration `1786700000000-AddCorrections` : `corrections`
  (une par livrable, UNIQUE, CASCADE avec le livrable, RESTRICT vers le
  correcteur, statut EN_COURS / TERMINEE, date d'ouverture) et
  `notes_criteres` (une par correction × critère, niveau FK RESTRICT,
  `points_pct` numeric(5,2) 0–100, commentaire 1–2 000). Déclencheur
  `trg_notes_criteres_coherence` (INSERT et UPDATE) : niveau du critère,
  points dans la plage, critère de la grille de l'atelier du livrable.
- **B — Autorisation.** `@FormateurDeLaFormation({ livrableId })` : le garde
  remonte livrable -> atelier -> module -> formation.
- **C — API.** Règles pures `correction.regles.ts`, `CorrectionsService`,
  `CorrectionsController` ; `StockageService.lire()` (lecture en flux).
- **D — Web.** Section « Livrables » (filtres) sur `/formateur/ateliers/[id]`,
  nouvelle page `/formateur/livrables/[id]` (livrable, téléchargements, score
  en direct, saisie par critère).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/ateliers/:atelierId/livrables?statut=` | formateur affecté, admin | 200 · 400 · 403 · 404 |
| GET | `/api/livrables/:livrableId` | formateur affecté, admin | 200 · 400 · 403 · 404 |
| PATCH | `/api/livrables/:livrableId/ouvrir` | formateur affecté, admin | 200 · 400 · 403 · 404 · 409 |
| PUT | `/api/livrables/:livrableId/correction/criteres/:critereId` | formateur affecté, admin | 200 · 400 · 403 · 404 · 409 |
| GET | `/api/livrables/:livrableId/fichiers/:ordre` | formateur affecté, admin | 200 (flux) · 400 · 403 · 404 · 503 |

## Flux
1. Liste : livrables de l'atelier, premier déposé en tête, avancement
   (critères notés / total) dès que la correction est ouverte.
2. Ouvrir : transaction ; `SELECT … FOR UPDATE` du livrable ; formation
   archivée -> 409 ; statut ≠ SOUMIS -> 409 ; UPDATE EN_CORRECTION + INSERT
   `corrections` (heure de PostgreSQL) ; audit `CORRECTION_OUVERTE`.
3. Noter : même verrou ; statut ≠ EN_CORRECTION -> 409 ; critère hors de la
   grille de l'atelier -> 404 ; niveau / points / commentaire -> 400 ;
   INSERT ou UPDATE de la note ; score recalculé dans la transaction ; audit
   `NOTE_CRITERE_ENREGISTREE` (avant / après, score).
4. Télécharger : fichier connu en base (404 sinon), lecture S3 en flux (503
   si le stockage fait défaut), audit `LIVRABLE_FICHIER_TELECHARGE`,
   `Content-Disposition` avec repli ASCII et nom UTF-8 (RFC 5987).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Données | `corrections` + `notes_criteres` ; cohérence multi-tables garantie par un déclencheur (un CHECK ne peut pas la porter). |
| D2 | Routes (DS-03 : `PATCH /corrections/:id/critere`) | Sous le livrable (`PUT …/correction/criteres/:critereId`) pour réutiliser le garde par ressource. **Écart à reporter dans DS-03.** |
| D3 | Unité des points | % des points du critère, comme les plages des niveaux ; score = Σ points × pondération / 100, sur 100 ; calcul en centièmes entiers. |
| D4 | Qui note | Tout formateur affecté (et l'administrateur), pas seulement celui qui a ouvert ; chaque écriture est tracée avec son auteur. |
| D5 | Téléchargement | Relais en flux par l'API, pas d'URL présignée : MinIO n'est pas joignable par le navigateur derrière nginx. |
| D6 | Refus | État (ouvrir ≠ SOUMIS, noter ≠ EN_CORRECTION, formation archivée) = 409 ; saisie incohérente = 400. |
| D7 | Score | Non stocké pendant la correction (recalculé des notes) ; US-ATEL-07 le fige à la finalisation. |
| D8 | Niveau dans l'API | Rang 1–4 (le niveau est identifié par son rang dans le critère) ; la base garde l'identifiant du niveau. |

## Fichiers
- `apps/api/src/database/migrations/1786700000000-AddCorrections.ts`
- `apps/api/src/database/entities/{correction,note-critere}.entity.ts`, `enums/statut-correction.enum.ts`
- `apps/api/src/modules/ateliers/livrables/{correction.regles,correction.dto,corrections.service,corrections.controller}.ts` (+ specs)
- `apps/api/src/modules/formations/autorisation/*` (type `livrable`), `formations.module.ts`
- `apps/api/src/stockage/stockage.service.ts` (`lire`) + spec ; `ateliers.module.ts`
- `apps/api/test/corrections.e2e-spec.ts` (marqueur `E2E-ATEL06`)
- `apps/web/src/components/LivrablesAtelier.tsx`, `apps/web/src/app/formateur/livrables/[id]/page.tsx`,
  `apps/web/src/app/formateur/ateliers/[id]/page.tsx`, `lib/api.ts`, `lib/format.ts`, `globals.css`

## Incidents
- Après un refus d'ouverture (409, livrable ouvert ailleurs), le message
  disparaissait : le rechargement de la liste effaçait l'erreur. Corrigé :
  recharger d'abord, afficher le refus ensuite (liste et page de correction).
- Dans l'espace de travail, Chromium sans paramètres régionaux UTF-8 nomme
  « download » un fichier dont le nom est accentué ; avec `LANG=C.UTF-8` le nom
  est conservé. Limite de l'environnement de test, pas du code.

## Vérification
- API : lint 0 avertissement, `tsc`, unitaires **50 suites / 715 tests**,
  migration run + revert + run, e2e **27 suites / 402 tests** (en série).
- Mutations (toutes tuées) : verrou de la ligne, formation archivée, état
  « ouvrable », état « notable », borne basse et borne haute de la plage,
  critère de la grille de l'atelier, garde `livrableId`, `@FormateurDeLaFormation`
  sur l'ouverture et sur le téléchargement, audit du téléchargement, et dans le
  déclencheur : niveau du critère, plage, atelier, déclenchement sur UPDATE
  (17 au total).
- Web : `tsc`, `next lint`. Navigateur (Playwright, 1280 et 390 px) : liste,
  refus 409 affiché, page de correction, saisie avec score en direct
  (25 puis 52 / 100), refus de points hors plage, téléchargement ; pas de
  défilement horizontal.
- Non vérifiable localement : MinIO lui-même (serveur S3 compatible en local) —
  couvert par la CI.

## CI
Voir la PR : CI verte exigée sur la PR puis sur `main`.

## Suites
- US-ATEL-07 : finaliser (tous les critères notés, commentaire général),
  statut NOTE, score figé, feedback immuable (déclencheur), email.
- Documents à aligner : DS-03 partie 2 (routes sous le livrable, niveau par
  rang, points en % du critère, téléchargement en flux).
