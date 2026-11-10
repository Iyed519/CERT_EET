# US-SUIVI-03 — Traiter une alerte de décrochage

## En une phrase
Le formateur affecté saisit l'action menée et marque l'alerte « Traitée »,
peut la rouvrir avec un motif, et consulte son historique : chaque action
s'ajoute, rien n'est jamais écrasé ; chaque transition est tracée
(`ALERTE_TRAITEE`, `ALERTE_ROUVERTE`).

## Point de départ
US-SUIVI-02 a créé `alertes_decrochage` avec, déjà, `date_traitement`,
`traite_par` et le CHECK de cohérence OUVERTE / TRAITEE, l'index unique
partiel (une alerte ouverte par critère) et le répit de 7 jours après
traitement. DS-14 P2 : « Prend une action et marque Traitée -> PATCH ».

## Découpage
- **Base.** Migration `1788000000000-AddActionsAlerte` : type
  `actions_alerte_type_enum` (TRAITEMENT, REOUVERTURE), table
  `actions_alerte` (alerte CASCADE, auteur SET NULL, commentaire 1–2 000,
  date), index (alerte, date), déclencheur `trg_actions_alerte_immuable`
  (aucune modification, sauf la remise à NULL de l'auteur quand son compte
  est supprimé). Entité `ActionAlerte`, enum `TypeActionAlerte`.
- **Autorisation.** Le garde `@FormateurDeLaFormation` accepte une nouvelle
  source `{ alerteId }` (l'alerte porte sa formation) : 404 alerte inconnue,
  403 + `ACCES_RESSOURCE_REFUSE` pour un formateur non affecté.
- **API** (module `pilotage`) : `TraitementAlertesService` — `detail`,
  `traiter`, `rouvrir` ; routes `GET /formateur/alertes/:alerteId`,
  `POST /formateur/alertes/:alerteId/traiter` `{ action }`,
  `POST /formateur/alertes/:alerteId/rouvrir` `{ motif }` (DTO : texte
  1–2 000, espaces retirés).
- **Web.** Page « Alertes de décrochage » : boutons « Traiter » (saisie de
  l'action, « Marquer Traitée ») ou « Rouvrir » (motif), « Historique »
  (entrées datées, auteur).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/formateur/alertes/:alerteId` | FORMATEUR affecté, ADMINISTRATEUR | 200 alerte + `historique[]` ; 400 ; 401 ; 403 (+ audit) ; 404 |
| POST | `/api/formateur/alertes/:alerteId/traiter` | idem | 200 alerte traitée ; 400 action vide / > 2 000 / champ inconnu ; 401 ; 403 ; 404 ; 409 déjà traitée |
| POST | `/api/formateur/alertes/:alerteId/rouvrir` | idem | 200 alerte rouverte ; 400 ; 401 ; 403 ; 404 ; 409 déjà ouverte, ou autre alerte ouverte du même critère |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Historique | Table d'actions en ajout seul (DS-14 : « conserve l'historique des actions sans l'écraser ») ; un déclencheur refuse toute modification ; ordre chronologique. |
| D2 | Transitions | Deux actions explicites (traiter, rouvrir) plutôt qu'un PATCH de statut : chacune exige son texte (action menée, motif). |
| D3 | Concurrence | `UPDATE … WHERE statut = attendu` et ajout à l'historique dans la même transaction : 8 traitements simultanés -> 1 succès, 7 × 409, une seule entrée, une seule trace. |
| D4 | Rouvrir | Refusé (409, message explicite) si le balayage a entre-temps ouvert une autre alerte du même critère pour l'apprenant : l'index unique partiel le garantit ; le formateur traite la nouvelle. |
| D5 | Codes | Statut incompatible = 409 (écart habituel du projet) ; alerte inconnue = 404 (garde pour un formateur, service pour un administrateur). |
| D6 | Répit | Inchangé (US-SUIVI-02) : 7 jours après le traitement, pas de nouvelle alerte du même critère ; une réouverture efface la date de traitement. |
| D7 | Audit | `ALERTE_TRAITEE` / `ALERTE_ROUVERTE` : acteur, cible = alerte, avant / après ; le texte de l'action reste dans l'historique (pas dupliqué dans le journal). |

## Fichiers
- `apps/api/src/database/migrations/1788000000000-AddActionsAlerte.ts`, `entities/action-alerte.entity.ts`, `enums/type-action-alerte.enum.ts`
- `apps/api/src/modules/formations/autorisation/` (source `alerteId`), `formations.module.ts`
- `apps/api/src/modules/pilotage/` : `traitement-alertes.service.ts` (+ spec), `alertes.controller.ts`, `alertes.dto.ts`, `pilotage.module.ts`
- `apps/api/test/traitement-alertes.e2e-spec.ts` (marqueur `E2E-SUIVI03`)
- `apps/web/src/app/formateur/alertes/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Le mutant du déclencheur (migration) n'est pas visible des tests tant que
  la migration n'est pas rejouée : vérifié à la main (revert, migration
  mutée, suite en échec ; migration restaurée, suite verte), après l'ajout
  du test « changer l'auteur d'une action est refusé ».

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **85 suites / 1 219 tests**
  (+ 9 : traitement, réouverture, refus 404 / 409, conflit d'index, historique),
  migration run + revert + run (**30 migrations**), e2e complet en série
  **47 suites / 660 tests** (+ 1 ignoré), dont `E2E-SUIVI03` (9 tests : 401 /
  403 apprenant / 400 / 404 ; 403 formateur non affecté tracé ; détail avec
  historique vide ; 400 action vide, trop longue, champ inconnu ; traiter puis
  409 ; rouvrir, 409 déjà ouverte, historique jamais écrasé (déclencheur) ;
  rouvrir refusé si une autre alerte du même critère est ouverte ;
  administrateur ; concurrence : 8 traitements simultanés -> 1 succès, 7 × 409,
  une entrée, une trace). Un premier e2e complet a échoué sur un `read
  ECONNRESET` réseau dans la suite US-AUDIT-01 (concurrence, hors périmètre) :
  la suite seule passe 3 fois sur 3, l'e2e complet relancé est vert.
- Mutations : **14 / 14 tuées** — conditions de statut (traiter, rouvrir),
  `traite_par`, 409, traduction du 23505, type et ordre de l'historique,
  404 avant 409, garde (mauvaise formation, source ignorée), audit, longueur
  et `trim` des DTO ; le mutant du déclencheur (auteur NULL exigé) n'est tué
  qu'après revert + migration mutée + run (voir « Incidents »), migration
  restaurée et suite verte ensuite.
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, compte formateur de démonstration) : onglets Ouvertes /
  Traitées / Toutes, « Traiter » (saisie de l'action, « Marquer Traitée »),
  « Rouvrir », historique daté avec l'auteur ; pas de défilement
  horizontal.

## CI
Voir la PR.

## Suites
- US-RPT-01 : export du suivi (CSV / PDF, asynchrone), alertes comprises.
