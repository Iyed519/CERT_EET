# US-QCM-08 — Notation serveur et tentative figée

## En une phrase
Chaque tentative terminée est notée par le serveur juste après sa clôture —
soumission, échéance à la sauvegarde ou au démarrage suivant, balayage — sur
les seules questions de son tirage : score pondéré, réussite au seuil du QCM,
correction écrite sur chaque réponse, passage NOTEE figé (un trigger de la
base refuse toute modification), taux d'avancement de l'inscription mis à
jour ; l'apprenant voit son score et « Réussi » / « Échoué ».

## Découpage
- **A — API.** Règles pures (`tentative-notation.regles.ts`), service de
  notation (`TentativeNotationService`) appelé après chaque clôture et en
  rattrapage par le balayage, migration du trigger d'immuabilité, score dans
  la soumission et la consultation ; correctif d'un test daté
  (`qcm-configuration.service.spec.ts`) ; tests unitaires et e2e.
- **B — UI.** Bloc de résultat en fin de tentative (score, Réussi / Échoué) ;
  fond de l'application et contrastes revus.
- **C — Journal + PR.**

Une migration (trigger), aucune dépendance ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| POST | `/tentatives/:tentativeId/soumettre` | (US-QCM-07) + notation : 200 `{ statut: NOTEE, score, estReussie, … }` ; SOUMISE et `score: null` si la notation a échoué |
| GET | `/tentatives/:tentativeId` | + `score`, `estReussie` (null tant que la tentative n'est pas NOTEE) |
| PUT | `/tentatives/:tentativeId/reponses/:questionId` | (US-QCM-07) 409 `temps_ecoule` : les réponses partielles sont notées avant la réponse ; `statut` du 409 reste ABANDONNEE_TIMER (comment la tentative s'est terminée) |
| POST | `/qcm/:qcmId/tentatives` | (US-QCM-05) une tentative échue clôturée ici est aussi notée |

Aucune route de notation ni de renotation (D6). Audit **`TENTATIVE_NOTEE`**
(score, réussite, seuil, nombre de questions et de bonnes réponses, statut
avant, taux d'avancement) : acteur = l'apprenant dont la requête a déclenché
la notation, aucun pour le rattrapage du balayage.

## Flux
1. Une clôture est validée (US-QCM-07), puis `noterSansEchec(tentativeId,
   acteur)` : un échec est journalisé, jamais remonté.
2. Transaction de notation : `SELECT … FOR UPDATE` sur la tentative → rien si
   elle n'est pas SOUMISE ou ABANDONNEE_TIMER → questions du plan avec leur
   pondération, options correctes (requête explicite sur `est_correcte`),
   réponses cochées → correction → `estCorrecte` / `pointsObtenus` sur chaque
   réponse → tentative NOTEE (`score`, `estReussie`) → inscription verrouillée,
   `taux_avancement` recalculé.
3. Après COMMIT : audit `TENTATIVE_NOTEE`.
4. Balayage (toutes les 60 s) : après ses clôtures, rattrapage de toute
   tentative SOUMISE / ABANDONNEE_TIMER encore sans note (lot de 50).
5. Interface : la page de la tentative affiche le score renvoyé par la
   soumission ; après un temps écoulé, elle relit la tentative (encore deux
   fois à 45 s si le serveur n'a pas encore clôturé).

## Décisions
Tableau D validé avant de coder (D1–D13, options recommandées).
- **D1 — État final NOTEE (écart avec DS-02 étape 4 : SOUMISE + score).**
  ET-02 et le Backlog concordent : SOUMISE et ABANDONNEE_TIMER mènent à NOTEE.
- **D2 — Notation juste après chaque clôture, dans SA transaction**, plutôt
  que dans la transaction de clôture : si elle échoue, la clôture tient et le
  rattrapage du balayage la reprend — y compris les tentatives clôturées
  avant cette story.
- **D3 — Question à choix multiples : tout ou rien.** Correcte si l'ensemble
  coché est exactement celui des bonnes options ; la formule du Backlog
  porte sur un booléen « correcte » ; aucun document ne parle de points
  partiels.
- **D4 — Seules les questions du tirage comptent** ; sans réponse = 0 et
  compte au dénominateur ; Σ(pondération) nulle (impossible après
  publication) → 0.
- **D5 — Score arrondi à 2 décimales** (colonne `numeric(5,2)`) ; réussite si
  score ≥ `scoreMinValidation` lu au moment de la notation.
- **D6 — Immuabilité à deux niveaux.** Application : notation conditionnelle
  au statut, aucune route. Base : trigger `BEFORE UPDATE … WHEN (OLD.statut =
  'NOTEE')` qui refuse toute modification, même en SQL direct ; la
  suppression reste possible (nettoyage des tests).
- **D7 — Audit `TENTATIVE_NOTEE` (écart avec le Backlog : `QCM_SOUMIS` à la
  notation).** `QCM_SOUMIS` existe déjà à la soumission (US-QCM-07) ; une
  action distincte dit ce qui s'est passé.
- **D8 — Redis** : déjà nettoyé à la clôture (US-QCM-07) ; verrou de session
  = US-QCM-10.
- **D9 — Taux d'avancement recalculé à la notation (écart avec DS-09 : à la
  lecture de « Mon espace »)** : QCM publiés réussis au moins une fois / QCM
  publiés × 100 ; un GET reste sans effet (journal 30, D14). Les ateliers s'y
  ajouteront au Sprint 4. L'inscription est verrouillée : deux notations de
  la même inscription ne s'écrasent pas.
- **D10 — Pas de colonne « mode de fin »** : l'audit (`QCM_SOUMIS` ou
  `TENTATIVE_EXPIREE`) et `dateFin = dateLimite` le disent ; à revoir avec
  US-QCM-11 (historique).
- **D11 — Score et réussite visibles dès US-QCM-08** (visibles dans les deux
  modes d'affichage selon le Backlog) ; le corrigé par question reste
  US-QCM-09.
- **D12 — Concurrence** : deux notations simultanées → la seconde trouve
  NOTEE sous le verrou et ne fait rien ; une seule note, un seul audit.
- **D13 — UI** : bloc de résultat ; « Mon espace » affichait déjà la
  progression et Réussi / Échoué, alimentés désormais par le serveur.
- **Ajout UI — fond et contrastes.** Fond `#e9eee9` (gris-vert) pour détacher
  les cartes blanches ; `--muted` et les liens assombris pour rester au-dessus
  de 4,5:1 (WCAG AA) sur le fond, les cartes et les pastilles ; liens du
  bandeau en blanc sur un dégradé assombri (contraste de 1,2–2,0:1 à
  4,7–12,7:1 ; dette signalée depuis le Sprint 1).

## Fichiers
- `apps/api/src/modules/tentatives/` : `tentative-notation.regles.ts`,
  `tentative-notation.service.ts` et leurs specs (nouveaux) ;
  `tentative-passage.service.ts`, `tentative-demarrage.service.ts`,
  `tentative-balayage.service.ts` (+ specs) (notation après clôture,
  rattrapage) ; `tentative-consultation.service.ts` (+ spec) (`score`,
  `estReussie`) ; `tentatives.controller.ts` (Swagger) ;
  `tentatives.module.ts`
- `apps/api/src/database/migrations/1786100000000-AddTentativeNoteeImmutabilityTrigger.ts`
  (nouveau)
- `apps/api/src/modules/qcm/qcm-configuration.service.spec.ts` (horloge figée)
- `apps/api/test/tentative-notation.e2e-spec.ts` (nouveau, marqueur
  `E2E-NOTATION`) ; `tentative-passage.e2e-spec.ts`,
  `tentative-demarrage.e2e-spec.ts` (statut final NOTEE)
- `apps/web/src/app/tentatives/[id]/page.tsx`, `lib/api.ts` (types),
  `lib/format.ts` (`scoreFr`), `app/globals.css` (bloc de résultat, fond,
  contrastes)

## Incidents
- **Test à retardement sur `main`.** `qcm-configuration.service.spec.ts`
  (US-QCM-03) : 8 tests en échec depuis le 02/11/2026. Le service valide
  « fermeture dans le futur » avec l'horloge réelle, le test utilise des
  dates fixes. Toute nouvelle PR aurait eu une CI rouge. Corrigé dans le test
  seulement : horloge figée sur `MAINTENANT` (Date simulé, minuteurs réels).
- **Base de référence faussée.** Une première passe e2e lancée pendant
  l'écriture du code (ts-jest compile les sources) et avec Redis arrêté ;
  écartée et rejouée sur une copie intacte de `main` (19 suites, 253 tests
  verts).
- **Prettier sur la page web.** La configuration Prettier du web ne
  correspond pas à la mise en forme de ses fichiers : la page entière avait
  été reformatée. Repartie de la version d'origine, seules les modifications
  de la story réappliquées (comme `lib/api.ts`, jamais reformaté).
- **CSS non recompilé dans le conteneur `web` (Windows).** La page modifiée
  était prise en compte, pas `globals.css` : CSS compilé sans les nouvelles
  règles (0 `passage-note`). Résolu par `restart web` + rechargement forcé ;
  `WATCHPACK_POLLING=true` dans `docker-compose.dev.yml` éviterait le cas.
- **Copie vers le dépôt local.** Une réécriture de `globals.css` depuis le
  même chemin de dépôt a recopié l'ancienne version ; détecté par md5,
  renvoyé depuis un nouveau chemin.
- **Suite e2e à 8 614 s chez moi** : poste en veille pendant l'exécution ;
  8 s mesurées hors veille.

## Vérification
- **Lint** : propre. **Tests unitaires** : 34 suites, 442 tests (+2 suites,
  +29) — règles (tout ou rien, pondération, sans réponse, hors tirage,
  arrondi, seuil, avancement) ; notation (verrou, statuts notables, ordre
  réponses puis NOTEE, seuil lu, avancement sous verrou, audit après
  transaction, rattrapage) ; notation appelée par la soumission, l'échéance,
  le démarrage et le balayage.
- **e2e** : 20 suites, 262 tests, dont `tentative-notation` (9) — 4/10 = 40 %
  au seuil 40 (réussi), QCM incomplet = 0, sans réponse compté ; 100 % ; 0 % ;
  plan réduit (25 %) ; temps écoulé noté (10 %) ; rattrapage sans acteur ;
  avancement 50 puis 100 ; trigger qui refuse la modification d'une NOTEE ;
  renotation sans effet ; aucune bonne réponse dans les réponses ;
  chevauchement forcé de deux notations. **Mutations** : sans le verrou de la
  ligne, le test de concurrence échoue ; sans le trigger, le test
  d'immuabilité échoue. Migration annulée puis rejouée.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; dans Chromium,
  bureau 1280 px et mobile 390 px : soumission (50 %, Réussi), rechargement
  (« Tentative notée »), temps écoulé côté base (25 %, Échoué), « Mon espace »
  (progression 100 %, Réussi) ; fond et bandeau vérifiés sur connexion,
  accueil, inscriptions, espace, dialogue, passage, résultat ; aucun
  débordement.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run migration:run
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- --runInBand
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : `migration:run` applique le trigger,
puis e2e avec la nouvelle suite. Le correctif du test daté remet la CI au
vert pour toutes les PR. Front hors CI (dette Sprint 1).

## Suites
- US-QCM-09 : corrigé par question (bonnes réponses, explications) selon le
  mode IMMEDIAT / DIFFERE, à partir de `reponses.estCorrecte`.
- US-QCM-11 : historique des tentatives notées (date, score, durée, détail) ;
  colonne « mode de fin » à décider (D10).
- E5 : éligibilité à la certification à partir de la note et de
  l'avancement (DS-09 → DS-04).
- Documents à aligner (rangement d) : DS-02 étape 4 (NOTEE, audit
  `TENTATIVE_NOTEE`), DS-09 (avancement recalculé à la notation).
- `WATCHPACK_POLLING=true` pour le service `web` en développement.
- Fin du Sprint 2 : périmètre engagé terminé (46 / 46).
