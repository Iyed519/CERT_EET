# US-UI-05 — Parcours formateur refondu

## En une phrase
Chaque écran du formateur (mes formations, page d'une formation, éditeur de QCM et import
US-IA-08, tentatives, ateliers et livrables à corriger, suivi, rapports, alertes, demandes et
propositions) a un titre, une phrase qui dit à quoi il sert, au plus une action pleine (l'étape
suivante), un fil d'Ariane jusqu'à la page courante, des états vides utiles ; toutes les fenêtres
de formulaire réagissent au clavier comme la fenêtre unique.

## Point de départ
Révision v2.2, E10, Must, 5 pts. Captures avant (1280 / 390 px) des 12 pages formateur (l'accueil
a été refait par US-UI-03). Constats : lien « ← » doublé par le fil d'Ariane sur 7 pages ;
plusieurs pages sans phrase d'usage ; éditeur de QCM avec deux boutons pleins (« Configurer »,
« + Ajouter une question ») plus « Publier » ; ~15 fenêtres de formulaire (question, configuration,
banque, atelier, critère, grille, génération, suggestions, supports, ressources…) sans Échap, sans
piège du focus ni clic extérieur.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | En-tête | — | `EnTetePage` (US-UI-04) sur chaque page, avec une phrase d'usage. |
| D2 | Fil d'Ariane | — | `useMiettes` : formation (titre), rapports et suivi (formation › page), éditeur de QCM (formation › QCM), tentatives (QCM › Tentatives), atelier (formation › atelier), livrable (atelier › Correction — apprenant). Liens « ← » retirés. Alertes, demandes, propositions sont des pages de premier niveau : leur lien « ← » part aussi. |
| D3 | Éditeur de QCM | — | Une seule action pleine, **l'étape suivante** : aucune question → « + Ajouter une question » ; des questions sans paramètres → « Configurer » ; configuré et non publié → « Publier » ; publié → aucune. Les autres restent disponibles en secondaire. Règle pure `etapeSuivanteQcm`. |
| D4 | Fenêtres de formulaire | Réécrire 15 composants · **un gestionnaire unique** | `components/GestionFenetres.tsx` (dans `layout.tsx`) donne à toute fenêtre `.profil-overlay` non bâtie sur `Fenetre` le même comportement : `role="dialog"` / `aria-modal` posés s'ils manquent, focus placé dans la fenêtre, piégé (Tab / Maj+Tab), Échap et clic sur le fond déclenchent **sa propre croix** (`.modal-close`, donc son `onClose` et son état désactivé pendant un envoi), focus rendu à l'élément d'origine ; seule la fenêtre la plus haute réagit. Une fenêtre sans croix (`ProfilGate`, obligatoire) ne se ferme pas. Le comportement est ainsi unifié pour les trois rôles sans toucher au contenu de ces formulaires (risque nul pour leurs règles) ; leur passage sur le composant `Fenetre` reste une simplification de code possible, sans effet visible. |
| D5 | États vides | — | Mes formations (→ « Demander une formation »), alertes (« Aucune alerte ouverte »), demandes et propositions, tentatives d'un QCM. |
| D6 | Import US-IA-08 | — | Déjà sur `Fenetre` et la charte (US-UI-01 / 02) ; le bouton « Importer depuis un fichier » reste en secondaire à côté de « Importer depuis ma banque ». |
| D7 | Portée | — | Aucune API ni règle métier ; e2e et unitaires inchangés. |

## Constat corrigé pendant la recette
Deux fenêtres empilées (question ouverte depuis la fenêtre d'import) : un seul Échap fermait les
deux (le premier écouteur fermait la plus haute, le suivant voyait alors celle du dessous comme la
plus haute). Correctif : `stopImmediatePropagation` dans `GestionFenetres` et `Fenetre`. La fiche
d'un apprenant du suivi pédagogique (une « fiche », catégorie D2 d'US-UI-01, sans croix
standard) passe sur `Fenetre`. Les pages d'administration qui ont des fenêtres sans croix standard
(utilisateurs, certificats, demandes de rôle) sont traitées par US-UI-06.

## Fichiers
- `apps/web/src/components/GestionFenetres.tsx` (nouveau), `Fenetre.tsx`, `app/layout.tsx`
- `apps/web/src/app/formateur/formations/page.tsx`, `formations/[id]/page.tsx`,
  `formations/[id]/rapports/page.tsx`, `formations/[id]/suivi/page.tsx`, `qcm/[id]/page.tsx`
  (`etapeSuivanteQcm`), `qcm/[id]/tentatives/page.tsx`, `ateliers/[id]/page.tsx`,
  `livrables/[id]/page.tsx`, `alertes/page.tsx`, `demandes/page.tsx`, `propositions/page.tsx`
- Backlog (E10), `CHANGELOG.md`

## Vérification
- `tsc`, `next lint` (0 avertissement), `next build`. Aucune API changée.
- Captures avant / après des 12 pages formateur (1280 / 390 px) ; console propre.
- Playwright `ws/pw/ui05.js` : éditeur de QCM avec une seule action pleine ; fenêtres « question »,
  « configuration », « banque » (anciennes fenêtres, gérées par `GestionFenetres`) : focus dedans,
  piégé, Échap, focus rendu, clic extérieur, croix, plein écran à 390 px ; fenêtres empilées : Échap
  ferme seulement la plus haute ; fiche du suivi ; fils d'Ariane de la formation, du suivi, de
  l'atelier et de la correction ; aucun lien « ← ».
- Unitaires **125 / 1 584** ; e2e **77 / 907** (906 + 1 ignoré) ; audit de navigation **104 pages, 0 problème**.
