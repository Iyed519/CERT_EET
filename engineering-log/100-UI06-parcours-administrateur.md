# US-UI-06 — Parcours administrateur refondu

## En une phrase
Chaque écran de l'administrateur (utilisateurs et demandes de rôle, formations, affectations,
propositions, inscriptions, certificats, pilotage : rapports, risque, générations IA, audit) a un
titre, une phrase d'usage sans jargon interne, au plus une action pleine, un fil d'Ariane jusqu'à
la page courante, des états vides utiles, et des fenêtres qui se ferment toutes par la croix,
Échap ou un clic à l'extérieur.

## Point de départ
Révision v2.2, E10, Must, 5 pts. Captures avant (1280 / 390 px) des 11 pages d'administration
(l'accueil a été refait par US-UI-03, la sous-navigation par section aussi). Constats : codes de
story visibles par l'utilisateur (« (US-FORM-01) », « (US-ROL-02) »…) ; « Nouvelle formation » en
bouton discret alors que c'est l'action de la page ; six fenêtres sans croix (changer le rôle,
désactiver, anonymiser un compte, décider une demande de rôle, révoquer, fiche d'un certificat) ;
lien « ← » sur la page des inscriptions d'une formation ; page « Prédiction du risque » sans
en-tête commun.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Jargon | — | Les codes de story ne sont plus affichés (6 textes : administration et « Changer de rôle ») ; ils restent dans les commentaires du code et les journaux. |
| D2 | En-tête et action | — | `EnTetePage` avec une phrase d'usage sur chaque page ; action pleine de la page : « Nouvelle formation » (formations), « Importer un CSV » reste secondaire (utilisateurs, action rare), rapports : « Générer ». |
| D3 | Fenêtres | — | Les six fenêtres sans croix reçoivent `CroixFermeture` (classe `modal-closable`) reliée à leur `onClose` et désactivée pendant l'envoi : `GestionFenetres` (US-UI-05) leur donne alors Échap, clic extérieur et focus. Repli dans `GestionFenetres` : sans croix, Échap déclenche un bouton « Annuler » ou « Fermer » actif de la fenêtre. |
| D4 | Fil d'Ariane | — | Inscriptions d'une formation : « Accueil › Formations › {formation} › Inscriptions » (`useMiettes`), lien « ← » retiré. |
| D5 | États vides | — | Demandes de rôle, d'affectation, propositions (« Aucune demande en attente »), certificats (aucun résultat), générations IA, rapports. |
| D7 | Liste des comptes à 390 px | défilement horizontal (avant) ; cartes | Ajouté pendant la vérification : la table des comptes cachait les actions hors écran. Elle reprend le motif `table-compacte` d'US-UI-01 (nom en en-tête de ligne, libellés « E-mail », « Rôle », « Statut ») : cartes empilées sur mobile, table inchangée sur ordinateur. |
| D6 | Portée | — | Aucune API ni règle ; les textes réglementaires (motifs de révocation, avertissements d'anonymisation) inchangés. |

## Fichiers
- `apps/web/src/components/GestionFenetres.tsx` (repli « Annuler » / « Fermer » pour Échap)
- `apps/web/src/app/admin/utilisateurs/page.tsx` (croix, cartes à 390 px), `role-requests/page.tsx`,
  `certificats/page.tsx`, `formations/page.tsx`, `formations/[id]/inscriptions/page.tsx`,
  `risque/page.tsx`, `generations-ia/page.tsx`, `tableau-de-bord/page.tsx`, `audit/page.tsx`,
  `apps/web/src/app/mon-role/page.tsx` (texte sans code de story)
- Backlog (E10), `CHANGELOG.md`

## Vérification
- `tsc` (API et web), ESLint API `--max-warnings 0`, `next lint` (0 avertissement), `next build`.
  Aucune API changée.
- Captures avant / après des pages d'administration (1280 / 390 px) ; console propre.
- Playwright `ws/pw/ui06.js` (74 contrôles) : fenêtres « changer le rôle », « désactiver »,
  « anonymiser », « fiche du certificat », « révoquer » : focus dedans, piégé, Échap, clic
  extérieur, croix, plein écran à 390 px ; « Nouvelle formation » seule action pleine ; fil
  d'Ariane des inscriptions ; aucun code de story visible.
- Unitaires **125 / 1 584** ; e2e **77 / 907** (906 + 1 ignoré) ; audit de navigation **104 pages, 0 problème**.
