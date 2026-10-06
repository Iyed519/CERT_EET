# US-FORM-01 — Créer et configurer une formation

## En une phrase
Un administrateur crée une formation (objectifs, capacité, seuil de
certification, modèle de certificat), la modifie et en gère les modules ; elle
naît OUVERTE, visible au catalogue pour tout utilisateur connecté, et chaque
écriture est tracée (NF3).

## Découpage
- **A — Créer et consulter (API).** `POST /admin/formations`, `GET /formations`,
  `GET /formations/:id` ; règle de visibilité admin / catalogue ; audit
  `FORMATION_CREEE`.
- **B — Configurer (API).** `PATCH /admin/formations/:id` (avant / après) et
  gestion des modules : ajout, modification, réordonnancement, suppression.
- **C — UI.** Page admin `/admin/formations` (+ onglet), formulaire de
  création / modification, modale des modules, client API.
- **D — Tests + journal + PR.**

Aucune migration (tables posées par l'enabler, journal 21), aucune dépendance
npm ajoutée.

## Endpoints
| Méthode | Route | Accès | Effet |
|---|---|---|---|
| POST | `/admin/formations` | ADMINISTRATEUR | Crée au statut OUVERTE |
| PATCH | `/admin/formations/:id` | ADMINISTRATEUR | Modifie les champs fournis |
| POST | `/admin/formations/:formationId/modules` | ADMINISTRATEUR | Ajoute un module en fin de liste |
| PATCH | `/admin/formations/:formationId/modules/:moduleId` | ADMINISTRATEUR | Titre / description |
| PUT | `/admin/formations/:formationId/modules/ordre` | ADMINISTRATEUR | Réordonne TOUS les modules |
| DELETE | `/admin/formations/:formationId/modules/:moduleId` | ADMINISTRATEUR | Supprime + renumérote (204) |
| GET | `/formations` | authentifié | Liste paginée (`statut`, `page`, `limit`) |
| GET | `/formations/:id` | authentifié | Formation + modules triés par ordre |

Codes d'erreur : **400** validation (capacité ≤ 0, seuil hors [0,100], titre
vide, dates incohérentes, champ inconnu dont `statut`, liste d'ordre
incomplète) · **403** rôle insuffisant, ou filtre sur un statut non ouvert par
un non-admin · **404** formation / module introuvable (ou formation non ouverte
pour un non-admin) · **409** formation archivée, capacité sous le nombre
d'inscrits, module portant une évaluation.

Actions d'audit : `FORMATION_CREEE`, `FORMATION_MODIFIEE`, `MODULE_CREE`,
`MODULE_MODIFIE`, `MODULE_SUPPRIME`, `MODULES_REORDONNES` (cible = la formation).

## Flux
1. **Création.** L'admin soumet le formulaire → le DTO valide champ par champ →
   le service vérifie l'ordre des dates → insertion au statut OUVERTE (imposé
   par le serveur) → audit `FORMATION_CREEE` → 201.
2. **Catalogue.** `GET /formations` : un administrateur voit tous les statuts ;
   tout autre rôle ne voit que les formations OUVERTE.
3. **Modification.** `PATCH` → formation chargée « pour écriture » (404 /
   409 archivée) → seuls les champs réellement différents sont retenus → dates
   vérifiées sur les valeurs FINALES → capacité comparée au nombre d'inscrits →
   enregistrement → audit avec l'avant et l'après.
4. **Modules.** Ajout : ordre = dernier + 1. Suppression : delete + décalage des
   suivants dans UNE transaction. Réordonnancement : la liste complète des
   identifiants devient l'ordre 1, 2, 3… dans une transaction.

## Décisions
- **Écritures sous `/admin/formations`, lectures sous `/formations`** : je suis
  DS-16 et la convention déjà en place (`/admin/users`), plutôt que le
  `POST /formations` du Sprint Backlog. Deux contrôleurs, deux protections.
- **Le statut ne vient jamais du client.** Absent des DTO : avec
  `forbidNonWhitelisted`, l'envoyer donne un 400. Clôturer / archiver sera
  US-FORM-02.
- **Visibilité : 404 plutôt que 403 sur le détail** d'une formation non ouverte
  pour un non-admin — même message qu'un identifiant inconnu, pour ne pas
  révéler son existence. En liste, un filtre explicite sur un autre statut
  donne un 403 (refus assumé plutôt que réponse silencieusement différente).
  Les apprenants inscrits et formateurs affectés verront plus large dans leurs
  stories (US-INSC-04, US-FORM-03 / US-AUTH-16).
- **PATCH minimal.** Un champ identique à l'existant n'est ni écrit ni tracé ;
  un PATCH qui ne change rien renvoie 200 sans audit. `null` vide un champ
  facultatif et est refusé (400) sur titre, capacité et seuil.
- **Capacité jamais sous le nombre d'inscrits** (409) : garde-fou posé dès
  maintenant, il servira dès US-INSC-01.
- **Formation archivée figée** (409 sur toute écriture, modules compris), via
  un point d'entrée unique `chargerPourEcriture` partagé par les deux services.
- **L'ordre des modules appartient au serveur.** Le client n'écrit jamais un
  numéro : ajout en fin, renumérotation à la suppression, réordonnancement par
  liste complète (ni oubli, ni doublon, ni module d'une autre formation → 400).
  La numérotation reste continue.
- **Un module adressé par une autre formation = 404** : le service cherche
  toujours `(moduleId, formationId)` ensemble.
- **Suppression refusée si le module porte un QCM** (409) : la FK RESTRICT
  l'interdirait, mais un message clair vaut mieux qu'une erreur de contrainte.
- **Bornes techniques** : capacité ≤ 100000, durée ≤ 10000 h — un nombre absurde
  donne un 400 au lieu d'un dépassement d'entier en base.
- **`PartialType` (Swagger)** pour les DTO de modification : une seule
  définition des règles de validation.

## Fichiers
- `apps/api/src/modules/formations/` (nouveau module) : `formations.module.ts`,
  `formations.service.ts`, `formation-modules.service.ts`,
  `admin-formations.controller.ts`, `admin-formation-modules.controller.ts`,
  `formations.controller.ts`, `dto/` (create-formation, update-formation,
  list-formations, create-module, update-module, reorder-modules) + 3 specs
- `apps/api/src/app.module.ts`, `apps/api/src/main.ts` (module + tag Swagger)
- `apps/api/test/formations.e2e-spec.ts`, `apps/api/test/formation-modules.e2e-spec.ts`
- `apps/web/src/app/admin/formations/page.tsx` (nouveau), `admin/layout.tsx`
  (onglet), `lib/api.ts` (client), `app/globals.css` (styles)

## Incidents
- **`null` et `PartialType`.** `@IsOptional()` laisse passer `null` : sans
  contrôle, `{ "titre": null }` aurait atteint la base (NOT NULL → 500). Le
  service refuse explicitement `null` sur les champs obligatoires ; couvert par
  un test e2e.
- **Collision de marqueurs entre deux suites e2e.** La suite des modules
  utilisait le marqueur `E2E-FORM01B`, que le nettoyage `LIKE 'E2E-FORM01%'` de
  la suite des formations englobait. Jest lançant les suites en parallèle, la
  première comptait 3 formations au lieu de 0, puis échouait à les supprimer
  (`FK_inscriptions_formation`, des inscriptions y étant rattachées). Invisible
  tant que chaque suite était lancée seule ; apparu au premier lancement des
  deux ensemble. Correction : marqueur `E2E-MODULES` (et e-mails
  `e2e-modules-*`). Règle retenue : un marqueur de suite n'est jamais le
  préfixe d'un autre.
- **Sortie e2e illisible en conteneur de dev.** `NODE_ENV=development` active
  la journalisation SQL de TypeORM : des centaines de lignes par suite. Lancer
  les e2e avec `-e NODE_ENV=test` (les 9 suites passent ainsi).
- **Barre d'onglets admin.** Le 4e onglet débordait sur écran étroit : la barre
  défile désormais horizontalement.

## Vérification
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 15 suites,
  159 tests (DTO, service formations, service modules).
- **e2e** : `formations` (18) + `formation-modules` (19), lancées en parallèle,
  sur l'application réelle — accès 401 / 403, validations 400, audit, visibilité, avant / après,
  capacité vs inscrits, ordre des modules, absence de résidus en base.
- **Swagger** : les 8 routes apparaissent avec leurs codes et le cadenas.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` et `next build` propres ;
  parcours complet joué dans un navigateur (créer → erreur serveur affichée →
  créer → modifier → ajouter / monter / renommer / supprimer des modules →
  filtrer).

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e -- formation
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npm run lint
```

## CI
Pipeline inchangé (scope `apps/api`) : lint, tests unitaires, `migration:run`,
puis e2e — les deux nouvelles suites s'y ajoutent. Le front reste hors CI
(dette Sprint 1) : vérification manuelle ci-dessus.

## Suites
- US-FORM-03 : affecter un formateur (table `formation_formateurs`).
- US-AUTH-16 : garde d'autorisation par ressource sur les routes d'évaluation.
- US-FORM-02 (stretch) : clôturer / archiver — la règle « archivée = figée »
  est déjà appliquée, il manque les transitions.
- Catalogue apprenant (places restantes, formateurs) avec US-INSC-01.
