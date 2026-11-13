# US-UI-04 — Parcours apprenant refondu

## En une phrase
Chaque écran du parcours apprenant a un titre clair, une phrase qui dit à quoi il sert, au plus une
action principale, un fil d'Ariane jusqu'à la page courante, des états vides qui disent quoi faire,
et ses fenêtres sur la fenêtre unique accessible ; les mots sont les mêmes que dans le menu.

## Point de départ
Révision v2.2, E10, Must, 5 pts. Captures avant (1280 / 390 px) des 11 pages : catalogue, fiche
formation, mon espace, mes formations, page d'une formation, atelier, tentative, mes évaluations,
mes certificats, sécurité, changer de rôle. Constats : lien « ← Retour » doublé par le fil d'Ariane ;
la page d'une formation s'appelle encore « Mon espace » (nom de l'accueil depuis US-UI-03) ; titre
« Mes inscriptions » alors que le menu dit « Mes formations » ; une tentative notée affiche encore un
chronomètre « 00:00 » ; un QCM réussi propose « Nouvelle tentative » en bouton plein rouge ; fenêtres
d'inscription, de démarrage et de désinscription recopiées à la main.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Composants | — | `components/EnTetePage.tsx` (titre, phrase, pastille d'état, actions) et `components/EtatVide.tsx` (titre, phrase, action ; classes `.etat-vide` d'US-UI-02). Utilisés par toutes les pages du parcours. |
| D2 | Fil d'Ariane jusqu'à la page | — | `components/TitrePage.tsx` : une page profonde déclare ses miettes (`useMiettes([...])`) ; `FilAriane` les ajoute après la section (« Accueil › Mes formations › Développement web › Atelier — API REST »). Les liens « ← Retour » des pages profondes du parcours sont retirés (le fil d'Ariane y mène) ; le bouton de retour d'une fin de parcours (résultat d'un QCM) reste, en secondaire. |
| D3 | Vocabulaire | — | Le menu fait foi : `/mes-inscriptions` s'intitule « Mes formations » ; « Mon espace » = l'accueil ; la page d'une formation garde son titre (nom de la formation) et ses liens disent « Retour à la formation ». |
| D4 | Une action principale | — | Page d'une formation : QCM à faire → « Commencer » plein ; QCM en cours → « Reprendre » plein ; QCM réussi → « Nouvelle tentative » en secondaire ; échoué → « Retenter » plein. Tentative notée ou soumise : plus de chronomètre ; « Retour à la formation » en secondaire ; « Voir le corrigé » plein quand il est disponible. Catalogue : « S'inscrire » reste l'action de chaque carte (une par formation, la recherche passe en secondaire). |
| D5 | Fenêtres | — | Sur `Fenetre` (US-UI-01) : confirmation d'inscription (`ConfirmationInscription`), démarrage d'une tentative (`DemarrageTentative`), désinscription (`/mes-inscriptions`). `ProfilGate` (complétion obligatoire du profil, non fermable par conception) garde son balisage : la règle « Échap ferme » n'y a pas de sens. |
| D6 | États vides | — | Catalogue (aucune formation ouverte / aucun résultat → « Effacer la recherche »), mes formations (→ « Parcourir le catalogue »), mes évaluations (→ « Aller à mon espace »), mes certificats (ce qu'il faut valider), page d'une formation sans module, atelier sans grille. |
| D7 | Portée | — | Aucune API, règle métier ni texte réglementaire changé (consignes de surveillance, règles du QCM, mentions du certificat : à l'identique). Les e2e et unitaires ne changent pas. |

## Correctif trouvé pendant la recette
Un bouton plein rendu par un lien (`<a class="btn btn-lien">`, ex. « Parcourir le catalogue »
d'US-UI-03, « Aller à mon espace ») héritait de `.btn-lien { color: inherit }` : texte foncé sur
rouge, illisible. Règle `a.btn.btn-lien:not(.btn-secondaire)` → texte blanc (4,88:1).

## Fichiers
- `apps/web/src/components/EnTetePage.tsx`, `EtatVide.tsx`, `TitrePage.tsx` (nouveaux),
  `FilAriane.tsx` (miettes de page), `DemarrageTentative.tsx`, `ConfirmationInscription.tsx`
  (sur `Fenetre`), `RessourcesCours.tsx` (libellé)
- `apps/web/src/app/layout.tsx` (`MiettesProvider`), `catalogue/page.tsx`, `catalogue/[id]/page.tsx`,
  `mes-inscriptions/page.tsx` (« Mes formations », désinscription sur `Fenetre`),
  `mes-inscriptions/[formationId]/page.tsx`, `mes-ateliers/[atelierId]/page.tsx`,
  `tentatives/[id]/page.tsx`, `mes-tentatives/page.tsx` (« Mes évaluations »),
  `mes-certificats/page.tsx`, `globals.css`
- Backlog (E10), `CHANGELOG.md`

## Vérification
- `tsc`, `next lint` (0 avertissement), `next build`. Aucune API changée.
- Captures avant / après des 11 pages du parcours à 1280 et 390 px (plus états vides avec un
  apprenant sans inscription, recherche sans résultat) ; console propre.
- Playwright `ws/pw/ui04.js` : fenêtres de démarrage, d'inscription et de désinscription (focus
  dedans, piégé, Échap, focus rendu, clic extérieur, croix, plein écran à 390 px) ; fil d'Ariane
  « Accueil › Mes formations › formation › atelier » ; aucun lien « ← » restant.
- Unitaires **125 / 1 584** ; e2e **77 / 907** (906 + 1 ignoré) ; audit de navigation **104 pages, 0 problème**.
