# US-ATEL-07 — Feedback immuable et notification

## En une phrase
Quand chaque critère est noté et enregistré, le formateur écrit un commentaire
général et envoie le feedback : sous le verrou de la ligne du livrable, le
serveur exige une grille à 100 % et une correction complète, fige le score,
passe la correction à TERMINEE et le livrable à NOTE (heure de PostgreSQL),
trace l'envoi et prévient l'apprenant par email ; ensuite plus rien ne se
modifie, ni par l'API ni en SQL direct.

## Découpage
- **A — Données.** Migration `1786800000000-AddFinalisationCorrection` :
  `corrections.score_total`, `commentaire_general` (1–5 000),
  `date_finalisation` ; CHECK « tous ou aucun » selon le statut ; trois
  déclencheurs d'immuabilité (correction TERMINEE, notes d'une correction
  TERMINEE, livrable NOTE). La suppression reste permise (CASCADE, tests).
- **B — API.** `verifierComplete`, `nettoyerCommentaireGeneral` (règles
  pures), `CorrectionsService.finaliser`, route
  `POST /livrables/:livrableId/correction/finaliser`,
  `MailService.sendCorrectionFinaliseeEmail`. Score figé exposé dans la liste
  (`scoreFinal`) et la fiche (`scoreFinal`, `commentaireGeneral`,
  `dateFinalisation`).
- **C — Web.** Page de correction : bloc « Commentaire général et envoi »
  (bouton actif seulement si tout est noté et enregistré), confirmation,
  puis « Feedback envoyé » en lecture seule ; score dans la liste.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/livrables/:livrableId/correction/finaliser` `{ commentaireGeneral }` | formateur affecté, admin | 200 · 400 · 403 · 404 · 409 |

## Flux
1. Transaction : verrou de la ligne du livrable ; formation archivée -> 409 ;
   statut ≠ EN_CORRECTION -> 409 (SOUMIS : pas ouverte ; NOTE : feedback
   immuable).
2. Nombre et total des critères de la grille, notes enregistrées -> 400
   « Correction incomplète : … » s'il manque une note ou si le total ≠ 100 %.
3. Commentaire général rogné, obligatoire -> 400.
4. Score = Σ points × pondération / 100 ; UPDATE correction (TERMINEE, score,
   commentaire, date) puis livrable NOTE.
5. Audit `CORRECTION_FINALISEE` (score, nombre de critères, avant / après),
   email à l'apprenant (au mieux : un échec est journalisé).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Table `feedbacks` (DS-03) | Le feedback vit dans `corrections` (commentaire général, date, score) : une seule ligne par livrable, immuable d'un bloc. **Écart à reporter dans DS-03.** |
| D2 | Fichiers annotés (DS-03) | Non construits (hors critères d'acceptation) ; à ajouter plus tard. |
| D3 | Route (DS-03 : `POST /corrections/:id/finaliser`) | Sous le livrable, même raison qu'US-ATEL-06 (garde par ressource). |
| D4 | Incomplète | 400 « correction incomplète » (Backlog / DS-03). |
| D5 | Immuabilité | API (409) ET base (déclencheurs) : correction, notes, livrable ; CHECK de cohérence du statut. |
| D6 | Notification | Email (pas de table `notifications`, comme US-ATEL-04). |

## Fichiers
- `apps/api/src/database/migrations/1786800000000-AddFinalisationCorrection.ts`, `entities/correction.entity.ts`
- `apps/api/src/modules/ateliers/livrables/{correction.regles,correction.dto,corrections.service,corrections.controller}.ts` (+ specs)
- `apps/api/src/mail/mail.service.ts` (+ spec)
- `apps/api/test/feedback.e2e-spec.ts` (marqueur `E2E-FEEDBACK`), `test/corrections.e2e-spec.ts` (`scoreFinal`)
- `apps/web/src/app/formateur/livrables/[id]/page.tsx`, `components/LivrablesAtelier.tsx`, `lib/api.ts`, `globals.css`

## Incidents
- La suite US-ATEL-06 comparait la ligne de liste à l'identique : ajout de
  `scoreFinal: null` attendu.

## Vérification
- API : lint 0 avertissement, `tsc`, unitaires **50 suites / 729 tests**,
  migration revert + run, e2e **28 suites / 416 tests** (en série).
- Mutations tuées (12) : complétude, commentaire obligatoire, état
  « notable » à la finalisation, verrou de ligne, envoi de l'email, passage à
  NOTE ; déclencheurs (correction, notes, livrable) et CHECK de cohérence.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : bouton désactivé avec
  sa raison (1/4 noté), confirmation, feedback envoyé (70 / 100), score dans
  la liste ; email reçu par le puits SMTP local ; pas de défilement horizontal.

## CI
Voir la PR : CI verte exigée sur la PR puis sur `main`.

## Suites
- US-ATEL-08 : l'apprenant consulte son feedback (score, détail par critère,
  commentaire général), « Nouveau feedback » dans « Mon espace ».
