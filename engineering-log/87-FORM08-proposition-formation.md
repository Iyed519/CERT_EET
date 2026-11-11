# US-FORM-08 — Le formateur propose une nouvelle formation

## En une phrase
Un formateur propose une formation (titre, description, objectifs, durée,
capacité, public visé, motif) — plusieurs possibles, au plus cinq en cours ;
l'administrateur l'accepte (la formation est créée **en brouillon** avec le
proposant affecté, en une transaction), demande des modifications (le
formateur corrige et renvoie) ou la refuse avec un motif ; un brouillon se
publie ensuite depuis la page Formations.

## Point de départ
Seul l'administrateur créait des formations (US-FORM-01). La plateforme
n'avait pas d'état « pas encore publiée » : une formation créée était
immédiatement OUVERTE, donc au catalogue.

## Découpage
- **Migration** `1788900000000-AddPropositionsFormation` :
  - `formations_statut_enum` + `BROUILLON` (avant `OUVERTE`) ; `down` repasse
    les brouillons en `FERMEE` (hors catalogue) et recrée l'énumération ;
  - table `propositions_formation` : mêmes bornes que US-FORM-01 (titre
    ≤ 255, description et objectifs ≤ 5 000, durée 1–10 000 h, capacité
    1–100 000), public visé ≤ 1 000, motif 10–1 000, statut `EN_ATTENTE` /
    `A_MODIFIER` / `ACCEPTEE` / `REFUSEE`, commentaire obligatoire pour
    `A_MODIFIER` et `REFUSEE`, `formation_id` seulement si acceptée,
    `version` (+ 1 à chaque resoumission).
- **Cycle de vie** (US-FORM-02) : `BROUILLON -> OUVERTE` (« Publier »,
  audit `FORMATION_PUBLIEE`, pas « rouverte ») ; aucune transition vers
  `BROUILLON`. Un brouillon est hors catalogue et n'accepte pas d'inscription
  (règles existantes : seul `OUVERTE` est visible et inscriptible) ; il ne
  peut pas être demandé (US-FORM-07).
- **Api** (`modules/propositions-formation`) :
  - formateur : `GET/POST /formateur/propositions-formation`,
    `PUT …/:id` (modifier et resoumettre une proposition en cours) ;
  - administrateur : `GET /admin/propositions-formation` (filtre),
    `PATCH …/:id/accepter`, `…/demander-modifications`, `…/refuser`
    (commentaire 10–1 000) ;
  - email `sendDecisionPropositionEmail` ; audit
    `PROPOSITION_FORMATION_CREEE / RESOUMISE / ACCEPTEE / A_MODIFIER / REFUSEE` ;
  - tableaux de bord : `BROUILLON` dans les répartitions par statut ;
    `demandesEnAttente.propositions` côté administrateur.
- **Web** : `/formateur/propositions` (formulaire, liste, « Modifier et
  renvoyer » avec le commentaire de l'administrateur, lien vers la formation
  acceptée) ; `/admin/propositions-formation` (onglet « Propositions »,
  accepter, demander des modifications, refuser) ; bouton « Proposer une
  formation » du tableau de bord formateur ; compteur et lien sur le tableau
  de bord administrateur ; libellés « Brouillon » partout ; bouton
  « Publier » dans la modale de statut d'une formation en brouillon.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Statut BROUILLON | Ajouté à l'énumération plutôt que réutiliser `FERMEE` : une formation proposée n'a jamais été ouverte ; « Publier » et « Rouvrir » sont deux gestes différents (audit distinct). |
| D2 | Limite de 5 | Compte les propositions **en cours** (`EN_ATTENTE` et `A_MODIFIER`) : une proposition à corriger attend encore quelqu'un. Vérifiée sous verrou de la ligne du formateur : la limite tient face à des envois simultanés (8 envois pour 2 places -> 2). |
| D3 | Acceptation | Une transaction : proposition `FOR UPDATE` (doit être `EN_ATTENTE`), proposant encore formateur actif, création de la formation `BROUILLON` (seuil de certification 60 %, modifiable ensuite), affectation du proposant, proposition `ACCEPTEE` liée à la formation. |
| D4 | Public visé | La table `formations` n'a pas de colonne dédiée : le public visé est ajouté à la description de la formation créée (« Public visé : … ») plutôt que d'étendre le modèle et ses réponses publiques. |
| D5 | Modification | Le formateur peut corriger une proposition en cours (`EN_ATTENTE` ou `A_MODIFIER`) ; elle repart `EN_ATTENTE`, `version` + 1. Acceptée ou refusée : figée (409). |
| D6 | Emails | Non bloquants (audit `notificationEnvoyee`). |

## Fichiers
- `apps/api/src/database/migrations/1788900000000-AddPropositionsFormation.ts`, `database/enums/statut-formation.enum.ts`
- `apps/api/src/modules/propositions-formation/*` (règles + spec, DTO, service, contrôleurs, module), `app.module.ts`, `mail/mail.service.ts`
- `apps/api/src/modules/formations/cycle-formation.{regles,service}.ts`, `modules/demandes-affectation/demandes-affectation.{regles,service}.ts` (+ spec), `modules/pilotage/tableau-de-bord.service.ts` (+ spec), `tableau-de-bord-formateur.spec.ts`
- `apps/api/test/propositions-formation.e2e-spec.ts` (nouveau, `E2E-FORM08`), `test/tableau-de-bord-formateur.e2e-spec.ts`
- `apps/web/src/app/formateur/propositions/page.tsx`, `app/admin/propositions-formation/page.tsx` (nouveaux), `app/admin/formations/page.tsx`, `app/admin/layout.tsx`, `app/admin/tableau-de-bord/page.tsx`, `app/formateur/tableau-de-bord/page.tsx`, `app/formateur/demandes/page.tsx`, `app/formateur/formations/page.tsx`, `app/formateur/formations/[id]/page.tsx`, `components/SiteHeader.tsx`, `components/navigation.ts`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Vérification
- Migration : run / revert / run (**39 migrations**).
- Api : lint 0 avertissement, `tsc`, unitaires **117 suites / 1 464 tests**
  (+ 4), e2e complet en série **72 suites / 846 tests** (+ 1 ignoré), dont
  `E2E-FORM08` (10 tests : accès ; validations ; création ; modifications
  demandées puis resoumission ; acceptation -> brouillon affecté, hors
  catalogue, sans inscription, publié avec `FORMATION_PUBLIEE` ; refus ;
  limite de 5 ; **8 envois simultanés pour 2 places -> 2** ; **accepter ×3,
  refuser, demander des modifications simultanés -> une issue, au plus une
  formation** ; liste, formateur désactivé, compteur).
- Mutations : **15 / 15 tuées** — limite à 6, `A_MODIFIER` hors limite,
  création sans verrou, motif non vérifié, formation créée `OUVERTE`,
  proposant non affecté, décision sur une proposition non en attente,
  modification d'une proposition acceptée, modification de celle d'un
  autre, resoumission sans version, public visé perdu, refus sans email,
  brouillon non publiable, publication tracée comme réouverture, formateur
  désactivé accepté.
- Web : `tsc`, `next lint`, `next build`.
- Navigateur (pile locale derrière nginx), 1280 et 390 px : tableau de bord
  -> « Proposer une formation », envoi ; administrateur -> demande de
  modifications ; formateur -> « Modifier et renvoyer » (commentaire
  affiché), version 2 ; administrateur -> acceptation ; la formation
  apparaît en « Brouillon » chez le formateur et dans les formations de
  l'administrateur.

## CI
Voir la PR.
