# US-QCM-02 — Importer des questions depuis la banque

## En une phrase
Depuis l'éditeur d'un QCM, le formateur ouvre « Importer depuis ma banque » :
il voit les questions de ses autres QCM, cherche dans l'énoncé, en coche
plusieurs et les ajoute en fin de QCM — par une **liaison**, sans copie : la
même question sert alors à plusieurs QCM.

## Point de départ
Backlog E3, US-QCM-02 (Should, 3 pts) : « le système crée une liaison (sans
copie) entre le QCM et les questions existantes » ; « une recherche sans
résultat -> le système indique qu'aucune question ne correspond, sans
modifier le QCM ». Existant : table de liaison `qcm_questions` (unique
QCM + question, rang), `qcm.formateur_id` (créateur), verrouillage d'un QCM
dès sa première tentative (US-QCM-01), retrait d'une question qui ne
supprime que les questions devenues orphelines.

## Découpage
- **Aucune migration** (le modèle prévoyait déjà la liaison).
- **Règles pures** `qcm/banque.regles.ts` : bornes, messages, motif de
  recherche échappé, contrôle « hors banque », doublons.
- **API** (`QcmService`, `QcmController`) : `banque`, `importerDeLaBanque`,
  verrou des questions partagées dans `remplacerQuestion` ; DTO
  `RechercheBanqueDto`, `ImportBanqueDto`.
- **Web.** Bouton « Importer depuis ma banque » à côté de « + Ajouter une
  question » ; fenêtre `BanqueQuestionsModal` : recherche, liste (type,
  nombre d'options, QCM d'origine, « Figée »), cases à cocher, « Importer N
  questions ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/qcm/:qcmId/banque?recherche` | FORMATEUR affecté, ADMINISTRATEUR | 200 `{ questions, message }` ; 400 recherche > 200, paramètre inconnu ; 401 ; 403 (tracé) ; 404 |
| POST | `/api/qcm/:qcmId/banque/import` `{ questionIds }` | idem | 200 QCM ; 400 liste vide / > 50, UUID invalide, question hors banque ou déjà liée, champ inconnu ; 401 ; 403 ; 404 ; 409 QCM avec tentatives, formation archivée |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Banque | Questions liées aux QCM dont le formateur est le créateur (`qcm.formateur_id`), hors celles déjà dans le QCM cible ; 100 au plus, les plus récentes d'abord. Pas de banque partagée entre formateurs (non demandé ; les questions d'un collègue restent les siennes). |
| D2 | Liaison | Insertion dans `qcm_questions` seulement — aucune ligne `questions` ou `options` créée (e2e : nombre de questions inchangé, même identifiant). |
| D3 | Recherche | Dans l'énoncé, insensible à la casse ; `%`, `_` et `\` pris littéralement ; aucune correspondance -> `message` « Aucune question de votre banque ne correspond. », rien n'est modifié. |
| D4 | Ordre | En fin de QCM, dans l'ordre demandé ; doublons de la demande ignorés. |
| D5 | Tout ou rien | Une question hors banque (autre formateur, inconnue, déjà liée) -> 400 et rien n'est lié. |
| D6 | QCM cible | Mêmes règles que l'ajout manuel : formation archivée -> 409, QCM avec tentatives -> 409. |
| D7 | Question partagée | Modifier une question la modifie dans chaque QCM qui l'utilise ; elle est donc figée (seule l'explication change) dès qu'UN de ses QCM a des tentatives — sinon un résultat déjà obtenu porterait sur un énoncé changé. Signalé « Figée » dans la banque. Retirer la question d'un QCM ne la supprime pas des autres (règle des orphelines existante). |
| D8 | Concurrence | Ligne du QCM verrouillée (`FOR UPDATE`) pendant le contrôle et l'insertion : 8 imports simultanés de la même question -> 1 × 200, 7 × 400, un seul lien ; 6 imports de questions distinctes -> rangs 1 à 6. |
| D9 | Audit | `QUESTIONS_IMPORTEES` (identifiants, nombre), une trace par import. |

## Fichiers
- `apps/api/src/modules/qcm/banque.regles.ts` (+ spec), `dto/banque.dto.ts`, `qcm.service.ts` (+ spec), `qcm.controller.ts`
- `apps/api/test/banque-questions.e2e-spec.ts` (marqueur `E2E-QCM02`) ; `test/audit-journal.e2e-spec.ts` (correctif, voir Incidents)
- `apps/web/src/components/BanqueQuestionsModal.tsx`, `app/formateur/qcm/[id]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Test instable hors périmètre : la concurrence de `audit-journal.e2e-spec.ts`
  (US-AUDIT-01) a échoué en `ECONNRESET` pendant l'e2e complet (déjà vu au
  Sprint 4). Cause : `app.init()` sans serveur à l'écoute, chaque requête
  simultanée démarre le sien. Corrigé par `app.listen(0)` (comme les autres
  suites concurrentes) ; suite rejouée 3 fois : verte.
- Les tests unitaires existants de `remplacerQuestion` n'avaient pas de
  `dataSource.query` simulé : ajouté au double (réponse vide par défaut)
  pour le nouveau contrôle « tentée ailleurs ».

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **97 suites / 1 318 tests**
  (+ 10 : motif échappé, hors banque, doublons ; banque filtrée et requête,
  message vide, 404 ; import sous verrou dans l'ordre, sans copie, audit ;
  400 hors banque sans rien lier ; 400 vide / 409 tenté ; question partagée
  figée), aucune migration (**32**), e2e complet en série **54 suites /
  724 tests** (+ 1 ignoré), dont `E2E-QCM02` (11 tests : accès ; banque
  filtrée avec options, origine, figée ; recherche et `%` ; aucune
  correspondance ; liaison sans copie, ordre, audit ; 400 tout ou rien ; 409
  QCM tenté ; question partagée figée, explication modifiable ; retrait sans
  suppression ailleurs ; deux rafales concurrentes).
- Mutations : **10 / 10 tuées** — filtre du formateur, exclusion du QCM cible,
  jokers non échappés, import sans verrou, contrôle de la banque ignoré, même
  rang pour chaque question, verrou « tentée ailleurs » ignoré, QCM cible
  tenté accepté, action d'audit, doublons de la demande conservés (le premier
  mutant de ce dernier ne compilait pas — import devenu inutilisé — et a été
  réécrit).
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, formateur de démonstration, un QCM de démonstration et une
  banque de trois questions) : bouton, recherche, liste, sélection,
  « Importer 1 question » ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-QCM-11 : historique complet et immuable des tentatives.
