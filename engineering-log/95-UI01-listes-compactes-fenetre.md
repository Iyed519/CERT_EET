# US-UI-01 — Listes compactes et fiche détaillée en fenêtre (correctif)

## En une phrase
La prédiction du risque affiche une ligne par apprenant (nom, pastille de niveau, facteur
principal, nombre d'alertes ouvertes), triée du risque le plus élevé au plus faible ; le détail
s'ouvre dans une fenêtre accessible (croix, Échap, clic à l'extérieur, focus rendu à la ligne,
plein écran sur mobile) ; « Mes certificats » suit le même modèle ; une seule fenêtre modale
réutilisable remplace les variantes recopiées.

## Point de départ
Révision v2.2, E10, Must, 3 pts. Capture du porteur (13/11/2026) : `components/PredictionRisque.tsx`
empile une grande carte par apprenant sur le tableau de bord formateur et sur `/admin/risque`.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Fenêtre | Ajouter un 3e composant · **un seul composant, les autres s'y rangent** | `components/Fenetre.tsx` devient LA fenêtre : `role="dialog"`, `aria-modal`, titre relié (`aria-labelledby`), focus placé dans la fenêtre puis piégé (Tab / Maj+Tab bouclent), Échap, clic sur le fond, focus rendu à l'élément d'origine, croix existante (`CroixFermeture`), désactivation de la fermeture pendant une action (`occupe`), plein écran sous 640 px. Mêmes classes CSS que les modales actuelles (`profil-overlay` / `profil-card`) : aucun changement visuel des autres pages. Une fenêtre ouverte par-dessus une autre : seule la plus haute réagit à Échap. |
| D2 | Unification | Tout migrer maintenant · **migrer les fiches et la confirmation ; formulaires dans leur story de parcours** | Passent sur `Fenetre` : `ConfirmationModal` (utilisée partout), fiche du risque (nouvelle), fiche de « Mes certificats » (nouvelle), détail de « Mes tentatives » et du suivi des tentatives formateur (fenêtres recopiées à la main), fenêtre d'import US-IA-08. Les ~25 fenêtres de formulaire restantes gardent leur balisage (déjà visuellement identique) et passent sur `Fenetre` dans US-UI-04 / 05 / 06, page par page, avec leurs captures avant / après : migrer 25 formulaires dans un correctif de 3 points multiplierait le risque sans bénéfice visible. Consigné pour ces stories. |
| D3 | Liste du risque | Cartes plus petites · **tableau compact** | Tableau (`table-compacte`) : Apprenant (bouton qui ouvre la fiche), Niveau (pastille + texte, jamais la couleur seule), Facteur principal (1re raison du modèle ; « Pas de signal important » si faible ; « Prédiction indisponible »), Alertes ouvertes (nombre). Tri : élevé, moyen, faible, sans prédiction ; puis nombre d'alertes décroissant ; puis nom (`localeCompare('fr')`). Fonction pure `trierRisque`, testée. |
| D4 | Mobile | Défilement horizontal · **lignes empilées** | Sous 640 px, chaque ligne du tableau devient un bloc (étiquettes `data-libelle`) : aucun défilement horizontal ; la fiche occupe tout l'écran. |
| D5 | Fiche du risque | — | Niveau, toutes les raisons, alertes ouvertes (libellés), date de calcul et version du modèle, rappel « Suggestion du modèle, à valider par le formateur », lien « Suivi pédagogique » (formateur seulement, comme avant). |
| D6 | Pages apprenant | Toutes · **celles qui empilent vraiment de longues cartes** | Audit des pages apprenant : « Mes inscriptions » et « Mes tentatives » sont déjà des tableaux (la seconde avec une fenêtre de détail, rangée sur `Fenetre`) ; « Mon espace » d'une formation présente des modules (contenu, pas une liste d'entités répétées) ; **« Mes certificats »** empile une longue carte par certificat (lien de vérification, empreinte) → liste compacte (formation, note / mention, date, état, actions « Télécharger le PDF » et « Détails ») + fiche en fenêtre (lien public, copie du lien, empreinte SHA-256, motif de révocation). |
| D7 | Tests | — | Pas de banc de test React dans `apps/web` (aucune dépendance ajoutée) : règles pures (`trierRisque`, `facteurPrincipal`) vérifiées par `tsc` et par la recette Playwright (ordre des lignes, ouverture / fermeture par la croix, Échap, clic extérieur, focus rendu, 1280 / 390 px). L'audit de navigation `outils/recette/audit-navigation.js` doit rester à 0 problème. |
| D8 | API | — | Aucune API, aucune règle métier changée ; e2e et unitaires inchangés et verts. |

## Fichiers
- `apps/web/src/components/Fenetre.tsx` (nouveau), `ConfirmationModal.tsx`, `PredictionRisque.tsx`
  (`trierRisque`, `facteurPrincipal`, `ListeRisque`, `FicheRisque` ; l'ancienne carte est retirée),
  `ImportFichierModal.tsx`
- `docs/projet/v3_2026-11-09/1_backlog/Cert_EET_Backlog_Produit.md` (épopée E10), `CHANGELOG.md`
- `apps/web/src/app/mes-certificats/page.tsx`, `mes-tentatives/page.tsx`,
  `formateur/qcm/[id]/tentatives/page.tsx`, `globals.css` (section US-UI-01)

## Vérification
- `tsc`, `next lint` (0 avertissement), `next build`. Aucune API touchée : unitaires et e2e
  inchangés (CI).
- Playwright 1280 / 390 px sur le jeu de démo (`ws/pw/ui01.js`), captures avant / après regardées :
  tableau de bord formateur et `/admin/risque` (ordre élevé → faible vérifié), fiche du risque
  (formateur avec « Suivi pédagogique », administrateur sans), « Mes certificats » et sa fiche,
  détail de « Mes tentatives », détail d'une tentative côté formateur, confirmation de suppression
  d'un QCM. Pour chaque fenêtre : focus dans la fenêtre à l'ouverture, piégé (Maj+Tab), Échap
  ferme, focus rendu au déclencheur, clic extérieur ferme (1280), croix ferme ; à 390 px la fenêtre
  occupe tout l'écran et la liste ne défile pas horizontalement. Console propre.
- Audit de navigation `outils/recette/audit-navigation.js` : **104 pages parcourues, 0 problème**.
