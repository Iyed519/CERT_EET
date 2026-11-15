# US-UX-09 — Recette finale de l'épopée E11

## En une phrase
La recette finale prouve que l'épopée E11 n'a rien retiré : l'inventaire « après » de toutes les
actions du formateur et de l'administrateur, comparé à l'inventaire « avant », ne perd aucune action
et n'en éloigne aucune de plus d'un clic ; l'audit de navigation des cinq rôles passe à 1280 et
390 px ; l'interface apprenant et les pages publiques sont inchangées au pixel près ; les captures
de référence et les deux guides sont à jour.

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Code | — | Aucun changement de code applicatif : la story livre des preuves et de la documentation. Tout défaut trouvé serait corrigé dans la story d'origine s'il n'est pas fusionné, sinon ici, en le disant. |
| D2 | Inventaire « après » | relancer ; reprendre le relevé de US-UX-08 | Relevé de `inventaire-actions.js` sur le build final (code identique à la tête de US-UX-08, jeu de démonstration rechargé, un livrable ouvert en correction comme pour « avant »), versionné en `docs/ux/inventaire-apres.json` / `.md` ; `docs/ux/comparaison.md` = sortie de `comparer-inventaires.js` avec `equivalences.json`. |
| D3 | Audit | — | `audit-navigation.js` sur les **cinq rôles** (visiteur, apprenant, formateur, administrateur, compte MFA), 1280 et 390 px, contrastes compris : 0 problème exigé. |
| D4 | Non-régression apprenant / public | captures à l'œil ; comparaison au pixel | Build de `main` avant US-UX-06 (`7cedd7c`) et build final servis côte à côte sur les mêmes données ; captures pleine page des pages de l'apprenant (Mon espace, Mes formations, Mes évaluations, Mes certificats, Catalogue et une formation, Profil) et publiques (accueil, connexion, catalogue, vérification) à 1280 et 390 px, comparées pixel à pixel ; écarts regardés un à un. |
| D5 | Captures avant / après | — | `docs/ux/captures/` : pages principales du formateur et de l'administrateur (tableau de bord, listes, journal d'audit, rapports, espace d'une formation, QCM), « avant » = build de l'inventaire « avant » (`82bdf1c`), « après » = build final, à 1280 px (haut de page) ; données de démonstration uniquement. |
| D6 | Captures de référence | — | `docs/guide-style/` : captures des écrans réorganisés par US-UX-06 à 08 mises à jour (comptes, certificats, comptes à 390 px) et ajoutées (accueil administrateur, formations, journal d'audit, rapports) ; tableau du § 9 du guide de style complété. |
| D7 | Guides | — | `GUIDE_STYLE.md` et `GUIDE_DEMO.md` relus en entier ; corrigés : pastilles (`PastilleStatut` est la règle), barre de filtres (`BarreListe`), titre du § 10, contrôle avant fusion (inventaire). |

## Fichiers
_(complété en fin de story)_

## Vérification
_(complété en fin de story)_
