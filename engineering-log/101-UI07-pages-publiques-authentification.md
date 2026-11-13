# US-UI-07 — Pages publiques et authentification refondues

## En une phrase
Les pages vues sans compte (accueil, connexion avec MFA et OAuth, inscription, vérification de
l'adresse, mot de passe oublié et réinitialisation, activation, vérification publique d'un
certificat, page introuvable) suivent la charte ESPRIT, n'ont qu'une action pleine et disent
toujours quoi faire ensuite.

## Point de départ
Révision v2.2, E10, Should, 3 pts. Captures avant (1280 / 390 px) de 12 adresses publiques.
Constats : sur « Se connecter » et « Créer un compte », l'en-tête propose encore le même bouton
que la page ; deux boutons pleins sous le formulaire (« Se connecter » rouge et « Continuer avec
GitHub » noir) ; carte « certificat » de l'accueil marquée « CE », sans rapport avec la marque ;
bordure des champs violet-gris héritée de l'ancien thème indigo ; message technique « jeton
manquant » ; « Certificat introuvable » et « Page introuvable » sans icône ni suite claire.
Le catalogue public redirige vers la connexion (règle d'accès existante, inchangée).

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | En-tête visiteur | garder les deux boutons ; masquer celui de la page courante | Sur `/login`, le bouton « Se connecter » de l'en-tête (et du menu mobile) disparaît ; sur `/register`, « S'inscrire » / « Créer un compte » aussi. La page est déjà cette action. |
| D2 | Boutons OAuth | GitHub sombre ; GitHub contour | GitHub prend le même style contour que Google : la seule action pleine reste l'envoi du formulaire. Logo GitHub en couleur du texte. |
| D3 | Carte de l'accueil | « CE » ; logo ESPRIT | Le badge « CE » est remplacé par le logo ESPRIT déjà servi (`logo-esprit-bandeau.webp`) sur fond blanc. |
| D4 | Bordure des champs | violet-gris `#8e88a6` ; gris neutre | Gris neutre `#8a8a8f` (contraste 3,4:1 sur blanc, critère 1.4.11 conservé), survol `#6b6b70`. |
| D5 | Messages et suite | — | « Lien invalide » (vérification de l'adresse) : phrase sans jargon et deux suites (« Se connecter », « Créer un compte ») ; « Certificat introuvable » et « Page introuvable » : icône comme les autres cartes et un lien de retour à l'accueil. |
| D6 | Portée | — | Aucune API, aucune règle (accès au catalogue, MFA, OAuth) modifiée ; seuls des textes, classes et styles côté web. |

## Fichiers
- `apps/web/src/components/SiteHeader.tsx` (bouton de la page courante masqué, en-tête et menu mobile)
- `apps/web/src/components/accueil/AccueilPublic.tsx` (logo ESPRIT sur la carte)
- `apps/web/src/app/verifier-email/page.tsx`, `app/verifier/[id]/page.tsx`, `app/not-found.tsx`
- `apps/web/src/app/globals.css` (bordure des champs, GitHub en contour, styles US-UI-07)
- Backlog (E10), `CHANGELOG.md`

## Vérification
- `tsc`, `next lint` (0 avertissement), `next build`. Aucune API changée.
- Captures avant / après de 12 adresses publiques (1280 / 390 px), dont l'étape MFA.
- Playwright `ws/pw/ui07.js` (31 contrôles) : en-tête sans bouton répété sur `/login` et
  `/register` (ordinateur et menu mobile) ; une seule action pleine sur la connexion ; GitHub en
  contour ; bordure grise `rgb(138, 138, 143)` ; étape MFA ; plus de badge « CE », logo chargé ;
  « jeton » absent, deux suites ; certificat introuvable avec pastille et lien ; 404 avec icône ;
  console propre (hors 404 attendus).
- Unitaires **125 / 1 584** ; e2e **77 / 907** (906 + 1 ignoré) ; audit de navigation **104 pages, 0 problème**.
