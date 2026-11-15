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
| D1 | Code | — | Pas de nouvelle fonction : la story livre des preuves et de la documentation. Un défaut trouvé est corrigé ici et signalé. **Trouvé** : sur l'accueil public, « Comment ça marche » passait en carte blanche, sur deux colonnes, parce que le bandeau `Etapes` (US-UX-01) reprenait la classe `.etapes` des étapes de l'accueil. Correction : le bandeau prend `.etapes-bandeau` ; l'accueil public redevient identique à celui d'avant E11. |
| D2 | Inventaire « après » | relancer ; reprendre le relevé de US-UX-08 | Relevé de `inventaire-actions.js` sur le build final (code identique à la tête de US-UX-08, jeu de démonstration rechargé, un livrable ouvert en correction comme pour « avant »), versionné en `docs/ux/inventaire-apres.json` / `.md` ; `docs/ux/comparaison.md` = sortie de `comparer-inventaires.js` avec `equivalences.json`. |
| D3 | Audit | — | `audit-navigation.js` sur les **cinq rôles** (visiteur, apprenant, formateur, administrateur, compte MFA), 1280 et 390 px, contrastes compris : 0 problème exigé. |
| D4 | Non-régression apprenant / public | captures à l'œil ; comparaison au pixel | Build de `main` avant US-UX-06 (`7cedd7c`) et build final servis côte à côte sur les mêmes données ; captures pleine page des pages de l'apprenant (Mon espace, Mes formations, Mes évaluations, Mes certificats, Catalogue et une formation, Profil) et publiques (accueil, connexion, catalogue, vérification) à 1280 et 390 px, comparées pixel à pixel ; écarts regardés un à un. |
| D5 | Captures avant / après | — | `docs/ux/captures/` : pages principales du formateur et de l'administrateur (tableau de bord, listes, journal d'audit, rapports, espace d'une formation, QCM), « avant » = build de l'inventaire « avant » (`82bdf1c`), « après » = build final, à 1280 px (haut de page) ; données de démonstration uniquement. |
| D6 | Captures de référence | — | `docs/guide-style/` : captures des écrans réorganisés par US-UX-06 à 08 mises à jour (comptes, certificats, comptes à 390 px) et ajoutées (accueil administrateur, formations, journal d'audit, rapports) ; tableau du § 9 du guide de style complété. |
| D7 | Guides | — | `GUIDE_STYLE.md` et `GUIDE_DEMO.md` relus en entier ; corrigés : pastilles (`PastilleStatut` est la règle), barre de filtres (`BarreListe`), titre du § 10, contrôle avant fusion (inventaire). |

## Fichiers
- **Web** : `components/Etapes.tsx` et `app/globals.css` (`.etapes` → `.etapes-bandeau` pour le bandeau d'étapes).
- **docs/ux** : `inventaire-apres.json` / `.md`, `comparaison.md`, `captures/` (10 pages × avant / après), `README.md`.
- **docs/guide-style** : mises à jour `admin-utilisateurs.png`, `admin-certificats.png`, `mobile-admin-utilisateurs.png` ; ajouts `admin-accueil.png`, `admin-formations.png`, `admin-audit.png`, `mobile-admin-audit.png`, `admin-rapports.png`.
- **Guides** : `GUIDE_STYLE.md` (pastilles, `BarreListe`, contrôle avant fusion n° 4, tableau des captures, titre du § 10, `.etapes-bandeau`), `GUIDE_DEMO.md` (alertes et rapports du formateur) — relus en entier ; backlog, `CHANGELOG.md`.

## Vérification
- Inventaire « après » (build final, jeu de démonstration, un livrable ouvert en correction) comparé à « avant » : **295 conservées, 0 plus loin, 0 déplacée, 0 perdue, 0 page disparue** (formateur 23 pages / 230 actions relevées, administrateur 15 pages). Le relevé a été fait sur la tête de US-UX-08 : le seul changement de code de cette story (nom d'une classe CSS) n'ajoute ni ne retire d'action.
- Audit de navigation, contrastes compris, 1280 et 390 px : visiteur, apprenant et compte MFA **46 pages, 0 problème** (build final) ; formateur et administrateur **70 pages, 0 problème** (tête de US-UX-08 ; le bandeau d'étapes renommé a été revu sur la page d'un QCM : 4 étapes, mise en page inchangée, aucune erreur console).
- Non-régression apprenant et pages publiques : build d'avant E11 (`82bdf1c`) et build final côte à côte, mêmes données, 22 captures pleine page (1280 et 390 px : Mon espace, Mes formations, Mes évaluations, Mes certificats, Catalogue, une formation, Profil ; accueil public, connexion, catalogue, vérification) comparées au pixel : **21 identiques**, l'accueil public à 1280 px diffère de 15 pixels d'anticrénelage (regardé : identique à l'œil) — après la correction de D1 ; avant elle, l'accueil public était 155 px plus haut.
- Web : `tsc`, `next lint --max-warnings 0`, tests unitaires 119 / 119, `next build`. API inchangée depuis US-UX-08 (130 suites / 1 672 tests, e2e 81 / 942).
- Captures `docs/ux/captures` et `docs/guide-style` regardées ; données de démonstration uniquement.
