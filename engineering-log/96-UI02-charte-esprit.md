# US-UI-02 — Charte graphique ESPRIT : jetons, logo, composants de base

## En une phrase
L'interface passe aux couleurs d'ESPRIT (rouge de marque, noir, gris, blanc), avec le logo fourni
dans l'en-tête et le pied de page ; le rouge est réservé à la marque et à l'action principale, la
réussite garde un vert sobre, l'erreur un rouge plus sombre accompagné d'une icône et d'un texte ;
boutons, messages, états vides et focus viennent d'une seule définition ; les PDF (certificat,
rapport QCM) prennent le rouge ESPRIT sans changer de contenu.

## Point de départ
Révision v2.2, E10, Must, 5 pts. Jetons de `globals.css` posés par la refonte #106 (journal 91) :
vert pour la marque **et** pour les états de réussite, fond lavande, boutons redéfinis trois fois
(`.btn` en tête de fichier, dans la refonte, puis un correctif `.btn.btn-secondaire` en fin de
fichier — journal 93). Logo fourni par le porteur (pièce jointe du 13/11/2026, 231 × 234 px).

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Palette | — | Jetons (contrastes **calculés**, formule WCAG 2.1) : `--primary` = rouge ESPRIT `#E30613` (blanc dessus 4,88:1 — boutons pleins) ; `--primary-dark` `#B1040E` (texte et liens : 7,26:1 sur blanc, 6,78:1 sur le fond, 6,36:1 sur `--primary-soft`) ; `--primary-soft` `#FDECEC` ; `--ink` `#1D1D1B` (16,9:1) ; `--muted` `#5F6368` (6,05:1 sur blanc, 5,65:1 sur le fond, 5,50:1 sur `#F4F4F5`) ; surfaces `#FFFFFF` / `#FAFAFA` / `#F4F4F5` ; filets `#E4E4E7` / `#D4D4D8` ; fond `#F7F7F8` (gris très clair, au lieu du lavande). États sobres : `--succes` `#1E7A45` (5,35:1), `--succes-fonce` `#17663A` (6,25:1 sur `--succes-doux` `#E8F5EE`), ambre `#8A5A00` sur `#FEF3E2` (5,40:1), info `#1D4F91` sur `#E8F0FB` (7,09:1), `--danger` `#9B1C1C` (8,15:1 sur blanc ; 7,14:1 sur `#FDECEC`). |
| D2 | Marque ≠ réussite | Garder `--primary` pour tout · **séparer** | Les noms `--primary*` sont gardés (≈ 160 usages : boutons, liens, navigation active, focus, accent des cases) et passent au rouge. Les règles d'**état de réussite** (pastilles sur `--success-soft`, bonnes réponses, conditions remplies, barres de progression et de score, verdict « valide », confiance haute, états OUVERT / ACTIF / PUBLIE / TERMINEE…) basculent sur de nouveaux jetons `--succes`, `--succes-fonce`, `--succes-doux` : une réussite ne devient jamais rouge. Liste fermée des sélecteurs, appliquée par un script relu (pas de remplacement aveugle). |
| D3 | Erreur | — | Rouge plus sombre (`--danger`), **et** une icône (⚠) **et** un texte : `.alert-error` reçoit une bordure gauche et l'icône ; `.alert-success` ✓, `.alert-info` ℹ. La couleur ne porte jamais seule le sens. |
| D4 | Logo | Redessiner · **fichier du porteur** | `apps/web/public/logo-esprit.webp` = la pièce jointe, octet pour octet. `logo-esprit-bandeau.webp` = la même image dont seules les marges blanches sont retirées (rognage au cadre du contenu, 201 × 78 px + 4 px), pour tenir dans un en-tête de 40 px. Aucun dessin refait. `alt="ESPRIT — Se former autrement"`. En-tête : logo + filet + « Cert_EET » ; pied de page : logo réduit. Favicon `icon.svg` gardée (« CE ») et déclinée en rouge ESPRIT. |
| D5 | Une seule bibliothèque | — | Boutons définis **une fois**, dans l'ordre (`.btn` plein rouge = action principale ; `.btn-secondaire` et `.btn.btn-secondaire` contour ; `.btn-sm` discret ; `.btn-primary-sm` plein ; `.btn-danger` / `.btn-danger-solid`) : la définition de tête de fichier perd son dégradé et son ombre vertes, le correctif de fin de fichier (journal 93) est supprimé, la variante secondaire est déclarée après `.btn`. Nouveau composant d'**état vide** `.etat-vide` (titre + phrase + action), utilisé par les stories de parcours. Fenêtre : `Fenetre` (US-UI-01). Champs, tableaux, pastilles, cartes : mêmes classes, nouveaux jetons. |
| D6 | Focus | — | Contour rouge foncé 3 px (`--primary-dark`, 7,26:1) avec décalage ; anneau des champs `rgba(227, 6, 19, 0.22)`. |
| D7 | Couleurs codées en dur | — | Dégradés verts de l'accueil public, des pastilles de marque et de l'avatar formateur → noir / rouge ESPRIT ; ombres teintées lavande → gris neutre ; survol de lien `#125c32` → `--primary-dark`. |
| D8 | PDF | — | `certificat-pdf.ts` : `VERT` (marque) → `MARQUE` rouge ESPRIT `#E30613` pour les filets et le titre (contenu inchangé). `rapport-tentative-pdf.ts` : l'en-tête passe au rouge ESPRIT ; « juste / faux » gardent vert et rouge (un état, pas la marque). Aucun test ne vérifie une couleur ; les PDF déjà émis restent tels quels (empreinte inchangée). |
| D9 | Dépendances | — | Aucune bibliothèque d'interface ajoutée ; aucune police téléchargée. |
| D10 | Portée | — | Aucune API, aucune règle, aucun texte réglementaire changé. Pages non retouchées dans leur structure (ce sont US-UI-03 → 07) : seule la charte s'applique partout. |

## Fichiers
- `apps/web/public/logo-esprit.webp` (pièce jointe du porteur, identique octet pour octet),
  `logo-esprit-bandeau.webp` (mêmes pixels, marges blanches rognées) ; `app/icon.svg` (rouge)
- `apps/web/src/app/globals.css` (jetons, états de réussite, boutons, messages, focus, état vide,
  logo), `components/SiteHeader.tsx`, `app/layout.tsx`, `components/FormationVisuel.tsx`
- `apps/api/src/modules/certificats/certificat-pdf.ts`,
  `apps/api/src/modules/tentatives/rapport/rapport-tentative-pdf.ts`
- `docs/projet/v3_2026-11-09/1_backlog/Cert_EET_Backlog_Produit.md` (E10), `CHANGELOG.md`

## Constats laissés aux stories de parcours
- Éditeur de QCM : deux boutons pleins (« Configurer », « + Ajouter une question ») → US-UI-05
  (une seule action principale par écran).
- Accueil : la carte « Certificat de réussite » garde un badge « CE » décoratif → US-UI-07.

## Vérification
- Script de bascule relu : 53 règles d'état passent sur `--succes*` ; aucune couleur verte codée
  en dur restante (`grep`).
- Contrastes calculés (formule WCAG 2.1) : voir D1 ; surtitre et accent de l'accueil `#ff8a8f`
  sur fond sombre : 4,62:1 / 7,46:1.
- `tsc` api et web, lint api et web (0 avertissement), `next build` ; unitaires **125 suites /
  1 584 tests** (dont les générateurs PDF).
- e2e complet : **77 suites / 907 tests** (906 + 1 ignoré). Audit de navigation : **104 pages, 0 problème**.
- Playwright 1280 / 390 px, captures avant / après de 14 pages (accueil, catalogue, connexion,
  inscription, mes inscriptions, mon espace, mes tentatives, mes certificats, tableau de bord
  formateur, formation, éditeur de QCM, tableau de bord admin, utilisateurs, formations) ; console
  propre.
