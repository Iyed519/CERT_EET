# US-UI-08 — Recette finale : cohérence, accessibilité, guide de style

## En une phrase
La recette de navigation rejouable contrôle désormais aussi le contraste de chaque texte visible,
toutes les pages de tous les rôles passent sans problème, et `docs/GUIDE_STYLE.md` fixe la charte
(palette, typographie, composants, règles d'usage, captures) pour que les prochains écrans restent
cohérents.

## Point de départ
Révision v2.2, E10, Must, 3 pts. Après US-UI-01 → US-UI-07, l'audit (`outils/recette/audit-navigation.js`)
vérifiait liens, erreurs console, réponses 5xx, défilement horizontal, boutons sans effet et accès
par rôle, mais pas les contrastes demandés par le scénario « Recette rejouable ». Aucun guide de
style n'existait ; `docs/GUIDE_DEMO.md` décrivait encore les anciens menus (« Affectations »,
« Propositions » au premier niveau) et ne montrait pas l'import de questions depuis un fichier.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Contrôle des contrastes | bibliothèque (axe-core) ; calcul dans la page | Calcul dans la page, sans nouvelle dépendance : pour chaque élément portant du texte visible, couleur du texte composée sur le fond effectif (en remontant les fonds translucides), seuil WCAG 2.1 AA 4,5:1, ou 3:1 pour un grand texte (≥ 24 px, ou ≥ 18,66 px gras). Nouveau type de problème `CONTRASTE_INSUFFISANT` (5 au plus par page). |
| D2 | Fonds en dégradé | ignorer ; pire cas | Pire cas : le ratio est calculé contre chaque couleur du dégradé et le plus faible est retenu (le fond de page et le bandeau de l'accueil sont des dégradés). Fond image (`url(...)`) : ignoré, faute de couleur calculable. |
| D3 | Exemptions | — | Celles de la norme : contrôle désactivé, contenu `aria-hidden`, élément à opacité réduite (décoratif ou inactif), texte masqué visuellement (1 px). |
| D4 | Portée de l'audit | pages ; pages et fenêtres | Pages (états atteints par la navigation et les boutons sûrs) ; les fenêtres sont couvertes par les scripts Playwright de chaque story (US-UI-01, 05, 06). Noté dans le README de la recette. |
| D5 | Guide de style | — | `docs/GUIDE_STYLE.md` : principes, palette avec contrastes, typographie, espacements, composants (en-tête de page, boutons, champs, pastilles, alertes, état vide, listes compactes, fenêtres, fil d'Ariane, « À faire maintenant »), règles par rôle, à faire / à éviter, contrôle avant fusion. Captures 1280 / 390 px dans `docs/guide-style/`, limitées à la zone visible pour garder le dépôt léger. |
| D6 | Guide de démonstration | — | Mise à jour : menus actuels (cinq entrées par rôle, sous-navigation de l'administrateur), accueil « À faire maintenant » des trois rôles, import de questions depuis un fichier (US-IA-08) dans le scénario formateur, captures du guide de style en référence. |
| D7 | Code de l'application | — | Aucun changement : l'audit complet est déjà à 0 avec le contrôle des contrastes (pire cas mesuré : 4,62:1 sur le surtitre du bandeau de l'accueil). |

## Fichiers
- `outils/recette/audit-navigation.js` (contrôle `CONTRASTE_INSUFFISANT`), `outils/recette/README.md`
- `docs/GUIDE_STYLE.md` (nouveau) et `docs/guide-style/*.png` (12 captures, zone visible, PNG 8 bits, 790 Ko en tout)
- `docs/GUIDE_DEMO.md` (menus, « À faire maintenant », import depuis un fichier, liste compacte des certificats)
- Backlog (E10), `CHANGELOG.md`
- Aucun fichier de `apps/` modifié.

## Vérification
- Contrôle des contrastes validé sur un texte injecté `#bbbbbb` sur le fond (1,72:1, signalé) ;
  pire cas réel mesuré 4,62:1 (surtitre et accent du bandeau de l'accueil sur `#3f3f46`).
- Audit de navigation complet, contrastes compris : **104 pages, 0 problème** (5 rôles, 1280 et 390 px).
- Captures du guide regardées une à une.
- Unitaires **125 / 1 584** ; e2e **77 / 907** (906 + 1 ignoré) ; `tsc` et `next lint`, `next build`.
