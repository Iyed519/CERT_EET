# US-FORM-04 — Contenu pédagogique géré par le formateur

## En une phrase
Le formateur affecté à une formation modifie lui-même sa description, ses
objectifs, ses prérequis et ses modules (ajout, renommage, ordre,
suppression d'un module vide) ; les réglages institutionnels — titre, dates,
durée, capacité, seuil, modèle, statut — restent à l'administrateur.

## Point de départ
Révision v1.4 du Backlog (ADR-11), DS-16 P1 ; Sprint 4 § 3.1. Existant :
US-FORM-01 (édition administrateur de la formation et des modules, avec
audit), garde `@FormateurDeLaFormation` (US-AUTH-16), US-FORM-02 (formation
archivée figée), ressources de module (révision v1.5).

## Découpage
- **Aucune migration.**
- **API** (module `formations`) : `FormateurContenuController`
  (`/formateur/formations/:formationId/...`), DTO `ContenuPedagogiqueDto`
  (trois champs autorisés, un validateur `ChampInstitutionnel` nommant chaque
  réglage réservé), réutilisation de `FormationsService.modifier` et de
  `FormationModulesService` ; ce dernier refuse maintenant la suppression d'un
  module qui porte une ressource et ajoute un module sous verrou de la
  formation.
- **Web.** Bouton « Modifier le contenu » sur la page de la formation côté
  formateur ; fenêtre `ContenuFormationModal` : trois zones de texte, liste
  des modules (monter, descendre, renommer, supprimer), ajout en fin.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| PATCH | `/api/formateur/formations/:formationId/contenu` | FORMATEUR affecté, ADMINISTRATEUR | 200 ; 400 réglage institutionnel (nommé), champ inconnu, vide ; 401 ; 403 apprenant ou non affecté (tracé) ; 404 ; 409 archivée |
| POST | `/api/formateur/formations/:formationId/modules` | idem | 201 en dernière position ; 400 ; 403 ; 409 archivée |
| PUT | `/api/formateur/formations/:formationId/modules/ordre` | idem | 200 ; 400 liste incomplète, doublon, module étranger ; 403 ; 409 |
| PATCH | `/api/formateur/formations/:formationId/modules/:moduleId` | idem | 200 ; 400 ; 403 ; 404 ; 409 |
| DELETE | `/api/formateur/formations/:formationId/modules/:moduleId` | idem | 204 ; 403 ; 404 ; 409 module portant une évaluation ou une ressource, formation archivée |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Périmètre | Trois champs pédagogiques + modules ; tout réglage institutionnel envoyé -> 400 « Le champ X est un réglage institutionnel réservé à l’administrateur. », même avec `null`. |
| D2 | Routes dédiées | Préfixe `/formateur/...` avec la garde de formation : les routes administrateur d'US-FORM-01 restent inchangées et réservées. |
| D3 | Règles communes | Mêmes services qu'US-FORM-01 (audit `FORMATION_MODIFIEE`, `MODULE_CREE`, `MODULE_MODIFIE`, `MODULES_REORDONNES`, `MODULE_SUPPRIME`), l'acteur étant le formateur. |
| D4 | Suppression | Refusée (409) si le module porte une évaluation (existant) ou une ressource (nouveau : « retirez-les avant de le supprimer ») — rien n'est perdu sans geste explicite. |
| D5 | Concurrence | Ajout sous `SELECT … FOR UPDATE` de la formation : 8 ajouts simultanés -> rangs 1 à 8 sans doublon. |
| D6 | Archivée | 409 pour toute écriture (US-FORM-02). |

## Fichiers
- `apps/api/src/modules/formations/formateur-contenu.controller.ts`, `dto/contenu-pedagogique.dto.ts` (+ spec), `formation-modules.service.ts` (+ spec), `formations.module.ts`
- `apps/api/test/contenu-formateur.e2e-spec.ts` (marqueur `E2E-FORM04`)
- `apps/api/test/supports.e2e-spec.ts` (correctif de test instable, voir Incidents)
- `apps/web/src/components/ContenuFormationModal.tsx`, `app/formateur/formations/[id]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Test instable hors périmètre : `supports.e2e-spec.ts` lisait la trace
  `SUPPORT_ECHEC_INDEXATION` / `SUPPORT_INDEXE` juste après le changement de
  statut, alors que la trace est écrite un instant plus tard par la tâche de
  fond ; un premier e2e complet a échoué là (1 test). Ajout d'un
  `attendreTraces` (interrogation courte) ; e2e complet relancé : vert.
- Prettier a replié une ligne existante de `formation-modules.service.spec.ts` :
  remise telle quelle.
- Deux exécutions de mutations interrompues ont laissé un mutant dans un
  fichier ; détecté par `git diff`, restauré, jamais commité.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **96 suites / 1 308 tests**
  (validateur des réglages institutionnels, `null` refusé, suppression d'un
  module avec ressource, ajout sous verrou), aucune migration (**32**), e2e
  complet en série **53 suites / 713 tests** (+ 1 ignoré), dont `E2E-FORM04`
  (8 tests : 401 / 403 apprenant / 403 non affecté tracé / 404 / administrateur
  admis ; contenu modifié et audit avec le formateur pour acteur ; 400 nommant
  chaque réglage institutionnel, rien modifié ; 400 champ inconnu ou corps
  vide ; cycle complet des modules ; 409 module portant un QCM ou une
  ressource, 404 module d'une autre formation ; archivée 409 ; concurrence :
  8 ajouts simultanés -> rangs 1 à 8).
- Mutations : **8 / 8 tuées** — garde de formation (contenu, ajout), réglage
  institutionnel accepté, `null` accepté, suppression malgré une ressource,
  ajout sans verrou, description non transmise, acteur de l'audit remplacé.
  Deux mutants initiaux remplacés : « champs institutionnels transmis au
  service » est équivalent (le DTO les refuse avant), et « acteur fictif »
  ne compilait pas (variable inutilisée).
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, formateur de démonstration, formation de démonstration) :
  « Modifier le contenu », trois zones, modules avec ordre / renommer /
  supprimer, ajout ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-QCM-02 : banque de questions du formateur.
