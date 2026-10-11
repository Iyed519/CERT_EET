# US-QCM-01 — Créer le contenu d'un QCM (formateur affecté)

## En une phrase
Le formateur affecté à une formation crée des QCM dans ses modules (au statut
brouillon) et les remplit de questions à choix unique, à choix multiple ou
vrai / faux, avec leurs options, bonnes réponses, pondérations et
explications ; chaque question est validée côté serveur avec un message ciblé,
et le contenu se fige dès la première tentative d'un apprenant (seules les
explications restent modifiables). C'est le premier écran où le formateur agit.

## Découpage
- **A — API.** Module `qcm` (service, contrôleur, 4 DTO) sous
  `@FormateurDeLaFormation` ; tests unitaires et e2e.
- **B — UI.** QCM listés sous chaque module de « Mes formations », éditeur de
  QCM, modales question / titre / confirmation.
- **C — Journal + PR.**

Aucune migration (tables `qcm`, `questions`, `options`, `qcm_questions` posées
avec le modèle de données), aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| POST | `/modules/:moduleId/qcm` | Crée un QCM BROUILLON (créateur = utilisateur du jeton) |
| GET | `/modules/:moduleId/qcm` | QCM du module, tous statuts, avec leur nombre de questions |
| GET | `/qcm/:qcmId` | QCM, questions triées, options avec `estCorrecte`, `verrouille` |
| PATCH | `/qcm/:qcmId` | Titre et / ou description |
| DELETE | `/qcm/:qcmId` | Supprime un QCM non publié et sans tentative |
| POST | `/qcm/:qcmId/questions` | Ajoute une question et ses options en fin de QCM |
| PUT | `/qcm/:qcmId/questions/ordre` | Réordonne toutes les questions |
| PUT | `/qcm/:qcmId/questions/:questionId` | Remplace une question |
| DELETE | `/qcm/:qcmId/questions/:questionId` | Retire une question, renumérote |

Accès : FORMATEUR **affecté** à la formation et ADMINISTRATEUR (garde
d'US-AUTH-16 sur `moduleId` ou `qcmId`). Codes : **400** validation ·
**401** · **403** rôle ou non affecté (audit `ACCES_RESSOURCE_REFUSE`) ·
**404** module, QCM ou question absente de ce QCM · **409** formation
archivée, QCM verrouillé, QCM publié (suppression).

Actions d'audit : `QCM_CREE`, `QCM_MODIFIE`, `QCM_SUPPRIME`,
`QUESTION_AJOUTEE`, `QUESTION_MODIFIEE`, `QUESTION_SUPPRIMEE`,
`QUESTIONS_REORDONNEES` (cible = le QCM).

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (FORMATEUR, ADMINISTRATEUR) →
   `FormateurDeLaFormationGuard` (module ou QCM → formation → affectation) →
   `ValidationPipe` (forme du corps) → service.
2. **Écriture.** QCM chargé (404), formation chargée pour écriture (409 si
   archivée), QCM non verrouillé pour le contenu (409), règles métier de la
   question (400), puis question + options + liaison dans **une transaction**,
   puis audit.
3. **Lecture.** Les bonnes réponses (`estCorrecte`, colonne non sélectionnée
   par défaut) ne sont chargées qu'ici, explicitement, pour l'éditeur.

## Décisions
- **Route `POST /modules/:moduleId/qcm`** (Sprint Backlog) plutôt que
  `POST /qcm {moduleId, formationId}` (DS-12) : le garde remonte du module à la
  formation ; envoyer les deux identifiants exposait à une incohérence.
- **Trois types de questions** : QCM (plusieurs bonnes réponses), QCU (une
  seule), VRAI_FAUX (deux options, une bonne réponse). `REPONSE_COURTE` et
  `ASSOCIATION` existent dans l'énumération mais aucun document ne définit leur
  correction → 400 « pas encore pris en charge ».
- **Validation en deux couches** : le DTO vérifie la forme (types, longueurs,
  champ inconnu refusé) ; le service applique les règles métier dans un ordre
  fixe, un message par règle — Vrai/Faux (2 options, 1 bonne), au moins 2 et
  au plus 10 options, pas de doublon de texte (casse ignorée), au moins une
  bonne réponse, QCU → exactement une. Rien n'est écrit si une règle échoue.
- **Verrouillage dès la première tentative** (DS-12, UC1 Formateur) : ajout,
  retrait, réordonnancement et changement de contenu → 409. L'explication
  d'une question et le titre / la description du QCM restent modifiables :
  ils ne changent ni les questions ni la correction. Pour une question, le
  serveur compare tout le reste à l'existant et refuse toute différence.
- **Suppression d'un QCM** seulement s'il n'est ni publié ni tenté ; ses
  questions partent avec lui, sauf celles qu'un autre QCM utilise encore —
  la banque de questions (US-QCM-02) pourra partager des questions sans
  risque.
- **Remplacement complet d'une question** (`PUT`) plutôt que des modifications
  champ par champ : les options se remplacent en bloc, dans la même
  transaction que la question.
- **Route de réordonnancement déclarée avant celle d'une question** : sinon
  « ordre » serait pris pour un identifiant (400 du `ParseUUIDPipe`).
- **Statut BROUILLON imposé** : le passage à NON_PUBLIE puis PUBLIE relève
  d'US-QCM-03 et US-QCM-04. Un brouillon n'apparaît jamais dans « Mon espace »
  de l'apprenant (vérifié en e2e).
- **UI** : bouton radio pour choix unique et vrai / faux, cases à cocher pour
  choix multiple ; options « Vrai » / « Faux » fixées ; le message exact du
  serveur s'affiche dans la modale ; QCM verrouillé → seule l'explication est
  saisissable. Modale de confirmation générique créée pour les suppressions.

## Fichiers
- `apps/api/src/modules/qcm/` (nouveau) : `qcm.service.ts` (+ spec),
  `qcm.controller.ts`, `qcm.module.ts`, `dto/create-qcm.dto.ts`,
  `dto/update-qcm.dto.ts`, `dto/question.dto.ts`, `dto/reorder-questions.dto.ts`
- `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (tag Swagger `qcm`)
- `apps/api/test/qcm.e2e-spec.ts` (nouveau, marqueur `E2E-QCM01`)
- `apps/web/src/app/formateur/qcm/[id]/page.tsx` (nouveau, éditeur),
  `formateur/formations/[id]/page.tsx` (QCM par module, « Nouveau QCM »)
- `apps/web/src/components/` : `QuestionModal.tsx`, `QcmInfosModal.tsx`,
  `ConfirmationModal.tsx` (nouveaux)
- `apps/web/src/lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- **Aucune route ne crée encore de tentative** (US-QCM-05) : le verrouillage
  est testé en insérant une tentative directement en base (e2e et
  vérification visuelle).
- **Environnement de travail réinitialisé en cours de tests** : la base de
  test s'est arrêtée pendant un lancement e2e (sans lien avec le code) ;
  relancée, la suite passe.

## Vérification
- **Lint** : propre. **Tests unitaires** : 22 suites, 266 tests (+22 : chaque
  règle de validation avec son message, statut BROUILLON imposé, formation
  archivée, verrouillage, suppression d'un QCM publié, PATCH vide ou titre
  vidé).
- **e2e** : 14 suites, 179 tests, dont `qcm` (22) sur l'application réelle —
  formateur affecté 201, non affecté 403 + audit, apprenant 403, admin
  autorisé ; 404 module inconnu, 409 formation archivée ; QCU, QCM, Vrai/Faux
  dans l'ordre avec bonnes réponses ; trois refus de validation avec le
  message exact et rien d'enregistré ; champ inconnu refusé ; remplacement,
  réordonnancement, retrait avec renumérotation ; QCM verrouillé : 409 partout
  sauf explication et titre ; suppression d'un brouillon et de ses questions ;
  brouillon absent de « Mon espace ».
- **Front (hors CI)** : `tsc --noEmit`, `next lint`, `next build` propres ;
  parcours joué dans un navigateur — nouveau QCM → éditeur → choix unique,
  choix multiple refusé (aucune bonne réponse) puis corrigé, vrai / faux,
  déplacement, retrait confirmé ; QCM verrouillé : ajout et suppression
  désactivés, seule l'explication modifiable et enregistrée ; mobile.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : lint, tests unitaires,
`migration:run`, puis e2e — la nouvelle suite s'y ajoute. Le front reste hors
CI (dette Sprint 1) : vérification manuelle ci-dessus.

## Suites
- US-QCM-03 : paramètres anti-fraude (`config_anti_fraude`), passage en
  NON_PUBLIE.
- US-QCM-04 : publication (au moins une question et une configuration),
  audit `QCM_PUBLIE`.
- US-QCM-02 (stretch) : banque de questions — liaison sans copie, déjà
  permise par le modèle.
- Types `REPONSE_COURTE` et `ASSOCIATION` : à définir (règles de correction)
  avant de les accepter.
