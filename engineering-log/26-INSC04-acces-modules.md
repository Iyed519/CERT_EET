# US-INSC-04 — Accéder aux modules et choisir une évaluation (apprenant)

## En une phrase
L'apprenant inscrit ouvre « Mon espace » dans une formation : sa progression,
son échéance, les modules dans l'ordre et, dans chacun, les QCM publiés avec
SON avancement (à faire, en cours, réussi, échoué) — sans jamais recevoir une
question ; l'accès est ouvert par l'inscription, refusé en 403 et tracé si
l'apprenant n'est pas inscrit ou si son inscription est suspendue.

## Découpage
- **A — API.** Service `EspaceFormationService`, route
  `GET /formations/:formationId/mon-espace`, audit des refus ; tests
  unitaires et e2e.
- **B — UI.** Page « Mon espace », liens depuis « Mes inscriptions » et la
  fiche du catalogue.
- **C — Journal + PR.**

Aucune migration (QCM et tentatives existent depuis le modèle de données),
aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Accès | Effet |
|---|---|---|---|
| GET | `/formations/:formationId/mon-espace` | APPRENANT inscrit (EN_COURS ou TERMINEE) | Formation, mon inscription, modules triés, QCM publiés avec mon avancement |

Codes : **400** identifiant mal formé · **401** non authentifié · **403** rôle
autre qu'apprenant ; « Vous n’êtes pas inscrit à cette formation. » (y compris
formation inconnue) ; « … suspendue : contactez un administrateur. »

Action d'audit : `ACCES_RESSOURCE_REFUSE` (acteur = l'apprenant, cible = la
formation, résultat `Échec`, détail : ressource `inscription`, motif
`NON_INSCRIT` ou `INSCRIPTION_SUSPENDUE`, méthode, route).

## Flux
1. **Requête.** `JwtAuthGuard` → `RolesGuard` (APPRENANT) → `ParseUUIDPipe`.
2. **Inscription.** Absente → audit + 403 ; SUSPENDUE → audit + 403.
3. **Contenu.** Formation et modules triés, quel que soit le statut de la
   formation ; QCM des modules au statut PUBLIE seulement (colonnes
   d'affichage : id, titre, description) ; MES tentatives sur ces QCM.
4. **Avancement.** Par QCM : une tentative réussie → réussi ; une en cours ou
   soumise non notée → en cours ; toutes notées en échec → échoué ; aucune →
   à faire. Par module : complété si tous ses QCM publiés sont réussis, à
   faire sinon, « sans évaluation » s'il n'en a pas.

## Décisions
- **Une route, `/mon-espace` (DS-09)** plutôt que `/formations/:id/modules`
  (Sprint Backlog) : la réponse est personnelle (inscription, avancement). Les
  deux appels de DS-09 (tableau de bord, puis détail d'un module) sont
  fusionnés : un module ne porte qu'un titre, une description et ses QCM, une
  seconde requête n'apporterait rien.
- **C'est l'inscription qui ouvre l'accès**, EN_COURS ou TERMINEE (une
  formation achevée reste consultable). Une formation FERMÉE ou ARCHIVÉE
  reste accessible à ses inscrits : la fermeture arrête les inscriptions, pas
  le cours ; le passage d'un QCM sera contrôlé par US-QCM-05.
- **403 pour une formation inconnue**, avec le message « pas inscrit » : son
  existence n'est pas révélée (DS-09 : 403 si inscription absente).
- **Refus tracé**, même action que le garde d'US-AUTH-16 : tenter d'atteindre
  un contenu sans droit est un événement de sécurité (NF3). Un échec
  d'écriture d'audit est journalisé, la réponse reste un 403.
- **Lecture seule** : DS-09 recalcule `tauxAvancement` et l'écrit à chaque
  consultation. Je renvoie la valeur enregistrée ; le recalcul se fera après
  la notation d'une tentative (US-QCM-08), seul moment où elle change.
- **Pas de verrouillage de module** (« Verrouillé » dans DS-09) : aucun
  document ne définit de règle d'ordre imposé.
- **Anti-fraude** : seuls les QCM PUBLIÉS apparaissent, sans questions,
  options ni configuration ; un test e2e vérifie que la réponse n'en contient
  aucune trace.
- **« Commencer » affiché mais inactif** jusqu'à US-QCM-05 (démarrage d'une
  tentative).
- **Ateliers hors périmètre** (DS-09 étape 3B) : pas encore de modèle de
  données.

## Fichiers
- `apps/api/src/modules/inscriptions/` : `espace-formation.service.ts`
  (+ spec, nouveaux), `inscriptions.controller.ts` (route),
  `inscriptions.module.ts` (service, lecture de Formation, Qcm, TentativeQcm)
- `apps/api/src/main.ts` (tag Swagger `inscriptions`)
- `apps/api/test/espace-formation.e2e-spec.ts` (nouveau, marqueur
  `E2E-ESPACE`)
- `apps/web/src/app/mes-inscriptions/[formationId]/page.tsx` (nouveau),
  `mes-inscriptions/page.tsx` (lien vers « Mon espace »),
  `catalogue/[id]/page.tsx` (bouton « Accéder à mon espace »),
  `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Incidents
- **Badge étiré dans l'en-tête de la fiche.** À côté du nouveau bouton, le
  badge « Inscrit » prenait la hauteur du bouton (alignement par défaut des
  boutons d'en-tête). Correction CSS : badge et bouton centrés verticalement
  dans l'en-tête d'une page.
- **Pas de route pour créer un QCM ni une tentative** (US-QCM-01, US-QCM-05) :
  les tests e2e et la vérification visuelle les insèrent directement en base.

## Vérification
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 21
  suites, 244 tests (+18 : accès, refus et audit, filtre PUBLIE, champs
  exposés, règles d'avancement QCM et module).
- **e2e** : 13 suites, 157 tests, dont `espace-formation` (6) sur
  l'application réelle — formation fermée accessible à ses inscrits, modules
  triés, brouillon et non publié absents, aucune trace de question ;
  avancement personnel (réussi pour moi, à faire pour un autre inscrit) ;
  403 suspendue, non inscrit, formation inconnue, chacun tracé une fois ;
  401 ; 403 formateur ; 400.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` et `next build` propres ;
  parcours joué dans un navigateur — « Mes inscriptions » → « Mon espace »
  (progression 33 %, module complété, QCM réussi / échoué / à faire, module
  sans évaluation) ; URL d'une inscription suspendue et d'une formation non
  suivie → message du serveur ; bouton depuis la fiche du catalogue ;
  affichage mobile.

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
- US-QCM-01 / US-QCM-04 : création et publication des QCM par le formateur
  affecté ; ils apparaîtront alors dans « Mon espace ».
- US-QCM-05 : activer « Commencer » (démarrage d'une tentative, contrôles
  d'accès anti-fraude côté serveur).
- US-QCM-08 : recalcul de `tauxAvancement` après notation.
- Ateliers (DS-03) : quand leur modèle existera, ils s'ajouteront aux modules
  de « Mon espace ».
