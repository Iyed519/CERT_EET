# US-QCM-05 — Démarrer une tentative (contrôle serveur)

## En une phrase
L'apprenant inscrit démarre une tentative de QCM : le serveur vérifie, sous
verrou et avec sa seule horloge, que le QCM est publié, que l'inscription est
active, que l'instant est dans la fenêtre, qu'il reste une tentative et que le
délai depuis la précédente est respecté ; il crée alors la tentative EN_COURS
avec une échéance qui ne dépasse jamais la fermeture, ou refuse avec le motif
précis et la date de réouverture ; une tentative en cours est reprise au lieu
d'être dupliquée, et la page de tentative affiche un compte à rebours calé sur
l'heure du serveur.

## Découpage
- **A — API.** `TentativeDemarrageService` + règles pures
  (`tentative-demarrage.regles.ts`), route `POST /qcm/:qcmId/tentatives`,
  nouveau module `tentatives` ; tests unitaires et e2e.
- **B — API (complément, D13/D14) + UI.** « Mon espace » donne la durée, le
  nombre de tentatives et la tentative à reprendre ; `GET
  /tentatives/:tentativeId` en lecture seule ; bouton « Commencer » /
  « Nouvelle tentative » / « Reprendre », modale de confirmation, page
  `/tentatives/[id]`.
- **C — Journal + PR.**

Aucune migration, aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| POST | `/qcm/:qcmId/tentatives` | Démarre une tentative (201) ou reprend celle en cours (200) |
| GET | `/tentatives/:tentativeId` | Une de mes tentatives, avec l'heure du serveur (`maintenant`) |
| GET | `/formations/:formationId/mon-espace` | (existant) chaque QCM porte aussi `dureeMaxMinutes`, `nbTentativesMax`, `nbTentativesPassees`, `tentativeEnCoursId` |

Accès : APPRENANT seulement (`@Roles` de classe sur un contrôleur à part de
`QcmController`, réservé aux formateurs et administrateurs) ; l'apprenant est
toujours celui du jeton. Codes du démarrage : **401** · **403** rôle, non
inscrit, inscription suspendue ou terminée (audit `ACCES_RESSOURCE_REFUSE`) ·
**404** QCM inconnu, brouillon ou non publié · **409** refus avec `message`,
`raison` (`hors_fenetre` · `tentatives_epuisees` · `delai_non_respecte`) et
`dateReouverture`. Consultation : **404** pour une tentative inconnue ou celle
d'un autre apprenant (même réponse).

Actions d'audit : `TENTATIVE_DEMARREE` — Succès (cible = la tentative, avec
QCM, rang, début, échéance) ou Échec (cible = le QCM, avec motif, date de
réouverture, tentatives passées / autorisées) ; `TENTATIVE_EXPIREE` (cible =
la tentative clôturée). Une reprise n'est pas tracée.

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (APPRENANT) → service. Pas de
   corps.
2. **Hors transaction.** QCM chargé avec son module et sa configuration : 404
   s'il n'est pas PUBLIÉ → inscription à la formation du QCM : absente,
   SUSPENDUE ou TERMINEE → 403 tracé.
3. **Transaction.** Ligne d'inscription verrouillée (`pessimistic_write`,
   statut revérifié) → `SELECT now()` (l'horloge de toutes les règles) →
   tentative EN_COURS : encore valide → **reprise** ; échéance passée →
   clôturée ABANDONNEE_TIMER à son échéance → `verifierFenetre` →
   `verifierQuota` → `verifierDelai` → création EN_COURS, échéance =
   `calculerDateLimite`. Un refus est **renvoyé** par la transaction, pas levé
   dedans : la clôture d'une tentative expirée est validée même si le
   démarrage est ensuite refusé.
4. **Après.** Audits, puis 409 avec le motif, 201 (création) ou 200 (reprise).
   Une violation de l'index unique (23505) est traitée comme une reprise.
5. **Interface.** « Mon espace » → modale (durée, « Tentative n sur max »,
   fermeture, avertissement) → POST → `/tentatives/[id]` → GET : compte à
   rebours jusqu'à l'échéance, « Temps écoulé » ensuite.

## Décisions
Tableau D validé avant de coder (D1–D12), complété à l'étape UI (D13–D14).
- **D1 — `POST /qcm/:qcmId/tentatives` (Sprint Backlog) plutôt que `GET
  /qcm/:qcmId/acces` (DS-02, DS-09).** La requête crée une ressource ; un GET
  ne doit pas avoir d'effet de bord. DS-09 renvoyait même 200 avec la
  tentative sur ce GET.
- **D2 — 409 pour la fenêtre, le quota et le délai (écart avec DS-02 : 403).**
  C'est l'état du QCM ou de l'historique qui bloque, comme pour US-QCM-03/04 ;
  403 reste réservé aux droits (inscription). Corps : `message` français +
  `raison` (codes de DS-02) + `dateReouverture`.
- **D3 — Reprise au lieu de refus « session active ailleurs ».** Un
  rechargement ne doit pas bloquer l'apprenant hors de sa propre tentative ;
  la transition « déconnexion + reprise → EnCours » figure dans
  `Cert_EET_Diagrammes_UML_Necessaires.md` §4.2. Le vrai blocage multi-appareil
  (verrou Redis, `blocageSessionsMultiples`) reste à US-QCM-10.
- **D4 — Périmètre.** La tentative est créée sans questions : tirage et
  `planTirage` = US-QCM-06, minuterie Redis = US-QCM-07.
- **D5 — Échéance = min(début + durée, fermeture).** Une tentative ne survit
  pas à sa fenêtre ; la modale prévient quand le QCM ferme avant la fin de la
  durée.
- **D6 — Toutes les tentatives comptent** (`COUNT(*)` de DS-02, sans filtre de
  statut) ; le délai court depuis la fin de la précédente, ou son début si elle
  n'en a pas ; délai 0 = pas de règle. Si la réouverture tombe à la fermeture
  ou après, le message le dit et ne donne pas de date.
- **D7 — Seule une inscription EN_COURS permet de démarrer.** TERMINEE garde
  la consultation (US-INSC-04) mais reçoit son propre message ; mêmes messages
  et même audit que « Mon espace » pour non inscrit et suspendue (constantes
  désormais exportées).
- **D8 / D10 — Audit `TENTATIVE_DEMARREE` en succès ET en échec.** Des
  démarrages refusés à répétition sont exactement ce que l'anti-fraude doit
  pouvoir retrouver (NF3).
- **D9 — Fenêtre [ouverture, fermeture)** : même règle que `etatFenetre`, le
  bouton et le serveur ne peuvent pas se contredire.
- **D11 — Tentative EN_COURS expirée clôturée au démarrage suivant**
  (ABANDONNEE_TIMER, `dateFin` = échéance, réponses conservées). Sans
  minuterie avant US-QCM-07, l'index unique bloquerait sinon l'apprenant pour
  toujours. Tracée `TENTATIVE_EXPIREE` (action ajoutée).
- **D12 — Une seule horloge, celle de PostgreSQL**, lue une fois par
  transaction : elle décide toutes les règles et date `date_debut`.
- **D13 — « Mon espace » donne la durée, le nombre de tentatives autorisées et
  passées, et la tentative à reprendre.** Nécessaire pour une confirmation
  honnête avant de lancer le chronomètre ; ces valeurs informent seulement, le
  serveur revérifie tout (le délai, par exemple, n'est connu que de lui).
- **D14 — `GET /tentatives/:tentativeId`, lecture seule.** La page de
  tentative survit à un rechargement ; elle porte `maintenant`, l'heure du
  serveur, d'où le navigateur déduit l'écart avec sa propre horloge : avancer
  l'heure du poste ne donne pas une seconde de plus. US-QCM-06 y ajoutera les
  questions. Une tentative échue n'y est pas clôturée (pas d'effet de bord).
- **Concurrence.** Verrou sur la ligne d'inscription (les démarrages d'un même
  apprenant passent l'un après l'autre, sans gêner les autres apprenants) +
  index unique partiel « une seule EN_COURS par (apprenant, QCM) », dont la
  violation (23505) devient une reprise. Chacune des deux protections suffit ;
  **sans les deux, le test de rafale échoue (4 × 500)**.
- **Module `tentatives` séparé de `qcm`** : rôles différents, aucune
  dépendance vers `QcmModule` ni `FormationsModule`, donc pas d'import
  circulaire ; US-QCM-06 à 08 s'y ajouteront.

## Fichiers
- `apps/api/src/modules/tentatives/` (nouveau module) :
  `tentative-demarrage.regles.ts`, `tentative-demarrage.service.ts` (+ spec),
  `tentative-consultation.service.ts` (+ spec), `tentatives.controller.ts`,
  `tentatives.module.ts`
- `apps/api/src/app.module.ts` (module enregistré)
- `apps/api/src/modules/inscriptions/espace-formation.service.ts` (+ spec) :
  messages exportés, durée / tentatives / tentative à reprendre, fonction
  `tentativeAReprendre`
- `apps/api/test/tentative-demarrage.e2e-spec.ts` (nouveau, marqueur
  `E2E-TENTDEM`), `apps/api/test/espace-formation.e2e-spec.ts` (nouveaux
  champs)
- `apps/web/src/components/DemarrageTentative.tsx` (nouveau)
- `apps/web/src/app/tentatives/[id]/page.tsx` (nouveau)
- `apps/web/src/app/mes-inscriptions/[formationId]/page.tsx` (bouton actif)
- `apps/web/src/lib/api.ts` (`demarrerTentative`, `getTentative`,
  `TentativeRefusee`), `lib/format.ts` (`dureeFr`, `compteAReboursFr`,
  `LIBELLES_TENTATIVE`), `app/globals.css`

## Incidents
- **Test de rafale qui ne prouvait rien.** Les 5 requêtes simultanées
  passaient en réalité l'une après l'autre : le test restait vert même sans
  verrou ni traduction du 23505. Corrigé : le test bloque les INSERT sur
  `tentatives_qcm` pendant 1 s (`LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE`,
  les lectures passent) ; les 5 requêtes franchissent leurs contrôles et
  attendent ensemble. Vérifié : sans les deux protections → 4 × 500.
- **Stack Docker après un redémarrage de Docker Desktop.** `restart api` a
  démarré l'API seule (il ignore `depends_on`) : base et Redis introuvables
  (`ENOTFOUND postgres`), application arrêtée, conteneur `unhealthy`, et
  `up -d` ne le recrée pas. Correction : `up -d` (base et Redis sains), puis
  `restart api`. Aucun lien avec le code.
- **En-tête mobile.** Sur la page de tentative, l'en-tête porte quatre liens
  et débordait (450 px pour 390). Il passe désormais à la ligne sous 560 px
  (toutes les pages). Dans « Mon espace », sous 560 px, le titre du QCM prend
  toute la largeur, badge et bouton passent dessous.
- **`date_debut` posée par la base** : les tests insèrent l'historique puis
  reculent `date_debut` par SQL pour simuler une tentative ancienne.

## Vérification
- **Lint** : propre. **Tests unitaires** : 26 suites, 341 tests (+40) — chaque
  règle avec son motif et son message, bornes de la fenêtre (ouverture
  incluse, fermeture exclue) et du délai (instant exact), échéance plafonnée,
  ordre des contrôles, reprise sans écriture ni audit, clôture conservée malgré
  un refus, 23505 → reprise, audit en panne sans effet sur le 409,
  consultation réservée à son apprenant, tentative à reprendre.
- **e2e** : 17 suites, 226 tests, dont `tentative-demarrage` (18) — 401, 403
  formateur, 400, 404 inconnu et brouillon ; 403 non inscrit / suspendu /
  terminé, tracés, sans tentative ; 201 + audit, échéance = début + 30 min à
  l'heure de la base ; 200 reprise sans doublon ; « Mon espace » (en cours,
  tentative à reprendre) ; GET (rang, heure du serveur, aucune bonne réponse) ;
  GET 404 pour la tentative d'un autre ; échéance plafonnée à la fermeture ;
  409 pas encore ouvert (avec date), fermé, épuisé, délai (réouverture = fin
  + 24 h) ; refus tracés ; tentative expirée clôturée puis nouvelle ; rafale.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; parcours joué
  dans Chromium, bureau 1280 px et mobile 390 px — cinq états du bouton, refus
  « délai » dans la modale avec la date, démarrage, rechargement de la page de
  tentative (le décompte continue), « Reprendre » au retour, temps écoulé
  (00:00), tentative inconnue ; aucun débordement horizontal.

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
- US-QCM-06 : tirage figé dans `planTirage` à la création, questions et
  options sans `estCorrecte`, servies par `GET /tentatives/:tentativeId`.
- US-QCM-07 : minuterie Redis, sauvegarde des réponses, clôture à
  l'échéance — le badge « En cours » d'une tentative échue (affiché jusqu'au
  démarrage suivant) disparaîtra alors à l'heure.
- US-QCM-10 (Sprint 3) : blocage multi-appareil (`blocageSessionsMultiples`).
- DS-02 et DS-09 à aligner : route `POST`, 409, reprise.
