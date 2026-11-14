# Inventaire des actions — garde-fou de l'épopée E11

L'épopée E11 réorganise les espaces formateur et administrateur **sans retirer aucune fonction**.
Ce dossier contient la preuve :

| Fichier | Contenu |
|---|---|
| `inventaire-avant.json` / `.md` | Relevé de **toutes** les actions (liens, boutons, onglets, menus, listes, volets, et ce qu'ouvrent les onglets, menus et fenêtres sans effet destructeur) de chaque page, pour le formateur et l'administrateur, **avant** E11 (14/11/2026, `main` = `82bdf1c`, jeu de démonstration). |
| `equivalences.json` | Libellés renommés : libellé avant → libellé(s) après, chacun justifié dans le journal de sa story. |
| `inventaire-apres.json` / `.md`, `comparaison.md` | Relevé final et comparaison (US-UX-09). |

## Relancer

Pile démarrée (https://localhost) et jeu de démonstration chargé, puis :

```bash
cd outils/recette && npm ci
INVENTAIRE=../../docs/ux/inventaire.json node inventaire-actions.js
node comparer-inventaires.js ../../docs/ux/inventaire-avant.json ../../docs/ux/inventaire.json ../../docs/ux/equivalences.json
```

La comparaison classe chaque action « avant » : **conservée** (au plus un clic de plus depuis la même
page, une page liée comptant pour un clic), **plus loin** (plus d'un clic de plus), **déplacée**
(présente ailleurs dans l'espace du rôle) ou **perdue**. Code de sortie 1 si une action est perdue ou
plus loin. Logique testée : `cd outils/recette && node --test`.

Remarque : pour atteindre la page de correction d'un livrable, le relevé « avant » a été fait avec un
livrable de démonstration ouvert en correction (« Reprendre » au lieu de « Corriger ») ; les boutons
qui modifient des données ne sont jamais cliqués.
