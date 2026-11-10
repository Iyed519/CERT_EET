# US-QCM-11 — Historique complet et immuable des tentatives

## En une phrase
L'apprenant retrouve dans « Mes tentatives » chacune de ses tentatives (rang,
dates, durée, statut, score une fois notée) et, pour une tentative terminée,
les questions vues et ses choix — sans le corrigé ; le formateur affecté voit
toutes les tentatives de son QCM, avec l'apprenant et le corrigé complet.
Rien n'y est modifiable.

## Point de départ
Backlog E3, US-QCM-11 (Should, 3 pts) : « historique complet et immuable des
tentatives afin de garder une trace certifiante (date, score, durée,
détail) ». Sprint 4 § 3.2 : « lecture seule ; apprenant (les siennes) et
formateur affecté ; durée effective, détail des réponses (sans exposer les
bonnes réponses tant que le corrigé n'est pas disponible) ». Existant :
passage, durée effective et notation (US-QCM-05 à 08), déclencheur qui fige
une tentative NOTEE (US-QCM-08), corrigé et ses règles de disponibilité
(US-QCM-09).

## Découpage
- **Aucune migration.**
- **Module** `tentatives/historique/` (à part : il a besoin de la garde de
  formation, que `TentativesModule` n'importe pas) : règles pures
  (`historique.regles.ts`), `HistoriqueTentativesService`, deux contrôleurs
  (apprenant, formateur), DTO de filtre. `TentativeCorrectionService.lireCorrection`
  devient public (lu par le détail formateur).
- **Web.** Page « Mes tentatives » (lien dans l'en-tête apprenant) : tableau
  et détail ; page « Tentatives » d'un QCM côté formateur (lien « Voir
  l'historique » dans l'éditeur) : tableau filtrable par apprenant, détail
  avec juste / faux, points et bonnes réponses.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/mes-tentatives?qcmId` | APPRENANT | 200 (les siennes, plus récentes d'abord) ; 400 ; 401 ; 403 |
| GET | `/api/mes-tentatives/:tentativeId` | APPRENANT | 200 questions vues + choix + état du corrigé ; 404 inconnue ou d'un autre |
| GET | `/api/formateur/qcm/:qcmId/tentatives?apprenantId` | FORMATEUR affecté, ADMINISTRATEUR | 200 avec l'apprenant ; 400 ; 403 (tracé) ; 404 QCM |
| GET | `/api/formateur/qcm/:qcmId/tentatives/:tentativeId` | idem | 200 corrigé complet ; 404 tentative d'un autre QCM |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Lecture seule | Aucune route d'écriture ; une tentative NOTEE reste figée par le déclencheur d'US-QCM-08 (e2e : `UPDATE` refusé, `PUT` / `PATCH` / `DELETE` -> 404). |
| D2 | Isolation | Apprenant : `apprenant_id` du jeton dans chaque requête (celle d'un autre = 404, comme une inconnue). Formateur : garde de formation sur le QCM ; le détail exige que la tentative soit de CE QCM. |
| D3 | Contenu apprenant | Questions dans l'ordre du tirage et options cochées — jamais `estCorrecte`, points ni explication (e2e : aucune de ces clés). Le corrigé garde sa route et ses règles (US-QCM-09) ; la page y renvoie quand il est disponible. Tentative EN_COURS : aucun contenu ici (la page de passage garde le contrôle de session et la minuterie). |
| D4 | Score | Score et réussite seulement sur une tentative NOTEE (null avant). |
| D5 | Rang | `ROW_NUMBER()` sur TOUTES les tentatives du même apprenant sur le même QCM, même quand une seule ligne est demandée (sous-requête) : le rang ne dépend pas du filtre. |
| D6 | Durée | Durée effective écrite à la soumission ou à la clôture (`duree_effective`, en secondes) ; « — » tant qu'elle n'existe pas. |
| D7 | Bornes | 200 lignes au plus, les plus récentes d'abord. |
| D8 | Audit | Lecture non tracée (comme les autres consultations du parcours) ; seul le refus d'accès du formateur non affecté l'est (garde existante). |

## Fichiers
- `apps/api/src/modules/tentatives/historique/` : `historique.regles.ts`, `historique-tentatives.service.ts` (+ specs), `historique-tentatives.controller.ts`, `historique.dto.ts`, `historique-tentatives.module.ts` ; `tentative-correction.service.ts` ; `app.module.ts`
- `apps/api/test/historique-tentatives.e2e-spec.ts` (marqueur `E2E-HISTO`)
- `apps/web/src/app/mes-tentatives/page.tsx`, `app/formateur/qcm/[id]/tentatives/page.tsx`, `app/formateur/qcm/[id]/page.tsx`, `components/ApprenantNav.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- Premier jet : sortie du bloc `apprenant` par déstructuration (`{ apprenant: _a, ...l }`) refusée par le lint (variable inutilisée) ; remplacée par une fonction `sansApprenant`.
- Un mutant (rang calculé sur les seules lignes retenues) n'aurait été vu par aucun test : ajout du rang dans l'assertion du détail d'une tentative en cours (n° 2).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **99 suites / 1 327 tests**
  (+ 9 : choix dans l'ordre du tirage, score masqué ; filtres SQL, rang sur
  le couple apprenant / QCM, ordre ; 404 ; détail sans corrigé ; en cours
  vide ; détail formateur avec corrigé ; 404 autre QCM), aucune migration
  (**32**), e2e complet en série **55 suites / 732 tests** (+ 1 ignoré), dont
  `E2E-HISTO` (8 tests : accès ; liste apprenant — ordre, rang, durée, score,
  nombre de réponses — ; détail sans fuite ; en cours et 404 ; liste
  formateur avec apprenant et filtre ; détail avec corrigé et 404 ;
  immuabilité ; concurrence : 8 lectures pendant une soumission, chaque ligne
  cohérente).
- Mutations : **9 / 9 tuées** — filtre de l'apprenant, score visible avant la
  notation, tentative en cours dévoilée, tentative d'un autre QCM acceptée,
  rang par QCM seulement, rang sur les seules lignes retenues, garde de
  formation retirée, ordre chronologique, choix hors de l'ordre du tirage.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium) : « Mes tentatives » d'un apprenant de démonstration (deux QCM,
  durée, score) ; page « Tentatives » du QCM de démonstration côté formateur
  et fenêtre de détail ; pas de défilement horizontal de la page (le tableau
  défile dans son cadre sur mobile).

## CI
Voir la PR.

## Suites
- US-ATEL-05 : remplacer son livrable.
