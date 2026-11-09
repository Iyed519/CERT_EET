# US-CERT-03 — Consulter et télécharger son certificat

## En une phrase
L'apprenant ouvre « Mes certificats » (nouveau lien d'en-tête) : formation,
score, mention, état ; une fois délivré, il télécharge le PDF (relayé en flux
par l'API, tracé), voit son empreinte SHA-256 et copie le lien public de
vérification ; en préparation ou révoqué, le téléchargement est refusé.

## Découpage
- **API.** `CertificatsApprenantController` (`@Roles(APPRENANT)`) :
  `GET /mes-certificats`, `GET /mes-certificats/:id/pdf` ;
  `CertificatsService.mesCertificats` / `monPdf` ; règles
  `verifierTelechargeable`, `nomFichierCertificat`.
- **Web.** Page `/mes-certificats`, lien « Mes certificats » de l'en-tête
  apprenant, bouton « Voir mon certificat » sur la carte « Certification »
  de « Mon espace » (US-ATEL-09).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/mes-certificats` | apprenant | 200 · 401 · 403 |
| GET | `/api/mes-certificats/:id/pdf` | apprenant | 200 (PDF) · 400 · 401 · 403 · 404 · 409 · 503 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Certificat d'un autre | 404 identique à un identifiant inconnu (pas d'énumération), titulaire = jeton. |
| D2 | États | ACTIF seul téléchargeable ; en préparation / révoqué = 409 (état) ; le révoqué reste listé avec son empreinte (DS-07 : PDF et hash conservés). |
| D3 | Liste blanche | Jamais la clé de stockage ni la dernière erreur ; empreinte, date de génération et lien public seulement une fois émis. |
| D4 | Téléchargement | Relais en flux par l'API (comme les livrables), nom `certificat-<formation>.pdf`, audit `CERTIFICAT_TELECHARGE`. |

## Fichiers
- `apps/api/src/modules/certificats/{certificats-apprenant.controller,certificats.service,certificat.regles,certificats.module}.ts` (+ specs)
- `apps/api/test/mes-certificats.e2e-spec.ts` (marqueur `E2E-MESCERT`)
- `apps/web/src/app/mes-certificats/page.tsx`, `components/ApprenantNav.tsx`, `app/mes-inscriptions/[formationId]/page.tsx`, `lib/api.ts`, `globals.css`

## Incidents
- Date de délivrance affichée « 09T02:43…Z/11/2026 » : `dateFr` attend une date
  sans heure ; remplacé par `jourFr`, vu à l'écran puis corrigé.

## Vérification
- API : lint 0, `tsc`, unitaires **55 suites / 789 tests**, e2e **32 suites / 444 tests** (en série).
- Mutations tuées (5) : titulaire seulement, refus du révoqué, refus de
  l'en-préparation, rôle apprenant, audit du téléchargement. Mutant
  équivalent écarté : masquage de l'empreinte avant émission (la base n'en
  pose une qu'avec ACTIF).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : liste (délivré + en
  préparation), téléchargement (PDF, nom attendu), refus « révoqué » affiché ;
  pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-04 : page publique `/verifier/{id}` (valide / révoqué / inconnu,
  empreinte publiée).
