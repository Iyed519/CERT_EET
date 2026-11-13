# Recette de navigation (US-QUAL-01)

Outil rejouable qui parcourt Cert_EET dans un vrai navigateur, **pour chaque
rôle** (visiteur, apprenant, formateur, administrateur, compte MFA) et **à
1280 et 390 px**, et signale :

| Code | Problème |
|---|---|
| `LIEN_MORT` / `RESSOURCE_404` | lien vers une page inexistante, appel d'api introuvable |
| `PAGE_BLANCHE` | page sans contenu |
| `ERREUR_JAVASCRIPT` / `ERREUR_CONSOLE` | erreur dans la page |
| `ERREUR_SERVEUR` | réponse 5xx pendant la navigation |
| `DEFILEMENT_HORIZONTAL` | mise en page qui déborde |
| `BOUTON_SANS_EFFET` | bouton cliqué sans navigation, modale ni changement |
| `ACCES_MAUVAIS_ROLE` | page d'un autre rôle sans redirection propre |
| `PAGE_404_NON_TRAITEE` | adresse inconnue sans page « introuvable » en français |
| `CONTRASTE_INSUFFISANT` | texte visible sous le seuil WCAG 2.1 AA : 4,5:1, ou 3:1 pour un grand texte (US-UI-08) |

Contrastes (US-UI-08) : la couleur du texte est composée sur le fond effectif
(fonds translucides compris) ; sur un dégradé, le ratio retenu est le plus
faible des couleurs du dégradé. Exemptés comme le prévoit la norme : contrôle
désactivé, contenu `aria-hidden`, élément à opacité réduite, texte masqué
visuellement. L'audit contrôle les pages ; les fenêtres (dialogues) sont
vérifiées par les scripts Playwright des stories US-UI-01, 05 et 06.

Les boutons qui modifient des données ou la session (supprimer, accepter,
publier, se déconnecter…) ne sont jamais cliqués.

## Lancer

Prérequis : la pile tourne (https://localhost) et le jeu de démonstration est
chargé (`npm run demo:charger` dans le conteneur api).

```bash
cd outils/recette
npm ci
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe" node audit-navigation.js
```

Variables : `BASE` (https://localhost), `CHROME` (exécutable ; sinon le Chrome
installé), `LARGEURS` (`1280,390`), `ROLES` (`visiteur,apprenant,formateur,administrateur,securite`),
`MAX_PAGES` (120 par rôle), `RAPPORT` (fichier JSON), `VERBEUX=1` (liste des
pages parcourues). Code de sortie 0 : aucun problème.
