# Refonte visuelle de l'interface web (hiérarchie, fond, cartes)

## En une phrase
Les pages paraissaient chargées et plates (fond presque blanc, cartes blanches
sans relief, titres de la taille du texte) : un seul `:root` porte désormais
la palette, les ombres, les rayons, l'échelle typographique et l'échelle
d'espacement, et les composants ne font qu'utiliser ces jetons. **Aucune
fonctionnalité, API ou texte métier n'a changé** ; seul
`apps/web/src/app/globals.css` est modifié (aucun JSX touché).

## Point de départ
- `:root` était défini **deux fois** (ligne 1 et vers la ligne 981) ; le second
  `--bg: #f4f6f5` et un second fond `html, body` écrasaient le premier.
- Teintes « en dur » chaudes (`#faf9f6`, `#fbfaf7`…) et verdâtres
  (`#eef2f0`, `#f7f9f8`…) mélangées.
- Défaut d'accessibilité : le texte ambre des pastilles « Fermée », « En
  attente » et des alertes d'information (`#d98207` sur `#fef3e2`) n'avait
  que **2,68:1** (AA exige 4,5:1). Le texte indicatif des champs : **2,45:1**.
- Les boutons `btn btn-sm` (raccourcis 7 j / 30 j, « Suivi pédagogique »)
  héritaient de l'ombre verte du bouton principal.
- Dans les modales, « Annuler » était un bouton **rouge plein**, aussi visible
  que l'action principale.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Jetons | Un seul `:root` en tête de fichier ; le second supprimé. Couleurs, surfaces, texte, bordures, états, rayons, ombres, `--fs-*`, `--sp-*`. |
| D2 | Fond | Dégradé froid et doux : `#efe8f7` (rose froid) → `#eae9f7` → `#e6ebf9` (lavande), `fixed`. Contraste carte blanche / fond 1,20:1 : les cartes se détachent sans agressivité. |
| D3 | Vert ESPRIT | `--primary` inchangé, réservé à l'action principale (bouton plein, onglet actif, liens). Le vert sur fond lavande reste harmonieux (couleurs presque complémentaires, saturation modérée). |
| D4 | Cartes | Fond blanc, bordure teintée `#e2ddee`, ombre douce teintée violet (`--shadow-card`), rayon 16 px, padding 24 px (16 px sur mobile). Survol des cartes cliquables : `--shadow-card-hover` + légère montée. Une seule liste de sélecteurs applique cette surface. |
| D5 | Pas de carte dans la carte | Blocs imbriqués (QCM d'un module, options d'une question, fiches d'un certificat, récapitulatif de démarrage) : fond `--surface-2`, sans ombre. |
| D6 | Échelle typographique | Voir tableau ci-dessous. Les titres sans classe (`<h1>` du tableau de bord admin) suivent déjà l'échelle. |
| D7 | Chiffres clés | `.kpi` passe en colonne flexible : le chiffre (`order: -1`) vient **avant** son libellé `h2`, qui devient une légende en petites capitales discrètes. Ordre du DOM inchangé pour les lecteurs d'écran. |
| D8 | Boutons | Principal : vert plein. Secondaire (`.btn-sm`) : blanc, bordure `--border-strong`, texte 13 px. `btn btn-sm` ne porte plus l'ombre du principal. Les « + Nouveau QCM / atelier » d'une carte de module passent en vert clair : une seule action pleine visible par carte. |
| D9 | « Annuler » des modales | Convention vérifiée sur les 30 modales : un `.btn-danger-solid` placé **en premier** dans `.modal-actions` (et suivi d'un autre bouton) est toujours « Annuler / Fermer / Retour ». Règle CSS `:first-child:not(:only-child)` → bouton secondaire. Une confirmation destructrice (rouge placé après « Annuler ») reste rouge. Aucun JSX modifié. |
| D10 | Pastilles | Gabarit unique (12 px, 650, pilule, filet interne) ; toutes portent un texte, jamais la couleur seule. Texte ambre `--accent-dark` corrigé en `#8a5a00`. |
| D11 | Champs | Bordure `#8e88a6` (3,37:1, critère 1.4.11 des composants), indicatif `--placeholder` 4,68:1. |
| D12 | Focus | `:focus-visible` : contour vert 3 px décalé de 2 px ; champs : bordure verte + halo `--ring`. |
| D13 | Mobile (≤ 560 px) | h1 26 px, h2 19 px, chiffre clé 30 px ; indicateurs sur une colonne (deux colonnes testées : libellés et répartitions trop serrés à 390 px). |

## Échelle typographique (`--fs-*`)
| Jeton | Taille | Usage |
|---|---|---|
| `--fs-h1` | 30 px (26 px mobile) | titre de page (`.page-title`, `h1`) |
| `--fs-h2` | 21 px (19 px mobile) | titre de section (`.section-title`, `h2`, titres de modale) |
| `--fs-carte` | 17 px, 650 | titre de carte (module, certificat, bloc du tableau de bord, énoncé de question) |
| `--fs-kpi` | 34 px (30 px mobile), 750 | chiffre clé des tableaux de bord |
| `--fs-corps` | 15 px | texte courant, tableaux |
| `--fs-petit` | 13 px | dates, aides, libellés de champ, boutons secondaires |
| `--fs-etiquette` | 12 px | pastilles, sur-titres en capitales |

Espacements (`--sp-1` à `--sp-6`) : 4 / 8 / 12 / 16 / 24 / 32 px.

## Contrastes mesurés (formule WCAG 2.x)
| Paire | Ratio | AA |
|---|---|---|
| Texte courant `#1b2631` / fond `#eae9f7` | 12,79:1 | ✔ |
| Titres `#141a2e` / fond | 14,38:1 | ✔ |
| Secondaire `#525a72` / fond | 5,71:1 | ✔ |
| Secondaire / carte blanche | 6,85:1 | ✔ |
| Secondaire / bloc imbriqué `#f7f5fb` | 6,33:1 | ✔ |
| Libellés `#3a4256` / carte | 10,03:1 | ✔ |
| Lien vert `#176f3c` / carte | 6,22:1 | ✔ |
| Lien vert / fond | 5,18:1 | ✔ |
| Blanc / bouton principal `#1e8449` | 4,72:1 | ✔ |
| Pastille verte `#176f3c` / `#e7f4ec` | 5,50:1 | ✔ |
| Pastille ambre `#8a5a00` / `#fef3e2` (avant `#d98207` : 2,68:1) | 5,40:1 | ✔ (corrigé) |
| Pastille rouge `#922b21` / `#fdecea` | 7,09:1 | ✔ |
| Pastille grise `#475569` / `#eef2f7` | 6,74:1 | ✔ |
| Pastille bleue `#1d4f91` / `#e8f0fb` | 7,09:1 | ✔ |
| Texte indicatif `#6b7489` / blanc (avant 2,45:1) | 4,68:1 | ✔ (corrigé) |
| Bordure de champ `#8e88a6` / blanc (non-texte, ≥ 3:1) | 3,37:1 | ✔ |

## Méthode
1. Pile complète lancée hors Docker (Postgres 16 + pgvector, Redis, S3
   simulé), jeu `npm run demo:charger`, base sauvegardée puis restaurée avant
   chaque série de captures pour un avant / après identique.
2. Captures Playwright (`playwright-core` de `outils/recette`) de 16 vues à
   1280 et 390 px : connexion, tableaux de bord administrateur et formateur,
   formations et certificats (admin), page de formation et éditeur de QCM
   (formateur), supports pour l'IA, catalogue, mes inscriptions, page de
   formation, certificats, corrigé (apprenant), modale de démarrage, passage
   d'un QCM, modale « Nouveau lien ou vidéo ».
3. Palette et échelle validées sur 2 pages, puis appliquées.

## Vérification
- Web : `tsc --noEmit` et `next lint` : 0 avertissement. Prettier non lancé.
- Api : lint 0 avertissement, unitaires **117 suites / 1 470 tests** ;
  e2e **73 suites / 851 tests** (1 suite ignorée, comme avant), lancés pile
  de démo arrêtée, sur une base dédiée.
- Audit de navigation (`outils/recette/audit-navigation.js`), 5 rôles × 1280
  et 390 px : **0 problème** (aucun défilement horizontal, aucun bouton sans
  effet).

## Suite possible
- Les 30 modales gardent la classe `btn-danger-solid` sur « Annuler » : la
  règle D9 corrige l'affichage ; renommer la classe dans le JSX serait plus
  propre, mais hors du périmètre « CSS seulement » de cette refonte.
