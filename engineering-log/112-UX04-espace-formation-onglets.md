# US-UX-04 — Espace d'une formation (formateur) en onglets, modules lisibles

## En une phrase
L'espace d'une formation n'est plus une page-fleuve : quatre onglets à adresse (« Vue d'ensemble »,
« Contenu », « Apprenants », « Rapports ») sous un même en-tête, et dans « Contenu » chaque module est
un bloc repliable avec son résumé, des éléments reconnaissables à leur icône et leur pastille, des
brouillons qui se distinguent (et se masquent), et un seul bouton « Ajouter » au lieu de cinq.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Adresses des onglets | paramètre `?onglet=` ; chemins | **Chemins** : `…/formations/:id` = **Contenu** (l'adresse de la formation reste celle où l'on travaille, aucun lien existant ne change de destination), `…/:id/vue-d-ensemble` (nouveau), `…/:id/suivi` = **Apprenants**, `…/:id/rapports` = **Rapports** (pages existantes, mêmes fonctions). Liens partageables, retour arrière du navigateur. Onglets dans l'ordre de la spécification. |
| D2 | Pourquoi « Contenu » à l'adresse de la formation | — | C'est l'onglet de travail ; l'avoir à l'adresse d'origine garde chaque action d'ajout à **un clic de plus au plus** (le menu « Ajouter ») depuis la page d'avant (règle E11 vérifiée par l'inventaire). |
| D3 | En-tête commun | layout Next ; composant | Composant `EnTeteFormation` (titre `h1`, statut en pastille, dates, durée, nombre de modules, `Onglets` à adresse) placé en tête des quatre pages ; les titres des pages « Suivi pédagogique » et « Rapports de session » passent en `h2` (un seul `h1` par page). |
| D4 | Vue d'ensemble | — | Fiche de la formation (capacité, seuil, description, objectifs, prérequis — déplacés depuis la page d'avant), 4 indicateurs cliquables lus dans le suivi pédagogique existant (apprenants actifs, avancement moyen, alertes, contenu publié) et le programme (modules) avec « Préparer le contenu ». Aucune API nouvelle. |
| D5 | Modules lisibles | — | Bloc repliable (bouton `aria-expanded` sur le titre) : numéro, titre, **résumé** « n QCM dont n publiés · n ateliers · n ressources · n supports IA » (règle pure `resumeModule`, testée) ; déplié par défaut, « Tout replier / Tout déplier ». Éléments : icône par type (QCM bleu, atelier ambre), pastille de statut. |
| D6 | Brouillons | — | Fond blanc, contour en tirets, icône grise (et pastille « Brouillon ») ; filtre « Masquer les brouillons (n) ». |
| D7 | Ajouts d'un module | 5 boutons ; un menu | **Un bouton « Ajouter »** (`MenuActions`, principal du bloc) : Nouveau QCM, Nouvel atelier, Lien ou vidéo, Fichier, Support pour l'IA. Les fenêtres sont celles d'avant : `RessourcesFormateur` et `SupportsModule` reçoivent une demande d'ajout (`demandeAjout`), peuvent masquer leurs propres boutons (`boutonsAjout={false}`) et remontent leur nombre d'éléments (`onCompte`) ; utilisés ailleurs, ils ne changent pas. Équivalences de libellés documentées (`docs/ux/equivalences.json`) : « + Nouveau QCM » → « Nouveau QCM », etc. |
| D8 | Menu latéral | — | Les quatre onglets gardent « Mes formations » actif (les motifs du suivi et des rapports d'une formation sont retirés d'« Apprenants » et de « Rapports ») : fil d'Ariane « Accueil › Mes formations › Formation › Onglet ». |
| D9 | Inventaire | — | L'outil ouvre désormais les fenêtres des éléments de menu sans effet destructeur (profondeur 2), pour vérifier que « Créer », « Enregistrer »… des fenêtres d'ajout restent atteignables. |

Pages touchées : `app/formateur/formations/[id]/page.tsx`, `…/vue-d-ensemble/page.tsx` (nouvelle), `…/suivi/page.tsx`, `…/rapports/page.tsx` ; composants `EnTeteFormation` (nouveau), `RessourcesCours.tsx`, `SupportsModule.tsx` ; `navigation.ts`.

## Fichiers
- **Web** : `components/EnTeteFormation.tsx` (nouveau), `app/formateur/formations/[id]/page.tsx` (onglet Contenu), `app/formateur/formations/[id]/vue-d-ensemble/page.tsx` (nouveau), `…/suivi/page.tsx` et `…/rapports/page.tsx` (en-tête et onglets, titre en `h2`), `components/RessourcesCours.tsx` et `components/SupportsModule.tsx` (`demandeAjout`, `boutonsAjout`, `onCompte`), `components/navigation.ts` (+ test), `lib/ui-regles.ts` (`resumeModule`, + test), `app/globals.css` (bloc US-UX-04).
- **Outil** : `outils/recette/inventaire-actions.js` (fenêtres des éléments de menu, coque exclue du relevé des pages) ; `docs/ux/equivalences.json` (5 libellés d'ajout).
- **Docs** : `docs/GUIDE_DEMO.md`, `docs/GUIDE_STYLE.md` § 10, backlog, `CHANGELOG.md`.

## Vérification
- Web : tests unitaires 100 / 100 (`resumeModule`, entrée active des onglets de formation) ; `tsc`, `next lint --max-warnings 0`, `next build`. Mutation 3 / 3 tués (QCM publiés, ressources non chargées, pluriel).
- API inchangée : unitaires **130 suites / 1 671 tests**, e2e **81 suites / 940 tests** (+ 1 ignoré), lint, `tsc`.
- Recette Playwright (production, 1280 / 390 px, captures relues) : chaque onglet change d'adresse et garde « Mes formations » actif dans le menu, fil d'Ariane « Accueil › Mes formations › Formation › Onglet », retour arrière du navigateur ; « Ajouter » au clavier (Entrée → « Nouveau QCM », Échap rend le focus) ; « Lien ou vidéo » et « Support pour l'IA » ouvrent les fenêtres d'avant ; module replié / déplié ; un QCM brouillon créé pour l'essai est en tirets, compté dans « Masquer les brouillons (1) » et masqué par le filtre ; un seul `h1` par onglet ; aucun défilement horizontal, aucune erreur console.
- Audit de navigation formateur + administrateur : **70 pages, 0 problème** (un premier passage signalait « Masquer les brouillons 0 » sans effet : le filtre n'apparaît plus quand il n'y a aucun brouillon).
- Inventaire comparé à « avant » : **295 conservées, 0 plus loin, 0 perdue** ; « Créer », « Enregistrer », « Déposer » des fenêtres d'ajout relevés à 2 clics (1 avant).
