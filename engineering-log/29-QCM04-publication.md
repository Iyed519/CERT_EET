# US-QCM-04 — Publier un QCM

## En une phrase
Le formateur affecté publie un QCM complet — au moins une question, une
configuration anti-fraude, un tirage possible, une fermeture encore à venir — ;
le serveur revérifie tout au moment de publier, sous verrou, passe le QCM en
PUBLIE et le journalise (`QCM_PUBLIE`) ; l'apprenant inscrit le voit alors dans
« Mon espace » avec sa fenêtre d'ouverture (à venir, ouverte, fermée), et un QCM
publié ne peut plus perdre les questions dont il a besoin.

## Découpage
- **A — API.** `QcmPublicationService` + règles pures
  (`qcm-publication.regles.ts`), route `PATCH /qcm/:qcmId/publier`, garde sur
  le retrait d'une question d'un QCM publié, fenêtre dans « Mon espace » ;
  tests unitaires et e2e.
- **B — UI.** Section « Publication » de l'éditeur (conditions cochées,
  confirmation, rappel de la fenêtre), « Retirer » désactivé quand il le faut,
  fenêtre de chaque QCM dans « Mon espace ».
- **C — Journal + PR.**

Aucune migration, aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| PATCH | `/qcm/:qcmId/publier` | Vérifie la complétude, passe le QCM en PUBLIE, renvoie son détail |
| DELETE | `/qcm/:qcmId/questions/:questionId` | (existant) refusé si un QCM publié passerait sous 1 question ou sous son tirage |
| GET | `/formations/:formationId/mon-espace` | (existant) chaque QCM porte `dateOuverture`, `dateFermeture`, `fenetre` |

Accès : FORMATEUR **affecté** à la formation et ADMINISTRATEUR (garde
d'US-AUTH-16 sur `qcmId`). Codes : **401** · **403** rôle ou non affecté (audit
`ACCES_RESSOURCE_REFUSE`) · **404** QCM inconnu · **409** « QCM incomplet pour
publication » (motif précis), fenêtre close, déjà publié, formation archivée,
retrait qui rendrait un QCM publié impubliable.

Action d'audit : `QCM_PUBLIE` (cible = le QCM) avec le statut avant / après, le
nombre de questions et les dates de la fenêtre.

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (FORMATEUR, ADMINISTRATEUR) →
   `FormateurDeLaFormationGuard` (QCM → module → formation → affectation) →
   service. Pas de corps.
2. **Publication.** QCM chargé (404) → formation chargée pour écriture (409 si
   archivée) → **transaction** : ligne du QCM verrouillée
   (`pessimistic_write`) → déjà publié (409) → nombre de questions et
   configuration lus sous le verrou → `verifierPublication` (409, un motif par
   règle) → statut PUBLIE → hors transaction, audit → détail renvoyé.
3. **Retrait d'une question.** Même verrou sur la ligne du QCM ; s'il est
   publié, `verifierRetraitQuestion` (au moins 1 question, au moins le tirage)
   avant de supprimer.
4. **Mon espace.** Les QCM publiés sont chargés avec les seules dates de leur
   configuration ; `etatFenetre` calcule A_VENIR / OUVERTE / FERMEE à l'instant
   de la requête.

## Décisions
- **409 plutôt que 400 (écart avec DS-12).** DS-12 renvoie 400 « QCM incomplet
  pour publication » ; la requête n'a pas de corps, c'est l'**état** du QCM qui
  bloque — même code que « QCM sans question » d'US-QCM-03. Le libellé du
  Backlog est gardé, suivi du motif précis : « … : ajoutez au moins une
  question. », « … : configurez les paramètres anti-fraude. », « … : le tirage
  prévoit K questions, le QCM n'en contient que N. … ».
- **Tout est revérifié au moment de publier.** La configuration a été validée
  à son enregistrement, mais depuis une question a pu être retirée (tirage
  devenu impossible) et le temps a passé (fermeture dépassée → 409 « fenêtre
  close : repoussez la date de fermeture »).
- **Verrou sur la ligne du QCM.** Deux clics simultanés publieraient deux fois
  (deux traces d'audit) ; un retrait concurrent pourrait vider le QCM pendant sa
  publication. Les deux opérations verrouillent la même ligne et s'exécutent
  l'une après l'autre. Test e2e : 5 publications simultanées → un 200, quatre
  409, une trace ; **retiré le verrou, ce test échoue**.
- **Un QCM publié reste publiable.** Les règles d'US-QCM-01 permettent de
  retirer des questions jusqu'à la première tentative ; sur un QCM publié, un
  retrait qui laisserait 0 question, ou moins que le tirage, est refusé (409).
- **Règles dans un fichier à part** (`qcm-publication.regles.ts`, fonctions
  pures) : `QcmService` et `QcmPublicationService` les partagent sans
  s'importer mutuellement (dépendance circulaire évitée pour l'injection).
- **« Visible dès l'ouverture de la fenêtre » (écart assumé avec le
  Backlog).** Le QCM apparaît dans « Mon espace » dès sa publication, avec ses
  dates : « Ouvre le … », « Ouvert jusqu'au … », « Fermé depuis le … ».
  L'apprenant doit savoir quand passer l'évaluation ; seuls le titre, la
  description et les dates sortent (ni questions, ni autres paramètres). Le
  contrôle réel reste côté serveur : US-QCM-05 refusera de démarrer une
  tentative hors fenêtre.
- **Pas de dépublication** : aucun document ne la décrit ; hors périmètre.
- **UI** : les conditions sont vérifiées dans le navigateur pour guider
  (bouton grisé tant qu'une manque), le serveur tranche et son message exact
  s'affiche dans la confirmation ; « Retirer » est désactivé avec la raison au
  survol quand le serveur le refuserait.

## Fichiers
- `apps/api/src/modules/qcm/` : `qcm-publication.regles.ts`,
  `qcm-publication.service.ts` (+ spec) (nouveaux), `qcm.service.ts` (garde
  sur le retrait), `qcm.controller.ts` (route), `qcm.module.ts` (service)
- `apps/api/src/modules/inscriptions/espace-formation.service.ts` (+ spec) :
  dates et état de la fenêtre, fonction `etatFenetre`
- `apps/api/test/qcm-publication.e2e-spec.ts` (nouveau, marqueur
  `E2E-QCMPUB`), `apps/api/test/espace-formation.e2e-spec.ts` (fenêtre)
- `apps/web/src/app/formateur/qcm/[id]/page.tsx` (section Publication)
- `apps/web/src/app/mes-inscriptions/[formationId]/page.tsx` (fenêtre)
- `apps/web/src/lib/api.ts` (`publishQcm`, `EtatFenetre`), `lib/format.ts`
  (`fenetreQcmFr`, `LIBELLES_FENETRE`), `app/globals.css`

## Incidents
- **Mise en page mobile de l'éditeur de QCM** (depuis US-QCM-01) : avec quatre
  boutons d'action, l'énoncé était écrasé à un mot par ligne. Corrigé : sous
  560 px, l'énoncé prend la largeur et les boutons passent dessous.
- **« Mon espace » e2e** : l'égalité stricte sur un QCM a dû intégrer les trois
  nouveaux champs ; le quiz d'intro reçoit une configuration (fenêtre
  ouverte), le second n'en a pas (`fenetre: null`).
- **Aucune route ne fait encore passer le temps** : la fenêtre close est
  simulée en modifiant la configuration directement en base.

## Vérification
- **Lint** : propre. **Tests unitaires** : 24 suites, 301 tests (+18 : chaque
  règle de complétude avec son message et dans l'ordre, règle de retrait,
  publication + audit, déjà publié et incomplet sans rien écrire, 404 / 409
  archivée, état de la fenêtre aux bornes, champs de « Mon espace »).
- **e2e** : 16 suites, 208 tests, dont `qcm-publication` (12) — 409 sans
  question, sans configuration, tirage trop grand après retrait, fenêtre
  close ; 403 non affecté et apprenant (statut inchangé) ; QCM invisible de
  l'apprenant avant publication ; 200 + audit ; 409 seconde publication ;
  visible ensuite, fenêtre « à venir » ; retrait permis puis refusé sous le
  tirage ; dernière question non retirable ; 5 publications simultanées → une
  seule réussit.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; parcours joué
  dans un navigateur — brouillon (conditions manquantes, Publier grisé), QCM
  configuré (tout coché), confirmation puis « Publié » et rappel de la
  fenêtre, retrait permis puis bloqué, « Mon espace » avec les trois états de
  fenêtre ; mobile.

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
- US-QCM-05 : démarrer une tentative — QCM publié, maintenant dans la fenêtre,
  tentatives et délai respectés, inscription active ; le bouton « Commencer »
  s'active.
- US-QCM-06 à 08 : randomisation et tirage, minuterie serveur, notation.
- Dépublication : à décider si le besoin apparaît (que deviennent les
  tentatives en cours ?).
