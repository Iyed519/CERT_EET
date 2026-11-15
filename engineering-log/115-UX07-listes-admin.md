# US-UX-07 — Listes de l'administrateur : une action principale, les autres dans un menu

## En une phrase
Dans les listes de l'administrateur (Comptes, Demandes de rôle, Formations, Demandes d'affectation,
Propositions, Certificats, Générations IA), chaque ligne montre l'essentiel, une pastille de statut et
**une** action visible, les autres étant dans le menu « ⋯ » (les dangereuses en dernier, séparées,
avec leur confirmation inchangée) ; toutes les listes partagent la même barre (recherche, filtres en
pastilles avec compteurs, actualiser, action principale de la page) et la même pagination, et
deviennent des cartes lisibles sous 640 px.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Périmètre | — | Comptes, Demandes de rôle, Formations, Demandes d'affectation, Propositions, Certificats (spécification) et Générations IA (liste de l'administrateur). La page *Rapports* (formulaire + « Mes rapports ») passe en cartes avec US-UX-08, qui la cite explicitement. |
| D2 | Ligne | 5 boutons ; 1 + menu | Une action visible (bouton secondaire `btn-sm` : le rouge plein reste réservé à l'action principale de la page) + `MenuActions` (⋯, nommé « Plus d'actions pour … ») avec **toutes** les autres ; dangereuses (Désactiver, Anonymiser, Refuser, Révoquer, Statut d'une formation) en dernier, après un séparateur, texte rouge sombre ; leurs fenêtres de confirmation ne changent pas. Pas de menu quand il n'y a pas d'autre action. |
| D3 | Action visible par liste | — | **Comptes** : selon le statut — Changer le rôle (actif), Renvoyer l'activation (en attente), Réactiver (désactivé) ; anonymisé : aucune. **Demandes de rôle / d'affectation** (en attente) : Approuver / Accepter, ⋯ Refuser. **Propositions** (en attente ou à modifier) : Accepter, ⋯ Demander des modifications, Refuser. **Formations** : « **Gérer** » (bouton-menu nommé, comme le demande la spécification) : Modifier, Modules, Formateurs, Inscriptions, puis Statut (clôturer / archiver / rouvrir) séparé ; archivée : inchangé (« Figée »). **Certificats** : Relancer (en file / en génération), Réémettre (révoqué pour erreur, non remplacé), sinon Fiche ; ⋯ Fiche, puis Révoquer (actif) séparé. **Générations IA** : Détail. |
| D4 | Clic sur la ligne | — | Ouvre sa fiche quand elle existe : nom du titulaire d'un certificat → fenêtre « Fiche » ; titre d'une génération IA → « Détail ». Les autres listes n'ont pas de fiche (aucune créée : pas de nouvelle page). |
| D5 | Barre commune `BarreListe` | — | Nouveau composant : recherche (champ `type="search"` ; locale et instantanée quand toute la liste est chargée, envoyée au serveur pour Certificats comme avant), filtres en pastilles (`FiltresPastilles`) avec compteurs, « Actualiser » en bouton discret, action principale de la page à droite (« Importer des comptes », « Nouvelle formation »). Les `<select>` de filtre deviennent des pastilles (équivalence « Filtrer par statut » → « Tous » / statut). |
| D6 | Compteurs | changer l'API ; appels existants | Aucune API changée. Comptes (liste complète) : comptés dans la page (règle pure `compterPar`). Listes filtrées côté serveur (Formations, Demandes de rôle, d'affectation, Propositions, Générations IA) : un appel existant par statut (`limit=1` quand l'API le permet, lecture du `total`), en parallèle, relancé après chaque chargement (`useCompteurs`). Certificats : le filtre de statut reste côté serveur (l'API rend 200 certificats au plus : filtrer dans la page en aurait oublié) ; un appel par statut avec la même recherche et le même « Échecs définitifs » donne les compteurs, relus quand les filtres changent ou après une action (pas à chaque actualisation de 3 s). |
| D7 | Pagination | trois styles | Composant `PaginationListe` (« 12 comptes · page 1 / 2 », Précédent / Suivant) ; pagination serveur inchangée (Formations, Générations IA), pagination locale de 20 lignes (Comptes, Certificats) par la règle pure `paginer`. |
| D8 | Mobile | tableau qui défile | Sous 640 px, chaque ligne devient une carte (`table-compacte` existante, étendue : libellés des cellules, actions en pied de carte) ; Certificats sont déjà des cartes ; aucun défilement horizontal. |
| D9 | Statuts | badges | `PastilleStatut` (couleur + icône + texte) partout. |
| D10 | En-tête | `page-head` | `EnTetePage` (titre, phrase, action principale) sur chaque liste. |

Pages touchées : `app/admin/utilisateurs`, `role-requests`, `formations`, `demandes-affectation`, `propositions-formation`, `certificats`, `generations-ia` ; nouveaux composants `BarreListe`, `PaginationListe` ; règles `compterPar`, `correspondRecherche`, `paginer` (`lib/ui-regles.ts`) ; CSS (bloc US-UX-07).

Arborescence d'une liste :
```
En-tête (titre, phrase, [action principale de la page])
Barre : [recherche] [Tous n] [Statut A n] [Statut B n] …   [Actualiser]
Liste : nom / détails · pastille · [action visible] [⋯ autres · ─ · dangereuses]
Pagination : « n éléments · page p / q »  [Précédent] [Suivant]
```

## Fichiers
- **Web** : `app/admin/utilisateurs`, `role-requests`, `formations`, `demandes-affectation`, `propositions-formation`, `certificats`, `generations-ia` (`page.tsx`) ; nouveaux composants `components/ActionsLigne.tsx`, `BarreListe.tsx`, `PaginationListe.tsx` (rappel des filtres appliqués) ; `lib/useCompteurs.ts` ; `lib/ui-regles.ts` (`compterPar`, `correspondRecherche`, `paginer`, + tests) ; `components/MenuActions.tsx` (un défilement dans les 400 ms qui suivent l'ouverture replace le menu au lieu de le fermer) ; `app/globals.css` (bloc US-UX-07).
- **Outils / docs** : `docs/ux/equivalences.json` (« Importer un CSV » → « Importer des comptes » ; « Filtrer par statut » / « Statut » (listes) → pastilles « Tous les statuts # » / « Tous # » ; filtres des certificats avec compteur « Tous # », « Émis # »… ; « ← Précédente » / « Suivante → » → « Précédent » / « Suivant ») ; `docs/GUIDE_STYLE.md` (§ 10 : listes de l'administrateur) ; `docs/GUIDE_DEMO.md` (§ 4.4) ; backlog ; `CHANGELOG.md`.

## Vérification
- Web : tests unitaires **116 / 116** (`compterPar` ; `correspondRecherche` : vide, casse, accents, espaces, mots répartis sur plusieurs champs, mot absent, champ absent ; `paginer` : découpage, dernière page partielle, bornes, liste vide) ; `tsc`, `next lint --max-warnings 0`, `next build`.
- Mutation à la main : **9 mutants, 8 tués** ; le survivant (`champs.filter(Boolean)` retiré) était équivalent (`join` rend null et undefined en chaîne vide) : le filtre a été retiré du code.
- Recette Playwright (production, 1280 / 390 px, captures relues) : Comptes — barre (recherche, rôles 9 / 6 / 2 / 1, statuts), une action visible « Changer le rôle » et ⋯ « Désactiver », « Anonymiser » (rouge, séparés) ; recherche « san » → 1 ligne ; cartes lisibles à 390 px, menu ouvert au doigt après défilement ; Formations — pastilles (Tous 5, Brouillon 0, Ouverte 3, Fermée 1, Archivée 1), « Gérer » ouvre Modifier, Modules, Formateurs, Inscriptions, puis Statut séparé ; flèche bas puis Échap rend le focus à « Gérer » ; archivée : « Figée (archivée) » ; Certificats — clic sur le nom → fiche, « Fiche » visible, ⋯ « Révoquer » ; aucun défilement horizontal, aucune erreur console.
- Audit de navigation (1280 et 390 px) : administrateur **26 pages, 0 problème** ; formateur **44 pages, 0 problème**. Deux passages précédents avaient signalé (1) la pastille « Actif 9 » sans effet visible (même liste que « Tous ») — la pagination rappelle désormais les filtres appliqués (« 9 comptes · filtre : Actif ») ; (2) à 390 px, des menus ⋯ refermés aussitôt par le défilement qui amène le bouton à l'écran — corrigé dans `MenuActions`.
- API inchangée par cette story (code identique à US-UX-06) : ESLint, `tsc`, unitaires 130 suites / 1 671 tests, e2e 81 suites / 940 tests (+ 1 ignoré), passés sur US-UX-06.
- Inventaire comparé à « avant » : **295 conservées, 0 perdue, 0 plus loin** (actions des lignes à un clic de plus, dans ⋯ ou « Gérer »).
