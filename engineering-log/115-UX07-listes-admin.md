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
| D6 | Compteurs | changer l'API ; appels existants | Aucune API changée. Listes chargées en entier (Comptes, Certificats) : comptés dans la page (règle pure `compterPar`). Listes filtrées côté serveur (Formations, Demandes de rôle, d'affectation, Propositions) : un appel existant par statut avec `limit=1` (lecture du `total`), en parallèle, rafraîchi après chaque action. Certificats : le filtre de statut s'applique dans la page sur la liste complète (même règle d'égalité que l'API), ce qui donne les compteurs sans appel de plus ; recherche et « Échecs définitifs » restent côté serveur. |
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
_(complété en fin de story)_

## Vérification
_(complété en fin de story)_
