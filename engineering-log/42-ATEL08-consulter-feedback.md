# US-ATEL-08 — Consulter son feedback

## En une phrase
Sur la fiche de l'atelier, l'apprenant dont le livrable est noté lit sa note
globale, le détail par critère (niveau, points, contribution, commentaire) et
le commentaire général ; tant que la correction est en cours, il ne voit que
« en cours de correction », sans aucune note partielle ; « Mon espace »
affiche « Nouveau feedback » jusqu'à sa première ouverture, enregistrée une
seule fois et tracée.

## Découpage
- **A — Données.** Migration `1786900000000-AddConsultationsFeedback` :
  `consultations_feedback` (clé = livrable, CASCADE, heure de PostgreSQL).
  Table à part : correction et livrable notés sont immuables (US-ATEL-07).
- **B — API.** `GET /mes-ateliers/:id` : `monLivrable.feedback` (null sauf
  NOTE) ; première ouverture -> `INSERT … ON CONFLICT DO NOTHING` + audit
  `FEEDBACK_CONSULTE`. `GET /formations/:id/mon-espace` : `nouveauFeedback`
  par atelier.
- **C — Web.** « Mon feedback » dans le panneau « Mon livrable », message
  « en cours de correction », badge « Nouveau feedback » dans « Mon espace ».

## Endpoints
| Méthode | Route | Changement |
|---|---|---|
| GET | `/api/mes-ateliers/:atelierId` | `monLivrable.feedback` (score, date, correcteur, critères, commentaire général) |
| GET | `/api/formations/:formationId/mon-espace` | `ateliers[].nouveauFeedback` |

## Flux
1. Fiche : accès par l'inscription (EN_COURS ou TERMINEE), comme avant.
2. Livrable NOTE -> correction TERMINEE lue (notes + niveau) -> détail dans
   l'ordre de la grille ; sinon `feedback: null`.
3. Première ouverture : une ligne `consultations_feedback` (clé primaire :
   deux onglets simultanés n'en créent qu'une), audit `FEEDBACK_CONSULTE`.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | « Nouveau feedback » | Badge tant que la fiche n'a pas été ouverte après la notation (table de consultations), pas de table `notifications`. |
| D2 | Pas de note partielle | Trois garde-fous : statut NOTE exigé, correction TERMINEE exigée, score présent (CHECK US-ATEL-07). |
| D3 | GET qui écrit | La fiche enregistre la première consultation (idempotent) ; assumé, c'est l'événement « feedback lu ». |
| D4 | Correcteur | Prénom et nom seulement (jamais l'email). |

## Fichiers
- `apps/api/src/database/migrations/1786900000000-AddConsultationsFeedback.ts`, `entities/consultation-feedback.entity.ts`
- `apps/api/src/modules/ateliers/ateliers-apprenant.service.ts` (+ spec), `modules/inscriptions/espace-formation.service.ts` (+ spec)
- `apps/api/test/mon-feedback.e2e-spec.ts` (marqueur `E2E-MONFEED`), `test/ateliers-publication.e2e-spec.ts` (`nouveauFeedback`)
- `apps/web/src/components/MonLivrable.tsx`, `app/mes-inscriptions/[formationId]/page.tsx`, `lib/api.ts`, `globals.css`

## Incidents
- La suite US-ATEL-03 comparait les ateliers de « Mon espace » à
  l'identique : ajout de `nouveauFeedback: false` attendu.

## Vérification
- API : lint 0, `tsc`, unitaires **50 suites / 734 tests**, migration revert
  + run, e2e **29 suites / 424 tests** (en série).
- Mutations tuées : ON CONFLICT (concurrence), audit à la première fois
  seulement, badge limité aux livrables NOTE, badge levé après consultation,
  court-circuit EN_CORRECTION (unitaire). Mutant équivalent écarté : filtre
  TERMINEE doublé par le CHECK de cohérence.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : badge puis disparition,
  feedback complet (70 / 100), message « en cours de correction » ; pas de
  défilement horizontal.

## CI
Voir la PR : CI verte exigée sur la PR puis sur `main`.

## Suites
- US-CERT-01 : émission asynchrone du certificat (Bull, PDF, SHA-256, QR).
- Documents à aligner : UC Apprenant (badge « Nouveau feedback », table de
  consultations), DS-03 partie 2.
