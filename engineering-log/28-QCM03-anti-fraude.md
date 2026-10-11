# US-QCM-03 — Paramètres anti-fraude d'un QCM

## En une phrase
Le formateur affecté règle, pour un QCM qui contient au moins une question,
ses paramètres anti-fraude — randomisation, tirage de K questions parmi N,
durée, fenêtre d'ouverture, tentatives, affichage du résultat, seuil et
pondération — ; le serveur vérifie la cohérence de l'ensemble, passe le QCM de
BROUILLON à NON_PUBLIE et fige ces règles dès la première tentative (seule la
fermeture peut alors être repoussée). Les paramètres sont enregistrés ici ;
leur application au passage de l'apprenant viendra avec US-QCM-05 à 08.

## Découpage
- **A — API.** `QcmConfigurationService` + `ConfigurationDto`, route
  `PUT /qcm/:qcmId/configuration`, configuration ajoutée au détail du QCM ;
  tests unitaires et e2e.
- **B — UI.** Section « Paramètres anti-fraude » dans l'éditeur de QCM
  (résumé + Configurer / Modifier), modale de configuration groupée.
- **C — Journal + PR.**

Aucune migration (table `config_anti_fraude` posée avec le modèle de
données, une ligne au plus par QCM), aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Effet |
|---|---|---|
| PUT | `/qcm/:qcmId/configuration` | Crée ou remplace la configuration ; BROUILLON → NON_PUBLIE |
| GET | `/qcm/:qcmId` | (existant) renvoie désormais `configuration` (ou `null`) |

Accès : FORMATEUR **affecté** à la formation et ADMINISTRATEUR (garde
d'US-AUTH-16 sur `qcmId`). Codes : **400** champ hors bornes ou règle croisée
non respectée · **401** · **403** rôle ou non affecté (audit
`ACCES_RESSOURCE_REFUSE`) · **404** QCM inconnu · **409** formation archivée,
QCM sans question, QCM déjà tenté (paramètre figé).

Action d'audit : `QCM_CONFIGURE` (cible = le QCM), avec l'avant / l'après des
paramètres et du statut.

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (FORMATEUR, ADMINISTRATEUR) →
   `FormateurDeLaFormationGuard` (QCM → module → formation → affectation) →
   `ValidationPipe` (chaque champ isolément : type, bornes, énumération, date
   ISO 8601) → service.
2. **Écriture.** QCM chargé (404) → formation chargée pour écriture (409 si
   archivée) → au moins une question (409) → règles croisées (400) → si le QCM
   a déjà des tentatives, comparaison avec la configuration en place (409) →
   enregistrement (fusion si elle existe, création sinon) → BROUILLON passé à
   NON_PUBLIE → audit.
3. **Lecture.** Le détail du QCM porte la configuration ; l'éditeur l'affiche
   en résumé et pré-remplit la modale avec.

## Décisions
- **Une seule route `PUT`, configuration remplacée en entier.** Un QCM a au
  plus une configuration : la créer ou la modifier est la même opération.
  Tous les champs sont obligatoires sauf `nbQuestionsTirees` (absent ou
  `null` = toutes les questions) ; pas de mise à jour partielle qui laisserait
  un ensemble incohérent.
- **Validation en deux couches** (comme US-QCM-01) : le DTO borne chaque champ
  — durée 1 à 600 min, tentatives 1 à 20, délai 0 à 720 h, seuil et
  pondération 0 à 100 % ; le service applique les règles qui croisent
  plusieurs champs, dans un ordre fixe, un message par règle : ouverture
  avant fermeture, fermeture dans le futur, fenêtre au moins aussi longue que
  la durée d'une tentative, tirage ≤ nombre de questions du QCM.
- **QCM sans question → 409**, pas 400 : la story vise « un QCM contenant des
  questions » ; le corps est valide, c'est l'état du QCM qui ne le permet pas.
- **Statut.** Le premier enregistrement fait passer le QCM de BROUILLON à
  NON_PUBLIE (prêt à publier, US-QCM-04). Un QCM déjà publié le reste : une
  reconfiguration ne le dépublie jamais.
- **QCM déjà tenté : paramètres figés, sauf la fermeture repoussée.** Les
  apprenants qui ont composé l'ont fait avec ces règles ; changer la durée, le
  seuil ou le nombre de tentatives après coup fausserait la comparaison.
  Prolonger la session ne lèse personne, l'avancer si → 409 avec le message
  « Des apprenants ont déjà passé ce QCM : ses paramètres sont figés. Seule la
  date de fermeture peut être repoussée. » La comparaison se fait champ par
  champ (dates à la milliseconde, nombres décimaux normalisés).
- **Paramètres enregistrés, pas encore appliqués.** `blocageSessionsMultiples`
  (US-QCM-10, Sprint 3), `proctoringWebcam` et `desactiverCopierColler` sont
  stockés mais sans effet serveur ; l'UI les regroupe sous « Bientôt actif »
  pour ne rien promettre.
- **Dates.** Saisie en heure locale dans le navigateur, envoyée en UTC (ISO
  8601 avec fuseau) ; le serveur refuse une date sans format strict.
- **UI en modale** plutôt qu'une page `parametres` dédiée : l'éditeur reste un
  seul écran, comme pour les questions. Groupes Randomisation, Temps,
  Tentatives, Résultat, Bientôt actif ; QCM tenté → seule la fermeture est
  saisissable ; le message exact du serveur s'affiche en cas de refus.

## Fichiers
- `apps/api/src/modules/qcm/` : `qcm-configuration.service.ts` (+ spec,
  nouveaux), `dto/configuration.dto.ts` (nouveau), `qcm.controller.ts`
  (route), `qcm.module.ts` (service, entités), `qcm.service.ts`
  (`configuration` dans le détail) + spec
- `apps/api/test/qcm-configuration.e2e-spec.ts` (nouveau, marqueur
  `E2E-QCMCONF`)
- `apps/web/src/components/ConfigurationModal.tsx` (nouveau)
- `apps/web/src/app/formateur/qcm/[id]/page.tsx` (section paramètres)
- `apps/web/src/lib/api.ts` (`ConfigurationQcm`, `configureQcm`),
  `lib/format.ts` (libellés, conversions heure locale ↔ UTC),
  `app/globals.css`

## Incidents
- **Spec de `QcmService` en échec** après l'ajout du dépôt de configuration au
  service : le module de test ne le fournissait pas. Mock ajouté.
- **Lint : variable `_ignore` inutilisée** dans l'extraction des valeurs
  (déstructuration pour retirer `updatedAt`). Réécrit avec `delete`.
- **Identifiant accentué** (`figé`) renommé `fige` ; les accents restent dans
  les commentaires et les messages.
- **Test unitaire `auth.service.spec` (mfaSetup) en dépassement de délai** sur
  le poste local lent, sans lien avec cette story ; il passe relancé seul et
  en CI.
- **Aucune route ne crée encore de tentative** (US-QCM-05) : la règle « QCM
  tenté » est testée en insérant une tentative directement en base.

## Vérification
- **Lint** : propre. **Tests unitaires** : 23 suites, 283 tests (+17 : chaque
  règle croisée avec son message, fenêtre exactement égale à la durée
  acceptée, tirage absent normalisé à `null`, création + NON_PUBLIE + audit,
  remplacement sans doublon, QCM publié jamais rétrogradé, 409 sans question
  sans rien écrire, 404 / 409 archivée, QCM tenté : fermeture repoussée
  acceptée, tout autre changement refusé).
- **e2e** : 15 suites, dont `qcm-configuration` (17) sur l'application
  réelle — 200 avec passage en NON_PUBLIE, configuration visible dans le
  détail et audit ; second enregistrement sans doublon ; 409 QCM sans
  question ; quatre règles croisées en 400 avec le message exact ; six champs
  invalides en 400 ; 403 non affecté ; QCM publié reste publié ; QCM tenté :
  fermeture repoussée 200, fermeture avancée ou autre paramètre 409.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` propres ; parcours joué
  dans un navigateur — QCM sans question (refus affiché), configuration
  complète, résumé mis à jour et statut NON_PUBLIE, modification, refus d'une
  fenêtre trop courte avec le message du serveur, QCM tenté (seule la
  fermeture saisissable).

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
- US-QCM-04 : publication — revérifier au moment de publier qu'il y a au
  moins une question, une configuration, et que `nbQuestionsTirees` ne
  dépasse pas le nombre actuel de questions (une question a pu être retirée
  depuis) ; audit `QCM_PUBLIE`.
- US-QCM-05 à 08 : appliquer la configuration au passage — fenêtre et
  tentatives au démarrage, randomisation et tirage, minuterie serveur,
  notation avec seuil et affichage du résultat.
- US-QCM-10 (Sprint 3) : blocage des sessions multiples ; proctoring et
  copier-coller à décider.
