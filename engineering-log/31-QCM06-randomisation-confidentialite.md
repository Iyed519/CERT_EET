# US-QCM-06 — Randomisation et confidentialité des réponses

## En une phrase
À la création d'une tentative, le serveur tire ses questions (K parmi N si
configuré) et l'ordre de leurs options avec un générateur cryptographique, et
fige ce tirage dans `planTirage` ; l'apprenant reçoit ensuite ses questions
dans cet ordre, à chaque lecture identique, sans jamais la bonne réponse,
l'explication ni la pondération — ce que prouve un test de non-fuite sur le
trafic réel.

## Découpage
- **A — API.** Règles pures de tirage (`tentative-tirage.regles.ts` :
  Fisher-Yates, `tirerPlan`), `TentativeTirageService` (lecture des questions
  pour le tirage, vue apprenant en liste blanche), tirage dans la transaction
  de démarrage, questions servies par `GET /tentatives/:tentativeId`, tirage
  tardif unique pour les tentatives antérieures ; tests unitaires et e2e.
- **B — UI.** Page `/tentatives/[id]` : « Question i / K », consigne, options
  dans l'ordre tiré, champs désactivés.
- **C — Journal + PR.**

Aucune migration (`plan_tirage` existait depuis l'enabler), aucune dépendance
npm ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| POST | `/qcm/:qcmId/tentatives` | (existant) tire et fige le plan à la création ; réponse inchangée, sans questions |
| GET | `/tentatives/:tentativeId` | (existant) + `nbQuestions` et `questions` : `{ id, enonce, type, options: [{ id, texte }] }` dans l'ordre du tirage, pendant le temps de passage seulement |

Accès inchangés : APPRENANT, sa propre tentative (404 sinon). Aucune nouvelle
action d'audit : le tirage fait partie du démarrage déjà tracé
(`TENTATIVE_DEMARREE`).

## Flux
1. **Démarrage** (transaction d'US-QCM-05, après tous les contrôles) :
   questions du QCM lues avec leurs options (identifiants, ordre de rédaction,
   type — jamais `estCorrecte`) → `tirerPlan` → tentative créée avec son
   `planTirage`. Un démarrage refusé ou une reprise ne tire rien.
2. **Consultation** : tentative chargée → `SELECT now()` → si elle est
   EN_COURS et dans son échéance : plan absent (tentative antérieure) → tirage
   unique sous verrou de la ligne ; puis questions et options relues par leurs
   identifiants, remises dans l'ordre du plan, reconstruites champ par champ.
   Hors du temps de passage : `questions: []`.
3. **Interface** : la page lit `questions` et les affiche en liste ordonnée,
   champs désactivés dans un `<fieldset disabled>`.

## Décisions
Tableau D validé avant de coder (D1–D10).
- **D1 — Tirage à la création, dans la transaction de démarrage, figé dans
  `planTirage`.** Un rechargement ne remélange jamais ; le scoring
  (US-QCM-08) saura exactement sur quelles questions noter. Un démarrage
  refusé ne consomme aucun tirage.
- **D2 — Questions servies par `GET /tentatives/:tentativeId`, pas dans la
  réponse du POST (écart avec DS-02).** Une seule source de vérité, déjà lue
  par la page ; la réponse du POST reste celle d'US-QCM-05.
- **D3 — `crypto.randomInt` + Fisher-Yates.** `Math.random` est prévisible ;
  pour un examen, l'ordre d'une tentative ne doit pas se déduire des
  précédentes. Le hasard est injectable : les tests rejouent des suites
  exactes.
- **D4 — Tirage de K parmi N toujours aléatoire** dès que `nbQuestionsTirees`
  est réglé ; sans mélange des questions, les K tirées gardent l'ordre de
  rédaction. (DS-02 parle de « piochage banque » : la banque est US-QCM-02 ;
  ici le tirage est piloté par `nbQuestionsTirees`.)
- **D5 — Options d'un Vrai/Faux jamais mélangées (écart avec le Backlog).**
  « Faux, Vrai » déroute l'apprenant et ne protège rien.
- **D6 — Vue apprenant en liste blanche** : `id`, `enonce`, `type` (il faut
  savoir s'il s'agit d'un choix unique ou multiple), options `{ id, texte }`.
  Jamais `estCorrecte`, `explication` (elle trahit la réponse),
  `ponderation`, `niveauDifficulte`.
- **D7 — Preuve de non-fuite à deux niveaux** : clés exactes de chaque objet,
  et corps brut de chaque réponse sans `estCorrecte` / `est_correcte` /
  `explication` / `ponderation` / `difficulte` ni le texte (marqué) des
  explications.
- **D8 — Tentative créée avant US-QCM-06 (plan nul) : tirage unique à la
  première lecture**, sous verrou de la ligne, plan relu sous le verrou. Seule
  écriture d'un GET, idempotente ; sans elle, les tentatives de démonstration
  n'auraient aucune question.
- **D9 — K plafonné au nombre de questions** par sécurité (la publication et
  la garde de retrait garantissent déjà N ≥ K).
- **D10 — UI : champs désactivés** jusqu'à l'enregistrement des réponses
  (US-QCM-07) ; des cases actives qui n'enregistrent rien tromperaient
  l'apprenant.
- **Ajout : aucune question hors du temps de passage** (tentative terminée ou
  échéance atteinte) : la page affiche « Temps écoulé », le serveur ne sert
  plus le questionnaire.
- **Trois barrières contre la fuite** : `estCorrecte` en `select: false` sur
  l'entité (depuis US-QCM-01) ; des `select` explicites qui ne la demandent
  jamais ; une vue reconstruite champ par champ.

## Fichiers
- `apps/api/src/modules/tentatives/` : `tentative-tirage.regles.ts` (+ spec),
  `tentative-tirage.service.ts` (+ spec) (nouveaux) ;
  `tentative-demarrage.service.ts` (+ spec) (tirage à la création) ;
  `tentative-consultation.service.ts` (+ spec) (questions, tirage tardif) ;
  `tentatives.controller.ts` (Swagger) ; `tentatives.module.ts` (service)
- `apps/api/test/tentative-tirage.e2e-spec.ts` (nouveau, marqueur
  `E2E-TIRAGE`) ; `apps/api/test/tentative-demarrage.e2e-spec.ts`
  (assertion adaptée : la vue contient désormais `questions`)
- `apps/web/src/app/tentatives/[id]/page.tsx` (questions) ;
  `apps/web/src/lib/api.ts` (`QuestionTentative`), `lib/format.ts`
  (`CONSIGNES_TYPE_QUESTION`), `app/globals.css`

## Incidents
- **Préparation e2e trop lente pour 5 s.** Sur le poste de développement, le
  `beforeAll` de la nouvelle suite (5 connexions bcrypt, 3 QCM, 12 questions
  insérées une à une) dépassait le délai par défaut de Jest. Corrigé : délai
  explicite de 60 s pour la préparation et le nettoyage, insertions groupées
  (3 requêtes par QCM).
- **Premier passage e2e juste après `restart api`** : 4 suites en échec de
  délai (dont des suites anciennes) pendant que l'API recompilait ; second
  passage entièrement vert. Piste (ménage de fin de sprint) : `testTimeout`
  global à 30 s dans `jest-e2e.json`.
- **Test de lectures simultanées qui ne prouvait rien** : sans verrou, il
  n'échouait qu'une fois sur trois (les lectures se chevauchaient rarement).
  Corrigé comme la rafale d'US-QCM-05 : les UPDATE sur `tentatives_qcm` sont
  bloqués 1 s (`LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE`) ; vérifié — sans
  verrou ni relecture du plan, 3 échecs sur 3.
- **Assertion d'US-QCM-05 à adapter** : le test refusait le mot « question »
  dans la vue ; elle contient maintenant la clé `questions` (vide pour ce QCM
  sans question). Remplacée par la vérification de non-fuite.
- **`disabled` d'un champ dans un `fieldset` désactivé** : la propriété du
  champ reste `false` ; c'est `:disabled` qui fait foi (vérifié dans le
  navigateur, et un clic ne coche rien).

## Vérification
- **Lint** : propre. **Tests unitaires** : 28 suites, 360 tests (+19) —
  Fisher-Yates exact avec hasard imposé, uniformité des 6 permutations avec
  `crypto` (6 000 tirages), K parmi N avec et sans mélange, K plafonné,
  Vrai/Faux non mélangé, unicité et appartenance des questions tirées ;
  requêtes sans `estCorrecte` ; vue en liste blanche même si la base renvoie
  trop de champs ; tirage à la création seulement (ni reprise ni refus) ;
  consultation : questions pendant le passage seulement, tirage tardif unique
  et relu sous verrou.
- **e2e** : 18 suites, 233 tests, dont `tentative-tirage` (7) — non-fuite du
  POST et du GET ; ordre de rédaction sans mélange ; plan figé en base et à la
  relecture ; 3 parmi 6 pour 4 apprenants (questions distinctes du QCM,
  Vrai/Faux intact, tirages qui varient) ; 5 lectures simultanées d'une
  tentative sans plan → un seul tirage ; rien hors du temps de passage.
- **Preuve que le test de non-fuite détecte une fuite** : `estCorrecte`
  ajouté volontairement à la vue → 4 tests rouges ; retiré → vert.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; parcours joué
  dans Chromium, bureau 1280 px et mobile 390 px — 3 questions tirées parmi 5,
  ordre identique après rechargement, Vrai/Faux intact, champs réellement
  désactivés, aucune bonne réponse dans les 6 réponses réseau capturées, aucun
  débordement.

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
- US-QCM-07 : minuterie Redis, enregistrement des réponses
  (`PATCH …/reponse`, options validées contre le plan figé), activation des
  champs, clôture ABANDONNEE_TIMER à l'échéance.
- US-QCM-08 : notation sur les seules questions du plan, pondérées.
- DS-02 à aligner : questions servies par `GET /tentatives/:id`, Vrai/Faux
  non mélangé.
