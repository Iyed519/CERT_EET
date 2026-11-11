# US-CERT-09 — L'administrateur voit le PDF d'un certificat

## En une phrase
Dans le panneau « Certificats », la fiche d'un certificat généré affiche
maintenant le PDF lui-même (aperçu intégré, téléchargement) et un lien vers sa
page de vérification publique ; chaque consultation est journalisée.

## Point de départ
Demande du porteur pendant la préparation de la démonstration : la fiche
administrateur montrait l'identifiant, le statut, le score et l'empreinte,
mais pas le document. Seul l'apprenant pouvait télécharger son PDF.

## Découpage
- Api : `GET /api/admin/certificats/:id/pdf` (`@Roles(ADMINISTRATEUR)`),
  règle pure `verifierConsultableParAdmin` (actif, expiré ou révoqué ; sinon
  409), service `pdfAdmin` (même fichier que celui de l'apprenant, lecture
  commune `lirePdf`, 503 si le stockage est injoignable), affichage en ligne
  (`Content-Disposition: inline`), audit `CERTIFICAT_PDF_CONSULTE_ADMIN`
  (statut et empreinte SHA-256).
- Web : fiche du certificat — « Voir le PDF » (aperçu dans un cadre, URL
  locale du fichier libérée à la fermeture), puis « Télécharger le PDF » ;
  « Page de vérification publique ↗ » ; libellé de l'action dans
  l'historique.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Statuts | Révoqué et expiré restent consultables par l'administrateur : c'est la preuve de ce qui a été délivré (l'apprenant, lui, ne télécharge que l'actif). Pas encore généré : 409. |
| D2 | Traçabilité | Chaque ouverture est journalisée (accès à un document personnel). |
| D3 | Aperçu | Le PDF est chargé avec le jeton d'accès (`apiFetch`) puis affiché depuis une URL locale : aucun lien direct à l'api sans jeton, CSP inchangée (`frame-src blob:` déjà admis). |

## Fichiers
- `apps/api/src/modules/certificats/certificat.regles.ts` (+ spec), `certificats.service.ts`, `certificats-admin.controller.ts`
- `apps/api/test/pdf-certificat-admin.e2e-spec.ts` (nouveau, `E2E-CERT09`)
- `apps/web/src/app/admin/certificats/page.tsx`, `lib/api.ts`, `lib/format.ts`, `app/globals.css`

## Vérification
- Api : lint 0 avertissement, `tsc`, unitaires **117 suites / 1 465 tests**,
  e2e complet en série **73 suites / 851 tests** (+ 1 ignoré), dont
  `E2E-CERT09` (5 tests : accès 401 / 403 apprenant titulaire et formateur ;
  PDF identique à celui de l'apprenant (empreinte), en ligne, journalisé ;
  révoqué et expiré consultables ; 409 / 404 / 400 sans trace ; 5
  consultations simultanées servies et journalisées).
- Mutations : **8 / 8 tuées** — révoqué refusé, expiré refusé, non généré
  admis, consultation non journalisée, audit sans empreinte, téléchargement
  au lieu d'affichage, inconnu sans 404, type de contenu faux.
- Web : `tsc`, `next lint`, `next build`. Navigateur (pile derrière nginx,
  jeu de démonstration), 1280 et 390 px : fiche -> « Voir le PDF » -> aperçu
  du certificat (QR code compris), « Télécharger le PDF », lien vers la page
  de vérification ; aucune erreur.

## CI
Voir la PR.
