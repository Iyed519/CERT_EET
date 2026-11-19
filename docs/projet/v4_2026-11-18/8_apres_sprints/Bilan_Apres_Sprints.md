# Cert_EET — Bilan des travaux après les sprints (PR #104 → #141)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri · **Période :** 11/11 → 16/11/2026
> **Rédigé le :** 18/11/2026, à partir de l'historique Git, du `CHANGELOG.md`, des journaux
> `engineering-log/89` à `121` et des révisions v2.1 → v2.9 du backlog.
> **Méthode :** inchangée — une story = une branche = une PR = un squash-merge, CI verte obligatoire,
> journal technique par story ; développement par un agent (Claude) suivant la procédure du porteur.

---

## 1. Vue d'ensemble

| Bloc | PR | Stories | Points | Journaux |
|---|---|:-:|:-:|---|
| A — Compléments et IA prédictive (hors backlog) | #104 → #112 | 1 (US-CERT-09, non estimée) | — | 89 → 92 |
| B — Rapport PDF et IA générative (révisions v2.1 → v2.5) | #113, #114, #123 → #125 | 5 | 22 | 93, 94, 103 → 105 |
| C — Charte ESPRIT et parcours (épopée E10, v2.2) | #115 → #122 | 8 | 34 | 95 → 102 |
| D — Surveillance par IA (v2.6 → v2.8) | #126 → #128 | 3 | 14 | 106 → 108 |
| E — Organisation des espaces (épopée E11, v2.9) | #129 → #137 | 9 | 37 | 109 → 117 |
| F — Mise en ligne (sans story) | #138 → #141 | — | — | 118 → 121 |
| **Total** | **38 PR** | **26** | **107** (+ CERT-09) | |

## 2. Détail par bloc

### A — Compléments et IA prédictive (#104 → #112)
- **US-CERT-09** (#104) : l'administrateur ouvre le PDF d'un certificat depuis sa fiche.
- **Correctif IA** (#105) : choix d'outil `auto` pour Claude (les modèles récents refusent `tool` / `any`),
  motif du refus affiché.
- **Refonte visuelle** (#106) : fond froid, cartes détachées, hiérarchie typographique.
- **Prédiction du risque** (#107 → #112) : modèle LightGBM `risque_v1` entraîné sur OULAD (32 593
  inscriptions), 16 variables, seuil 0,355, explications SHAP, audit d'équité ; service `ml` (FastAPI,
  conteneur interne) ; intégration dans l'API (calcul quotidien, scores 180 jours) ; écrans formateur et
  administrateur ; documentation `docs/IA_PREDICTION_RISQUE.md`, `ml/FICHE_MODELE.md`.

### B — Rapport PDF et IA générative
| Story | PR | Pts | Objet |
|---|:-:|:-:|---|
| US-QCM-13 | #113 | 5 | Rapport PDF détaillé d'une tentative (corrigé selon les règles d'US-QCM-09) |
| US-IA-08 | #114 | 8 | Importer des questions depuis un fichier (PDF même scanné, DOCX, CSV, XLSX, image), revue humaine |
| US-IA-09 | #123 | 3 | Claude appelé dès qu'une clé est là ; « IA non configurée » ; erreurs du fournisseur en français |
| US-RPT-03 | #124 | 1 | Nom de l'apprenant (ou du module) dans le titre des rapports |
| US-IA-10 | #125 | 5 | Analyse des points faibles par Claude dans les rapports (RAG, aucune identité envoyée) |

### C — Épopée E10 « Expérience utilisateur & charte ESPRIT » (8 stories, 34 pts)
US-UI-01 listes compactes et fenêtre unique · US-UI-02 charte ESPRIT · US-UI-03 coque et « À faire
maintenant » · US-UI-04 / 05 / 06 parcours apprenant, formateur, administrateur · US-UI-07 pages
publiques · US-UI-08 recette finale, contrastes WCAG AA, `docs/GUIDE_STYLE.md`.

### D — Surveillance des QCM par IA (14 pts)
| Story | PR | Pts | Objet |
|---|:-:|:-:|---|
| US-QCM-15 | #126 | 8 | MediaPipe EfficientDet-Lite0 dans le navigateur ; alertes avec photo au formateur |
| US-QCM-16 | #127 | 3 | Photo seulement en cas d'anomalie ; détection du téléphone fiabilisée (2 analyses / s) |
| US-QCM-17 | #128 | 3 | Apprenants signalés par l'IA dans les listes du formateur |

### E — Épopée E11 « Organisation et lisibilité » (9 stories, 37 pts)
US-UX-01 inventaire des actions (297 « avant ») et socle visuel · US-UX-02 navigation latérale avec
compteurs · US-UX-03 tableau de bord formateur · US-UX-04 espace de formation en onglets · US-UX-05 QCM et
atelier en étapes · US-UX-06 tableau de bord administrateur · US-UX-07 listes de l'administrateur ·
US-UX-08 pages d'analyse homogènes · US-UX-09 recette finale : **295 actions conservées, 0 perdue**.

### F — Mise en ligne (journaux 118 → 121)
| PR | Objet |
|:-:|---|
| #138 | Authentification SMTP facultative (Gmail, STARTTLS exigé sur 587) |
| #139 | Lien reçu par e-mail : jeton lu une seule fois (défaut trouvé en ligne) |
| #140 | Mise en ligne sur https://cert-eet.duckdns.org (Hetzner Cloud CPX32, Helsinki, Let's Encrypt, DuckDNS) ; recette en ligne : 114 pages, 0 problème |
| #141 | Fichiers de déploiement versionnés : `deploy/hetzner/` (cloud-config, surcharge Compose, modèle de `.env`, 7 scripts) |

## 3. Chiffres de fin de projet

| Indicateur | Valeur | Source |
|---|---|---|
| Tests unitaires de l'API | **1 683** (132 suites) | journal 118 |
| Tests e2e de l'API | **942** (81 suites, + 1 ignoré) | journaux 116, 117 |
| Tests unitaires du web | **119** | journal 117 |
| Tests Python du modèle | **19** | `ml/tests`, `ml/service/tests` |
| Migrations | **43** | `apps/api/src/database/migrations` |
| Tables métier | **48** | schéma reconstruit en exécutant les 43 migrations (18/11/2026) |
| Modules métier de l'API | **20** | `apps/api/src/modules` |
| Audit de navigation en ligne | **114 pages, 0 problème** | journal 120 |

## 4. Écarts et points ouverts relevés à la vérification finale
- **US-AUTH-07** (modifier nom / prénom) non réalisée ; **US-AUTH-10** partielle (code TOTP seul).
- **Inscription TERMINEE** jamais écrite par l'application (seulement par le jeu de démonstration).
- **Démonstration en mode développement**, un seul serveur, sans sauvegarde automatique, hébergée en
  Europe (journal 120, « Limites »).
- **Modèle de risque** non réentraîné sur des données Cert_EET ; **détection d'un vrai téléphone** non
  mesurée (journal 107).

*Cert_EET — bilan après les sprints · 18/11/2026 · Iyed Omri*
