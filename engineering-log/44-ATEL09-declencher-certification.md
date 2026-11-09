# US-ATEL-09 — Déclencher la certification

## En une phrase
Après chaque correction finalisée et chaque tentative de QCM réussie, le
système évalue l'éligibilité de l'apprenant (chaque QCM publié réussi, chaque
atelier publié noté au-dessus du seuil de certification, formation non
clôturée, inscription active) et, s'il est éligible, demande l'émission de son
certificat — une seule fois — ; « Mon espace » montre où en est la
certification, et l'administrateur peut réévaluer toute une formation.

## Découpage
- **A — Règles pures.** `eligibilite.regles.ts` : `verdictEligibilite`
  (verdict, raison « Certification non éligible : … », évaluations jugées,
  score final = moyenne à poids égal).
- **B — Service.** `EligibiliteService` (module certificats, exporté) :
  `evaluer` (lectures SQL), `evaluerEtDeclencher` (->
  `CertificatsService.demanderEmission`, audit `CERTIFICATION_DECLENCHEE`
  pour la seule demande créée), `declencherSansEchec`, `evaluerFormation`.
- **C — Branchements.** Fin de `CorrectionsService.finaliser` (origine
  CORRECTION_FINALISEE) ; fin de `TentativeNotationService.noter` si la
  tentative est réussie (origine TENTATIVE_NOTEE). Au mieux : une erreur est
  journalisée, la note reste acquise.
- **D — Routes.** `POST /admin/formations/:formationId/certification/evaluer`
  (bilan, audit `CERTIFICATION_FORMATION_EVALUEE`) ; `GET
  /formations/:id/mon-espace` gagne `certification`.
- **E — Web.** Carte « Certification » de « Mon espace » : évaluations
  validées / requises, puis état du certificat (en préparation, délivré,
  révoqué).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | QCM « requis » | Tous les QCM PUBLIÉS des modules ; réussi = une tentative NOTEE réussie (seuil propre au QCM). |
| D2 | Ateliers | Tous les ateliers non brouillons ; validé = correction TERMINEE avec score ≥ `noteMinCertification`. |
| D3 | « Formation non clôturée » | Statut ≠ ARCHIVEE (FERMEE = fermée aux inscriptions, la formation continue). Inscription EN_COURS ou TERMINEE ; SUSPENDUE ou absente -> non éligible. |
| D4 | Score final | Moyenne à poids égal (meilleur score de chaque QCM, score de chaque atelier) ; mention d'après US-CERT-01. |
| D5 | Exactement une fois | UNIQUE + `ON CONFLICT DO NOTHING` (US-CERT-01) ; seul le créateur trace. Pas de verrou supplémentaire : la contrainte suffit, prouvé par un test de concurrence forcée. |
| D6 | Non éligible | Pas d'audit à chaque note (bruit) ; la raison est visible dans « Mon espace ». |
| D7 | Notes antérieures | Réévaluation administrateur d'une formation (API) ; pas encore de bouton dans l'administration. |

## Fichiers
- `apps/api/src/modules/certificats/{eligibilite.regles,eligibilite.service}.ts` (+ specs), `certificats-admin.controller.ts`, `certificats.module.ts`
- `apps/api/src/modules/ateliers/{ateliers.module.ts,livrables/corrections.service.ts}` (+ spec)
- `apps/api/src/modules/tentatives/{tentatives.module.ts,tentative-notation.service.ts}` (+ spec)
- `apps/api/src/modules/inscriptions/{inscriptions.module.ts,espace-formation.service.ts}` (+ spec)
- `apps/api/test/eligibilite.e2e-spec.ts` (marqueur `E2E-ELIGIB`), `test/outils/nettoyage-certificats.ts`,
  `test/{feedback,mon-feedback,tentative-notation}.e2e-spec.ts` (nettoyage)
- `apps/web/src/app/mes-inscriptions/[formationId]/page.tsx`, `lib/api.ts`, `globals.css`

## Incidents
- Trois suites existantes (US-ATEL-07, US-ATEL-08, US-QCM-08) rendent
  désormais leurs apprenants éligibles : un certificat est généré en arrière-
  plan et bloquait la suppression des formations (FK RESTRICT). Ajout d'un
  utilitaire de test commun qui attend les générations en cours puis retire
  certificats, PDF et audit avant les formations.

## Vérification
- API : lint 0, `tsc`, unitaires **55 suites / 784 tests**, migration revert
  + run, e2e **31 suites / 439 tests** (en série).
- Mutations tuées (7) : seuil d'atelier (≥), réussite du QCM, « toutes
  validées », formation clôturée, audit unique, branchement après la
  correction ; en unitaire : branchement après la notation d'un QCM.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : « 1/2 évaluation
  validée » (non éligible) et « Certificat délivré » (après réévaluation) ;
  pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-03 : « Mes certificats » et téléchargement (le lien des emails).
- Bouton « Réévaluer les certifications » dans l'administration des
  formations (petite story à planifier).
