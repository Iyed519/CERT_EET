# US-CERT-08 — Réémission après révocation pour erreur

## En une phrase
Quand un certificat a été révoqué pour une erreur administrative,
l'administrateur peut en réémettre un nouveau (mêmes titulaire, formation,
score et mention) : le certificat révoqué reste conservé et sa vérification
publique renvoie vers le certificat en vigueur.

## Point de départ
Backlog E5, US-CERT-08 (Could, 2 pts, stretch) : « réémettre un certificat
après une révocation pour erreur afin de corriger une émission erronée »
(DS-07 cas particulier -> DS-04). Existant : révocation motivée et immuable
(US-CERT-06 : motifs FRAUDE, ERREUR_ADMIN, DISCIPLINAIRE, JUDICIAIRE),
émission asynchrone (US-CERT-01), unicité (apprenant, formation).

## Découpage
- **Migration** `1788500000000-AddReemissionCertificats` :
  `certificats.remplace_certificat_id` (FK vers le révoqué remplacé) ;
  l'unicité (apprenant, formation) devient un index unique PARTIEL sur les
  certificats d'origine ; index unique sur `remplace_certificat_id`.
- **API** : `CertificatsService.reemettre`, route
  `POST /admin/certificats/:id/reemettre { confirmer: true }`, vues
  (`remplaceCertificatId`, `remplacePar`), vérification publique
  (`remplacePar`) ; « certificat courant » (non remplacé) dans « Mon espace »
  et le suivi formateur ; émission automatique : `ON CONFLICT` sur l'index
  partiel.
- **Web** : bouton « Réémettre » (révoqué pour erreur, pas encore réémis) avec
  confirmation ; mentions « réémission » / « réémis » dans la supervision ;
  lien « vérifier le certificat en vigueur » sur la page publique.

## Endpoint
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/admin/certificats/:certificatId/reemettre` `{ confirmer: true }` | ADMINISTRATEUR | 201 nouveau certificat (en file) ; 400 confirmation ; 401 ; 403 ; 404 ; 409 pas révoqué, autre motif, déjà réémis |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Nouvelle ligne | Le révoqué est immuable (déclencheur) : la réémission crée un NOUVEAU certificat (nouvel identifiant, nouveau PDF, nouvelle empreinte, nouvelle date d'émission et d'expiration), lié par `remplace_certificat_id`. |
| D2 | Motif | Seulement ERREUR_ADMIN : une révocation pour fraude, discipline ou décision de justice ne se « corrige » pas. |
| D3 | Unicité | (apprenant, formation) unique parmi les certificats d'ORIGINE : l'émission automatique reste bloquée par le premier certificat, même révoqué ; un révoqué n'est remplacé qu'une fois (index unique) : 6 réémissions simultanées -> 1 × 201, 5 × 409. |
| D4 | Certificat courant | Celui qu'aucune réémission ne remplace (`NOT EXISTS`), dans « Mon espace » et le suivi formateur ; « Mes certificats » liste les deux. |
| D5 | Vérification publique | Le révoqué reste « Révoqué » et donne l'identifiant du certificat en vigueur (`remplacePar`, une fois émis) ; aucune autre donnée. |
| D6 | Confirmation | `confirmer: true` (pas de mot de passe : l'action n'efface rien et reste tracée). Audit `CERTIFICAT_REEMIS` (acteur, nouveau certificat, certificat remplacé). |

## Fichiers
- `apps/api/src/database/migrations/1788500000000-AddReemissionCertificats.ts`, `entities/certificat.entity.ts`
- `apps/api/src/modules/certificats/` : `certificat.regles.ts`, `certificats.service.ts`, `certificats-admin.controller.ts`, `certificats.dto.ts`, `verification.service.ts`, `reemission.spec.ts` (+ specs mis à jour)
- `apps/api/src/modules/inscriptions/espace-formation.service.ts`, `modules/pilotage/suivi-formation.service.ts` (+ specs)
- `apps/api/test/reemission-certificats.e2e-spec.ts` (marqueur `E2E-CERTREEM`)
- `apps/web/src/app/admin/certificats/page.tsx`, `app/verifier/[id]/page.tsx`, `lib/api.ts`

## Incidents
- Les requêtes qui supposaient un seul certificat par (apprenant, formation)
  ont été recherchées une à une : « Mon espace » et le suivi formateur prennent
  le certificat courant ; les compteurs (rapports, tableau de bord, cycle de
  formation) comptent chaque certificat, ce qui reste juste.
- `toEqual` ignore les propriétés `undefined` mais pas `null` : l'attente de la
  vérification publique a reçu `remplacePar: null`.
- Deux e2e existants (US-CERT-04, US-CERT-05) comparent la liste exacte des
  champs publics : `remplacePar` ajouté.

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **104 suites / 1 367 tests** (+ 3 :
  règle ; nominal — verrou, contrôle, ligne liée, audit, file — ; 404, déjà
  réémis, course perdue 23505 sans effet), migration run + revert + run
  (**35 migrations**), e2e complet en série **61 suites / 765 tests** (+ 1 ignoré), dont `E2E-CERTREEM`
  (4 tests : accès et confirmation ; 409 non révoqué / fraude ; réémission
  complète — génération réelle, vérification publique des deux, supervision,
  « Mes certificats », audit, deuxième réémission 409, émission automatique
  toujours bloquée — ; 6 réémissions simultanées -> une seule).
- Mutations : **12 / 12 tuées** — motif non contrôlé, statut non contrôlé,
  déjà réémis non contrôlé, course perdue en 500, nouveau certificat non lié,
  action d'audit, réémis non mis en file, `remplacePar` absent de la
  supervision, vérification publique sans remplaçant, émission automatique non
  bloquée après réémission, confirmation non exigée, certificat remplacé
  affiché dans « Mon espace » (un mutant réécrit : il ne compilait pas ; deux
  mutants « défense en profondeur » — contrôle explicite doublé par l'index
  unique, course perdue que le verrou rend rare — tués par les unitaires).
- Web : `tsc`, `next lint`, `next build`. Navigateur 1280 / 390 px
  (Chromium, administrateur de démonstration, un certificat révoqué pour
  erreur posé en base locale) : bouton « Réémettre » sur la ligne,
  confirmation, nouveau certificat généré (ACTIF, lié au révoqué), mentions
  « réémis » dans la supervision, page publique du révoqué avec le lien
  « vérifier le certificat en vigueur » ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-IA-07 : suivi en temps réel (SSE).
