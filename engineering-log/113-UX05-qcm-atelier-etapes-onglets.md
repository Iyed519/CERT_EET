# US-UX-05 — Éditeur de QCM et page d'atelier en étapes et onglets

## En une phrase
Le formateur voit où en est son QCM (ou son atelier, ou une correction) dans son parcours — rédiger,
paramétrer, publier, suivre — grâce à un bandeau d'étapes qui porte la prochaine action, et trouve
chaque partie dans un onglet ; la liste des questions devient compacte et les ajouts sont réunis dans
« Ajouter des questions ».

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Étapes du QCM | — | `Etapes` : 1 Questions (n), 2 Paramètres anti-fraude, 3 Publication, 4 Résultats, chacune « fait / à faire / bloquant / en cours » avec un détail (règle pure `etapesQcm`, testée). « Bloquant » : paramètres enregistrés mais tirage impossible ou fermeture passée (conditions de publication existantes). Cliquer une étape ouvre son onglet. |
| D2 | Prochaine action | — | Seul bouton plein de la page, dans le bandeau : « Saisir une question », « Configurer », « Publier » (désactivé tant qu'une condition manque) ou, une fois publié, « Voir les tentatives ». Dans les onglets, « Configurer / Modifier les paramètres » et « Publier » restent en secondaire (mêmes fenêtres). |
| D3 | Onglets du QCM | à adresse ; dans la page | **Dans la page** (motif ARIA « tabs ») : un QCM est une seule ressource et l'éditeur garde son adresse (voir D9 pour le rendu des panneaux). « Questions » (compteur), « Paramètres » (paramètres anti-fraude et publication avec ses conditions), « Tentatives et résultats » (historique, rapport, alertes : page existante), « Surveillance » si la surveillance par caméra est activée (compteur des alertes à examiner du QCM, lu dans `GET /api/formateur/evaluations`). |
| D4 | Questions compactes | — | Une ligne par question : énoncé, type, pondération, niveau, nombre d'options ; un clic (bouton `aria-expanded`) déplie options et explication ; « Tout déplier / Tout replier ». ↑ ↓, Modifier / Explication, Retirer inchangés. |
| D5 | Ajout de questions | 3 boutons ; un menu | **« Ajouter des questions »** (`MenuActions`) : Saisir une question, Importer depuis ma banque, Importer depuis un fichier, Générer avec l'IA (lien vers le contenu de la formation, où sont les supports et « Générer »). Contenu figé : le menu s'ouvre quand même et dit pourquoi les éléments sont indisponibles (`note`) — `MenuActions` ne désactive plus son bouton. Équivalence : « + Ajouter une question » → « Saisir une question ». |
| D6 | En-tête | — | `EnTetePage` : titre, phrase, pastille de statut ; « Modifier le titre » et « Supprimer le QCM » (dangereux, désactivé avec sa raison si publié ou tenté) dans ⋯. |
| D7 | Atelier | — | Même modèle : étapes Énoncé, Grille de notation (validée ?), Publication (bloquante tant que la grille n'est pas validée), Correction et résultats (n à corriger) ; action « Compléter la grille », « Publier l'atelier » ou « Corriger les livrables » ; onglets « Énoncé » (fiche + énoncé), « Grille de notation », « Livrables et résultats » (compteur des livrables à corriger, filtres existants dont « Notés » = résultats ; ouvert par défaut une fois publié). « Modifier » et « Supprimer » dans ⋯. `LivrablesAtelier` remonte le nombre de livrables à corriger (`onCompte`). |
| D8 | Correction d'un livrable | — | Étapes « Ouvrir la correction », « Noter chaque critère (n / total) », « Envoyer le feedback » ; le score pondéré reste **collé en haut** pendant qu'on parcourt la grille ; titre de la grille avec icône. Rien d'autre ne change (règles de correction, envoi). |
| D9 | Panneaux d'onglet | tous montés ; seul l'actif | Seul le panneau actif est rendu (l'état utile vit dans la page) ; un atelier publié a forcément une grille validée (la publication l'exige), ce qui évite de monter la grille pour le savoir. L'étape de l'onglet déjà ouvert n'est pas cliquable. |
| D10 | Outils de recette | — | L'audit ne reclique plus un onglet déjà ouvert (`aria-selected`), comme un filtre déjà choisi ; l'inventaire revient à l'état d'origine après un onglet et relève les fenêtres des boutons apparus dans un onglet (profondeur 2). |

Pages touchées : `app/formateur/qcm/[id]/page.tsx`, `app/formateur/ateliers/[id]/page.tsx`, `app/formateur/livrables/[id]/page.tsx` ; composants `MenuActions` (note, bouton jamais désactivé s'il a des éléments), `Onglets` (`PanneauOnglet cache`), `LivrablesAtelier` (`onCompte`) ; `lib/ui-regles.ts`.

## Fichiers
- **Web** : `app/formateur/qcm/[id]/page.tsx` (en-tête, ⋯, étapes, onglets, questions compactes, « Ajouter des questions »), `app/formateur/ateliers/[id]/page.tsx` (même modèle), `app/formateur/livrables/[id]/page.tsx` (étapes, note collante), `components/MenuActions.tsx` (`note`), `components/Onglets.tsx` (`PanneauOnglet cache`), `components/LivrablesAtelier.tsx` (`onCompte`), `lib/ui-regles.ts` (`etapesQcm`, + tests), `app/globals.css` (bloc US-UX-05).
- **Outils** : `outils/recette/audit-navigation.js` (onglet ouvert non recliqué), `outils/recette/inventaire-actions.js` (onglets, `VERBEUX`) ; `docs/ux/equivalences.json` (+ « Saisir une question »).
- **Docs** : `docs/GUIDE_DEMO.md`, `docs/GUIDE_STYLE.md` (§ 6), `docs/guide-style/formateur-editeur-qcm.png` (mise à jour), backlog, `CHANGELOG.md`.

## Vérification
- Web : tests unitaires 104 / 104 (`etapesQcm` : nouveau QCM, questions puis paramètres, bloquant avec son détail, publié avec ou sans tentatives) ; `tsc`, `next lint --max-warnings 0`, `next build`. Mutation 4 / 4 tués (après un survivant — « résultats » sans publication — couvert par un test ajouté).
- Recette Playwright (production, 1280 / 390 px, captures relues) : QCM publié et figé — étapes toutes faites sauf « Résultats » (en cours), action « Voir les tentatives » ; onglets Questions (5) / Paramètres / Tentatives et résultats ; « Ajouter des questions » s'ouvre et explique que le contenu est figé ; une question se déplie (options, explication) ; atelier publié — onglet « Livrables et résultats (1) » ouvert, « Corriger les livrables » place le focus sur le premier livrable ; correction — étapes 1 faite, 2 en cours (0 / 2), note collante ; aucun défilement horizontal, aucune erreur console.
- API inchangée : lint, `tsc`, unitaires **130 suites / 1 671 tests**, e2e **81 suites / 940 tests** (+ 1 ignoré).
- Audit de navigation formateur + administrateur : **0 problème** (formateur 44 pages, administrateur 26 au passage précédent) ; un premier passage signalait les onglets et les étapes sans effet visible (panneaux masqués en même longueur de page) : seul le panneau actif est rendu et l'étape de l'onglet ouvert n'est plus un bouton.
- Inventaire comparé à « avant » : **295 conservées, 0 perdue** ; les fenêtres « Modifier les paramètres » et « Explication » sont relevées depuis leurs onglets.
