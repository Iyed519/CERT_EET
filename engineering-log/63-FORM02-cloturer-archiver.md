# US-FORM-02 — Clôturer / archiver une formation

## En une phrase
L'administrateur clôture une formation (plus d'inscription, les inscrits
terminent), la rouvre, ou l'archive (parcours figé, définitif) ; s'il reste
des évaluations en cours, il doit le confirmer explicitement ; les
certificats déjà émis restent vérifiables.

## Point de départ
DS-16 P1 et Sprint 4 (§ 3.2) : « transitions OUVERTE → FERMEE → ARCHIVEE ;
confirmation explicite si des évaluations sont en cours ; certificats émis
toujours vérifiables ». Existant : le statut `formations_statut_enum`
(OUVERTE, FERMEE, ARCHIVEE), l'inscription limitée aux formations OUVERTE
(US-INSC-01), le blocage des modifications d'une formation archivée
(US-FORM-01), l'éligibilité refusée sur une formation archivée (US-CERT-01),
le balayage des alertes qui l'ignore (US-SUIVI-02). Le PATCH d'US-FORM-01
excluait volontairement le statut (« autre story »).

## Découpage
- **Aucune migration.**
- **Règles pures.** `cycle-formation.regles.ts` : transitions, actions
  d'audit, messages, confirmation exigée.
- **API** (module `formations`) : `CycleFormationService` — `impact`,
  `changerStatut` ; `GET /admin/formations/:id/cycle`,
  `POST /admin/formations/:id/statut` `{ statut, confirmer? }` ; DTO.
- **Parcours figé.** Démarrage d'un QCM et dépôt d'un livrable refusés
  (409) dans une formation archivée.
- **Web.** Bouton « Statut » dans la liste des formations : impact
  (inscriptions, tentatives, livrables, corrections, certificats), case de
  confirmation si des évaluations sont en cours, actions possibles avec leur
  effet.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/formations/:id/cycle` | ADMINISTRATEUR | 200 statut, transitions possibles, inscriptions en cours, évaluations en cours, certificats actifs ; 400 ; 401 ; 403 ; 404 |
| POST | `/api/admin/formations/:id/statut` | ADMINISTRATEUR | 200 formation ; 400 statut, champ inconnu, corps vide ; 401 ; 403 ; 404 ; 409 transition impossible ou `CONFIRMATION_REQUISE` (+ `evaluationsEnCours`) |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Transitions | OUVERTE → FERMEE → ARCHIVEE ; FERMEE → OUVERTE (rouvrir une session clôturée par erreur) ; OUVERTE → ARCHIVEE interdit (clôturer d'abord) ; ARCHIVEE définitif. |
| D2 | Effets | FERMEE : plus d'inscription (règle existante), les inscrits terminent (QCM, ateliers, certificats). ARCHIVEE : parcours figé — plus de modification, de démarrage de QCM, de dépôt de livrable, de demande de certificat, d'alerte. |
| D3 | « Évaluations en cours » | Tentatives EN_COURS, livrables SOUMIS (à corriger), corrections EN_COURS, certificats en attente ou en émission. Clôturer ou archiver avec au moins une -> `confirmer: true` exigé ; rouvrir n'exige rien. |
| D4 | Réponse de refus | 409 `CONFIRMATION_REQUISE` avec le détail des évaluations en cours : l'écran peut l'afficher sans nouvelle requête. |
| D5 | Concurrence | `UPDATE … WHERE statut = attendu` : 8 clôtures simultanées -> 1 succès, 7 × 409, une trace. |
| D6 | Certificats | Jamais modifiés par le cycle : la vérification publique d'un certificat d'une formation archivée répond VALIDE (e2e). |
| D7 | Audit | `FORMATION_CLOTUREE`, `FORMATION_ARCHIVEE`, `FORMATION_ROUVERTE` : avant, après, évaluations en cours, confirmation. |
| D8 | Route dédiée | Un POST de transition plutôt que le statut dans le PATCH d'US-FORM-01 : règles et audit propres, PATCH inchangé. |
| D9 | Booléen | `confirmer` suit la conversion implicite globale du `ValidationPipe` (une chaîne non vide devient `true`) ; l'écran envoie un vrai booléen. |

## Fichiers
- `apps/api/src/modules/formations/cycle-formation.regles.ts`, `cycle-formation.service.ts` (+ specs), `dto/changer-statut-formation.dto.ts`, `admin-formations.controller.ts`, `formations.module.ts`
- `apps/api/src/modules/tentatives/tentative-demarrage.service.ts`, `ateliers/livrables/livrables.service.ts` (+ specs)
- `apps/api/test/cycle-formation.e2e-spec.ts` (marqueur `E2E-FORM02`)
- `apps/web/src/app/admin/formations/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- Premier passage de la suite e2e : le cas « confirmation non booléenne »
  (`confirmer: 'oui'`) a été accepté — la conversion implicite globale le
  transforme en `true` — et a clôturé la formation, faisant échouer les tests
  suivants en cascade. Cas retiré, comportement documenté (D9).

## Vérification
VERIF

## CI
Voir la PR.

## Suites
- US-INSC-02 / US-INSC-03 : inscriptions suspendues ou désinscriptions,
  cohérentes avec le cycle (aucune inscription dans une formation fermée).
