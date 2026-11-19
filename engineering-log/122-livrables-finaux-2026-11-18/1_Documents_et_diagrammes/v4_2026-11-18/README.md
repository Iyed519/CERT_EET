# Cert_EET — `v4_2026-11-18` : jeu de documents de fin de projet

> **État décrit :** projet terminé et déployé — `main` = `e7216f2` (PR #141, 16/11/2026), démonstration en
> ligne https://cert-eet.duckdns.org. **Rédigé le :** 18/11/2026.
> **Règle du dossier `docs/projet` :** rien n'est supprimé ; `v3_2026-11-09/` reste tel quel.

## Contenu

| Dossier / fichier | Contenu | Statut |
|---|---|---|
| `1_backlog/Cert_EET_Backlog_Produit.md` | Backlog **v3.0** : section « Révision v3.0 » (livraison par période, statut final par épopée, écarts), L2 / L3 / L4 mis à jour | Modifié |
| `2_sprint1/` → `4_sprint3/` | Copies de `v3_2026-11-09/` | Inchangés |
| `5_sprint4/` | Backlog planifié (copie de `docs/`) + **clôture et revue** (nouveau : la clôture n'avait pas été écrite) | Nouveau |
| `6_sprint5/`, `7_sprint6/` | Backlogs et revues (copies de `docs/`) | Copiés |
| `8_apres_sprints/Bilan_Apres_Sprints.md` | PR #104 → #141 : IA prédictive, IA générative, E10, surveillance IA, E11, mise en ligne | Nouveau |
| `9_conception/` | ADR v3.0 (révisions + ADR-14 à 17), architectures physique et logique v2, diagrammes d'architecture v2, diagramme de classes v3, cas d'utilisation v3, écarts au cahier des charges | Nouveau |
| `10_diagrammes/` | 55 diagrammes PlantUML (`.puml`) + leurs images (`.png`) : 50 vues complètes + 5 vues de lecture | Nouveau |
| `CHANGELOG.md` | CHANGELOG du dépôt + **section Sprint 4** (manquante) | Modifié |

### `10_diagrammes/`

| Sous-dossier | Diagrammes |
|---|---|
| `sequence/` | **DS-01 → DS-21** : 9 mis à jour (DS-02 → 07, 09, 12, 13), 7 réécrits d'après le code (DS-01, 08, 10, 11, 14, 15, 16), 5 nouveaux (DS-17 import de questions, DS-18 rapport et analyse IA, DS-19 surveillance IA, DS-20 prédiction du risque, DS-21 demandes et propositions de formation) |
| `classes/` | **CLS-00 → CLS-11**, générés depuis le schéma réel (48 tables, 83 clés étrangères) ; **CLS-00b** dépendances entre packages ; `schema_reel/` contient l'export du schéma et le script |
| `cas_utilisation/` | UC-01 Visiteur, UC-02 Apprenant, UC-03 Formateur, UC-04 Administrateur (réalisé / écart / non réalisé) |
| `etats/` | ETAT-01 → 07 : certificat, tentative, livrable et correction, compte, formation et inscription, traitements IA, alertes et demandes ; ETAT-07 aussi en deux vues (**07a** alertes, **07b** demandes et propositions) |
| `deploiement/` | DEP-01 déploiement réel, DEP-02 environnements et CI/CD, DEP-03 zones de sécurité |
| `composants/` | COMP-01 modules de l'API (vue complète) ; **COMP-01a** structure des modules ; **COMP-01b** matrice des dépendances vers les adaptateurs |
| `packages/` | PKG-01 arborescence du dépôt, PKG-02 couches |

### Diagrammes : refonte de la mise en page (flèches orthogonales, sans chevauchement)
- Contenu inchangé (mêmes classes, attributs, relations, messages, états, cas) ; seule la mise en page change.
- Liens orthogonaux : moteur **ELK** (`!pragma layout elk`) pour classes, états, déploiement, composants,
  packages ; **Graphviz orthogonal** pour les cas d'utilisation ; les séquences sont numérotées.
- Style commun : `10_diagrammes/_style.puml` (inclus par tous les diagrammes sauf les classes, dont le style
  est dans le script générateur).
- Classes : une classe d'un autre package (gris) est dessinée une fois par lien, pour éviter que toutes les
  flèches convergent vers une même boîte (par exemple `User`).
- Les diagrammes trop denses gardent leur vue complète et reçoivent une vue de lecture : CLS-00b, COMP-01a,
  COMP-01b, ETAT-07a, ETAT-07b. Planche de contrôle : `10_diagrammes/planche_contact.png`.

## Ce qui a changé depuis `v3_2026-11-09` (clôture du Sprint 3)
- Sprints 4, 5, 6 puis 38 PR hors sprint : **113 stories livrées** au total (103 des tableaux + 10 de
  révision) ; le projet est **déployé**.
- **Correction de chiffres :** le Sprint 4 compte **21 stories / 63 points** (et non 10 / 27) ; les six
  sprints totalisent **81 stories / 315 points** (et non 70 / 279).
- **Écarts découverts à la vérification :** US-AUTH-07 non réalisée ; US-AUTH-10 partielle (code TOTP
  seul) ; statut d'inscription **TERMINEE jamais écrit** par l'application.

## Comment les chiffres ont été vérifiés
- Stories et PR : historique Git, `CHANGELOG.md`, revues de sprint, journaux `engineering-log/`.
- Modèle de données : les 43 migrations ont été **exécutées** sur PostgreSQL 16 + pgvector 0.6, puis le
  schéma a été relu (`10_diagrammes/classes/schema_reel/`).
- Routes : relevées dans les contrôleurs NestJS.
- Tests : derniers comptes des journaux 116 → 118 (1 683 unitaires, 942 e2e, 119 web) et `ml/` (19).

## Régénérer les images
```bash
# PlantUML 1.2025.x (ELK intégré) + Graphviz ; police Inter installée
python3 10_diagrammes/classes/schema_reel/generer_diagrammes_classes.py
java -DPLANTUML_LIMIT_SIZE=20000 -jar plantuml.jar -tpng -charset UTF-8 10_diagrammes/*/*.puml
```

*Iyed Omri — PFE ESPRIT 2026*
