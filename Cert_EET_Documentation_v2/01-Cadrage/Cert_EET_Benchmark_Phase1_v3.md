**Cert_EET — Benchmark Plateformes — Phase 1**

**ESPRIT ENTREPRISE**

**Projet de Fin d'Études — Ingénierie Logicielle**

**Rapport de Benchmark**

**Plateformes de Certification et de Formations Digitales**

**Projet  ·  Cert_EET**

**Phase 1 / 2  ·  Version 2.0  ·  Avril 2026**

***Étudiant : Iyed Omri  ***

Table de Matières

	1. Résumé Exécutif	5

	1.1 Conclusions Principales	5

	2. Contexte et Objectifs	6

	2.1 Contexte du Projet	6

	2.2 Périmètre Fonctionnel Requis	6

	2.3 Objectifs du Benchmark	6

	3. Méthodologie d'Évaluation	7

	3.1 Processus	7

	3.2 Grille de Critères et Pondérations	7

	3.3 Justification des Pondérations	8

	3.4 Échelle de Notation	9

	4. Analyse Détaillée par Plateforme	10

	4.1 Moodle 4.x — LMS Open Source	10

	4.2 TalentLMS — SaaS Corporate	10

	4.3 360Learning — LXP Collaboratif	11

	4.4 Open edX (Redwood) — Plateforme MOOC (Massive Open Online Course)	11

	4.5 Docebo Learn — LMS Enterprise IA	12

	4.6 Canvas LMS — LMS Académique	12

	5. Analyse des Capacités IA	13

	5.1 Référentiel de Maturité IA	13

	5.2 Positionnement IA des Plateformes	13

	5.3 Conclusion de l'Analyse IA	14

	6. Matrice Comparative et Scoring	15

	6.1 Tableau de Synthèse	15

	6.2 Classement et Analyse	15

	7. Analyse des Lacunes Fonctionnelles	16

	7.1 Détail des Lacunes Critiques	16

	G1 — Génération de Questions QCM par IA avec Ancrage RAG (Lacune Structurelle)	16

	G2 — Ateliers Pratiques avec Workflow Formateur (Lacune Quasi-Universelle)	16

	G3 — Certification Numérique Vérifiable	16

	8. Recommandation Stratégique	17

	8.1 Évaluation des Scénarios	17

	8.2 Pourquoi le Scénario B (Hybridation Moodle) est Écarté	17

	8.3 Recommandation Finale : Développement sur Mesure	17

	8.4 Prochaines Étapes (Phase 2)	18

	Annexes	20

	Glossaire	20

	(Learning Tools Interoperability)	21

	Sources et Références	21

	Avertissements	22

# Liste des tablaeux

	

	

	Tableau 1 : Tableau des conclusions principales	6

	Tableau 2 : Tableau des fonctionnalités obligatoires	7

	Tableau 3 : Grille des Critères et Pondérations	8

	Tableau 4 : tableau choix des critères et leurs pondérations	10

	Tableau 5 : Echelle de Notation	10

	Tableau 6 : 4.1 Moodle 4.3 LTS — Évaluation de la plateforme open source	11

	Tableau 7: Évaluation des Critères – Notes de Moodle 4.3 LTS	11

	Tableau 8 : Évaluation de TalentLMS	11

	Tableau 9 : Évaluation des Critères – Notes de TalentLMS	11

	Tableau 10 : 360Learning — Évaluation de la plateforme	12

	Tableau 11 : Évaluation des Critères – Notes de 360Learning	12

	Tableau 12 : Open edX — Évaluation de la plateforme	12

	Tableau 13 : Évaluation des Critères – Notes de Open edX	12

	Tableau 14 Docebo Learn — Évaluation de la plateforme	13

	Tableau 15  : Évaluation des Critères – Notes de Docebo Learn	13

	Tableau 16 : Canvas LMS — Évaluation de la plateforme	13

	Tableau 17: Tableau 13 : Évaluation des Critères – Notes de Canvas LMS	13

	Tableau 18 : Niveaux d’intégration de l’IA dans les plateformes d’apprentissage et impact	14

	Tableau 19 : Comparatif des plateformes LMS	15

	Tableau 20 : Tableau des scores globaux et verdicts d’adéquation	16

	Tableau 21 : Classement des plateformes LMS	16

	Tableau 22 : Analyse des lacunes critiques des LMS	17

	Tableau 23 : tableau d'évaluation des scénarios	18

	Tableau 24 : Tableau des recommandations et leurs justifications	19

# 1. Résumé Exécutif

Ce document constitue la livraison formelle de la Phase 1 du projet Cert_EET, réalisé dans le cadre d'un Projet de Fin d'Études (PFE) en développement logiciel à Esprit. Il présente une analyse comparative de six plateformes LMS/LXP évaluées sur 13 critères couvrant les dimensions fonctionnelles, technique et stratégique.

L’objectif de Cert_EET est de fournir à Esprit une plateforme digitale de certification couvrant : les évaluations QCM, les ateliers pratiques notés par formateur, la génération de certificats vérifiables, et un assistant IA de génération de questions QCM ancré sur les supports de cours (RAG) pour assister le formateur.

## 1.1 Conclusions Principales

| **Dimension** | **Constat** | **Criticité** |
| --- | --- | --- |
| **Assistant IA Génération QCM (RAG)** | Absent de toutes les plateformes évaluées. Aucune intégration stable côté apprenant. | **CRITIQUE** |
| **Ateliers pratiques évalués** | Workflow formateur inexistant ou rudimentaire sur 5/6 plateformes. | **CRITIQUE** |
| **Certification anti-fraude** | Open edX partiellement via Open Badges. Absent des solutions SaaS. | **MAJEUR** |
| **Intégration ****LLM**** native** | Absente nativement. Roadmaps annoncées non disponibles en production. | **MAJEUR** |
| **Souveraineté des données** | SaaS hébergés hors Tunisie. Incompatible avec un hébergement institutionnel local. | **SIGNIFICATIF** |

Tableau 1 : Tableau des conclusions principales

# 2. Contexte et Objectifs

## 2.1 Contexte du Projet

Esprit Entreprise, entité de formation continue rattachée au groupe Esprit, ambitionne de digitaliser ses cycles de formation par une infrastructure de certification numérique moderne et crédible. Ce projet s'inscrit dans trois tendances sectorielles majeures observées en 2025-2026 :

- La démocratisation des LLM dans les outils éducatifs, créant une nouvelle catégorie de plateformes dites "AI-native"

- La montée en puissance des micro-certifications et badges numériques dans les processus de recrutement

- L'émergence d'exigences sur la souveraineté des données apprenants dans les établissements tunisiens

## 2.2 Périmètre Fonctionnel Requis

Le cahier des charges de Cert_EET établit les fonctionnalités suivantes comme obligatoires pour la version initiale développée dans le cadre du PFE :

| **#** | **Fonctionnalité** | **Description** | **Priorité** |
| --- | --- | --- | --- |
| **F1** | **Moteur ****QCM** | QCM avec randomisation serveur, anti-fraude, scoring auto, historique des tentatives | **P0 — Critique** |
| **F2** | **Ateliers Pratiques** | Création d'ateliers, soumission de livrables, grille d'évaluation formateur, feedback structuré | **P0 — Critique** |
| **F3** | **Certification Digitale** | Génération de certificats PDF avec QR code et hash SHA-256, URL de vérification publique | **P0 — Critique** |
| **F4** | **Assistant IA Formateur** | Génération de questions QCM ancrée sur les supports de cours (RAG), soumise à validation humaine du formateur | **P0 — Critique** |
| **F5** | **Gestion Multi-Rôles** | Trois rôles : Administrateur, Formateur, Apprenant — RBAC granulaire | **P0 — Critique** |
| **F6** | **Analytics ****&**** Reporting** | Tableaux de bord par rôle, taux de complétion, scores, détection décrochage | **P1 — Majeur** |
| **F7** | **Sécurité ****&**** Conformité** | Chiffrement, logs d'audit, hébergement local possible | **P1 — Majeur** |

Tableau 2 : Tableau des fonctionnalités obligatoires

## 2.3 Objectifs du Benchmark

Ce benchmark poursuit quatre objectifs complémentaires :

- **Exhaustivité analytique** — Dresser un état de l'art objectif des solutions existantes sans a priori sur le résultat

- **Décision éclairée** — Fournir une matrice quantifiée pour trancher entre adoption, hybridation ou développement sur mesure

- **Positionnement IA** — Évaluer spécifiquement les capacités LLM de chaque solution, compte tenu du caractère central de l'axe IA[^c9]

- **Justification formelle** — Documenter les lacunes identifiées pour constituer la base argumentaire des choix architecturaux en Phase 2

# 3. Méthodologie d'Évaluation

## 3.1 Processus

L'évaluation a été conduite en quatre étapes séquentielles :

- Sélection des plateformes — Six candidats identifiés par pertinence sectorielle, notoriété et diversité typologique.

- Définition des critères — Grille de **13** critères pondérés couvrant les dimensions **fonctionnelle (50%), technique (25%) et stratégique (25%).**

- Collecte des données — Analyse de la documentation officielle, des retours publiés (G2, Capterra, Gartner), [^c12]des changelogs et tests ciblés.

- Scoring et synthèse — Notation indépendante, calcul des scores pondérés et formulation de la recommandation finale.

## 3.2 Grille de Critères et Pondérations

| **Dimension Fonctionnelle — 50% du score total** |
| --- |
| **C1** | **12,5%** | **Couverture QCM** | Typologies, randomisation serveur, gestion du temps, anti-fraude, historique |
| **C2** | **12,5%** | **Ateliers Pratiques** | Soumission livrables, workflow formateur, grille de notation, feedback |
| **C3** | **10%** | **Assistant IA Formateur** | Agent LLM natif, qualité du modèle, contextualisation parcours |
| **C4** | **7,5%** | **Certification Vérifiable** | QR code, hash cryptographique, URL publique anti-fraude |
| **C5** | **7,5%** | **Gestion Multi-Rôles** | Admin / Formateur / Apprenant — isolation des données |
| **Dimension Technique — 25% du score total** |
| **C6** | **7,5%** | **Architecture ****&**** Évolutivité** | Modularité, API, documentation développeur |
| **C7** | **6,25%** | **Intégration IA / LLM** | API natives, SDK IA, personnalisation du modèle |
| **C8** | **6,25%** | **Sécurité ****&**** Conformité** | Chiffrement, MFA, RBAC, logs d'audit[^c14] |
| **C9** | **5%** | **Performance ****&**** Fiabilité** | Robustesse, SLA, métriques de charge |
| **Dimension Stratégique — 25% du score total** |
| **C10** | **7,5%** | **Coût (TCO indicatif)**[^c15] | Licences, hébergement, maintenance — pertinence pour le PFE |
| **C11** | **6,25%** | **Souveraineté des Données** | Hébergement possible en local, localisation des données |
| **C12** | **6,25%** | **Maturité ****&**** Pérennité** | Stabilité, communauté, fréquence des mises à jour |
| **C13** | **5%** | **Time-to-Market** | Délai estimé avant première version fonctionnelle |

Tableau 3 : Grille des Critères et Pondérations

## 3.3 Justification des Pondérations

Les pondérations attribuées à chaque critère ne sont pas arbitraires. Elles découlent directement de la hiérarchie des exigences fonctionnelles du cahier des charges de Cert_EET, et obéissent à deux principes méthodologiques complémentaires : l'importance stratégique d'un critère pour la mission de la plateforme, et son pouvoir discriminant entre les candidats évalués.

| **Critère / Dimension** | **Poids** | **Justification du choix** |
| --- | --- | --- |
| **Dimension Fonctionnelle — 50%** |  | *Le benchmark a pour objet unique de répondre à une question opérationnelle : cette plateforme fait-elle ce que Cert_EET requiert ? Si la réponse fonctionnelle est non, aucune qualité technique ou économique ne compense. La dimension fonctionnelle est donc majoritaire par construction.* |
| **C1 — Couverture QCM** | **12,5%** | Le QCM est l'activité pédagogique principale de la plateforme. Sa qualité détermine directement la fiabilité des évaluations. Poids individuel maximal, à égalité avec les ateliers. |
| **C2 — Ateliers Pratiques** | **12,5%** | Les ateliers sont l'autre activité fondamentale de Cert_EET. L'évaluation de livrables par formateur est une exigence structurante du cahier des charges. Poids identique au QCM. |
| **C3 — Chatbot IA Intégré** | **10%** | L’assistant IA formateur est une exigence P0, mais son poids de 10% reflète son faible pouvoir discriminant : toutes les plateformes obtiennent 1/5 sur ce critère car aucune ne propose de génération ancrée sur les supports de cours via RAG avec validation humaine. Lui attribuer un poids plus élevé n’aurait pas modifié le classement — il aurait amplifié uniformément les scores vers le bas sans produire d’information supplémentaire. |
| **C4 — Certification Vérifiable** | **7,5%** | Critère essentiel pour la crédibilité institutionnelle de Cert_EET, mais la majorité des plateformes échoue sur ce point de façon similaire. Rôle confirmatoire plus que discriminant. |
| **C5 — Gestion Multi-Rôles** | **7,5%** | La gestion RBAC (Admin / Formateur / Apprenant) est une exigence standard bien couverte par la plupart des candidats. Le poids modéré reflète sa nature nécessaire mais non différenciante. |
| **Dimension Technique — 25%** |  | *Pour un projet PFE en développement sur mesure, l'architecture interne des plateformes existantes est une information de référence, non une contrainte absolue. 25% lui accorde une place significative sans surpondérer des critères qui deviennent secondaires si la conclusion est de tout développer from scratch.* |
| **C6 — Architecture ****&**** Évolutivité** | **7,5%** | La modularité et la qualité de l’API d’une plateforme déterminent la faisabilité d’une hybridation. C’est le critère technique le plus important, car il conditionne directement la possibilité d’une adoption partielle. |
| **C7 — Intégration IA / LLM** | **6,25%** | Critère technique central pour évaluer si une plateforme peut servir de base à l'intégration d'un agent LLM. Poids élevé dans sa dimension. |
| **C8 — Sécurité ****&**** Conformité** | **6,25%** | La sécurité est un prérequis non négociable. Poids identique à C7 car indispensable mais généralement bien couvert par les plateformes matures. |
| **C9 — Performance ****&**** Fiabilité** | **5%** | Critère pertinent en production |
| **Dimension Stratégique — 25%** |  | *La souveraineté des données et le coût sont des facteurs réels dans le contexte tunisien. Ils pèsent 25% pour rester présents dans l'analyse et renforcer la justification du développement sur mesure, sans éclipser la dimension fonctionnelle.* |
| **C10 — Coût (TCO indicatif)** | **7,5%** | le coût d'une licence n'est pas un critère d'adoption — c'est un argument de justification du développement custom. Le poids de 7,5% permet d'accréditer cet argument sans que le coût seul détermine la recommandation. |
| **C11 — Souveraineté des Données** | **6,25%** | Les solutions SaaS hébergées hors Tunisie posent un problème de conformité institutionnelle réel. Ce critère est un facteur discriminant fort entre solutions open source (hébergement local possible) et SaaS. |
| **C12 — Maturité ****&**** Pérennité** | **6,25%** | La stabilité d'une plateforme conditionne la fiabilité de l'analyse documentaire effectuée. Une plateforme immature ou en fin de vie ne constitue pas une référence valide. |
| **C13 — Time-to-Market** | **5%** | Pertinent pour évaluer la viabilité d'une adoption rapide. Mais secondaire en cas d’utilisation interne de l’entreprise (université Esprit ) au début. |

Tableau 4 : tableau choix des critères et leurs pondérations

## 3.4 Échelle de Notation

| **Note** | **Qualification** | **Définition opérationnelle** |
| --- | --- | --- |
| **5** | **Excellent** | Fonctionnalité native, mature et complète. Couvre 100% du besoin sans développement supplémentaire. |
| **4** | **Bon** | Couverture satisfaisante avec limitations mineures. Quelques ajustements de configuration requis. |
| **3** | **Acceptable** | Couverture partielle nécessitant des développements ou plugins complémentaires significatifs. |
| **2** | **Insuffisant** | Couverture minimale. Effort de personnalisation majeur requis, instabilité ou manque de maturité. |
| **1** | **Absent** | Fonctionnalité inexistante ou inutilisable. Aucune solution native ni voie d'intégration fiable. |

Tableau 5 : Echelle de Notation

# 4. Analyse Détaillée par Plateforme

## 4.1 Moodle 4.x — LMS Open Source

| **Éditeur** | Moodle HQ + Communauté mondiale |
| --- | --- |
| **Version évaluée** | 4.3 LTS (2024) |
| **Base utilisateurs** | 300M+ utilisateurs, 350 000+ sites |
| **Score global** | 52,6 / 100 |
| **Verdict** | Partiel — Option open source la plus mature |

Tableau 6 : 4.1 Moodle 4.3 LTS — Évaluation de la plateforme open source

| **C1** **4** | **C2** **2** | **C3** **1** | **C4** **2** | **C5** **4** | **C6** **4** | **C7** **2** | **C8** **3** | **C9** **3** | **C10** **4** | **C11** **5** | **C12** **5** | **C13** **3** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 7: Évaluation des Critères – Notes de Moodle 4.3 LTS[^c25]

Points forts : Moteur QCM très complet (15 typologies, randomisation, import GIFT/XML), système de rôles granulaire, écosystème de 4 000+ plugins, totalement open source, compatible SCORM/xAPI/LTI 1.3.

Limites critiques **:** Aucun chatbot IA natif — les plugins tiers sont expérimentaux et non contextualisés. Ateliers pratiques rudimentaires sans workflow formateur. Certificats PDF simples sans signature cryptographique. Interface vieillissante. La roadmap officielle ne prévoit pas d'agent conversationnel apprenant avant 2027.

*Maturité IA : N1 — IA de productivité formateur uniquement (génération de questions via sous-système 4.4+).*

## 4.2 TalentLMS — SaaS Corporate

| **Éditeur** | Epignosis Ltd (Grèce) |
| --- | --- |
| **Version évaluée** | Cloud 2025 |
| **Base utilisateurs** | 70 000+ entreprises, 11M+ apprenants |
| **Score global** | 36,4 / 100 |
| **Verdict** | Inadapté — Lacunes fonctionnelles majeures |

Tableau 8 : Évaluation de TalentLMS 

| **C1** **3** | **C2** **1** | **C3** **1** | **C4** **3** | **C5** **3** | **C6** **2** | **C7** **1** | **C8** **3** | **C9** **4** | **C10** **1** | **C11** **1** | **C12** **4** | **C13** **5** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 9 : Évaluation des Critères – Notes de TalentLMS[^c30]

Points forts : Déploiement immédiat, interface intuitive, QCM avec scoring automatique, gamification intégrée, SLA 99,9%, conformité SCORM/xAPI.

Limites critiques : Aucun chatbot IA ni agent conversationnel. Ateliers pratiques inexistants. Code source fermé — personnalisation impossible. Hébergement exclusivement AWS US-East (aucune option souveraineté). Vendor lock-in total.

**Maturité IA : N1 — TalentLMS AI annoncé en 2025 se limite à la génération de cours pour formateurs. Aucune IA côté apprenant.**

## 4.3 360Learning — LXP Collaboratif

| **Éditeur** | 360Learning SAS (France) |
| --- | --- |
| **Version évaluée** | Cloud 2025 |
| **Base utilisateurs** | 2 000+ entreprises, 2M+ apprenants |
| **Score global** | 41,3 / 100 |
| **Verdict** | Hors Scope — Tarification inadaptée au contexte |

Tableau 10 : 360Learning — Évaluation de la plateforme

| **C1** **2** | **C2** **3** | **C3** **1** | **C4** **2** | **C5** **4** | **C6** **3** | **C7** **2** | **C8** **4** | **C9** **4** | **C10** **1** | **C11** **3** | **C12** **4** | **C13** **3** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 11 : Évaluation des Critères – Notes de 360Learning[^c34]

Points forts : Apprentissage collaboratif unique (co-création de contenu), analytics avancés, UX soignée, ateliers collaboratifs bien supportés, API REST complète, conforme RGPD.

Limites critiques : Chatbot IA conversationnel absent — les fonctionnalités IA 2024-2025 portent sur la génération de contenu, pas sur un agent apprenant. Moteur QCM limité (pas de randomisation avancée, pas d'anti-fraude de niveau certification). Certification basique sans vérification cryptographique. 

**Maturité IA : N2 — Recommandations ML proprietary et génération de contenu. Pas de chatbot conversationnel.**

## 4.4 Open edX (Redwood) — Plateforme MOOC (Massive Open Online Course) 

| **Éditeur** | Axim Collaborative (USA) |
| --- | --- |
| **Version évaluée** | Redwood — Juin 2024 |
| **Base utilisateurs** | 35M+ apprenants, 160+ institutions |
| **Score global** | 57,5 / 100 |
| **Verdict** | Trop complexe — Non viable en solo |

Tableau 12 : Open edX — Évaluation de la plateforme

| **C1** **5** | **C2** **2** | **C3** **1** | **C4** **5** | **C5** **4** | **C6** **5** | **C7** **2** | **C8** **4** | **C9** **3** | **C10** **2** | **C11** **5** | **C12** **4** | **C13** **1** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 13 : Évaluation des Critères – Notes de Open edX[^c38]

Points forts : Meilleur score technique — QCM très avancé, certification Open Badges 2.0 avec vérification cryptographique, architecture XBlocks extensible, API REST très complète, Apache 2.0 open source, utilisé par Harvard et MIT.

Limites critiques : Complexité opérationnelle extrême — déploiement Kubernetes, outil tutor officiel, requiert une équipe DevOps dédiée. Aucun chatbot IA natif (le module AI Mentor est en bêta fermée sur edX.org SaaS uniquement). Ateliers pratiques limités aux labs XBlock et à l'évaluation par les pairs. Infrastructure très coûteuse en ressources. Mises à jour semi-annuelles avec breaking changes fréquents.

**Maturité IA (open source) : N1. La version SaaS commerciale est N3 mais inaccessible. Le chatbot open source est prévu pour mi-2026***.*

## 4.5 Docebo Learn — LMS Enterprise IA

| **Éditeur** | Docebo Inc. (Canada, Nasdaq: DCBO) |
| --- | --- |
| **Version évaluée** | Cloud 2025 |
| **Base utilisateurs** | 3 500+ entreprises, 2,5M+ apprenants |
| **Score global** | 52,8 / 100 |
| **Verdict** | Hors Scope — Tarification enterprise inaccessible |

Tableau 14 Docebo Learn — Évaluation de la plateforme [^c41]

| **C1** **4** | **C2** **2** | **C3** **3** | **C4** **3** | **C5** **4** | **C6** **4** | **C7** **4** | **C8** **4** | **C9** **5** | **C10** **1** | **C11** **1** | **C12** **4** | **C13** **4** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 15  : Évaluation des Critères – Notes de Docebo Learn

Points forts : Plateforme IA la plus avancée du marché LMS — moteur ML de recommandation, Docebo Shape (génération micro-contenus), API riche, interface apprenant très soignée, analytics avancés.

Limites critiques : Tarification sur devis estimée à 1 500–5 000 USD/mois — hors de tout périmètre PFE. "Docebo Coach" (chatbot conversationnel) toujours en bêta privée en avril 2026, indisponible en production. Code source fermé, SaaS pur, aucune souveraineté des données possible.

**Maturité IA : N2-N3 — Plateforme la plus proche du besoin Cert_EET mais structurellement inaccessible.**

## 4.6 Canvas LMS — LMS Académique

| **Éditeur** | Instructure Inc. (USA, Nasdaq: INST) |
| --- | --- |
| **Version évaluée** | Cloud + Self-hosted 2025 |
| **Base utilisateurs** | 30M+ utilisateurs, 6 000+ institutions |
| **Score global** | 51,9 / 100 |
| **Verdict** | Complexe — Architecture ouverte mais IA absente |

Tableau 16 : Canvas LMS — Évaluation de la plateforme

| **C1** **4** | **C2** **3** | **C3** **1** | **C4** **3** | **C5** **4** | **C6** **4** | **C7** **2** | **C8** **4** | **C9** **4** | **C10** **2** | **C11** **3** | **C12** **5** | **C13** **2** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Tableau 17: Tableau 13 : Évaluation des Critères – Notes de Canvas LMS

Points forts : Richesse fonctionnelle académique sérieuse — Speed Grader (interface de correction efficace), LTI 1.3, API REST avec 900+ endpoints, version open source AGPL, conforme WCAG 2.1 / RGPD, intégrations Office 365 / Google Workspace.

Limites critiques : Aucun chatbot IA natif — Canvas AI 2025 se limite à la génération de rubriques et au feedback automatique côté enseignant. QCM moins avancé que Moodle. Version open source (Canvas OSS) très complexe à maintenir. Hébergement SaaS AWS US exclusivement pour les petits comptes.

**Maturité IA : N1-N2 — Recommandations de contenu limitées. Aucun chatbot apprenant stable ou documenté.**

# 5. Analyse des Capacités IA

## 5.1 Référentiel de Maturité IA

Cert_EET requiert nativement un assistant IA de génération de questions QCM ancré sur les supports de cours via RAG — ce que nous définissons comme un niveau N4 appliqué à la productivité formateur. Voici le référentiel de maturité utilisé dans cette analyse :

| **Niveau** | **Désignation** | **Description** | **Impact Apprenant** |
| --- | --- | --- | --- |
| **N1** | **IA de Productivité** | L'IA assiste les formateurs dans la création de contenu. L'apprenant ne bénéficie pas directement de l'IA. | **Faible** |
| **N2** | **IA de Recommandation** | L'IA personnalise le parcours de l'apprenant en suggérant du contenu pertinent (ML, non LLM). | **Modéré** |
| **N3** | **IA Conversationnelle** | Un agent LLM répond aux questions de l'apprenant. Contextualisation limitée au cours en cours. | **Significatif** |
| **N4** | **IA Pédagogique Intégrée** | Génération de questions QCM ancrée sur les supports de cours (RAG), validation humaine obligatoire. (Requis par Cert_EET.) | **Élevé** |

Tableau 18 : Niveaux d’intégration de l’IA dans les plateformes d’apprentissage et impact

## 5.2 Positionnement IA des Plateformes

| **Rappel du référentiel de maturité IA (défini en section 5.1)** N1 — IA de Productivité : l'IA assiste le formateur uniquement. L'apprenant n'en bénéficie pas. N2 — IA de Recommandation : l'IA suggère du contenu à l'apprenant via un moteur ML. Pas de conversation. N3 — IA Conversationnelle : un agent LLM répond à l'apprenant, mais sa contextualisation est limitée au cours en cours. **N4 — IA Pédagogique Avancée (cible Cert_EET) : génération de questions QCM ancrée sur les vrais supports de cours (RAG), avec validation humaine obligatoire. Les questions reflètent le contenu enseigné, pas des connaissances génériques.** |
| --- |

| **Plateforme** | **Niveau Actuel** | **Niveau Annoncé** | **Capacités Disponibles** | **Lacune vs Cert_EET** |
| --- | --- | --- | --- | --- |
| **Moodle 4.x** | N1 | N1 | Génération questions (4.4+), assistance formateurs uniquement | Génération de questions basique (sous-système 4.4+), sans ancrage RAG sur les supports de cours ni validation structurée |
| **TalentLMS** | N1 | N1 | TalentLMS AI : génération de cours pour formateurs uniquement | Aucune IA côté apprenant |
| **360Learning** | N2 | N2 | Recommandations ML, génération contenu (authoring) | Génération de cours générique côté formateur, sans ancrage RAG ni banque de questions structurée |
| **Open edX** | N1 | N2 | Intégration OpenAI expérimentale (non open source) | Aucune génération de questions QCM avec ancrage RAG. AI Mentor (SaaS) en bêta fermée, inaccessible |
| **Docebo** | N2-N3 | N3 | Recommandations ML + Docebo Coach (bêta fermée) | Coach en bêta fermée, inaccessible |
| **Canvas LMS** | N1-N2 | N2 | Canvas AI : rubriques et feedback IA, côté enseignant | Génération de rubriques et feedback automatique côté enseignant uniquement. Aucune génération de questions QCM ancrée sur les supports de cours |

Tableau 19 : Comparatif des plateformes LMS

## 5.3 Conclusion de l'Analyse IA

En avril 2026, toutes les plateformes évaluées proposent au mieux une génération de questions ou de contenu générique côté formateur (N1). Aucune ne propose de génération ancrée sur les vrais supports de cours du formateur via RAG (Retrieval-Augmented Generation), avec banque de questions structurée et validation humaine obligatoire — ce que nous définissons comme le niveau N4 ciblé par Cert_EET.

Le marché est en transition de N1 vers N2, avec quelques acteurs (Docebo, Canvas) en phase bêta sur le N3. L'intégration directe d'un LLM via API (GPT-4o, Claude, Mistral) dans une solution développée sur mesure est la seule voie techniquement réalisable dans le calendrier d'un PFE.

**Observation stratégique : Si la génération de questions de base est présente chez plusieurs concurrents (N1), la génération ancrée sur les supports de cours spécifiques d’une formation (RAG) avec validation humaine structurée est absente de toutes les solutions évaluées. En développant nativement cette fonctionnalité, Cert_EET se positionnera à un niveau de maturité IA supérieur à l’ensemble des plateformes du marché sur ce critère précis.***.*

# 6. Matrice Comparative et Scoring

## 6.1 Tableau de Synthèse

Légende des scores : 5 — Excellent  |  4 — Bon  |  3 — Acceptable  |  2 — Insuffisant  |  1 — Absent

| **Plateforme** | **C1** | **C2** | **C3** | **C4** | **C5** | **C6** | **C7** | **C8** | **C9** | **C10** | **C11** | **C12** | **C13** | **Score** | **Verdict**[^c54] |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Moodle 4.x** | **4** | **2** | **1** | **2** | **4** | **4** | **2** | **3** | **3** | **4** | **5** | **5** | **3** | **52,6 / 100** | **Partiel** |
| **TalentLMS** | **3** | **1** | **1** | **3** | **3** | **2** | **1** | **3** | **4** | **1** | **1** | **4** | **5** | **36,4 / 100** | **Inadapté** |
| **360Learning** | **2** | **3** | **1** | **2** | **4** | **3** | **2** | **4** | **4** | **1** | **3** | **4** | **3** | **41,3 / 100** | **Hors Scope** |
| **Open edX** | **5** | **2** | **1** | **5** | **4** | **5** | **2** | **4** | **3** | **2** | **5** | **4** | **1** | **57,5 / 100** | **Trop complexe** |
| **Docebo** | **4** | **2** | **3** | **3** | **4** | **4** | **4** | **4** | **5** | **1** | **1** | **4** | **4** | **52,8 / 100** | **Hors Scope** |
| **Canvas LMS** | **4** | **3** | **1** | **3** | **4** | **4** | **2** | **4** | **4** | **2** | **3** | **5** | **2** | **51,9 / 100** | **Complexe** |

Tableau 20 : Tableau des scores globaux et verdicts d’adéquation

## 6.2 Classement et Analyse

| **Rang** | **Plateforme** | **Score** | **Analyse** |
| --- | --- | --- | --- |
| **1** | **Open edX** | **57,5/100** | Meilleur score technique et fonctionnel, mais complexité opérationnelle extrême (Kubernetes, DevOps) et absence d'IA conversationnelle. |
| **2** | **Docebo** | **52,8/100** | Plateforme IA la plus avancée mais sans génération QCM RAG. Fonctionnalités IA en bêta fermée et tarification enterprise inaccessible dans le périmètre d’un PFE. |
| **3** | **Moodle 4.x** | **52,6/100** | Meilleure option open source. QCM mature, souveraineté des données possible. Lacunes critiques sur l'IA conversationnelle et les ateliers. |
| **4** | **Canvas LMS** | **51,9/100** | Richesse académique sérieuse, architecture ouverte. Manque l'IA conversationnelle et la certification vérifiable anti-fraude. |
| **5** | **360Learning** | **41,3/100** | Expérience collaborative différenciante. Tarification inadaptée au périmètre DE NOTRE SOLUTION et IA limitée à la recommandation. |
| **6** | **TalentLMS** | **36,4/100** | Facilité maximale de déploiement. Aucune IA apprenant, aucun atelier pratique, aucune souveraineté des données. Totalement inadapté. |

Tableau 21 : Classement des plateformes LMS

# 7. Analyse des Lacunes Fonctionnelles

Les lacunes identifiées ci-dessous sont structurelles — elles ne peuvent pas être comblées par simple configuration ou activation d'un plugin existant, quel que soit le scénario d'adoption choisi.

| **Lacune** | **Détail** | **Impact** | **Criticité** |
| --- | --- | --- | --- |
| **G1** **Génération QCM par IA avec ancrage RAG** | Absent de toutes les plateformes. Les intégrations tierces sont instables. Requiert un développement sur mesure avec API LLM. | **Développement custom requis** | **CRITIQUE** |
| **G2** **Ateliers Pratiques Évalués** | Absent ou rudimentaire sur 5/6 plateformes. Aucun workflow formateur avec grille de notation configurable. | **Développement spécifique** | **CRITIQUE** |
| **G3** **Certification Vérifiable** | Open edX seul via Open Badges. Les autres génèrent des PDF sans signature cryptographique ni URL de vérification. | **Développement custom** | **MAJEUR** |
| **G4** **Anti-fraude QCM** | Randomisation et timer côté serveur incomplets sur la majorité des plateformes. Requis pour la certification. | **Développement sécurité** | **SIGNIFICATIF** |

Tableau 22 : Analyse des lacunes critiques des LMS

## 7.1 Détail des Lacunes Critiques

### G1 — Génération de Questions QCM par IA avec Ancrage RAG (Lacune Structurelle)

Si plusieurs plateformes évaluées proposent une génération de questions ou de contenu générique côté formateur (Moodle 4.4+, TalentLMS AI, Canvas AI), aucune ne propose de génération ancrée sur les vrais supports de cours spécifiques à une formation via RAG (Retrieval-Augmented Generation), avec banque de questions structurée, distracteurs pédagogiques de qualité, traçabilité complète du lot de génération et validation humaine obligatoire. La distinction est fondamentale : une question générée sans ancrage produit du contenu générique; une question générée par RAG sur les supports du formateur reflète ce qui est réellement enseigné.

Aucune plateforme ne propose un agent capable de : connaître le score du dernier QCM, savoir où l'apprenant en est dans son atelier, adapter son discours en conséquence et envoyer une alerte proactive au formateur. Cette fonctionnalité doit être développée de zéro.

### G2 — Ateliers Pratique	s avec Workflow Formateur (Lacune Quasi-Universelle)

La notion d'atelier pratique structuré — définition de livrables, soumission, grille de compétences configurable, workflow de validation, feedback textuel archivé — est absente ou très rudimentaire sur 5/6 plateformes. Canvas LMS propose Speed Grader, l'outil le plus avancé sur cet axe, mais son paramétrage pour des grilles de compétences spécifiques reste laborieux. Un développement spécifique est requis dans tous les scénarios.

### G3 — Certification Numérique Vérifiable

Seul Open edX implémente un mécanisme de certification avec vérification externe (Open Badges 2.0 avec signature cryptographique), au prix d'une complexité opérationnelle disproportionnée. Les autres solutions génèrent des certificats PDF sans signature numérique ni URL de vérification publique. Dans un contexte institutionnel où les certifications ont une valeur sur le marché de l'emploi, l'absence de mécanisme anti-fraude compromet la crédibilité du dispositif.

# 8. Recommandation Stratégique

## 8.1 Évaluation des Scénarios

| **Scénario** | **Description** | **Couverture CdC** | **Risque PFE** | **Retenu ?** |
| --- | --- | --- | --- | --- |
| **A — Adoption Directe** | Adopter Moodle ou Open edX sans développement spécifique majeur | **40–55%** | Élevé | **Non** |
| **B — Hybridation Moodle** | Prendre Moodle comme base et développer les modules manquants en plugins PHP | **70–80%** | Élevé | **Non** |
| **C — Développement sur mesure** | Développer Cert_EET en stack NestJS (OU BIEN  Spring Boot )+ Next.js PostgreSQL avec API LLM native | **100%** | Modéré | **OUI ✓** |

Tableau 23 : tableau d'évaluation des scénarios

**Couverture CdC** = **Couverture du Cahier des Charges**

## 8.2 Pourquoi le Scénario B (Hybridation Moodle) est Écarté

L'hybridation sur Moodle est une option naturellement envisagée. Elle est écartée pour les raisons suivantes :

- **Contraintes architecturales PHP** : Moodle est développé en PHP 8.x. L'intégration d'un agent LLM avec gestion d'état conversationnel persistant et communication temps-réel (WebSocket/SSE) est techniquement très complexe dans ce paradigme

- **Dette technique des plugins** : Le cycle de vie des plugins Moodle est couplé aux versions majeures. Un plugin développé pour Moodle 4.3 peut nécessiter une migration significative pour 4.4 ou 4.5.

- **Coût en temps comparable ou supérieur**  : Le développement de trois modules majeurs (assistant IA génération QCM, ateliers avancés, certification) en plugins Moodle correctement architecturés représente un effort comparable à un développement full-custom, sans les avantages d’une architecture propre ni la valeur pédagogique d’un projet full-stack.

- **Expérience utilisateur contrainte**  : Moodle impose son paradigme UX. La création d’une expérience formateur moderne autour d’un assistant IA de génération de questions est structurellement limitée par l’interface Moodle.

## 8.3 Recommandation Finale : Développement sur Mesure

Sur la base de l'analyse présentée dans ce document, le Scénario « C » est recommandé: développement d'une solution sur mesure pour la plateforme Cert_EET.

| **Critère de décision** | **Justification** |
| --- | --- |
| **Couverture fonctionnelle 100%** | Seule approche couvrant les 7 fonctionnalités obligatoires (QCM, ateliers, certification, assistant IA génération QCM, RBAC, analytics, sécurité) sans compromis architectural. |
| **Intégration LLM native** | L’intégration d’un assistant IA de génération de questions QCM ancré sur les supports de cours (RAG) via API (GPT-4o, Claude, Mistral) est uniquement réalisable dans une architecture conçue pour cela dès le départ. |
| **Certification vérifiable** | Le mécanisme SHA-256 + QR code + URL de vérification publique est uniquement possible en full-custom, avec contrôle total du cycle de vie du certificat. |
| **Souveraineté des données** | Hébergement entièrement maîtrisable (local ou VPS), aucune donnée apprenant transitant par un tiers SaaS étranger. |
| **Valeur pédagogique ** | Un développement full-stack complet avec méthode Agile, CI/CD, tests et documentation constitue un projet de qualité industrielle démontrant une maîtrise de bout en bout. |
| **Évolutivité** | L'architecture modulaire permet une évolution future vers le multi-tenant ou une extension des fonctionnalités sans contraintes imposées par un LMS tiers. |

Tableau 24 : Tableau des recommandations et leurs justifications

## 8.4 Prochaines Étapes (Phase 2)

- Validation formelle et accord de l’encadrant pédagogique 

- Rédaction des Architecture Decision Records (ADR) 

- Conception générale du système (ERD, architecture, maquettes UX et backlog initial) 

- Initialisation du projet (Sprint 0) : dépôt Git, pipeline CI/CD, environnements Docker et structure technique 

- Rédaction du backlog produit (Epics, User Stories et critères d’acceptation)

# Annexes

## Glossaire

| **Terme** | **Définition** |
| --- | --- |
| **LMS** | Learning Management System — Plateforme centralisant la création, distribution et suivi des formations. |
| **LXP** | Learning Experience Platform — Évolution du LMS privilégiant l'expérience apprenant et le social learning. |
| **LLM** | Large Language Model — Grand modèle de langage entraîné sur d'énormes corpus (ex: GPT-4o, Claude, Mistral). |
| **GenAI** | Generative AI — IA générative capable de produire du contenu original à partir de requêtes en langage naturel. |
| **QCM** | Questionnaire à Choix Multiples — Format d'évaluation composé de questions avec plusieurs options de réponse. |
| **Open Badges** | Standard de micro-certification numérique (IMS Global / 1EdTech) avec métadonnées vérifiables. |
| **RBAC** | Role-Based Access Control — Modèle de contrôle d'accès où les permissions sont attribuées à des rôles. |
| **SHA-256** | Secure Hash Algorithm 256 bits — Fonction de hachage cryptographique utilisée pour la signature de documents. |
| **XBlock** | Composant pédagogique extensible d'Open edX — architecture plugin permettant d'ajouter de nouveaux types d'activités. |
| **RAG** | Retrieval-Augmented Generation — Technique combinant LLM et base de connaissances externe pour des réponses précises. |
| **PFE** | Projet de Fin d'Études — Travail académique en fin de cursus ingénieur, à vocation de développement industriel. |
| **NestJS** | Framework Node.js progressif pour la construction d'applications serveur scalables et maintenables. |
| **Next.js** | Framework React full-stack avec rendu serveur (SSR/SSG) et API routes intégrées. |
| **GIFT** | C’est un **format texte simple** créé par Moodle. Il permet de créer rapidement des questions (QCM, vrai/faux, association, texte à trous, etc.) dans un fichier .txt avec une syntaxe très légère. |
| **SCORM** | Sharable Content Object Reference Model C’est un **standard international** (le plus connu) pour créer et diffuser des contenus e-learning. Standard e-learning définissant la communication entre les contenus pédagogiques et les LMS. |
| **xAPI (Tin Can API)** | C’est le **standard moderne** qui remplace peu à peu SCORM.  Il permet de suivre des activités d’apprentissage **très variées** (pas seulement des modules e-learning). Experience API — Standard moderne de suivi des activités d'apprentissage, successeur de SCORM |
| **SLA** | SLA = Service Level Agreement (Accord de Niveau de Service) C’est un engagement contractuel de l’éditeur sur la disponibilité et la performance de sa plateforme. |
| **RGPD** | **RGPD** = **Règlement Général sur la Protection des Données** C’est la **loi européenne** sur la protection des données personnelles (équivalent du GDPR en anglais). Respecte les règles strictes de l’Union Européenne sur la collecte, le stockage, le traitement et la suppression des données personnelles. Permet aux utilisateurs d’exercer leurs droits (droit d’accès, de rectification, d’oubli, etc.). |
| **LTI 1.3** | (Learning Tools Interoperability) C’est un standard qui permet d’intégrer facilement des outils externes dans Moodle. Exemples : intégrer Zoom, Microsoft Teams, Google Docs, Khan Academy, un simulateur, ou une plateforme externe directement dans un cours Moodle. |
| **AGPL**** (version open source)** | Affero General Public License C’est une licence open source très stricte. Elle oblige toute personne qui modifie le logiciel à redistribuer ses modifications en open source (même si l’application est utilisée en ligne/SaaS). Contrairement à une licence plus permissive (comme Apache 2.0), elle empêche les entreprises de prendre le code, le modifier, et le rendre propriétaire sans rien rendre à la communauté. |
| **WCAG ****2.1** | **Web Content Accessibility Guidelines 2.1** C’est le **standard international d’accessibilité** pour les sites et applications web. Signifie que la plateforme est conçue pour être **utilisable par tous**, y compris les personnes en situation de handicap (malvoyants, daltoniens, troubles moteurs, etc.). Elle respecte des règles strictes : contraste des couleurs, navigation au clavier, compatibilité avec les lecteurs d’écran, etc. |

## Sources et Références

- Moodle Official Documentation & Changelog — https://docs.moodle.org — Version 4.3, 2024

- Moodle AI Subsystem Announcement — Moodle HQ Blog, Novembre 2024

- TalentLMS Platform Overview — https://www.talentlms.com — Avril 2026

- TalentLMS AI Features Announcement — TalentLMS Blog, Février 2025

- 360Learning Platform Documentation — https://360learning.com — Avril 2026

- Open edX Documentation (Redwood Release) — https://docs.openedx.org — Juin 2024

- Docebo Learn Platform Overview — https://www.docebo.com — Avril 2026

- Docebo Coach Beta Announcement — Docebo Blog, Octobre 2024

- Canvas LMS Documentation — https://community.canvaslms.com/docs — Avril 2026

- Canvas AI Announcement — Instructure Blog, Mars 2025

- Gartner Magic Quadrant for Corporate Learning Technologies, 2025

- Forrester Wave : Learning Management Systems, Q1 2025

- MarketsandMarkets : E-learning Market Size Report, 2025

- IMS Global / 1EdTech : Open Badges 3.0 Specification, 2024

##  Avertissements

Les informations contenues dans ce document reposent sur les données publiques disponibles en avril 2026 et sur les analyses que nous avons menées durant notre PFE. Il faut savoir que les tarifs et fonctionnalités des plateformes SaaS peuvent évoluer rapidement. Les roadmaps évoquées sont simplement des déclarations d’intention de la part des éditeurs et n’ont rien d’engagé.

Ce travail reste un document académique et ne peut en aucun cas être considéré comme un conseil juridique ou financier.

Page | 2 

Page | 2 

Page | 2 

## Comments

[^c9] Omri IYED: L’axe IA étant central, le positionnement doit se faire prioritairement sur les capacités réelles des Large Language Models (raisonnement, connaissance, créativité, fiabilité, contexte long, outils/agentic, spécialisation, vitesse/latence, coût, etc.)
[^c12] Omri IYED: G2, Capterra et Gartner sont trois sources fréquemment utilisées pour évaluer des logiciels professionnels (SaaS, ERP, CRM, outils RH, etc.), mais elles n'ont pas le même rôle. G2 : plateforme d'avis utilisateurs sur les logiciels. Les clients publient des évaluations, notes, avantages/inconvénients et retours d'expérience. G2 agrège ces avis et produit aussi des classements de solutions selon la satisfaction client et leur présence sur le marché.  Capterra : plateforme de comparaison et d'avis logiciels appartenant à Gartner. Elle aide les entreprises à découvrir des solutions logicielles, comparer leurs fonctionnalités et consulter des retours d'utilisateurs.  Gartner : cabinet international d'analyse et de conseil spécialisé dans les technologies de l'information. Gartner publie des études de marché, des analyses stratégiques et des classements influents comme le Magic Quadrant, qui positionne les fournisseurs selon leur vision et leur capacité d'exécution.
[^c14] Omri IYED: Chiffrement (Encryption): Data is encrypted both in transit and at rest to protect it from unauthorized access. MFA (Multi-Factor Authentication): Requires multiple verification steps (password + code/app) for stronger login security. RBAC (Role-Based Access Control): Users get access only to the features and data their role allows (principle of least privilege). Logs d’audit (Audit Logs): Detailed records of all user actions, changes, and accesses for security monitoring and compliance.
[^c15] Omri IYED: Total cost of ownership
[^c25] Omri IYED: Critère / Dimension Dimension Fonctionnelle — 50% C1 — Couverture QCM C2 — Ateliers Pratiques C3 — Chatbot IA Intégré C4 — Certification Vérifiable C5 — Gestion Multi-Rôles Dimension Technique — 25% C6 — Architecture & Évolutivité C7 — Intégration IA / LLM C8 — Sécurité & Conformité C9 — Performance & Fiabilité Dimension Stratégique — 25% C10 — Coût (TCO indicatif) C11 — Souveraineté des Données C12 — Maturité & Pérennité C13 — Time-to-Market
[^c30] Omri IYED: Critère / Dimension Dimension Fonctionnelle — 50% C1 — Couverture QCM C2 — Ateliers Pratiques C3 — Chatbot IA Intégré C4 — Certification Vérifiable C5 — Gestion Multi-Rôles Dimension Technique — 25% C6 — Architecture & Évolutivité C7 — Intégration IA / LLM C8 — Sécurité & Conformité C9 — Performance & Fiabilité Dimension Stratégique — 25% C10 — Coût (TCO indicatif) C11 — Souveraineté des Données C12 — Maturité & Pérennité C13 — Time-to-Market
[^c34] Omri IYED: Critère / Dimension Dimension Fonctionnelle — 50% C1 — Couverture QCM C2 — Ateliers Pratiques C3 — Chatbot IA Intégré C4 — Certification Vérifiable C5 — Gestion Multi-Rôles Dimension Technique — 25% C6 — Architecture & Évolutivité C7 — Intégration IA / LLM C8 — Sécurité & Conformité C9 — Performance & Fiabilité Dimension Stratégique — 25% C10 — Coût (TCO indicatif) C11 — Souveraineté des Données C12 — Maturité & Pérennité C13 — Time-to-Market
[^c38] Omri IYED: Critère / Dimension Dimension Fonctionnelle — 50% C1 — Couverture QCM C2 — Ateliers Pratiques C3 — Chatbot IA Intégré C4 — Certification Vérifiable C5 — Gestion Multi-Rôles Dimension Technique — 25% C6 — Architecture & Évolutivité C7 — Intégration IA / LLM C8 — Sécurité & Conformité C9 — Performance & Fiabilité Dimension Stratégique — 25% C10 — Coût (TCO indicatif) C11 — Souveraineté des Données C12 — Maturité & Pérennité C13 — Time-to-Market
[^c41] Omri IYED: Critère / Dimension Dimension Fonctionnelle — 50% C1 — Couverture QCM C2 — Ateliers Pratiques C3 — Chatbot IA Intégré C4 — Certification Vérifiable C5 — Gestion Multi-Rôles Dimension Technique — 25% C6 — Architecture & Évolutivité C7 — Intégration IA / LLM C8 — Sécurité & Conformité C9 — Performance & Fiabilité Dimension Stratégique — 25% C10 — Coût (TCO indicatif) C11 — Souveraineté des Données C12 — Maturité & Pérennité C13 — Time-to-Market
[^c54] Omri IYED: Verdict = jugement