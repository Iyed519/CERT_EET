# US-INSC-01 — S'inscrire à une formation (apprenant)

## En une phrase
Un apprenant s'inscrit lui-même, immédiatement, à une formation ouverte qui a
encore de la place : l'inscription naît EN_COURS avec la date de fin pour
échéance, la capacité ne peut jamais être dépassée (transaction + verrou sur
la formation), un email de bienvenue part au mieux, l'action est tracée
(`INSCRIPTION_CREEE`) ; côté interface, l'apprenant obtient ses premiers
écrans : catalogue, fiche d'une formation, « Mes inscriptions ».

## Découpage
- **A — API.** Module `inscriptions` (service, contrôleur), email de
  bienvenue, catalogue enrichi (places restantes, statut d'inscription) ;
  tests unitaires et e2e.
- **B — UI.** Liens d'en-tête apprenant, catalogue, fiche, modale de
  confirmation, « Mes inscriptions ».
- **C — Journal + PR.**

Aucune migration (la table `inscriptions` existe depuis le modèle de données
du Sprint 1), aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Accès | Effet |
|---|---|---|---|
| POST | `/formations/:formationId/inscriptions` | APPRENANT | Inscription EN_COURS de l'apprenant du jeton → 201 |
| GET | `/mes-inscriptions` | APPRENANT | Mes inscriptions, tous statuts, la plus récente d'abord |
| GET | `/formations`, `/formations/:id` (existants) | authentifié | + `placesRestantes` et `statutInscription` sur chaque formation |

Codes de l'inscription : **400** identifiant mal formé · **401** non
authentifié · **403** rôle autre qu'apprenant · **404** formation inconnue,
fermée ou archivée · **409** déjà inscrit, inscription suspendue (« contactez
un administrateur »), ou « Formation complète : il ne reste aucune place. »

Action d'audit : `INSCRIPTION_CREEE` (acteur = l'apprenant, cible = la
formation, détail : identifiant de l'inscription, titre, échéance, places
restantes, `notificationEnvoyee`).

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (APPRENANT) → `ParseUUIDPipe`.
   L'apprenant est toujours celui du jeton : aucune route ne prend
   d'identifiant d'apprenant.
2. **Transaction.** Lecture de la formation **avec verrou**
   (`SELECT … FOR UPDATE`) → inconnue ou non OUVERTE : 404 → inscription
   existante : 409 (message dédié si SUSPENDUE) → comptage des inscriptions
   non suspendues ≥ capacité : 409 → insertion EN_COURS, échéance = date de
   fin. Commit.
3. **Après le commit.** Email de bienvenue (au mieux), puis audit. Une
   inscription n'est annoncée que si elle existe vraiment.
4. **Catalogue.** Pour une page de formations, deux requêtes au plus : le
   nombre d'inscrits non suspendus par formation (GROUP BY) et, pour un
   apprenant, ses propres inscriptions à ces formations.

## Décisions
- **Route au pluriel** `POST /formations/:formationId/inscriptions` (Sprint
  Backlog) plutôt que `/inscription` (DS-08) : même forme que `/modules` et
  `/formateurs`, sous-ressources de la formation.
- **404 pour une formation fermée ou archivée** (DS-08 : 403) : même réponse
  que le catalogue, qui ne révèle pas l'existence d'une formation non
  ouverte (règle d'US-FORM-01).
- **409 « Formation complète »** (DS-08 : 403 « Capacité maximale
  atteinte ») : c'est un conflit d'état, pas un défaut de droits ; le libellé
  reprend celui du Product Backlog.
- **Inscription suspendue → 409 explicite.** DS-11 : seul un administrateur
  réactive une inscription suspendue ; l'apprenant ne peut pas contourner la
  suspension en se réinscrivant, et le message lui dit quoi faire.
- **Verrou sur la formation plutôt que simple comptage.** Sans verrou, deux
  transactions concurrentes comptent la même place libre. L'index unique
  (apprenant, formation) ne protège que contre la double inscription d'un
  même apprenant ; sa violation (23505) est traduite en 409.
- **Email au mieux, après le commit** (UC4) : une panne de messagerie
  n'annule pas l'inscription ; le résultat est tracé dans l'audit. Les
  notifications in-app à l'administrateur et aux formateurs (DS-08)
  attendent le centre de notifications.
- **`statutInscription` plutôt qu'un booléen « inscrit »** (écart à la
  décision B8 de l'étape 0) : même information, et l'apprenant voit aussi une
  inscription suspendue. Une formation déjà suivie reste au catalogue,
  marquée (DS-08 la masquait).
- **Confirmation avant l'inscription** côté interface : elle est immédiate
  et l'apprenant ne peut pas encore se désinscrire lui-même. En cas de
  refus, le message exact du serveur s'affiche dans la modale et la liste se
  recharge.
- **L'accès aux modules reste à US-INSC-04** : la fiche du catalogue montre
  les intitulés des modules, pas leur contenu.
- **`CroixFermeture` extraite** en composant partagé (page Formations de
  l'administration + confirmation d'inscription), comportement inchangé.

## Fichiers
- `apps/api/src/modules/inscriptions/` (nouveau) : `inscriptions.service.ts`
  (+ spec), `inscriptions.controller.ts`, `inscriptions.module.ts`
- `apps/api/src/modules/formations/` : `formations.service.ts` (places
  restantes et statut d'inscription au catalogue, `Lecteur` porte l'id),
  `formations.controller.ts`, `formations.service.spec.ts`
- `apps/api/src/mail/` : `mail.service.ts` (`sendBienvenueInscriptionEmail`)
  + spec
- `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (tag Swagger
  `inscriptions`)
- `apps/api/test/inscriptions.e2e-spec.ts` (nouveau, marqueur `E2E-INSC01`)
- `apps/web/src/app/catalogue/page.tsx`, `catalogue/[id]/page.tsx`,
  `mes-inscriptions/page.tsx` (nouveaux)
- `apps/web/src/components/` : `ApprenantNav.tsx`, `ActionInscription.tsx`,
  `ConfirmationInscription.tsx`, `CroixFermeture.tsx` (nouveaux)
- `apps/web/src/lib/format.ts` (nouveau), `lib/api.ts`, `app/layout.tsx`,
  `app/globals.css`, `app/admin/formations/page.tsx` (import de
  `CroixFermeture`)

## Incidents
- **Le test de concurrence HTTP ne prouvait rien.** Deux inscriptions
  simultanées par HTTP passaient aussi SANS le verrou : les requêtes
  n'arrivaient pas assez en même temps. J'ai ajouté une rafale de huit
  inscriptions sur trois places, en appel direct du service : sans verrou,
  six ou sept passent ; avec, exactement trois. Les deux tests sont gardés.
- **e2e en échec en local (82 tests), sans lien avec le code.** Premier
  lancement après redémarrage : chaque suite mettait ~50 s à démarrer (12
  suites compilées et démarrées en parallèle dans le conteneur), les
  `beforeAll` dépassaient le délai de 5 s de Jest et les nettoyages ne
  s'exécutaient pas. Au second lancement, seule `auth.e2e` échouait : elle ne
  nettoie qu'APRÈS ses tests, les comptes laissés par le premier lancement
  bloquaient son insertion (`duplicate key`). Relancer suffit ; en cas de
  machine chargée, `npm run test:e2e -- --runInBand`.

## Vérification
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 20
  suites, 226 tests (+18 service d'inscription, +6 catalogue, +4 email).
- **e2e** : 12 suites, 151 tests, dont `inscriptions` (13) sur
  l'application réelle — 201 nominal avec échéance et audit ; 409 déjà
  inscrit, complète, suspendue ; 404 fermée, archivée, inconnue ; 400 ; 401 ;
  403 formateur et administrateur ; dernière place disputée ; rafale de huit
  sur trois places ; « Mes inscriptions » ; places restantes et statut au
  catalogue (une inscription suspendue ne prend pas de place).
- **Swagger** : tag `inscriptions`, deux routes avec leurs codes.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` et `next build` propres ;
  parcours joué dans un navigateur — liens d'en-tête apprenant → catalogue →
  confirmation → inscription (places 18 → 17, badge « Inscrit ») → fiche
  d'une formation complète, d'une inscription suspendue → inscription depuis
  la fiche → « Mes inscriptions » ; formation remplie pendant que la modale
  est ouverte → message du serveur dans la modale, ligne passée à
  « Complète » ; formateur sans liens apprenant ni bouton « S'inscrire » ;
  affichage mobile.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : lint, tests unitaires,
`migration:run`, puis e2e — la nouvelle suite s'y ajoute. Le front reste hors
CI (dette Sprint 1) : vérification manuelle ci-dessus.

## Suites
- US-INSC-04 : accès aux modules d'une formation à laquelle l'apprenant est
  inscrit (EN_COURS), refusé si suspendue (DS-09).
- Désinscription par l'apprenant et réactivation par l'administrateur
  (DS-11).
- Notifications in-app à l'administrateur et aux formateurs à chaque
  inscription (DS-08), avec le centre de notifications.
- `auth.e2e` : nettoyer AVANT les tests comme les autres suites, pour qu'un
  lancement interrompu ne bloque pas le suivant.
- Les trois gabarits d'email dupliquent la même mise en page : à factoriser
  quand un quatrième arrivera.
