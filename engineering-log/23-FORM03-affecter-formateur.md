# US-FORM-03 — Affecter un formateur à une formation

## En une phrase
Un administrateur affecte un ou plusieurs formateurs à une formation, les
retire, et consulte qui est affecté ; le formateur est prévenu par email et
chaque écriture est tracée (NF3). Cette affectation est la donnée que lira
l'autorisation par ressource (US-AUTH-16, ADR-11).

## Découpage
- **A — API.** Affecter, lister, retirer ; contrôles (rôle, statut, doublon,
  formation archivée) ; email ; audit ; tests unitaires et e2e.
- **B — UI.** Bouton « Formateurs » sur `/admin/formations` et sa modale ;
  client API ; croix de fermeture et bouton de fermeture rouges sur les trois
  modales de la page.
- **C — Journal + PR.**

Aucune migration (la table `formation_formateurs` vient de l'enabler,
journal 21), aucune dépendance npm ajoutée.

## Endpoints
| Méthode | Route | Accès | Effet |
|---|---|---|---|
| POST | `/admin/formations/:formationId/formateurs` | ADMINISTRATEUR | Affecte `{ formateurId }` (201) |
| GET | `/admin/formations/:formationId/formateurs` | ADMINISTRATEUR | Formateurs affectés, du plus ancien au plus récent |
| DELETE | `/admin/formations/:formationId/formateurs/:formateurId` | ADMINISTRATEUR | Retire l'affectation (204) |

Codes d'erreur : **400** identifiant mal formé, champ inconnu, compte sans le
rôle Formateur, compte non actif · **403** rôle insuffisant (un formateur ne
peut ni s'affecter ni lister) · **404** formation ou utilisateur introuvable,
formateur non affecté (au retrait) · **409** formateur déjà affecté, formation
archivée.

Actions d'audit : `FORMATEUR_AFFECTE`, `FORMATEUR_RETIRE` (cible = la
formation ; détail : formateur, titre de la formation, et pour l'affectation
`notificationEnvoyee`).

Vue renvoyée : `id` (celui du compte), `email`, `nom`, `prenom`, `role`,
`statut`, `affecteLe`.

## Flux
1. **Affectation.** L'admin choisit un formateur → formation chargée « pour
   écriture » (404 / 409 archivée) → compte chargé (404) → rôle FORMATEUR
   exigé (400) → statut ACTIF exigé (400) → déjà affecté ? (409) → insertion,
   `affecte_par` = l'administrateur du jeton → email au formateur → audit
   `FORMATEUR_AFFECTE` → 201.
2. **Liste.** Existence de la formation (404), puis jointure sur les comptes
   avec sélection explicite des colonnes : ni hash ni secret MFA ne sortent de
   la base. Lecture autorisée sur une formation archivée.
3. **Retrait.** Formation chargée « pour écriture » → affectation cherchée par
   `(formation, formateur)` (404) → suppression → audit `FORMATEUR_RETIRE` → 204.

## Décisions
- **Route sous `/admin/formations/:formationId/formateurs`** : je suis DS-16 et
  ce qu'a fait US-FORM-01, plutôt que le `POST /formations/:id/formateurs` du
  Sprint Backlog. **201** à l'affectation (une ressource est créée) là où
  DS-16 note 200 ; **204** au retrait.
- **Cette story n'écrit que l'affectation.** « Lui ouvre les droits » (critère
  nominal) se réalise en deux temps : la ligne existe ici, le garde qui la lit
  arrive avec US-AUTH-16. Conséquence assumée : connecté aujourd'hui, un
  formateur affecté ne voit rien de nouveau — l'application n'a pas encore
  d'espace formateur. Il est seulement prévenu par email.
- **Notification par email, au mieux.** UC4 (Administrateur) demande un email ;
  DS-16 écrit en plus une ligne `notifications`, table qui n'existe pas encore
  (centre de notifications, plus tard). L'email part après l'insertion : s'il
  échoue, l'affectation reste, l'échec est journalisé et l'audit porte
  `notificationEnvoyee: false`. Le bouton de l'email mène à la plateforme : il
  n'y a pas encore de page de formation côté formateur vers laquelle pointer.
- **Refus d'un non-formateur en 400**, avec un message clair (le backlog dit
  seulement « refuse ») ; même code pour un compte non actif — en attente,
  désactivé ou anonymisé, il ne peut pas se connecter.
- **Double affectation : contrôle, puis index unique.** Deux requêtes
  identiques simultanées passent toutes deux le contrôle ; c'est l'index
  `(formation, formateur)` qui tranche, et sa violation (`23505`) est traduite
  en 409 au lieu d'un 500. Couvert par un test e2e à deux requêtes parallèles.
- **L'auteur vient du jeton**, jamais du corps : `affectePar` dans la requête
  donne un 400 (`forbidNonWhitelisted`).
- **Un formateur rétrogradé ou désactivé garde sa ligne.** Je ne touche pas au
  module d'administration des comptes : la liste expose le rôle et le statut
  ACTUELS, la modale le signale, et le retrait ne vérifie ni l'un ni l'autre.
  S'il redevient formateur, il retrouve ses formations sans nouvelle
  affectation.
- **Formation archivée figée** (409 à l'affectation ET au retrait) ; une
  formation fermée accepte encore les deux — c'est le comportement de
  `chargerPourEcriture`, inchangé.
- **Retrait d'un formateur qui a déjà créé des évaluations : autorisé.** UC4
  demande une confirmation explicite et la conservation des données : la
  modale confirme au second clic, les évaluations restent, le formateur perd
  seulement le droit d'y agir (US-AUTH-16).
- **Saisies libres échappées dans l'email** (titre de la formation, prénom),
  objet replié sur une ligne.
- **Délais SMTP bornés** (5 s pour la connexion et l'accueil, 10 s
  d'inactivité) : l'email part pendant la requête, et nodemailer attend par
  défaut jusqu'à 2 minutes un serveur injoignable. Vaut pour tous les emails,
  y compris celui de l'inscription.
- **Hors périmètre, notés pour la suite** : rôle du formateur dans la
  formation (« principal / invité », marqué V2 dans UC4) ; notion de créateur
  et demandes d'ADR-11 ; colonne « Formateur(s) » dans la liste des formations
  (UC3).
- **UI.** Les candidats viennent de `GET /admin/users`, filtrés dans la page
  sur le rôle Formateur et le statut actif — pas de nouvel endpoint, le
  serveur revérifie. Les modales restent ouvertes après une action (on
  enchaîne souvent) ; une croix rouge en haut à droite et un bouton rouge en
  bas les referment, sur les trois modales de la page. Pas de bouton
  « Formateurs » sur une formation archivée.

## Fichiers
- `apps/api/src/modules/formations/` : `formation-formateurs.service.ts`
  (+ spec), `admin-formation-formateurs.controller.ts`,
  `dto/affecter-formateur.dto.ts`, `formations.module.ts` (dépôts
  `AffectationFormateur` et `User`, contrôleur, service)
- `apps/api/src/mail/` : `mail.service.ts` (`sendAffectationFormateurEmail`),
  `mail.service.spec.ts` (nouveau), `mail.module.ts` (délais)
- `apps/api/test/formation-formateurs.e2e-spec.ts`
- `apps/web/src/lib/api.ts` (client), `app/admin/formations/page.tsx`
  (modale, croix), `app/globals.css` (croix)

## Incidents
- **e2e en échec : `getaddrinfo EAI_AGAIN postgres`.** Les trois suites
  « formation » tombaient au démarrage, y compris celles d'US-FORM-01 : les
  conteneurs Postgres et Redis étaient arrêtés, et `restart api` ne relance
  pas les dépendances. Un `up -d` les a remontés mais a laissé l'API
  « unhealthy » : elle tournait déjà, en échec, et `up -d` ne redémarre pas un
  conteneur en marche. Séquence qui fonctionne : `up -d` → `restart api` →
  `up -d`.
- **Délai d'envoi d'email.** Repéré à la relecture : un serveur SMTP
  injoignable aurait retenu la requête d'affectation jusqu'à 2 minutes avant
  le 201. Mesuré après correction contre un serveur muet : échec en 5 s.
- **Message de succès trop affirmatif.** La première version de la modale
  annonçait « prévenu par email » ; or l'API ne dit pas si l'email est parti.
  Le message se limite à « est affecté à la formation ».

## Vérification
- **Lint** : `eslint --max-warnings 0` propre. **Tests unitaires** : 17 suites,
  183 tests (+19 service des affectations, +5 email).
- **e2e** : 10 suites, 127 tests, dont `formation-formateurs` (21) sur
  l'application réelle — 401 / 403 (apprenant et formateur), 400, 404, refus
  d'un non-formateur et d'un compte non actif, 409 doublon et archivée, deux
  requêtes simultanées, email en échec, audit, liste, retrait, absence de
  résidus en base. `MailService` y est remplacé par un faux.
- **Swagger** : les 3 routes apparaissent sous `admin` avec leurs codes et le
  cadenas.
- **Front (hors CI)** : `tsc --noEmit`, `next lint` et `next build` propres ;
  parcours joué dans un navigateur (affecter → email dans Mailhog → doublon
  refusé → formateur rétrogradé signalé → retirer → fermer par la croix et par
  le bouton, sur les trois modales).

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm run lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -e NODE_ENV=test api npm run test:e2e
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx tsc --noEmit
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web npx next lint
```

## CI
Pipeline inchangé (scope `apps/api`) : lint, tests unitaires, `migration:run`,
puis e2e — la nouvelle suite s'y ajoute. Aucun serveur SMTP en CI : la suite
remplace `MailService`. Le front reste hors CI (dette Sprint 1) :
vérification manuelle ci-dessus.

## Suites
- US-AUTH-16 : garde `@FormateurDeLaFormation` qui lit `formation_formateurs`
  (403 + audit `ACCES_RESSOURCE_REFUSE`), et premier écran formateur — « Mes
  formations », y compris celles qui ne sont pas ouvertes.
- Centre de notifications : table `notifications` et notification in-app
  (DS-16), en plus de l'email.
- Liste des formations : colonne « Formateur(s) » (UC3).
- V2 : rôle du formateur dans la formation (principal / invité).
