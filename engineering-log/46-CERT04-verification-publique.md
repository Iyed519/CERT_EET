# US-CERT-04 — Vérification publique sans compte

## En une phrase
N'importe qui, sans compte, ouvre `/verifier/{id}` (lien du QR code ou lien
partagé) et lit un verdict — valide et authentique, révoqué, ou intégrité
compromise — avec des données minimales et l'empreinte SHA-256 ; le serveur
relit le PDF stocké et recalcule son empreinte à chaque vérification ; le
visiteur peut comparer un PDF reçu, dont l'empreinte est calculée dans son
navigateur.

## Découpage
- **API (publique, `@Public()`).** `VerificationController`
  (`GET /api/verification/:id`, `GET /api/verification/:id/pdf`),
  `VerificationService`, règles `verification.regles.ts`.
- **Web.** Page publique `app/verifier/[id]/page.tsx` (fetch simple, jamais
  `apiFetch` : pas de redirection vers /login), comparaison locale d'un PDF
  (Web Crypto), téléchargement du PDF certifié.

## Endpoints
| Méthode | Route | Accès | Réponses |
|---|---|---|---|
| GET | `/api/verification/:id` | public | 200 (verdict) · 404 |
| GET | `/api/verification/:id/pdf` | public | 200 (PDF) · 404 |

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Route (DS-05 : `GET /v/{uuid}`) | API sous `/api/verification/:id` ; page humaine `/verifier/:id` (déjà dans le QR depuis US-CERT-01). **Écart à reporter dans DS-05.** |
| D2 | Inconnu | Inconnu, mal formé (pas de ParseUUIDPipe) et pas encore émis -> la même 404 « Aucun certificat ne correspond à ce lien. » |
| D3 | Intégrité | SHA-256 du PDF stocké recalculé à chaque vérification (DS-05) ; différent -> INTEGRITE_COMPROMISE ; stockage injoignable -> NON_VERIFIABLE, le verdict reste celui du statut. |
| D4 | Données publiques | Prénom + nom, formation, organisme, date, mention, score, empreinte ; jamais l'email ni un identifiant de personne. |
| D5 | Expiration | Pas de date d'expiration dans le modèle : pas de verdict EXPIRE (DS-05). **Écart.** |
| D6 | Traçabilité | Audit `CERTIFICAT_VERIFIE` (verdict, IP, sans acteur) plutôt qu'une table `verifications_certificat` et un compteur. **Écart.** |
| D7 | PDF public | Seulement valide et intègre (revérifié) ; sinon la même 404. |
| D8 | Comparaison d'un PDF reçu | Dans le navigateur (`crypto.subtle`) : le fichier du visiteur n'est jamais envoyé. |
| D9 | Limitation de débit | Reportée à US-CERT-05 (son objet). |

## Fichiers
- `apps/api/src/modules/certificats/{verification.controller,verification.service,verification.regles}.ts` (+ specs), `certificats.module.ts`
- `apps/api/test/verification.e2e-spec.ts` (marqueur `E2E-VERIFPUB`)
- `apps/web/src/app/verifier/[id]/page.tsx`, `lib/api.ts`, `globals.css`

## Incidents
- Bouton-lien vert au texte sombre (`.btn-lien` hérite la couleur) : corrigé
  globalement (`.btn-primary-sm.btn-lien`), ce qui corrige aussi « Voir mon
  certificat » (US-CERT-03).

## Vérification
- API : lint 0, `tsc`, unitaires **57 suites / 806 tests**, e2e **33 suites / 449 tests** (en série).
- Mutations tuées (6) : route publique, intégrité recalculée, « seulement
  émis », PDF refusé si révoqué, PDF refusé si altéré, identifiant plausible.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px, sans être connecté :
  valide (PDF reçu identique), PDF différent signalé, révoqué (pas de
  téléchargement), lien inconnu ; pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-CERT-05 : limitation de débit, réponses uniformes, minimisation renforcée.
