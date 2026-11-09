# US-IA-04 — Révision humaine des suggestions de questions

## En une phrase
Pour chaque question proposée par l'IA, un formateur affecté (ou un
administrateur) choisit un QCM du module puis l'accepte telle quelle, la
modifie avant de l'accepter, ou la rejette (motif facultatif) ; la question
acceptée entre dans le QCM avec son origine (IA ou IA modifiée), la décision
est unique et définitive, et la base garantit qu'une suggestion non décidée
n'est jamais reliée à un QCM.

## Découpage
- **Base.** Migration `1787700000000-AddRevisionSuggestions` :
  - `questions.origine` (type `questions_origine_enum` : MANUELLE par défaut,
    IA, IA_MODIFIEE) ;
  - `suggestions_questions_ia` : `question_id` (UNIQUE, FK SET NULL),
    `qcm_id` (FK SET NULL), `decide_par` (FK RESTRICT), `date_decision`,
    `motif_rejet` ;
  - `CHK_suggestions_decision` : PROPOSEE ⇒ ni question, ni QCM, ni
    décideur, ni date, ni motif ; ACCEPTEE / MODIFIEE ⇒ décideur et date,
    sans motif ; REJETEE ⇒ décideur et date, sans question ni QCM ;
    `CHK_suggestions_motif_rejet` (1–500) ;
  - déclencheur `trg_suggestions_transitions` : une suggestion naît
    PROPOSEE ; son contenu ne change jamais ; une fois décidée, seule la
    remise à NULL de la question ou du QCM (suppression ultérieure) passe.
- **API.**
  - `suggestions/` : `revision.regles.ts` (proposition au format de
    l'éditeur, « modifiée ? », motif), `RevisionSuggestionsService`,
    `RevisionSuggestionsController`, DTOs, `suggestion.vue.ts` (vue
    partagée avec la lecture US-IA-03, enrichie de la décision).
  - Garde `@FormateurDeLaFormation({ suggestionId })` (suggestion ->
    génération -> module -> formation).
  - `QcmService` exporté : `exigerAjoutPossible`, `insererQuestionEnFin`
    (verrou de la ligne du QCM, origine), `vueQuestion` ; vue des questions
    avec `origine` ; une question IA retouchée dans l'éditeur (hors
    explication) devient IA_MODIFIEE.
- **Web.**
  - `SuggestionsModal` devient l'écran de révision : choix du QCM du module
    (brouillon proposé d'abord ; sans QCM, invitation à en créer un, le rejet
    reste possible), compteur « à traiter », par suggestion « Accepter »,
    « Modifier puis accepter » (la modale de question de l'éditeur de QCM,
    pré-remplie, réutilisée), « Rejeter » (motif facultatif, confirmation) ;
    décision affichée (pastille, QCM de destination, motif).
  - Éditeur de QCM : pastille « IA » / « IA modifiée » sur les questions.
  - Liste des générations : « Réviser les questions ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/suggestions/:suggestionId/accepter` `{ qcmId, question? }` | FORMATEUR affecté, ADMINISTRATEUR | 201 `{ suggestion, question }` ; 400 (question non conforme, QCM d'un autre module, corps) ; 401 ; 403 tracé ; 404 suggestion / QCM ; 409 déjà décidée, formation archivée, QCM déjà tenté |
| POST | `/api/suggestions/:suggestionId/rejeter` `{ motif? }` | idem | 200 ; 400 ; 401 ; 403 tracé ; 404 ; 409 déjà décidée, formation archivée |

## Flux
1. **Accepter.** Suggestion chargée (404 ; déjà décidée -> 409) ; QCM : existe
   (404), formation non archivée (409), sans tentative (409), même module
   que la génération (400). Proposition mise au format de l'éditeur (niveau
   de la génération, pondération par défaut) et validée ; version retouchée
   validée avec les mêmes règles (400 avec le message de l'éditeur). Origine
   IA si identique après normalisation, IA_MODIFIEE sinon.
2. Transaction : verrou de la suggestion (toujours PROPOSEE, sinon 409),
   verrou du QCM, question + options + rang suivant, décision enregistrée à
   l'heure de PostgreSQL. Audit `SUGGESTION_ACCEPTEE` ou
   `SUGGESTION_MODIFIEE` (avant / après).
3. **Rejeter.** Formation non archivée (409), verrou, REJETEE avec motif
   nettoyé ; audit `SUGGESTION_REJETEE`.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Destination | Pas de « banque » séparée dans le modèle : la question acceptée entre dans un QCM **du même module** (ses questions portent sur le support de ce module). Le formateur choisit le QCM. |
| D2 | Règles | Celles de l'éditeur de QCM (`QcmService.validerQuestion`), y compris pour une version retouchée : une seule source de vérité. QCM déjà tenté : refusé comme un ajout manuel. |
| D3 | ACCEPTEE / MODIFIEE | Décidé par le serveur en comparant la version envoyée à la proposition normalisée (énoncé, type, pondération, explication, niveau, options) : l'origine dit honnêtement qui a écrit la question. |
| D4 | Garanties | « Jamais publiable sans validation » : une suggestion PROPOSEE n'a ni question ni QCM (CHECK) ; décision unique (verrou + CHECK + déclencheur) ; contenu de la suggestion immuable (la version modifiée vit dans la question). |
| D5 | Suite de vie | Question retirée du QCM ou QCM supprimé : la décision reste (SET NULL, permis par le déclencheur) ; question IA retouchée plus tard dans l'éditeur : origine IA_MODIFIEE. |
| D6 | Ordre | Deux ajouts simultanés dans un même QCM : verrou de la ligne du QCM dans `insererQuestionEnFin` (vaut aussi pour l'ajout manuel), deux rangs distincts. |
| D7 | Hors périmètre | « Tout accepter » en un clic, statistiques d'acceptation par génération et traçabilité complète de l'origine (US-IA-05) : non faits. |

## Fichiers
- `apps/api/src/database/migrations/1787700000000-AddRevisionSuggestions.ts`, `database/enums/origine-question.enum.ts`, `database/entities/{question,suggestion-question-ia}.entity.ts`
- `apps/api/src/modules/assistance-ia/suggestions/*` (+ specs), `assistance-ia.module.ts`, `generations/generations.{service,controller}.ts`
- `apps/api/src/modules/qcm/{qcm.service,qcm.module}.ts` (+ spec)
- `apps/api/src/modules/formations/autorisation/*`, `formations.module.ts`
- `apps/api/test/revision-suggestions.e2e-spec.ts` (marqueur `E2E-IAREV`)
- `apps/web/src/components/{SuggestionsModal,QuestionModal,SupportsModule}.tsx`, `app/formateur/qcm/[id]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Test de concurrence : la seconde requête attend derrière la première dans
  la file du verrou de ligne, pas derrière le bloqueur ; le décompte des
  sessions bloquées utilise `cardinality(pg_blocking_pids(pid)) > 0`.
- Nettoyage e2e : `qcm` est en RESTRICT vers `modules` ; les QCM sont
  supprimés avant la formation.

## Vérification
- API : lint 0, `tsc`, unitaires **77 suites / 1 128 tests**, migration
  run + revert + run (27 migrations), e2e **41 suites / 592 tests** (en
  série ; l'essai Anthropic réel est ignoré sans clé), dont `E2E-IAREV`
  (28 tests : accepter telle quelle, modifiée, identique, par
  l'administrateur ; rejeter avec motif ; origine dans l'éditeur ; question
  IA retouchée -> IA_MODIFIEE ; question retirée, décision conservée ; refus
  400 / 401 / 403 tracé / 404 / 409 sans rien écrire ; décision unique ;
  CHECK, déclencheur, unicité, valeurs d'origine ; trois tests de concurrence
  forcée : acceptation et rejet simultanés, deux acceptations simultanées de
  la même suggestion, deux acceptations simultanées vers le même QCM).
- Mutations tuées (11 / 11) : même module, origine IA_MODIFIEE, formation
  archivée au rejet, statut PROPOSEE à la lecture et sous verrou, verrou de
  la suggestion, explication et options dans « modifiée ? », verrou du QCM,
  IA_MODIFIEE réservé aux questions IA dans l'éditeur, garde du rejet.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px (Chromium) : génération
  réelle (fournisseur factice), révision sans QCM (invitation), puis avec un
  QCM : acceptation, « Modifier puis accepter » (modale de l'éditeur
  pré-remplie), rejet avec motif ; pastilles « IA » / « IA modifiée » dans
  l'éditeur de QCM ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-IA-05 : traçabilité de l'origine IA (statistiques, rapports).
- Aligner Backlog v1.8 / DS-06 P3 : destination = QCM du module (pas de banque).
