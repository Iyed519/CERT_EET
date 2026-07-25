**Cert_EET — Cahier des Charges** 

**ESPRIT**

***Ecole Supérieure Privée d'Ingénierie et de Technologies***

**CAHIER DES CHARGES**

**Projet Cert_EET**

**Plateforme de Certification et de Micro-Certification Digitale**

| **Etudiant** | Iyed Omri |
| --- | --- |
| **Etablissement** | ESPRIT — Projet de Fin d'Etudes, Ingénierie Logicielle |
| **Commanditaire** | ESPRIT Entreprise |
| **Date de début** | 24 avril 2026 |
| **Date de fin** | 24 octobre 2026 |
| **Méthodologie** | Agile / Scrum |
| **Version** | 2.0 — Avril 2026 |

Table des Matières

	Liste des Tableaux	4

	1. Introduction	1

	1.1 Contexte	1

	1.2 Presentation du commanditaire	1

	1.3 Périmètre du projet	1

	2. Objectifs du Projet	2

	2.1 Objectif general	2

	2.2 Objectifs specifiques	2

	3. Analyse de l'Existant et Benchmark	3

	3.1 Outils en usage chez ESPRIT	3

	3.2 Benchmark des plateformes du marche	3

	3.3 Lacunes structurelles identifiees	4

	4. Besoins Fonctionnels	5

	4.1 Vue d'ensemble	5

	4.2 Description detaillee	5

	F1 — Moteur QCM anti-fraude	5

	F2 — Ateliers Pratiques évalués	5

	F3 — Certification Numérique Vérifiable	5

	F4 — Assistant IA de Génération de Questions QCM	6

	F5 — Gestion Multi-Rôles (RBAC)	6

	F6 — Analytics et Reporting	6

	F7 — Sécurité et Conformité	6

	5. Besoins Non Fonctionnels	7

	6. Architecture et Choix Techniques	8

	6.1 Orientations générales	8

	6.2 Contraintes architecturales	8

	6.3 Spécificités de l'intégration IA	8

	6.4 Souveraineté des données	9

	7. Méthodologie de Développement	10

	7.1 Approche Agile — Scrum	10

	7.2 Livrables attendus	10

	8. Planning Prévisionnel	11

	Annexe — Glossaire	1

Liste des Tableaux

	Table 1 : outils en usage chez ESPRIT	3

	Table 2 : Résultats du Benchmark des plateformes étudiées	3

	Table 3 : Lacunes et leurs criticités	4

	Table 4 : Vue d’ensemble sur les Besoins Fonctionnels	5

	Table 5 : Gestion Multi-Roles	6

	Table 6 : Vue d'ensemble sur les Besoins non Fonctionnels	7

	Table 7 : Couche et choix techniques possibles	8

	Table 8 : Méthodologie du développement et spécificités	10

	Table 9 : Livrables attendus	10

	Table 10 : Planning Prévisionnel	11

# 1. Introduction

## 1.1 Contexte

ESPRIT Entreprise est l'entité de formation continue du groupe ESPRIT. Elle organise des cycles de formation professionnelle et certifiante destines aux étudiants, aux diplômes et aux professionnels partenaires.[^c6]

En 2025-2026, trois tendances structurelles transforment le marché de la formation et de la certification :

- L'intégration croissante des LLM (grands modelés de langage) dans les outils éducatifs, créant une nouvelle catégorie de plateformes dites « AI-native »

- La montée en puissance des micro-certifications et badges numériques dans les processus de recrutement et de validation des acquis

- L'émergence d'exigences de souveraineté sur les données apprenants dans les établissements tunisiens

Face a ces évolutions, ESPRIT Entreprise ne dispose pas d'une infrastructure de certification numérique propre, crédible et vérifiable. Les outils actuellement en usage — Blackboard pour les cours, Microsoft Teams pour la communication, Moodle de manière ponctuelle — sont des outils d'enseignement génériques qui ne répondent pas aux besoins spécifiques d'une plateforme de certification. Ce constat, documente dans l'Etude de l'Existant, justifie le développement d'une solution sur mesure.

## 1.2 Présentation du commanditaire

ESPRIT Entreprise est l'entité rattachée au groupe ESPRIT chargée des formations certifiantes et continues. Elle adresse des professionnels, des entreprises partenaires et des apprenants souhaitant valider des compétences spécifiques. Sa mission est de délivrer des certifications de qualité, reconnues et vérifiables, en s'appuyant sur les ressources du groupe ESPRIT.[^c9]

## 1.3 Périmètre du projet

Cert_EET est une plateforme de certification et de micro-certification digitale. Son rôle est de gérer le cycle complet de validation et d'attestation des compétences : évaluations, ateliers pratiques, délivrance et vérification des certificats.

Ce projet ne vise pas a remplacer les outils d'enseignement existants (Blackboard, Teams, Moodle). Ces outils continueront d'être utilisés pour la pédagogie quotidienne. Cert_EET intervient en aval, pour la certification des compétences acquises. Une intégration plus large avec les outils existants pourra être envisagée dans une version future, si la plateforme fait ses preuves.

# 2. Objectifs du Projet

## 2.1 Objectif général

Concevoir et développer une plateforme digitale de certification et de micro-certification pour ESPRIT, permettant de faire passer des évaluations certifiantes, d’évaluer des travaux pratiques, de délivrer des certificats numériques vérifiables et d’assister les formateurs par un outil de génération de questions QCM alimenté par l’intelligence artificielle.

## 2.2 Objectifs spécifiques

- Fournir un moteur d'évaluations QCM anti-fraude adapte aux certifications : randomisation serveur, minuterie, historique et scoring automatique

- Implémenter un système d'ateliers pratiques avec workflow complet : définition des livrables, soumission, grille d'évaluation formateur et feedback structure

- Générer des certificats numériques vérifiables via QR code et empreinte SHA-256, avec URL de vérification publique

- Intégrer un assistant IA de génération de questions QCM à destination des formateurs, ancré sur les supports de cours via RAG, constituant une fonctionnalité différenciante absente de toutes les solutions du marché à ce jour

- Garantir la qualité et la traçabilité des données via un tableau de bord analytique par rôle.

- Proposer une architecture déployable sur infrastructure propre (possibilité de souveraineté des données), rendue possible uniquement par le choix du développement sur mesure

# 3. Analyse de l'Existant et Benchmark

Cette section synthétise les conclusions de deux documents de référence produits en amont du présent cahier des charges. Ils constituent la justification formelle du choix de développement sur mesure.

## 3.1 Outils en usage chez ESPRIT

ESPRIT utilise actuellement trois outils dans son dispositif pédagogique, de manière partielle et non coordonnée :

| **Outil** | **Usage actuel** | **Limite vis-a-vis de Cert_EET** |
| --- | --- | --- |
| Blackboard | LMS institutionnel — diffusion de cours, gestion administrative | Aucun workflow de certification vérifiable. Certification générique sans QR code ni signature. SaaS héberge aux USA (Anthology). |
| Microsoft Teams | Sessions live, partage de fichiers, communication | Aucune traçabilité pédagogique. Les livrables déposes ne sont pas lies a une grille d'évaluation. |
| Moodle (ponctuel) | QCM occasionnels par certains formateurs | Aucun chatbot IA. Certificats PDF simples. Non synchronise avec Blackboard ni Teams. |

Table 1 : outils en usage chez ESPRIT

Ces outils sont des instruments d'enseignement. Ils ne constituent pas une réponse au besoin de certification numérique structure. Cert_EET ne les remplace pas — il comble un manque qu'ils ne sont pas conçus pour couvrir.

## 3.2 Benchmark des plateformes du marche

Six plateformes LMS/LXP ont été évaluées sur 13 critères (fonctionnels, techniques, stratégiques). Aucune ne satisfait l'ensemble des exigences de Cert_EET.

| **Plateforme** | **Score /100** | **Verdict** | **Blocage principal** |
| --- | --- | --- | --- |
| Open edX (Redwood) | 57,5 | Trop complexe | Déploiement Kubernetes, équipe DevOps requise, chatbot apprenant absent |
| Docebo Learn | 52,8 | Hors budget | 1 500-5 000 USD/mois, chatbot en beta fermée |
| Moodle 4.x | 52,6 | Partiel | Ateliers rudimentaires, aucun chatbot IA natif |
| Canvas LMS | 51,9 | Complexe | IA absente cote apprenant, certification basique |
| 360Learning | 41,3 | Hors scope | Tarification inadaptée, QCM limite |
| TalentLMS | 36,4 | Inadapté | Aucun atelier, aucune IA apprenant, code ferme |

Table 2 : Résultats du Benchmark des plateformes étudiées

## 3.3 Lacunes structurelles identifiées

L'analyse croisée révèle quatre lacunes qu'aucune solution — interne ou du marché — ne couvre sans un effort de développement équivalent à une solution sur mesure :

| **Ref.** | **Lacune** | **Criticite** |
| --- | --- | --- |
| G1 | Génération de questions QCM par IA (RAG sur supports de cours) : absent de toutes les plateformes évaluées. | CRITIQUE |
| G2 | Ateliers pratiques avec workflow formateur (grille, feedback, validation) : absent ou rudimentaire sur 5/6 plateformes.[^c30] | CRITIQUE |
| G3 | Certification numérique vérifiable (QR code + SHA-256 + URL publique) : seul Open edX partiellement, a complexité prohibitive. | MAJEUR |
| G4 | Souveraineté et maitrise de l'infrastructure : l es solutions SaaS ne permettent aucun hébergement local. | SIGNIFICATIF |

Table 3 : Lacunes et leurs criticités

Conclusion : le développement d'une solution sur mesure est la seule voie viable. Elle est la seule à couvrir 100% des exigences fonctionnelles, a permettre l'intégration native d'un LLM et à offrir  la possibilité d'un hébergement institutionnel local.

# 4. Besoins Fonctionnels

Les besoins fonctionnels sont organisés en deux niveaux de priorité. Les fonctionnalités P0 sont non négociables — leur absence rend la plateforme non viable. Les fonctionnalités P1 apportent une valeur significative et sont incluses dans le périmètre du PFE.

## 4.1 Vue d'ensemble

| **Ref.** | **Fonctionnalité** | **Priorité** |
| --- | --- | --- |
| F1 | Moteur QCM anti-fraude | P0 — Critique |
| F2 | Ateliers Pratiques évalués | P0 — Critique |
| F3 | Certification Numérique Vérifiable | P0 — Critique |
| F4 | Assistant IA Génération QCM | P0 — Critique |
| F5 | Gestion Multi-Rôles (RBAC) | P0 — Critique |
| F6 | Analytics et Reporting | P1 — Majeure |
| F7 | Sécurité et Conformité | P1 — Majeure |

Table 4 : Vue d’ensemble sur les Besoins Fonctionnels

## 4.2 Description détaillée

### F1 — Moteur QCM anti-fraude

- Typologies : QCM, vrai/faux, réponse courte, association

- Randomisation des questions et des options cote serveur (non manipulable par le client)

- Minuterie configurable appliquée et contrôlée cote serveur

- Scoring automatique avec pondération par question

- Limitation configurable du nombre de tentatives

- Historique complet par apprenant : date, score, durée, détail des réponses

- Protection contre les sessions multiples simultanées sur une même évaluation.

### F2 — Ateliers Pratiques évalués

- Coté formateur : création d'un atelier (énoncé, ressources, date limite, grille de compétences pondérée)

- Cote apprenant : soumission de livrables (fichiers, texte, liens)

- Interface de correction : notation par critère, commentaires libres, score calculé automatiquement

- Feedback structure archive et consultable par l'apprenant

- Workflow de statuts : Soumis > En correction > Note > Feedback envoyé

- Notification automatique au formateur à réception d'un livrable.

### F3 — Certification Numérique Vérifiable

- Génération automatique d'un certificat PDF a la validation d'une formation

- QR code unique par certificat, redirigeant vers une URL de vérification publique

- Empreinte cryptographique SHA-256 garantissant l'intégrité du document

- Page de vérification publique : accessible sans authentification, affiche le statut du certificat

- Métadonnées : nom, intitule de la formation, date, score, formateur responsable

- Gestion du cycle de vie du certificat : émission, consultation, révocation

### F4 — Assistant IA de Génération de Questions QCM

Fonctionnalité différenciante de Cert_EET, absente de toutes les plateformes évaluées dans le benchmark. L’assistant génère des questions de QCM ancrées dans les vrais supports de cours du formateur via une architecture RAG (Retrieval-Augmented Generation).

- Upload et indexation des supports pédagogiques (PDF, PPTX, TXT) par le formateur, rattachés au module concerné

- Génération par lot : le formateur spécifie le module source, le nombre de questions, le type (QCM, QCU, Vrai/Faux), le niveau de difficulté et un focus thématique optionnel

- Suggestions ancrées sur le contenu réel du cours (RAG) — les questions et distracteurs proposés reflètent ce qui est enseigné, non des connaissances génériques

- Révision obligatoire par le formateur : chaque suggestion est acceptée, modifiée ou rejetée avant d’intégrer la banque de questions — principe « humain dans la boucle »

- Architecture abstraite (LLM swappable : GPT-4o, Claude, Mistral) sans refactorisation

- Traçabilité complète : lot de génération (formateur, module, modèle LLM, paramètres, date) et statut de chaque suggestion (PROPOSEE, ACCEPTEE, MODIFIEE, REJETEE)

### F5 — Gestion Multi-Rôles (RBAC)

| **Rôle** | **Accès** | **Actions principales** |
| --- | --- | --- |
| Administrateur | Plateforme entière | Gestion des utilisateurs, des formations, des certificats, des configurations et de tous les rapports |
| Formateur | Ses formations | Création QCM et ateliers, correction des livrables, feedback, consultation des résultats de ses apprenants |
| Apprenant | Ses formations inscrites | Participation aux évaluations, soumission des livrables, consultation des résultats |

Table 5 : Gestion Multi-Roles

### F6 — Analytics et Reporting

- Tableau de bord Administrateur : vue globale, taux de complétion par formation, statistiques agrégées

- Tableau de bord Formateur : progression de ses apprenants, scores moyens, alertes décrochage

- Tableau de bord Apprenant : historique personnel, scores, certifications obtenues

- Export des rapports en PDF et CSV

### F7 — Sécurité et Conformité

- Authentification JWT (de préférence avec refresh tokens ) 

- Authentification multi-facteurs (MFA) optionnelle

- Chiffrement TLS en transit, données sensibles chiffrées au repos

- Journaux d'audit horodates pour toutes les actions critiques

# 5. Besoins Non Fonctionnels

| **Ref.** | **Exigence** | **Critere cible** |
| --- | --- | --- |
| NF1 | Performance | Temps de réponse API <= 500 ms sous charge nominale. Chargement des pages < 3 s. |
| NF2 | Disponibilité | Disponibilité cible 99 % (hors maintenance planifiée). |
| NF3 | Sécurité | JWT, MFA, RBAC, audit logs. |
| NF4 | Souveraineté | Architecture permettant un déploiement sur infrastructure locale ou VPS tunisien si souhaite — rendu possible par le choix du dev sur mesure. |
| NF5 | Scalabilité | Architecture permettant la montée en charge. Conteneurisation Docker facilitant le scaling. |
| NF6 | Maintenabilité | Code documenté, couverture de tests unitaires et d'intégration sur les modules critiques. |
| NF7 | Ergonomie[^c59] | Interface responsive. Navigation intuitive sans formation préalable. |
| NF8 | Interopérabilité | API RESTful documentée (Open API / Swagger) pour une intégration future avec d'autres systèmes ESPRIT. |
| NF9 | Portabilité | Déploiement via Docker Compose. Environnements reproductibles (dev / recette / prod). |

Table 6 : Vue d'ensemble sur les Besoins non Fonctionnels

# 6. Architecture et Choix Techniques

## 6.1 Orientations générales

Le stack technique sera sélectionné parmi les solutions modernes les mieux adaptées aux critères de performance, de maintenabilité et de scalabilité. Les choix définitifs seront documentés en Architecture Décision Records (ADR) en début de projet. Les grandes orientations sont les suivantes :

| **Couche** | **Options envisagées** | **Critères de sélection** |
| --- | --- | --- |
| Backend / API | NestJS (Node.js) ou Spring Boot (Java) | Modularité, performance, qualité de l'écosystème, maturité |
| Frontend | Next.js (React) ou bien Angular — rendu SSR/SSG[^c66] | Expérience utilisateur, performance, SEO, composants réactifs |
| Base de données | PostgreSQL (principal) + Redis (cache/sessions) | Intégrité relationnelle, performance, maturité |
| IA / LLM | API : OpenAI GPT-4o, Anthropique Claude ou Mistral | Qualité des réponses, cout, possibilité de remplacement futur |
| Déploiement | Docker + Docker Compose (dev/prod) | Portabilité, reproductibilité, indépendance infrastructure |
| CI/CD | GitHub Actions ou GitLab CI | Automatisation des tests et du déploiement |

Table 7 : Couche et choix techniques possibles

## 6.2 Contraintes architecturales

- API-first : toutes les fonctionnalités exposées via une API REST documentée (OpenAPI 3.0)

- Séparation claire frontend / backend : évolution indépendante des deux couches

- Modularité : les modules (QCM, ateliers, certification, assistance IA) sont indépendants et évolutifs

- Sécurité by design : authentification, autorisation et journalisation intégrées dès la conception

- Tests obligatoires sur les modules critiques : QCM anti-fraude, génération de certificats, génération IA de questions

- Conteneurisation Docker : environnements de développement, recette et production reproductibles

## 6.3 Spécificités de l'intégration IA

- Communication temps réel via WebSocket ou Server-Sent Events (SSE)

- Indexation asynchrone des supports pédagogiques (Bull/Redis) : découpage en chunks, vectorisation (embeddings) et stockage dans une base vectorielle (pgvector sur PostgreSQL)

- Couche d'abstraction LLM : changement de fournisseur sans refactorisation du code métier

- Principe « humain dans la boucle » : aucune question générée n’est publiée sans validation explicite du formateur

## 6.4 Souveraineté des données

La possibilité d'héberger la plateforme sur une infrastructure locale ou un VPS tunisien est un avantage direct du choix du développement sur mesure. Cette option n'est pas une contrainte imposée mais une capacite rendue possible par l'architecture : aucune dépendance à un service cloud externe n'est requise au niveau applicatif. La décision de déploiement reste à la discrétion d'ESPRIT Entreprise.

# 7. Méthodologie de Développement

## 7.1 Approche Agile — Scrum

Le projet est conduit en Agile avec le cadre Scrum. Les sprints durent deux semaines. Cette approche itérative permet de livrer de la valeur incrémentalement et d'adapter le développement aux retours continus.

| **Cérémonie** | **Fréquence** | **Objectif** |
| --- | --- | --- |
| Sprint Planning | Début de sprint | Sélectionner et planifier les User Stories du sprint |
| Daily Standup | Quotidien (15 min) | Synchronisation, identification des blocages |
| Sprint Review | Fin de sprint | Démonstration des fonctionnalités livrées |
| Rétrospective | Fin de sprint | Amélioration continue du processus |
| Backlog Refinement | Mi-sprint | Affinage et estimation des User Stories futures |

Table 8 : Méthodologie du développement et spécificités

Définition of Done (DoD) : fonctionnalité développée, testée (unitaire + intégration), documentée, déployée en environnement de recette.

## 7.2 Livrables attendus

| **Livrable** | **Description** |
| --- | --- |
| Architecture Décision Records (ADR) | Documentation des choix techniques majeurs avec justifications |
| Diagrammes d'architecture | ERD, diagramme de composants, diagrammes de séquence des flux principaux |
| Maquettes UX | Wireframes des vues principales par rôle (Apprenant, Formateur, Administrateur) |
| Product Backlog | Epics et User Stories avec critères d'acceptation et estimation |
| Code source versionné | Dépôt Git avec pipeline CI/CD opérationnel dès le Sprint 0 |
| Modules fonctionnels | F1 a F7 développes, testes et documentes incrémentalement |
| Documentation technique | API OpenAPI, guide de déploiement Docker, README technique |
| Rapport PFE | Document de soutenance complet couvrant l'ensemble du projet |

Table 9 : Livrables attendus

# 8. Planning Prévisionnel

Le projet couvre la période du 24 avril 2026 au 24 octobre 2026, soit 6 mois. Les sprints sont de deux semaines, pour un total de 12 sprints : 

| **Sprint** | **Période** | **Objectifs** |
| --- | --- | --- |
| Sprint 0 | 24 avr. – 07 mai 2026 | Cadrage : ADR, ERD, maquettes UX, backlog initial, dépôt Git |
| Sprint 1 | 08 mai – 21 mai 2026 | Docker Compose, CI/CD de base , Backend fondations : authentification JWT/MFA, RBAC (3 rôles), structure base de données |
| Sprint 2 | 22 mai – 04 juin 2026 | Module QCM : moteur de questions, randomisation serveur, minuterie, scoring automatique |
| Sprint 3 | 05 juin – 18 juin 2026 | Module QCM : anti-fraude avance, historique des tentatives, limitation des sessions |
| Sprint 4 | 19 juin – 02 juil. 2026 | Module Ateliers : création formateur, soumission apprenant, workflow de statuts |
| Sprint 5 | 03 juil. – 16 juil. 2026 | Module Ateliers : interface de correction, grille de notation, feedback, notifications |
| Sprint 6 | 17 juil. – 30 juil. 2026 | Module Certification : génération PDF, QR code, SHA-256, URL de vérification publique |
| Sprint 7 | 31 juil. – 13 aout 2026 | Assistance IA V1 : upload et indexation RAG des supports pédagogiques, intégration API LLM, génération de suggestions par lot |
| Sprint 8 | 14 aout – 27 aout 2026 | Assistance IA V2 : interface de révision formateur (accepter/modifier/rejeter), ajout à la banque de questions, alertes décrochage |
| Sprint 9 | 28 aout – 10 sept. 2026 | Analytics : tableaux de bord par rôle, exports PDF/CSV |
| Sprint 10 | 11 sept. – 24 sept. 2026 | Tests de charge, sécurité (OWASP), corrections, optimisations performance |
| Sprint 11-12 | 25 sept. – 24 oct. 2026 | Recette finale, documentation technique complète, rapport PFE, préparation soutenance |

Table 10 : Planning Prévisionnel

Note : ce planning est indicatif. Les priorités seront ajustées à chaque Sprint Planning en fonction de l'avancement réel. Le Sprint 0 est non négociable — aucune ligne de code fonctionnel n'est écrite avant que l'architecture, le backlog et l'infrastructure de base soient en place.

# Annexe — Glossaire

| **Terme** | **Definition** |
| --- | --- |
| LMS | Learning Management System — Plateforme de gestion et diffusion des formations |
| LXP | Learning Expérience Platform — Evolution du LMS centrée sur l'expérience apprenant |
| LLM | Large Langage Model — Grand modelé de langage (ex : GPT-4o, Claude, Mistral) |
| QCM | Questionnaire à Choix Multiples |
| RBAC | Role-Based Access Control — Contrôle d'accès par rôles et permissions |
| SHA-256 | Secure Hash Algorithm 256 bits — Hachage cryptographique pour la signature de documents |
| RAG | Retrieval-Augmented Generation — LLM couplé à une base de connaissances externe. Technique utilisée pour ancrer la génération de questions sur les supports de cours |
| ADR | Architecture Décision Record — Document formalisant un choix architectural |
| CI/CD | Intégration et déploiement continus — Automatisation des tests et de la mise en production |
| MFA | Multi-Factor Authentication — Authentification a plusieurs facteurs |
| TLS | Transport Layer Security — Protocole de chiffrement des communications réseau |
| JWT | JSON Web Token — Standard d'authentification stateless |
| SSE | Server-Sent Events — Communication temps réel serveur vers client |
| DoD | Définition of Done — Critères de complétude d'une User Story |
| PFE | Projet de Fin d'Etudes |

Page 2

## Comments

[^c6] Omri IYED: Needs changing
[^c9] Omri IYED: Same as Paragraph  : needs changing /revision about the main activity of Esprit Entreprise
[^c30] Omri IYED: Incomplets ou simples / primitifs
[^c59] Omri IYED: (desktop + mobile)
[^c66] Omri IYED: SSR / SSG : Explication claire et précise SSR = Server-Side Rendering (Rendu côté serveur) Le serveur génère le HTML de la page à chaque requête de l’utilisateur. Le navigateur reçoit déjà une page HTML complète (prête à être affichée). Avantages :  Excellent SEO Chargement plus rapide pour le premier affichage (First Paint) Bon pour les contenus qui changent souvent (ex: tableaux de bord, pages dynamiques) Dans Next.js : Très facile (getServerSideProps ou App Router avec async components) Dans Angular : Possible avec Angular Universal, mais plus compliqué et moins performant. SSG = Static Site Generation (Génération statique) Le HTML est généré à l’avance (au moment du build). Le serveur envoie directement les fichiers HTML statiques. Avantages :  Très très rapide (meilleure performance) Moins de charge sur le serveur Excellent SEO Moins cher en hébergement