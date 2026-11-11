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
