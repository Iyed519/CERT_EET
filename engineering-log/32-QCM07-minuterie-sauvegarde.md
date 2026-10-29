# US-QCM-07 — Minuterie serveur et sauvegarde des réponses

## En une phrase
L'apprenant répond enfin : chaque réponse est enregistrée sur le serveur peu
après chaque changement, restaurée au rechargement, et refusée dès que
l'échéance fixée par PostgreSQL est atteinte — la tentative est alors close
ABANDONNEE_TIMER, réponses conservées ; il peut aussi soumettre (SOUMISE), et
un balayage clôt toutes les 60 s les tentatives échues que personne ne touche
plus ; Redis porte la minuterie `timer:{id}` en miroir de l'échéance, sans
jamais la décider.

## Découpage
- **A — API.** Règles pures (`tentative-passage.regles.ts`), minuterie Redis
  (`TentativeMinuterieService`), enregistrement et soumission sous verrou de
  la tentative (`TentativePassageService`), balayage
  (`TentativeBalayageService`), `reponses` dans la consultation, minuterie
  posée au démarrage ; tests unitaires et e2e.
- **B — UI.** Page `/tentatives/[id]` : champs actifs, enregistrement 600 ms
  après le dernier changement avec état par question, soumission confirmée,
  états « Temps écoulé » et « Tentative soumise ».
- **C — Journal + PR.**

Aucune migration (`reponses`, `reponse_options` et `date_limite` existaient
depuis l'enabler), aucune dépendance npm ajoutée (`PXAT` est une option de
`SET` déjà prise en charge par ioredis ; pas de `@nestjs/schedule`).

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| PUT | `/tentatives/:tentativeId/reponses/:questionId` | corps `{ optionIds }` : remplace ma réponse à une question (`[]` l'efface) → 200 `{ questionId, optionIds, enregistreeLe, maintenant, dateLimite }` |
| POST | `/tentatives/:tentativeId/soumettre` | SOUMISE, `dateFin`, `dureeEffective` → 200 `{ …, nbQuestions, nbReponses }` (sans score : US-QCM-08) |
| GET | `/tentatives/:tentativeId` | (existant) + `reponses : { questionId: optionIds[] }`, pendant le temps de passage seulement ; toujours sans effet |
| POST | `/qcm/:qcmId/tentatives` | (existant) + clé Redis `timer:{id}` posée à la création, reposée à la reprise, supprimée pour une tentative échue qu'il clôt |

Refus : **400** corps invalide (liste, UUID, doublon, champ inconnu) ou
`raison` `question_hors_tirage` | `option_hors_question` | `une_seule_option` |
`type_non_pris_en_charge` ; **404** tentative inconnue ou d'un autre
apprenant ; **409** `tentative_terminee` (avec `statut`) ou `temps_ecoule`
(avec `dateLimite`). Accès : APPRENANT seulement (403 sinon).

Audit : `QCM_SOUMIS` (nom DS-02, succès, levé si l'écriture échoue) ;
`TENTATIVE_EXPIREE` pour chaque clôture — par l'apprenant (`cause:
echeance_depassee_a_la_sauvegarde` / `…_a_la_soumission`) ou par le système
(`cause: balayage`, sans acteur, `apprenantId` dans les détails). Aucun audit
par sauvegarde (une ligne par clic n'apprendrait rien).

## Flux
1. **Enregistrer** (une transaction) : `SELECT … FOR UPDATE` sur MA tentative
   → `SELECT clock_timestamp()` (l'heure APRÈS le verrou) → terminée : 409 ;
   échéance atteinte : clôture ABANDONNEE_TIMER, `dateFin = dateLimite`,
   COMMIT, puis audit, suppression de la clé, 409 `temps_ecoule` → question
   dans MON plan, options dans le plan de la question, une seule pour un QCU
   ou un Vrai/Faux → `INSERT … ON CONFLICT (tentative_id, question_id) DO
   UPDATE` puis options remplacées (ou ligne supprimée pour `[]`) → clé Redis
   reposée à la même échéance.
2. **Soumettre** : mêmes contrôles 1 à 3, puis SOUMISE à l'heure de la base,
   `dureeEffective`, audit `QCM_SOUMIS`, clé supprimée.
3. **Balayer** (toutes les 60 s, hors test) : `UPDATE tentatives_qcm SET
   statut = 'ABANDONNEE_TIMER', date_fin = date_limite, … WHERE statut =
   'EN_COURS' AND date_limite <= now() - 30 s RETURNING …` → un audit et une
   suppression de clé par ligne renvoyée.
4. **Interface** : chaque changement met à jour la sélection et programme
   l'envoi 600 ms plus tard ; chaque réponse du serveur recale le compte à
   rebours ; « Soumettre » ouvre la confirmation, envoie ce qui attend,
   renvoie ce qui a échoué, puis soumet ; un 409 `temps_ecoule` ou 00:00 fait
   passer la page en « Temps écoulé ».

## Décisions
Tableau D validé avant de coder (D1–D15, options recommandées).
- **D1 — `date_limite` décide, Redis est un miroir.** Une seule horloge
  (US-QCM-05 D12). La clé `timer:{id}` expire à l'instant ABSOLU de l'échéance
  (`SET … PXAT`) : la reposer ne rallonge jamais le temps, et une clé perdue
  (redémarrage, éviction) est recréée à l'identique. Une panne de Redis est
  journalisée, jamais remontée à l'apprenant.
- **D2 — Clôture à chaque écriture + balayage de 60 s dans l'API**, sans
  nouvelle dépendance : une requête conditionnelle, sûre avec plusieurs
  instances (une ligne déjà clôturée n'est plus EN_COURS, un seul audit). Les
  notifications d'expiration de Redis sont perdues quand l'API est arrêtée.
- **D3 — `PUT /tentatives/:tentativeId/reponses/:questionId` (écart avec
  DS-02 `PATCH /qcm/tentative/:id/reponse`).** Même famille de routes que la
  consultation ; remplacement entier, donc renvoyer la même requête ne change
  rien.
- **D4 — Codes des refus (écart avec DS-02 : 403 `timer_expire`).** 409
  `temps_ecoule`, cohérent avec les 409 d'US-QCM-05 ; 404 pour la tentative
  d'un autre (non révélée) ; 400 pour une réponse incohérente avec le tirage.
- **D5 — Enregistrement à chaque changement, 600 ms après le dernier (écart
  avec « toutes les 10 s » du Backlog et d'ET-02).** Rien ne se perd entre
  deux tops ; l'état de chaque question est visible.
- **D6 — Échéance : ABANDONNEE_TIMER, `dateFin = dateLimite` (écart avec DS-02
  `dateFin = NOW()`)**, réponses conservées pour la notation (US-QCM-08).
- **D7 — Soumission manuelle dans cette story** (QCM07-3 nomme SOUMISE) ;
  le score arrive avec US-QCM-08.
- **D8 — Restauration après rechargement** par `reponses` dans la
  consultation, qui reste en lecture seule.
- **D9 — Concurrence.** Enregistrement et soumission verrouillent la ligne de
  la tentative et relisent statut et heure sous le verrou ; l'heure est
  `clock_timestamp()` et non `now()`, qui date du début de la transaction et
  vieillirait pendant l'attente du verrou. Index unique : une ligne par
  question.
- **D10 — UI** : champs actifs, état par question, soumission confirmée,
  états de fin.
- **D11 — Délai de grâce de 30 s pour le balayage.** L'API de développement
  tourne sur la même base que les tests e2e : sans grâce, son balayage
  pouvait clore une tentative qu'un test venait d'échoir et rendre le test
  instable. Les tests d'échéance utilisent `now() - 1 s`, ceux du balayage
  `now() - 1 h`, et vérifient l'état final. Variable
  `MINUTERIE_BALAYAGE_ACTIF` (facultative, vraie par défaut) ; toujours
  désactivé quand `NODE_ENV=test`.
- **D12 — Clôture par le balayage tracée sans acteur** : c'est le système qui
  agit ; l'apprenant est dans les détails.
- **D13 — `[]` supprime la ligne** : pas de ligne = question sans réponse,
  plus simple à noter.
- **D14 — `REPONSE_COURTE` / `ASSOCIATION` refusés (400)** : défensif, aucun
  écran ne les crée encore.
- **D15 — La consultation ne clôt rien** (journal 30, D14) : la page affiche
  « Temps écoulé » d'après l'échéance ; la clôture vient d'une écriture ou du
  balayage.
- **Ajout UI : jamais de soumission avec une réponse non enregistrée.** Les
  envois en attente partent tout de suite, les échecs sont renvoyés ; s'il en
  reste, la modale l'indique et la tentative n'est pas soumise.
- **Ajout UI : chaque envoi est numéroté par question** : une réponse lente
  arrivée après une plus récente ne remplace pas son état.

## Fichiers
- `apps/api/src/modules/tentatives/` : `tentative-passage.regles.ts`,
  `tentative-minuterie.service.ts`, `tentative-passage.service.ts`,
  `tentative-balayage.service.ts`, `dto/enregistrer-reponse.dto.ts` et leurs
  4 specs (nouveaux) ; `tentative-demarrage.service.ts` (+ spec) (minuterie) ;
  `tentative-consultation.service.ts` (+ spec) (`reponses`) ;
  `tentatives.controller.ts` (2 routes, Swagger) ; `tentatives.module.ts`
- `apps/api/src/config/configuration.ts` (section `minuterie`),
  `config/env.validation.ts` (`MINUTERIE_BALAYAGE_ACTIF`) ; `.env.example`
  (ligne commentée)
- `apps/api/test/tentative-passage.e2e-spec.ts` (nouveau, marqueur
  `E2E-REPONSE`)
- `apps/web/src/app/tentatives/[id]/page.tsx` ; `apps/web/src/lib/api.ts`
  (`enregistrerReponse`, `soumettreTentative`, `PassageRefuse`, types) ;
  `lib/format.ts` (`sansReponseFr`) ; `app/globals.css`

## Incidents
- **Soumission possible malgré une réponse non enregistrée (trouvé dans le
  navigateur, avant livraison).** Une sauvegarde déjà en échec n'était plus
  « en cours » : « Soumettre » ne l'attendait pas et partait quand même.
  Corrigé : les questions en échec sont suivies, renvoyées avant la
  soumission, et la soumission est bloquée s'il en reste (scénario rejoué :
  coupure réseau → soumission refusée, base EN_COURS → « Réessayer » →
  soumise).
- **Une suite verte du premier coup ne prouve pas la protection.** Le test de
  chevauchement est forcé (les UPDATE sur `tentatives_qcm` bloqués 1 s : la
  soumission prend le verrou de la ligne puis attend, la sauvegarde arrive
  derrière) ; vérifié par mutation — sans le verrou de la ligne, la
  sauvegarde passe (200) après la soumission et le test échoue.
- **Prettier lancé sur tout le dossier `tentatives/`.** Vérifié fichier par
  fichier contre l'original : seuls les fichiers de la story ont changé.
- **Données de démonstration pour le navigateur** : le compte apprenant semé
  par SQL doit avoir `profil_complet = true`, sinon la carte de complétion du
  profil (US-AUTH-15) couvre la page.

## Vérification
- **Lint** : propre. **Tests unitaires** : 32 suites, 413 tests (+4 suites,
  +53) — règles (tirage, options, une seule option, types, échéance exacte,
  durée), minuterie (`PXAT`, rien pour une échéance passée, panne sans effet),
  enregistrement et soumission (verrou puis heure, 404, 409 terminée, 409
  temps écoulé avec clôture validée, 400, `[]`, audit, Redis), balayage
  (requête, grâce, audit système, minuteur et désactivation), démarrage et
  consultation adaptés.
- **e2e** : 19 suites, 253 tests, dont `tentative-passage` (20) — clé Redis
  et `PEXPIRETIME` = échéance, reposée à l'identique à la reprise, supprimée à
  la soumission ; enregistrement, remplacement (une ligne), restauration,
  ordre du tirage, effacement ; tous les 400 ; 404 autre apprenant, 403
  formateur, 401 ; aucune bonne réponse renvoyée ; soumission + audit + 409
  ensuite ; temps écoulé à la sauvegarde et à la soumission ; balayage
  sélectif ; chevauchement forcé. Suite rejouée deux fois de suite : verte
  (nettoyage avant et après, audit purgé par compte et par tentative).
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; parcours joué
  dans Chromium, bureau 1280 px et mobile 390 px — réponses, rechargement
  (sélection restaurée), « 1 question sans réponse », confirmation,
  soumission ; échéance reculée côté base pendant que la page affiche encore
  du temps (409 → « Temps écoulé », base ABANDONNEE_TIMER) ; compte à rebours
  jusqu'à 00:00 ; coupure réseau → « Non enregistré — Réessayer » ; aucun
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
`migration:run`, puis e2e — la nouvelle suite s'y ajoute ; `NODE_ENV=test`
(posé par Jest) y désactive le balayage. Le front reste hors CI (dette
Sprint 1) : vérification manuelle ci-dessus.

## Suites
- US-QCM-08 : notation des tentatives SOUMISE et ABANDONNEE_TIMER sur les
  seules questions du plan (pas de ligne = 0 point), passage NOTEE immuable ;
  le balayage et la soumission pourront la déclencher.
- US-QCM-10 (Sprint 3) : verrou multi-appareil `session_qcm:{apprenantId}:{qcmId}`.
- DS-02 à aligner : routes `PUT …/reponses/:questionId` et
  `POST /tentatives/:id/soumettre`, 409 `temps_ecoule`, `dateFin =
  dateLimite`, minuterie en `PXAT`. Sprint 2 Backlog §7 : la minuterie ne
  vient pas d'ADR-04 (qui ne la décrit pas) mais de DS-02 et du Backlog.
