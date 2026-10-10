# US-AUTH-16 — Autorisation par ressource (formateur ↔ formations affectées)

## En une phrase
Un formateur n'agit plus que sur les formations auxquelles il est affecté :
un garde réutilisable, `@FormateurDeLaFormation`, vérifie l'affectation
(US-FORM-03), refuse en 403 avec audit `ACCES_RESSOURCE_REFUSE` sinon, et
laisse passer l'administrateur ; le formateur obtient son premier écran,
« Mes formations ».

## Découpage
- **A — API.** Garde + décorateur + service de résolution (formation, module,
  QCM → formation) ; routes `/formateur/formations` ; audit ; tests unitaires
  et e2e.
- **B — UI.** Lien « Mes formations » dans l'en-tête (formateurs seulement),
  liste et fiche d'une formation en lecture.
- **C — Journal + PR.**

Aucune migration, aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Accès | Effet |
|---|---|---|---|
| GET | `/formateur/formations` | FORMATEUR | Mes formations affectées, tous statuts, la plus récemment affectée d'abord |
| GET | `/formateur/formations/:formationId` | FORMATEUR affecté, ADMINISTRATEUR | Formation + modules triés, tous statuts — protégée par `@FormateurDeLaFormation` |

Codes : **400** identifiant mal formé · **401** non authentifié · **403** rôle
insuffisant (apprenant ; administrateur sur la liste), ou formateur non affecté
(avec audit) · **404** formation introuvable.

Action d'audit : `ACCES_RESSOURCE_REFUSE` (acteur = formateur, cible = la
formation, résultat `Échec`, détail : type et identifiant de la ressource,
méthode, route).

## Flux
1. **Requête sur une route protégée.** `JwtAuthGuard` (session) → `RolesGuard`
   (rôle) → `FormateurDeLaFormationGuard` (ressource), dans cet ordre.
2. **Le garde.** Administrateur → passe, sans lecture en base. Autre rôle que
   formateur → 403. Identifiant de la ressource mal formé → 400. Ressource
   inconnue → 404. Sinon il remonte à la formation (`formation` directement,
   `module` → sa formation, `qcm` → son module → sa formation) et cherche la
   ligne `(formation, formateur)` dans `formation_formateurs` : présente →
   passe ; absente → audit puis 403.
3. **« Mes formations ».** La liste ne lit que les affectations du formateur
   connecté ; le détail est servi derrière le garde.

## Décisions
- **Garde déclaratif plutôt que contrôle dans le service** (DS-12 place la
  vérification dans le service ; le Sprint Backlog demande un garde) : posé
  par décorateur, réutilisable, testé une fois.
- **Un seul décorateur, trois chemins.** `@FormateurDeLaFormation({ formationId
  | moduleId | qcmId: '<nom du paramètre>' })`. Les routes QCM (US-QCM-01) ne
  feront qu'ajouter la ligne : la remontée QCM → module → formation est déjà
  écrite et testée.
- **Pas encore de route QCM** (AUTH16-2 demandait de brancher le garde sur
  elles) : je l'ai branché sur la première route qui en a besoin, le détail
  d'une formation côté formateur. Le chemin QCM est couvert par les tests
  unitaires et par un test e2e qui appelle le service sur la vraie base.
- **404 pour une ressource inconnue, 403 pour une ressource d'autrui.** Le
  backlog exige le 403 + audit explicitement.
- **Le garde revérifie le rôle.** RolesGuard refuse déjà un apprenant, mais un
  compte rétrogradé garde ses lignes d'affectation (journal 23) : le garde
  n'accepte que FORMATEUR, même sur une route qui oublierait `@Roles`.
- **Validation de l'identifiant dans le garde.** Un garde s'exécute AVANT les
  pipes : `ParseUUIDPipe` n'a pas encore tourné, et un identifiant invalide
  ferait échouer la requête SQL (500). Le garde renvoie donc lui-même le 400.
- **L'audit ne bloque jamais le refus.** Si l'écriture d'audit échoue, l'échec
  est journalisé et la réponse reste un 403.
- **Espace dédié `/formateur/formations`** plutôt qu'élargir le catalogue
  `/formations`, qui reste réservé aux formations OUVERTE. Le formateur voit
  ses formations fermées et archivées (en lecture) ; l'administrateur n'a pas
  de « mes formations » (403 sur la liste) mais accède à tout détail.
- **Le formateur est en lecture seule ici.** Les écrans d'action arrivent avec
  les évaluations (US-QCM-01, 03, 04). Décision produit du 10/10/2026 : le
  formateur affecté pourra modifier le **contenu pédagogique** de ses
  formations (description, objectifs, prérequis, modules) — nouvelle story
  **US-FORM-04** ; les réglages **institutionnels** (titre, dates, durée,
  capacité, seuil de certification, modèle de certificat, statut,
  affectations) restent à l'administrateur, car la crédibilité du certificat
  repose sur eux.
- **Clé et type partagés dans un fichier à part**
  (`formateur-de-la-formation.constants.ts`) : le décorateur importe le garde,
  le garde lit la clé ; sans ce fichier, les deux s'importeraient l'un l'autre.
- **Exports de FormationsModule** : le garde et son service sont exportés ; un
  module qui pose le décorateur (QCM) importera FormationsModule.

## Fichiers
- `apps/api/src/modules/formations/autorisation/` (nouveau) :
  `formateur-de-la-formation.constants.ts`, `.decorator.ts`, `.guard.ts`
  (+ spec), `autorisation-ressource.service.ts`
- `apps/api/src/modules/formations/` : `formateur-formations.service.ts`
  (+ spec), `formateur-formations.controller.ts`, `formations.module.ts`,
  `formations.service.ts` (`versFormationVue` exportée, comportement inchangé)
- `apps/api/src/main.ts` (tag Swagger `formateur`)
- `apps/api/test/formateur-formations.e2e-spec.ts`
- `apps/web/src/app/formateur/formations/page.tsx`,
  `apps/web/src/app/formateur/formations/[id]/page.tsx` (nouveaux),
  `components/FormateurNav.tsx` (nouveau), `app/layout.tsx` (lien),
  `lib/api.ts` (client), `app/globals.css` (styles)

## Incidents
- **« Le formateur ne voit rien » (fin d'US-FORM-03).** Pas un bug : aucune
  page formateur n'existait. Cette story crée la première ; le besoin
  d'édition par le formateur a été arbitré en US-FORM-04 (voir Décisions).
- **Deux refus tracés pour une seule visite, en dev.** En mode développement,
  React (`reactStrictMode`) exécute deux fois le chargement de la page : la
  fiche d'une formation non affectée produit deux requêtes, donc deux lignes
  `ACCES_RESSOURCE_REFUSE`. Une build de production n'en envoie qu'une. Je ne
  « corrige » pas côté serveur : chaque requête refusée doit rester tracée.
- **Liens de l'en-tête peu lisibles.** Ils sont vert foncé sur le bandeau vert ;
  le nouveau lien « Mes formations » se repère mal. Signalé, laissé en l'état
  par choix (style existant).

## Vérification
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 19 suites,
  200 tests (+13 garde, +4 service formateur).
- **e2e** : 11 suites, 138 tests, dont `formateur-formations` (11) sur
  l'application réelle — 401 ; 403 apprenant et admin sur la liste ; SES
  formations seulement, tous statuts ; détail fermé visible du formateur
  affecté alors que le catalogue renvoie 404 ; 403 + audit pour un non
  affecté ; admin sans audit ; 404 et 400 sans audit ; retrait de
  l'affectation = accès coupé immédiatement ; remontée formation / module /
  QCM sur la vraie base.
- **Swagger** : tag `formateur`, deux routes avec leurs codes et le cadenas.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` et `next build` propres ;
  parcours joué dans un navigateur (lien d'en-tête → liste → fiche d'une
  formation ouverte puis fermée → URL d'une formation non affectée refusée →
  apprenant sans lien et refusé).

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
Pipeline inchangé (scope `apps/api`) : lint, tests unitaires, `migration:run`,
puis e2e — la nouvelle suite s'y ajoute. Le front reste hors CI (dette
Sprint 1) : vérification manuelle ci-dessus.

## Suites
- US-INSC-01 / US-INSC-04 : catalogue, inscription et accès aux modules côté
  apprenant.
- US-QCM-01 : premières routes d'évaluation ; elles posent
  `@FormateurDeLaFormation({ moduleId | qcmId })` et importent
  FormationsModule. Trancher alors `POST /qcm` (DS-12) contre
  `POST /modules/:id/qcm` (Sprint Backlog).
- US-FORM-04 (nouvelle, stretch) : le formateur affecté modifie le contenu
  pédagogique de ses formations.
- US-SUIVI-01 (plus tard) : même garde pour les données de suivi.
