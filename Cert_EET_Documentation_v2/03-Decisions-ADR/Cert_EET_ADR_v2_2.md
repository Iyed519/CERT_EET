*Cert_EET — Architecture Decision Records*

**ESPRIT ENTREPRISE**

*Projet de Fin d’Études — Ingénierie Logicielle*

**ARCHITECTURE DECISION RECORDS**

*Plateforme de Certification et de Micro-Certification Digitale*

**Projet  ·  Cert_EET**

Sprints 0–1  ·  Version 2.2  ·  Mai 2026 (révisé juillet 2026)

| **Élément** | **Détail** |
| --- | --- |
| Étudiant | Iyed Omri |
| Établissement | ESPRIT — Ingénierie Logicielle |
| Commanditaire | ESPRIT Entreprise |
| Phase / Sprint | Sprint 0 — Cadrage architectural |
| Version | 2.0 — Mai 2026 |
| Statut global | **Validé — Baseline Sprint 0** |

# Table des Matières

	Table des Matières	2

	0. Introduction	5

	0.1 Qu’est-ce qu’un ADR ?	5

	0.2 Portée du document	5

	0.3 Synthèse des décisions	5

	ADR-01 — Approche de développement — Solution sur mesure	7

	Contexte	7

	Décision	7

	Justification	7

	Conséquences	7

	Alternatives écartées	8

	ADR-02 — Framework backend — NestJS	9

	Contexte	9

	Décision	9

	Justification	9

	Conséquences	9

	Alternatives écartées	10

	ADR-03 — Framework frontend — Next.js	11

	Contexte	11

	Décision	11

	Justification	11

	Conséquences	11

	Alternatives écartées	12

	ADR-04 — Base de données — PostgreSQL + Redis	13

	Contexte	13

	Décision	13

	Justification	13

	Conséquences	13

	Alternatives écartées	14

	ADR-05 — Fournisseur LLM et architecture d’abstraction IA	15

	Contexte	15

	Décision	15

	Justification	15

	Conséquences	16

	Alternatives écartées	16

	ADR-06 — Communication temps réel — SSE et WebSocket	17

	Contexte	17

	Décision	17

	Justification	17

	Conséquences	17

	Alternatives écartées	18

	ADR-07 — Déploiement et conteneurisation — Docker + Docker Compose	19

	Contexte	19

	Décision	19

	Justification	19

	Conséquences	19

	Alternatives écartées	20

	ADR-08 — Authentification et sécurité — JWT + MFA + RBAC	21

	Contexte	21

	Décision	21

	Justification	21

	Conséquences	22

	Alternatives écartées	22

	ADR-09 — Pipeline CI/CD — GitHub Actions	23

	Contexte	23

	Décision	23

	Justification	23

	Conséquences	23

	Alternatives écartées	24

	ADR-10 — Certification numérique vérifiable — SHA-256 + QR code + URL publique	25

	Contexte	25

	Décision	25

	Justification	25

	Conséquences	25

	Alternatives écartées	26

	ADR-11 — Inscription publique et onboarding formateur — modèle ouvert curaté	—

	Annexes	27

	Annexe A — Synthèse de la stack technique	27

	Annexe B — Gestion des versions des ADR	27

	Annexe C — Glossaire et abréviations	28

	Annexe D — Documents de référence	29

#  Introduction

## 1 Qu’est-ce qu’un ADR ?

Un Architecture Decision Record (ADR) est un document court qui fige par écrit une décision technique structurante. Il explique le problème posé, le choix retenu, les raisons de ce choix et ce que cela implique. Lorsqu’il est validé, il fait référence et sert de point de comparaison pour toute évolution future.

Chaque ADR de ce document suit la même trame :

- Contexte — la situation et le problème à résoudre.

- Décision — le choix retenu, formulé clairement.

- Justification — pourquoi ce choix, exprimé en points concrets.

- Conséquences — ce que cela change pour le développement et l’exploitation.

- Alternatives écartées — les options envisagées puis abandonnées, avec la raison.

## 2 Portée du document

Ce document regroupe les ADR produits durant le Sprint 0 du projet Cert_EET. Il constitue la référence de gouvernance technique du projet. Toute évolution future d’un de ces choix devra faire l’objet d’une révision formelle (voir Annexe sur la gestion des versions).

Les ADR présentés ici s’appuient directement sur trois documents validés en amont : l’Étude de l’Existant, le Benchmark Phase 1 et le Cahier des Charges v2.0.

## 3 Synthèse des décisions

| **ADR** | **Décision** | **Choix retenu** | **Statut** |
| --- | --- | --- | --- |
| ADR-01 | Approche de développement | Solution sur mesure full-stack | **Adopté** |
| ADR-02 | Framework backend | NestJS (Node.js / TypeScript) | **Adopté** |
| ADR-03 | Framework frontend | Next.js (App Router / TypeScript) | **Adopté** |
| ADR-04 | Base de données | PostgreSQL + Redis | **Adopté** |
| ADR-05 | Fournisseur LLM & architecture IA | API LLM externe + couche d’abstraction | **Adopté** |
| ADR-06 | Communication temps réel | SSE (principal) + WebSocket (complément) | **Adopté** |
| ADR-07 | Déploiement & conteneurisation | Docker + Docker Compose | **Adopté** |
| ADR-08 | Authentification & sécurité | JWT RS256 + MFA TOTP + RBAC | **Adopté** |
| ADR-09 | CI/CD | GitHub Actions | **Adopté** |
| ADR-10 | Certification numérique | SHA-256 + QR code + URL de vérification | **Adopté** |
| ADR-11 | Inscription publique & onboarding formateur | Modèle ouvert curaté · autorisation par ressource | **Adopté** |

# ADR-01 — Approche de développement — Solution sur mesure

**Statut : ****Adopté**

## Contexte

Le Benchmark Phase 1 a comparé six plateformes LMS/LXP (Moodle, TalentLMS, 360Learning, Open edX, Docebo, Canvas) sur 13 critères. Le meilleur score obtenu est de 57,5/100 (Open edX), mais sa complexité opérationnelle (déploiement Kubernetes, équipe DevOps requise) est incompatible avec un PFE solo en 6 mois.

Aucune plateforme évaluée ne couvre simultanément les quatre fonctionnalités critiques de Cert_EET : QCM anti-fraude, ateliers pratiques avec workflow formateur, certification vérifiable (SHA-256 + QR code) et assistant IA de génération de questions QCM ancré sur les supports de cours (RAG).

Trois scénarios étaient envisageables : adoption directe d’une plateforme du marché, hybridation (greffer des modules custom sur Moodle), ou développement sur mesure.

## Décision

Cert_EET sera développé comme une solution full-stack sur mesure. Aucune plateforme LMS existante n’est adoptée ni hybridée comme base technique.

## Justification

- Couverture fonctionnelle complète : c’est la seule approche qui garantit les sept besoins fonctionnels (F1 à F7) sans compromis.

- Intégration native d’un assistant IA : la génération de questions ancrée sur les supports de cours (RAG) suppose une architecture conçue pour cela dès le départ. L’implémenter sur Moodle ou Open edX dans le temps imparti n’est pas réaliste.

- Certification vérifiable : le mécanisme SHA-256 + QR code + URL publique exige un contrôle complet du cycle de vie du certificat, ce qui n’est pas accessible en SaaS.

- Souveraineté des données : un hébergement local ou sur VPS tunisien n’est possible qu’avec une architecture custom (exigence NF4 du Cahier des Charges).

- Valeur pédagogique du PFE : un projet full-stack avec CI/CD, tests et documentation démontre une maîtrise industrielle de bout en bout, ce qui correspond aux attentes d’un PFE en Ingénierie Logicielle.

## Conséquences

- La charge de développement est supérieure à celle d’une adoption directe. Elle est encadrée par le planning Sprint 0 à Sprint 12 défini dans le Cahier des Charges.

- La responsabilité de la sécurité, de la disponibilité et de la maintenance incombe entièrement au projet. Elle est couverte par les exigences NF2, NF3 et NF5.

- Le projet introduit une dépendance à une API LLM externe (voir ADR-05). Cette dépendance est mitigée par une couche d’abstraction qui rend le fournisseur  « swappable » (remplaçable).

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Adoption directe (Moodle, Open edX, autres) | Couverture estimée 40 à 55 % du Cahier des Charges. Lacunes critiques sur l’assistant IA de génération QCM et les ateliers. |
| Hybridation Moodle (plugins PHP) | Couverture estimée 70 à 80 %, mais effort de développement comparable au full-custom, dette technique liée au cycle de vie des plugins, et UX contrainte par l’interface Moodle. |

# ADR-02 — Framework backend — NestJS

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges propose deux options pour le backend : NestJS (Node.js / TypeScript) ou Spring Boot (Java). Une architecture hybride combinant les deux ont également été envisagée.

Le projet est conduit en solo sur 6 mois. Une architecture multi-framework imposerait une charge transverse importante (passerelle API, authentification inter-service, deux pipelines CI/CD) sans bénéfice fonctionnel mesurable à cette échelle.

## Décision

NestJS est retenu comme unique framework backend, avec TypeScript en mode strict et Node.js LTS comme runtime. L’architecture hybride NestJS + Spring Boot est écartée pour cette première version. Spring Boot reste documenté comme une option de migration possible si une montée en charge significative l’exigeait plus tard.

## Justification

- TypeScript de bout en bout : le backend (NestJS) et le frontend (Next.js) partagent le même langage. Les types et interfaces peuvent être partagés, ce qui réduit les erreurs d’intégration entre les deux couches.

- Temps réel intégré : NestJS dispose de modules natifs pour SSE et WebSocket, indispensables à l’assistance IA (F4) et aux notifications. Spring Boot demande une configuration plus lourde pour le même résultat.

- Architecture modulaire : les décorateurs NestJS (Module, Controller, Injectable) s’alignent naturellement sur les modules fonctionnels F1 à F7, ce qui simplifie la navigation dans le code.

- Démarrage plus rapide en solo : un développeur seul est productif en un à deux sprints sur NestJS, contre deux à trois sprints sur Spring Boot du fait du boilerplate plus dense[^c15].

- Écosystème complet : les bibliothèques pour ORM, JWT, files de tâches asynchrones, validation et transformation de données sont disponibles nativement, ce qui couvre tous les besoins du projet.

## Conséquences

- Node.js fonctionne sur un thread principal unique. Les traitements lourds (génération de PDF en masse, hachages par lot) seront déportés vers des Worker Threads ou des files de tâches asynchrones (voir ADR-04).

- TypeScript strict est activé dès le Sprint 1. Le mot-clé any implicite est interdit. Les DTO et les interfaces partagées entre backend et frontend doivent être définis explicitement.

- Spring Boot est documenté en annexe comme voie de migration possible si la charge en production dépasse les capacités de Node.js — situation non anticipée.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Spring Boot (Java) | Excellent pour les systèmes transactionnels lourds, mais boilerplate plus dense et absence de partage de types avec le frontend. |
| NestJS + Spring Boot (hybride) | Pertinent en équipe pluridisciplinaire. Coût d’intégration disproportionné pour un projet solo. |
| FastAPI (Python) | Bon framework pour des microservices IA, mais introduit un troisième langage dans la stack. |
| Express.js seul | Plus minimaliste, mais oblige à recréer les patterns que NestJS fournit (injection de dépendances, modules, guards). |

# ADR-03 — Framework frontend — Next.js

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges propose deux options pour l’interface utilisateur : Next.js (basé sur React) ou Angular. Deux exigences encadrent ce choix : NF7 demande une interface responsive et utilisable sans formation, sur ordinateur comme sur mobile ; NF1 impose un temps de chargement des pages inférieur à 3 secondes.

Deux modes de rendu sont à clarifier dans ce contexte. Le SSR (Server-Side Rendering) génère la page HTML côté serveur à chaque requête : le navigateur reçoit immédiatement une page lisible. Le SSG (Static Site Generation) prépare les pages à l’avance, lors du déploiement, et les sert comme des fichiers statiques : c’est extrêmement rapide.

Ces deux modes sont pertinents pour Cert_EET. Le SSR convient aux pages qui dépendent de l’utilisateur (tableaux de bord apprenant et formateur). Le SSG convient à la page publique de vérification des certificats, qui est stable et très consultée.

## Décision

Next.js avec TypeScript et Tailwind CSS est retenu comme framework frontend de Cert_EET. Angular est écarté.

## Justification

- SSR natif : Next.js intègre le rendu côté serveur sans configuration spécifique. Il répond directement à l’exigence NF1.

- Assistance IA temps réel (F4) : Next.js s’intègre simplement avec les flux SSE envoyés par le backend NestJS. Cela permet d’afficher l’avancement d’une génération IA ou une notification en temps réel, sans complexité côté client.

- Cohérence avec le backend : Next.js et NestJS partagent TypeScript. Les types et contrats d’API peuvent être réutilisés entre les deux couches, ce qui limite les erreurs.

- Responsive (NF7) : Tailwind CSS permet de construire des interfaces adaptées à tous les écrans sans maintenir une feuille de style complexe.

- Écosystème de composants : React met à disposition des bibliothèques de composants matures et accessibles (par exemple shadcn/ui ou Radix UI), bien adaptées aux tableaux de bord multi-rôles de Cert_EET.

## Conséquences

- Next.js distingue les composants serveur et les composants client. Cette distinction doit être comprise dès les premières pages pour éviter des erreurs de fonctionnement (par exemple appeler une API navigateur depuis un composant serveur).

- Pour gérer les données qui évoluent en temps réel (statut de génération IA, notifications), une bibliothèque légère sera utilisée, comme Zustand ou TanStack Query. Redux n’est pas retenu : trop lourd pour ce projet.

- La page publique de vérification des certificats (F3) sera générée en mode statique avec revalidation, pour rester rapide tout en restant à jour si un certificat est révoqué.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Angular | Très solide en environnement entreprise, mais SSR moins mature qu’avec Next.js, et courbe d’apprentissage plus longue pour un projet solo. |
| Vue.js / Nuxt.js | Bon framework, mais moins de synergie avec NestJS (côté types) et écosystème de composants pour tableaux de bord moins riche que React. |

# ADR-04 — Base de données — PostgreSQL + Redis

**Statut : ****Adopté**

## Contexte

Cert_EET manipule des données fortement relationnelles : utilisateurs, rôles, formations, QCM, tentatives, ateliers, livrables, certificats. L’intégrité référentielle et la traçabilité des transactions sont des exigences directes pour une plateforme de certification.

Deux besoins de performance coexistent : une persistance durable et cohérente pour les données métier (apprenants, scores, certificats), et un cache rapide pour les sessions, le rate-limiting et les files de tâches asynchrones.

## Décision

PostgreSQL est retenu comme base de données principale. Redis est retenu comme couche de cache, gestionnaire de sessions et support des files de tâches. L’ORM TypeORM, intégré nativement à NestJS, sera utilisé pour l’accès aux données.

## Justification

- PostgreSQL est une base relationnelle mature qui respecte les propriétés ACID (transactions fiables). Elle prend en charge le type JSON, ce qui est utile pour stocker des grilles de compétences flexibles, et propose une extension de hachage cryptographique (pgcrypto) directement exploitable côté base.

- Redis sert plusieurs usages dans Cert_EET : invalider les tokens JWT à la déconnexion (liste noire), limiter le nombre de tentatives QCM par minute, mettre en cache les résultats de recherche vectorielle RAG et faire tourner une file de tâches pour la génération asynchrone des certificats PDF et l’indexation des supports pédagogiques.

- TypeORM utilise des décorateurs TypeScript cohérents avec NestJS et gère des migrations versionnées. Les transactions sont prises en charge, ce qui est important pour les flux sensibles (soumission de QCM, émission de certificat).

- Souveraineté : PostgreSQL et Redis peuvent être auto-hébergés sur infrastructure locale (exigence NF4).

- Scalabilité : PostgreSQL supporte la réplication en lecture et Redis le clustering. Le chemin de croissance post-PFE est donc documenté, même s’il n’est pas activé dans la première version.

## Conséquences

- Les migrations de schéma seront versionnées avec TypeORM. L’option synchronize: true (synchronisation automatique du schéma au démarrage) ne sera jamais utilisée en production.

- Redis sera configuré avec une persistance fichier (AOF = Append_Only File ) pour éviter la perte des sessions et des tâches en cas de redémarrage.

- Les sauvegardes PostgreSQL seront automatisées dans le pipeline CI/CD lors du sprint dédié à la production.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| MongoDB | Base documentaire mal adaptée aux relations fortes entre apprenants, formations et certificats. Intégrité référentielle native absente. |
| MySQL / MariaDB | Alternative valide. PostgreSQL est privilégié pour la richesse fonctionnelle (JSONB, pgcrypto, recherche textuelle) et la maturité de son écosystème côté Node.js. |
| SQLite | Adapté aux applications monoposte, non viable pour un service web multi-utilisateurs. |

# ADR-05 — Fournisseur LLM et architecture d’abstraction IA

**Statut : ****Adopté**

## Contexte

L’assistant IA de génération de questions QCM (F4) est la fonctionnalité différenciante de Cert_EET. Le Benchmark Phase 1 a montré qu’aucune plateforme évaluée ne propose une génération de questions ancrée sur les supports de cours via RAG (lacune G1, criticité critique).

Le Cahier des Charges impose explicitement une architecture LLM swappable : il doit être possible de changer de fournisseur sans refactoriser le code métier.

Trois familles de fournisseurs ont été regardées : OpenAI (GPT-4o), Anthropic (Claude) et Mistral (API cloud ou local). Le choix doit concilier qualité des réponses, latence, coût par token et fiabilité de l’API dans le contexte d’un PFE.

## Décision

Une API LLM cloud externe est retenue comme fournisseur initial pour la génération de questions, avec OpenAI GPT-4o comme premier candidat à valider lors du Sprint 7. Le choix sera confirmé après une comparaison rapide sur des prompts de test représentatifs (qualité des questions générées, latence, coût observé).

Une couche d’abstraction LLMProvider, sous forme d’interface TypeScript et de factory, rendra le fournisseur entièrement swappable. L’architecture implémente le RAG (Retrieval-Augmented Generation) dès la première version : les supports pédagogiques sont indexés dans pgvector et injectés dans le prompt lors de chaque génération.

## Justification

- API LLM cloud : un service hébergé permet d’accéder à des modèles de qualité élevée sans coût d’infrastructure GPU, ce qui est compatible avec le périmètre PFE.

- Couche d’abstraction : une interface commune (par exemple complète (prompt, context)) est implémentée par chaque fournisseur (OpenAIProvider, ClaudeProvider, MistralProvider). Le changement de fournisseur se fait par configuration, sans toucher au code métier.

- Ancrage RAG sur les supports de cours : les documents pédagogiques indexés (PDF, PPTX) sont découpés en chunks, vectorisés via embeddings et stockés dans pgvector (extension PostgreSQL). À chaque génération, les passages les plus pertinents sont récupérés et injectés dans le prompt. C’est ce qui garantit que les questions générées reflètent le vrai contenu enseigné et non des connaissances génériques.

- Notifications asynchrones via SSE : la fin d’une génération IA est signalée au formateur par SSE. La génération elle-même s’exécute en tâche de fond (Bull/Redis) pour ne pas bloquer le thread principal (voir ADR-04 et ADR-06).

- Humain dans la boucle : aucune question générée n’est publiée automatiquement. Le formateur valide chaque suggestion via l’interface de révision (accepter / modifier / rejeter). Ce principe garantit la qualité pédagogique et la responsabilité humaine sur les contenus d’évaluation certifiante.

## Conséquences

- Le coût d’API est maîtrisé par deux mécanismes : un rate-limiter par formateur (nombre maximum de générations par heure) et un cache Redis pour les résultats de recherche vectorielle fréquents.

- Confidentialité : les données envoyées à l’API LLM externe sont anonymisées. Aucune information directement identifiante (nom complet, identifiant national) n’est transmise. Les apprenants sont référencés par un identifiant UUID interne dans les prompts.

- Indisponibilité : en cas de panne de l’API LLM, la génération IA affiche un message dégradé invitant à réessayer plus tard. Les questions déjà validées dans la banque ne sont pas affectées. Aucun modèle local de secours n’est prévu pour la première version.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Anthropic Claude | Qualité comparable à GPT-4o. Reste documenté comme option de swap immédiat via ClaudeProvider si la comparaison initiale montre un avantage net. |
| Mistral (API cloud) | Bon rapport qualité/coût, à reconsidérer si une exigence de souveraineté forte se confirme. |
| Ollama (LLM local) | Souveraineté totale, mais nécessite une infrastructure GPU dédiée, hors périmètre PFE. Évolution possible à long terme. |
| LangChain.js | Framework d’orchestration LLM. Introduit une abstraction supplémentaire et une dette de mise à jour. La couche LLMProvider custom suffit pour la première version. |

# ADR-06 — Communication temps réel — SSE et WebSocket

**Statut : ****Adopté**

## Contexte

Deux fonctionnalités de Cert_EET demandent une communication temps réel : l’assistance IA (F4), qui doit notifier le formateur de la fin d’une génération de questions, et les notifications côté formateur (réception de livrable, alerte de décrochage).

Les flux concernés sont essentiellement unidirectionnels : le serveur pousse des informations vers le client. Le Cahier des Charges mentionne explicitement SSE et WebSocket comme options possibles.

## Décision

SSE (Server-Sent Events) est retenu comme mécanisme principal pour les notifications push (fin de génération IA, alertes de décrochage, nouveaux feedbacks).

WebSocket est retenu comme complément, pour les interactions bidirectionnelles qui pourraient apparaître plus tard (par exemple un tableau de bord formateur collaboratif).

## Justification

- SSE pour les notifications IA : la notification de fin de génération va dans un seul sens, du serveur vers le client. SSE est plus simple à mettre en place que WebSocket : il fonctionne en HTTP standard, gère la reconnexion automatique et est supporté nativement par tous les navigateurs modernes via l’objet EventSource.

- SSE et NestJS : NestJS expose un décorateur SSE natif. L’implémentation est concise et n’ajoute pas de dépendance externe.

- WebSocket en complément : NestJS propose également un module WebSocket. Il sera activé seulement lorsque le besoin bidirectionnel apparaît, pour éviter de complexifier inutilement la première version.

- Compatibilité infrastructure : SSE passe sans configuration spéciale derrière un reverse proxy classique. WebSocket nécessite quelques réglages supplémentaires côté proxy, qui seront documentés au moment de l’activation.

## Conséquences

- Le client ne peut pas envoyer de données vers le serveur via SSE. Les paramètres de génération IA saisis par le formateur transitent par une requête POST REST classique. Seule la notification de fin de génération est streamée via SSE.

- Les connexions SSE sont persistantes. Le timeout du reverse proxy doit être réglé en conséquence pour éviter une déconnexion prématurée pendant la génération d’une réponse longue.

- L’activation de WebSocket est planifiée plus tard, à l’apparition d’un besoin bidirectionnel concret.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| WebSocket pur comme mécanisme principal | Surdimensionné pour un flux unidirectionnel. Ajoute du poids côté client (par exemple Socket.io). |
| Long polling | Technologie ancienne, charge serveur élevée, latence dégradée. |
| GraphQL Subscriptions | Pertinent si GraphQL est adopté globalement. Surcharge architecturale dans un projet REST-first. |

# ADR-07 — Déploiement et conteneurisation — Docker + Docker Compose

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges impose un déploiement via Docker Compose avec des environnements reproductibles (développement, recette, production). Il demande également la possibilité d’un hébergement local ou sur VPS tunisien.

Dans un PFE solo, la gestion d’une infrastructure Kubernetes est incompatible avec le calendrier. La complexité opérationnelle d’Open edX, écartée en Phase 1 pour cette même raison, illustre ce constat.

## Décision

Docker et Docker Compose sont retenus comme socle de conteneurisation et de déploiement. Trois environnements distincts seront définis : développement local, recette (staging) et production. Kubernetes est explicitement écarté pour la première version et documenté comme évolution ultérieure.

## Justification

- Couverture des exigences : Docker Compose répond aux besoins NF4 (souveraineté), NF5 (scalabilité raisonnée) et NF9 (portabilité) sans la complexité opérationnelle de Kubernetes.

- Reproductibilité : une seule commande, docker compose up, démarre l’environnement complet (backend, frontend, PostgreSQL, Redis, reverse proxy). L’onboarding d’un nouveau contributeur est immédiat.

- Composition des services : un fichier compose principal décrit les services. Des fichiers d’override permettent d’adapter la configuration par environnement (variables, ports, volumes) sans dupliquer la configuration.

- Compatibilité VPS : Docker et Docker Compose sont supportés par tous les hébergeurs accessibles (locaux comme internationaux). L’exigence NF4 est couverte.

- Intégration CI/CD : le pipeline (voir ADR-09) construira les images Docker et les poussera vers un registre, puis déclenchera le déploiement sur l’environnement de recette.

## Conséquences

- Les secrets (clés JWT, clés d’API LLM, mots de passe) ne seront jamais committés dans le dépôt. Ils seront injectés au démarrage via des variables d’environnement ou des secrets Docker.

- Les volumes de PostgreSQL et de Redis seront persistés sur le système hôte pour conserver les données entre redémarrages.

- Chaque service exposera un health check, ce qui permet à Docker Compose de démarrer les services dans l’ordre attendu (base de données prête avant le backend, backend prêt avant le frontend).

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Kubernetes | Indispensable pour une production à grande échelle. Complexité opérationnelle disproportionnée pour ce niveau. |
| Déploiement sans conteneurs (bare-metal) | Non reproductible, non conforme à l’exigence NF9. |
| PaaS cloud (par exemple Heroku, Render, Railway) | Perd la souveraineté des données (NF4). Envisageable uniquement pour une démo si le commanditaire le demande. |

# ADR-08 — Authentification et sécurité — JWT + MFA + RBAC

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges (F7 et NF3) impose plusieurs exigences combinées : authentification basée sur JWT avec refresh tokens, authentification multi-facteurs (MFA) optionnelle, contrôle d’accès par rôle (Admin, Formateur, Apprenant), chiffrement TLS et journaux d’audit horodatés.

Le moteur QCM anti-fraude (F1) ajoute une contrainte : empêcher les sessions multiples simultanées sur la même évaluation. Cela demande une gestion centralisée et révocable des sessions.

## Décision

JWT asymétrique (algorithme RS256) avec rotation des refresh tokens est retenu pour l’authentification. MFA via TOTP (compatible Google Authenticator et applications équivalentes) est implémenté comme option activable. Le RBAC est géré par des guards NestJS et un décorateur de rôles. Redis stocke la liste des tokens révoqués pour permettre une déconnexion immédiate. (pour plus d’information le fichier markdown : « Cert eet note authentification sécurité.md »

## Justification

- JWT RS256 : la signature utilise une clé privée et la vérification utilise une clé publique. La clé publique peut être partagée avec des services tiers sans exposer la clé privée. C’est plus flexible que l’algorithme HS256 (clé symétrique partagée).

- Refresh tokens à rotation : l’access token est de courte durée et le refresh token est de durée plus longue mais à usage unique. Chaque utilisation d’un refresh token le remplace, ce qui détecte et limite l’impact d’un vol éventuel.

- Liste noire Redis : à la déconnexion ou en cas d’anomalie (sessions multiples sur un QCM), le token est placé sur liste noire. La vérification est très rapide.

- RBAC déclaratif : les guards NestJS combinés au décorateur Roles permettent d’écrire le contrôle d’accès au plus près du code métier, de manière lisible et testable.

- MFA TOTP : la mise en œuvre repose sur une bibliothèque standard du monde Node.js, compatible avec toutes les applications d’authentification populaires. La MFA reste optionnelle et activable par l’administrateur.

- Journaux d’audit : un intercepteur global NestJS enregistre les actions critiques (soumission de QCM, émission de certificat, révocation) avec horodatage, identifiant utilisateur et adresse IP. Cela couvre l’exigence NF3.

## Conséquences

- La rotation des refresh tokens nécessite un Redis persistant. La persistance AOF est activée pour ne pas perdre les sessions en cas de redémarrage.

- Les journaux d’audit sont stockés dans une table PostgreSQL dédiée, non modifiable par les utilisateurs finaux.

- Le TLS est terminé au niveau du reverse proxy. Les services internes communiquent entre eux dans le réseau Docker privé, sans surcoût de chiffrement inter-services.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Sessions serveur classiques | État serveur difficile à scaler, incompatible avec l’architecture API-first. |
| OAuth2 / OIDC via Keycloak | Pertinent dans un écosystème multi-applications. Surcharge de configuration pour un PFE. Reste documenté comme évolution possible si un SSO Esprit est demandé. |
| JWT HS256 (symétrique) | Clé partagée entre tous les services. Moins flexible et moins adapté à un environnement multi-composants. |

## Révision ADR-08-R1 — bilan d’implémentation (Sprint 1, juillet 2026)

Conformément à la règle de gestion des versions (Annexe B), cette révision ne modifie pas la décision : elle en consigne l’implémentation et les précisions actées pendant le Sprint 1 (US-AUTH-01, US-AUTH-03, US-AUTH-04, US-AUTH-11).

- **Rotation des refresh tokens + détection de rejeu, effectives.** Chaque refresh token est à usage unique : son utilisation émet une nouvelle paire et brûle l’ancien (marqué consommé en base + denylist Redis, TTL = durée de vie restante). Le rejeu d’un token déjà consommé révoque **toute la famille** de tokens issue de la même connexion (colonne `famille_id` ajoutée à `refresh_tokens`). La première rédaction d’US-AUTH-03 (« sans renouveler le refresh token ») contredisait cet ADR : c’est la story qui a été réécrite, pas l’ADR.
- **Identifiant unique `jti` dans chaque jeton émis.** Rend chaque jeton distinct (même émis dans la même seconde) et permet la révocation ciblée d’un access token précis : clé Redis `denylist:access:<jti>`, alimentée à la déconnexion (US-AUTH-04) et consultée à chaque requête par le guard (US-AUTH-11).
- **Guards écrits à la main plutôt que passport-jwt.** L’ADR impose des guards NestJS et un décorateur de rôles, pas une bibliothèque précise. Les guards réutilisent la vérification RS256 et les contrôles Redis existants, sans dépendance supplémentaire ; passport-jwt (piste de mitigation citée au plan de sprint) n’apportait ici que des couches en plus.
- **Sécurité par défaut.** `JwtAuthGuard` puis `RolesGuard` sont enregistrés en guards **globaux** ; les routes ouvertes (login, refresh, logout, health) sont explicitement marquées `@Public`.
- **Invalidation immédiate des sessions d’un utilisateur.** Marqueur Redis `sessions-valid-after:<userId>` : tout access token émis avant ce marqueur est refusé par le guard. C’est le mécanisme qu’appellera le changement de rôle (US-ROL-01) et toute révocation de masse.
- **Conséquence d’exploitation.** Redis devient porteur (denylists, marqueurs d’invalidation, futurs tokens de vérification) : la persistance AOF est confirmée et `REDIS_HOST`/`REDIS_PORT` passent en variables obligatoires au démarrage (fail-fast).

## Révision ADR-08-R2 — OAuth2 via Passport, acquisition d’identité uniquement (v2, juillet 2026)

Consigne l’implémentation de la connexion sociale (US-AUTH-14) sans modifier la décision ADR-08.

- **Passport pour la seule poignée de main OAuth.** `@nestjs/passport` + `passport-google-oauth20` /
  `passport-github2` gèrent la redirection, l’échange du code et la récupération du profil. La stratégie
  s’arrête à `validate()`, qui renvoie un profil normalisé (`provider`, `providerId`, `email`, `nom`,
  `prenom`). **Aucune** délégation de session à Passport : pas de `passport-jwt`, pas de session Passport.
- **Émission de session inchangée.** Une fois l’identité validée, on repasse sur le dispositif maison
  d’ADR-08 (JWT RS256, rotation, denylist, `sessions-valid-after`).
- **Modèle de liaison.** Table `comptes_oauth` (unicité `provider` + `provider_id`) séparée de `users`,
  pour le multi-fournisseur et la **liaison de compte** par email (ADR-11). `mot_de_passe_hash` devient
  **nullable** ; la sécurité tient car `login()` compare toujours contre un hash factice quand il est nul.
- **Relais de session sûr.** Le callback pose le refresh token en cookie **httpOnly** puis redirige vers
  le frontend, qui l’échange via `/auth/refresh` — l’access token ne transite jamais par l’URL.

# ADR-09 — Pipeline CI/CD — GitHub Actions

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges impose la mise en place d’un pipeline CI/CD opérationnel dès le Sprint 0. La Definition of Done inclut la livraison testée, documentée et déployée en environnement de recette.

Le Cahier des Charges mentionne GitHub Actions et GitLab CI comme options possibles.

## Décision

GitHub Actions est retenu comme plateforme CI/CD. Le dépôt Git est hébergé sur GitHub. Deux workflows principaux sont définis : un workflow d’intégration continue (lint, tests unitaires, tests d’intégration) déclenché sur chaque pull request, et un workflow de déploiement (build Docker, push vers registre, déploiement en recette) déclenché lors d’une fusion dans la branche principale.

## Justification

- Intégration native : les workflows GitHub Actions vivent dans le dépôt (.github/workflows/) et sont versionnés avec le code. Aucune infrastructure CI séparée à maintenir.

- Marketplace : des actions officielles existent pour Node.js, Docker, PostgreSQL, et la remontée de couverture de tests. Le pipeline initial est opérationnel rapidement.

- Environnements GitHub : les environnements (par exemple staging et production) permettent de définir des secrets distincts, des règles de protection de branche et une approbation manuelle pour la mise en production.

- Matrice de tests : il est possible de tester sur plusieurs versions de Node.js en parallèle sans configuration supplémentaire.

- Coût compatible avec le périmètre PFE : GitHub Actions est disponible avec un quota suffisant pour ce projet sur les plans accessibles aux étudiants.

## Conséquences

- Le workflow d’intégration enchaîne lint (ESLint et Prettier), tests unitaires et tests d’intégration (Jest et Supertest). Une cible de couverture sera définie pour les modules critiques (QCM, certification, authentification).

- Le workflow de déploiement construit les images Docker du backend et du frontend, les pousse sur un registre, puis déclenche le déploiement sur l’environnement de recette via une connexion sécurisée.

- Les secrets (mots de passe de base, clés d’API LLM, clé privée JWT) sont stockés dans GitHub Secrets et injectés au runtime. Aucun secret n’apparaît en clair dans les workflows.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| GitLab CI | Alternative valide. Nécessite un compte GitLab distinct ou une instance auto-hébergée. Moins d’intégration native avec la marketplace d’actions utilisées par le projet. |
| Jenkins | Configuration complexe et serveur dédié requis. Disproportionné pour un projet solo. |
| CircleCI | Bon produit, mais demande une intégration webhook supplémentaire ou la migration du dépôt. |

# ADR-10 — Certification numérique vérifiable — SHA-256 + QR code + URL publique

**Statut : ****Adopté**

## Contexte

Le Cahier des Charges (F3) impose une certification numérique vérifiable. Quatre éléments sont attendus : génération automatique d’un certificat PDF à la validation d’une formation, QR code unique par certificat redirigeant vers une URL de vérification publique, empreinte cryptographique SHA-256 garantissant l’intégrité du document, et page de vérification accessible sans authentification.

Le Benchmark Phase 1 a montré que seul Open edX implémente un mécanisme de vérification externe (Open Badges 2.0), mais à une complexité opérationnelle rédhibitoire. La lacune G3 est classée majeure.

## Décision

Les certificats PDF sont générés via la bibliothèque PDFKit (Node.js). Une empreinte SHA-256 est calculée sur le contenu du certificat et stockée en base avec ses métadonnées. Un QR code est généré et encode l’URL de la page de vérification publique. Cette page est servie par Next.js en mode statique avec revalidation, accessible sans authentification.

## Justification

- PDFKit : bibliothèque Node.js native et légère. Le certificat est généré en mémoire, sans fichier temporaire.

- SHA-256 via le module crypto natif de Node.js : aucune dépendance supplémentaire. L’empreinte est calculée sur le contenu binaire du PDF et conservée en base avec la date d’émission.

- QR code : génère un code QR encodant l’URL de la page de vérification publique. L’identifiant inclus dans l’URL est un UUID non prédictible, qui ne peut pas être deviné.

- Page de vérification publique : route Next.js en mode statique avec revalidation. Elle affiche l’état du certificat (valide, révoqué, introuvable), le nom de l’apprenant, l’intitulé de la formation, la date et le formateur, sans exposer de données personnelles supplémentaires.

- Cycle de vie : émission, vérification, révocation. La révocation est immédiate côté base et invalide la page de vérification correspondante via la revalidation.

- Génération asynchrone : pour ne pas bloquer la requête HTTP, la génération PDF est confiée à une file de tâches Bull (Redis). Le certificat est disponible peu après la validation, sans impact perçu par l’utilisateur.

## Conséquences

- Les certificats PDF générés sont stockés dans un volume persistant côté serveur (ou un stockage objet compatible S3 en production).

- Une révocation ne supprime pas le PDF : elle met à jour le statut en base et invalide la page de vérification. Le PDF reste consultable, mais la page publique affiche son statut révoqué.

- Les métadonnées clés du certificat (nom, formation, score, formateur, date, empreinte SHA-256) sont également encodées dans les métadonnées XMP du PDF, ce qui permet une inspection hors-ligne.

## Alternatives écartées

| **Alternative** | **Raison de l’exclusion** |
| --- | --- |
| Open Badges 2.0 (IMS Global) | Standard interopérable, mais implémentation complexe disproportionnée pour la première version. Documenté comme évolution possible (V2). |
| Génération PDF via navigateur (Puppeteer / Chromium) | Rendu HTML vers PDF de très bonne qualité, mais consommation mémoire élevée par instance. PDFKit reste préféré pour la première version. |
| Certification sur blockchain | Techniquement intéressant. Hors périmètre PFE et sans valeur ajoutée pratique dans le contexte institutionnel ciblé. |

# ADR-11 — Inscription publique et onboarding formateur — modèle ouvert curaté

**Statut : ****Adopté** *(décision produit — Sprint 1, juillet 2026)*

## Contexte

Le modèle initial supposait des comptes créés uniquement par un administrateur (enrôlement institutionnel, DS-15). En cours de Sprint 1, le positionnement produit a été précisé : Cert_EET vise une plateforme d’apprentissage **ouverte**, où toute personne peut créer un compte et suivre des formations — à la manière de Coursera ou edX — tout en préservant ce qui fait la valeur du produit : des certificats vérifiables et crédibles. Or un certificat n’a de valeur que si les formateurs et les contenus sont contrôlés. Deux approches existent sur le marché : la place de marché ouverte (Udemy — n’importe qui publie, seule l’identité est vérifiée) qui maximise le volume au détriment de l’homogénéité, et le modèle curaté (Coursera, edX — les enseignants passent par des partenaires accrédités) qui garantit la crédibilité. Cert_EET retient le modèle **curaté**, mais en self-service.

## Décision

1. **Inscription publique en self-service.** Toute personne peut créer un compte APPRENANT : par email + mot de passe avec vérification d’email (US-CPT-05), ou via un fournisseur OAuth2 — Google, Facebook, GitHub (US-AUTH-14, avec liaison de compte si l’email existe déjà). Le rôle est **forcé côté serveur** : aucune élévation possible à l’inscription. La création de comptes par l’administrateur (US-CPT-01) est conservée pour les comptes internes (formateurs recrutés, administrateurs).

2. **Rôle FORMATEUR = éligibilité globale, accordée sur dossier.** Un utilisateur devient formateur via une **demande** (formulaire de compétences : diplômes, certifications — pièces jointes en texte et liens dans un premier temps, fichiers quand le stockage objet sera branché) approuvée par un administrateur, ou par promotion directe d’un administrateur. **Seul un administrateur peut promouvoir un compte ADMINISTRATEUR.**

3. **Droits d’enseignement par cours (autorisation par ressource).** Être formateur n’ouvre aucun droit global sur les contenus : un formateur n’agit que sur les cours qu’il a créés ou qu’il a été autorisé à rejoindre. Une table d’affectation cours ↔ formateur (avec la notion de **créateur** du cours) porte ces droits ; un administrateur peut affecter plusieurs formateurs à un même cours.

4. **Domaine « Demande » (workflows d’approbation).** Quatre types de demandes, gérés par une machine à états : devenir formateur (demandeur → admin) ; créer un cours (formateur → admin ; le demandeur devient créateur) ; inviter un co-formateur (créateur → admin) ; postuler comme formateur sur un cours existant (demandeur → créateur du cours → admin).

## Justification

- Le modèle curaté est aligné sur le cœur du produit : la crédibilité des certificats repose sur le contrôle de qui enseigne quoi.

- L’éligibilité globale (rôle FORMATEUR) combinée à l’affectation par cours est le seul découpage cohérent avec l’ensemble des règles métier retenues : une demande « devenir formateur » indépendante des cours, une promotion directe par l’admin, et des droits limités aux cours du formateur.

- L’autorisation par ressource complète le RBAC global (ADR-08) sans le remplacer : le RBAC répond à « quel type d’utilisateur êtes-vous ? », la couche ressource à « êtes-vous formateur de CE cours ? ».

## Conséquences

- Nouvelles entités à concevoir : `Demande` (type, statut, chaîne d’approbation, contenu du formulaire) et l’affectation cours ↔ formateur (avec créateur) ; extension du cycle de vie des comptes.

- Une couche d’autorisation par ressource (guard/policy au niveau du cours) s’ajoutera au RBAC global — elle dépend de l’épopée Cours/Formations et sera spécifiée avec elle.

- Les fournisseurs OAuth introduisent des secrets supplémentaires (client id/secret, URLs de callback), gérés comme les autres secrets (ADR-07 / US-INFRA-07).

- Documents à mettre à jour en conséquence : diagrammes de cas d’utilisation (le visiteur peut créer un compte), DS-15, diagramme de classes (Demande, affectation), Cahier des Charges (modèle ouvert curaté). Mise à jour planifiée après la livraison du bloc inscription/connexion.

## Alternatives écartées

- **Place de marché ouverte (type Udemy)** : maximise le nombre de formateurs mais fragilise la promesse de certification vérifiable.

- **Modèle fermé initial (comptes créés uniquement par l’admin)** : freine l’adoption côté apprenants sans bénéfice de crédibilité (les apprenants ne publient pas de contenu) ; conservé uniquement pour les comptes internes.

- **Rôle formateur purement par cours (sans éligibilité globale)** : rendrait impossibles la demande « devenir formateur » indépendante d’un cours et la promotion directe par l’admin ; incohérent avec les règles métier retenues.


# ADR-12 — Profil apprenant & référentiel des établissements

**Statut : Adopté** (v2, juillet 2026)

**Contexte.** L’auto-inscription (US-CPT-05) ne collecte que nom, prénom, email, mot de passe. Pour
personnaliser la plateforme et préparer une future recommandation de cours, il faut des données de profil
structurées et exploitables (pas du texte libre).

**Décision.** Ajouter un profil apprenant complété à la première connexion (US-AUTH-15), adossé à un
**référentiel normalisé** plutôt qu’à des champs libres :

- Référentiels : `domaines_etudes` (16), `universites` (71 : public + privé), `etablissements` (263, FK
  université), `etablissement_domaine` (M:N, prêt pour un filtre domaine→établissement en v2).
- Profil sur `users` : `date_naissance` (âge **dérivé**, jamais stocké — minimisation RGPD),
  `niveau_etudes` (enum), FK `domaine_etudes_id` / `etablissement_id` (SET NULL), `etablissement_autre`
  (échappatoire texte libre), `profil_complet` (booléen).
- Collecte via une carte **bloquante** à la première connexion, apprenants uniquement ; endpoint
  `PATCH /auth/profile` (âge ≥ 13, audit `PROFIL_COMPLETE`).

**Justification.** Des IDs stables et des jointures propres rendent les données réutilisables par un modèle
ML ultérieur ; l’enum de niveau et le référentiel évitent le bruit du texte libre. La donnée officielle
(source data.gov.tn) alimentera le mapping domaine↔établissement en v2 sans changer le schéma.

**Conséquences.** Nouveau module `referentiel` (lecture seule) ; seed des référentiels par migration
(reproduit en CI). Édition ultérieure du profil = US-AUTH-07.

# ADR-13 — Retrait de la création de comptes par l’administrateur

**Statut : Adopté** (v2, juillet 2026)

**Contexte.** Le modèle initial prévoyait la création de comptes par l’admin (US-CPT-01) puis une
activation par email avec définition du mot de passe (US-AUTH-05). L’ouverture de l’inscription publique
(ADR-11 : self-service + OAuth) rend ce parcours redondant pour les comptes d’apprenants.

**Décision.** **Retirer US-CPT-01 et US-AUTH-05.** Tout compte provient désormais de l’auto-inscription
(US-CPT-05 — mot de passe défini à l’inscription, email vérifié) ou d’OAuth (US-AUTH-14 — compte ACTIF, sans
mot de passe local). La montée en rôle (formateur/admin) passe par la gestion des rôles (US-ROL-01 nomination
par l’admin, US-ROL-02 demande/approbation), pas par une création de compte pré-typée.

**Justification.** Éviter deux parcours de création concurrents et un flux d’activation « définir le mot de
passe » sans objet ; réduire la surface d’attaque et la complexité.

**Conséquences.** À mettre à jour en polissage : Backlog (fait — stories marquées RETIRÉES), Sprint-1
Backlog/Plan (fait), DS-15 (gestion des comptes), cas d’utilisation Admin. Si un besoin d’enrôlement interne
en masse réapparaît, il fera l’objet d’une nouvelle story (import CSV, US-CPT-02) et non d’un retour à
US-CPT-01.

# Annexes

## Annexe A — Synthèse de la stack technique

Le tableau ci-dessous résume les choix techniques validés par les ADR-01 à ADR-11. Il sert de référence pour tous les sprints du projet. Les versions précises seront figées dans le fichier package.json au démarrage du Sprint 1, en privilégiant systématiquement les versions LTS et stables au moment de la première installation.

| **Couche** | **Technologie retenue** | **ADR de référence** |
| --- | --- | --- |
| Approche | Solution sur mesure full-stack | ADR-01 |
| Backend / API | NestJS · Node.js LTS · TypeScript strict | ADR-02 |
| Frontend | Next.js · App Router · TypeScript | ADR-03 |
| Styling | Tailwind CSS · bibliothèques de composants React | ADR-03 |
| Base de données | PostgreSQL · TypeORM | ADR-04 |
| Cache et sessions | Redis · Bull (files de tâches asynchrones) | ADR-04 |
| LLM / IA | API LLM cloud · couche d’abstraction LLMProvider | ADR-05 |
| Temps réel | SSE (notifications IA et alertes) · WebSocket (complément bidirectionnel) | ADR-06 |
| Conteneurisation | Docker · Docker Compose · reverse proxy | ADR-07 |
| Authentification et sécurité | JWT RS256 · MFA TOTP · RBAC via NestJS Guards | ADR-08 |
| Inscription & connexion sociale | Inscription publique en self-service · OAuth2 (Google, Facebook, GitHub) | ADR-11 |
| CI/CD | GitHub Actions · registre d’images Docker | ADR-09 |
| Certification PDF | PDFKit · qrcode · SHA-256 (crypto natif) | ADR-10 |
| Gestion d’état frontend | Zustand · TanStack Query | ADR-03 |
| Tests | Jest · Supertest · tests end-to-end (à confirmer en Sprint 1) | ADR-09 |
| Documentation API | OpenAPI 3.0 · Swagger UI (via NestJS) | ADR-02 |

## Annexe B — Gestion des versions des ADR

Les ADR validés en Sprint 0 constituent la baseline du projet. Toute modification ultérieure d’un choix architectural doit respecter la règle suivante :

- Un ADR validé est immuable. Une modification donne naissance à une nouvelle révision identifiée par un suffixe (par exemple ADR-02-R1).

- La révision fait l’objet d’un commit dédié dans le dépôt Git, accompagné d’une note de changement expliquant la raison de la révision et son impact sur les sprints en cours.

- La révision est validée par l’encadrant pédagogique avant d’être considérée comme effective.

*Historique appliqué : **ADR-08-R1** — révision de bilan d’implémentation (Sprint 1, juillet 2026) ; **ADR-11** — nouvel ADR (inscription publique & onboarding formateur, juillet 2026) ; **ADR-08-R2** — OAuth2 via Passport, acquisition uniquement (v2) ; **ADR-12** — profil apprenant & référentiel ; **ADR-13** — retrait de la création de comptes par l’admin (v2). Validation par l’encadrant : à présenter à la prochaine revue.*

## Annexe C — Glossaire et abréviations

Ce glossaire reprend les termes et abréviations utilisés dans le document, classés alphabétiquement.

| **Terme** | **Définition** |
| --- | --- |
| ACID | Atomicity, Consistency, Isolation, Durability. Quatre propriétés qui garantissent la fiabilité des transactions d’une base de données. |
| ADR | Architecture Decision Record. Document court qui fige une décision technique structurante. |
| AOF | Append-Only File. Mode de persistance de Redis qui journalise chaque écriture pour les rejouer après un redémarrage. |
| API | Application Programming Interface. Interface qui permet à deux logiciels d’échanger des informations. |
| Bull | Bibliothèque Node.js de files de tâches asynchrones, basée sur Redis. |
| CdC | Cahier des Charges du projet. |
| CI/CD | Continuous Integration / Continuous Deployment. Automatisation des tests et du déploiement. |
| DoD | Definition of Done. Liste des critères qui font qu’une User Story est considérée comme terminée. |
| DTO | Data Transfer Object. Objet utilisé pour transporter des données entre couches (par exemple entre l’API et le frontend). |
| Embedding | Représentation numérique vectorielle d’un texte, utilisée par les LLM pour comparer des contenus. |
| F1 à F7 | Fonctionnalités obligatoires du Cahier des Charges (QCM, Ateliers, Certification, Assistant IA Génération QCM, RBAC, Analytics, Sécurité). |
| G1 à G5 | Lacunes structurelles identifiées dans le Benchmark Phase 1. |
| JWT | JSON Web Token. Standard d’authentification sans état. |
| LLM | Large Language Model. Grand modèle de langage (par exemple GPT-4o, Claude, Mistral). |
| LMS | Learning Management System. Plateforme de gestion et de diffusion de formations. |
| LXP | Learning Experience Platform. Évolution du LMS centrée sur l’expérience apprenant. |
| MFA | Multi-Factor Authentication. Authentification à plusieurs facteurs (mot de passe + code). |
| NF1 à NF9 | Exigences non fonctionnelles du Cahier des Charges (performance, disponibilité, sécurité, souveraineté…). |
| ORM | Object-Relational Mapper. Bibliothèque qui fait le lien entre une base relationnelle et un code objet. |
| PFE | Projet de Fin d’Études. |
| RAG | Retrieval-Augmented Generation. Technique combinant un LLM et une base de connaissances externe pour des réponses plus précises. |
| RBAC | Role-Based Access Control. Contrôle d’accès par rôles. |
| RS256 | Algorithme de signature asymétrique pour JWT (clé privée pour signer, clé publique pour vérifier). |
| SaaS | Software as a Service. Logiciel hébergé par un éditeur tiers et consommé via Internet. |
| SHA-256 | Fonction de hachage cryptographique sur 256 bits, utilisée pour signer ou vérifier l’intégrité d’un document. |
| SSE | Server-Sent Events. Mécanisme HTTP qui permet au serveur d’envoyer des messages au client en continu. |
| SSG | Static Site Generation. Génération des pages à l’avance, lors du déploiement. |
| SSR | Server-Side Rendering. Génération de la page HTML côté serveur à chaque requête. |
| TLS | Transport Layer Security. Protocole de chiffrement des communications réseau (HTTPS). |
| TOTP | Time-based One-Time Password. Code à usage unique calculé à partir du temps, utilisé par les applications d’authentification (par exemple Google Authenticator). |
| UUID | Universally Unique Identifier. Identifiant universellement unique non prédictible. |
| WebSocket | Protocole de communication bidirectionnelle persistant entre client et serveur. |
| XMP | Extensible Metadata Platform. Standard de métadonnées intégré dans les PDF. |

## Annexe D — Documents de référence

Les ADR de ce document s’appuient sur trois documents du projet :

- Cert_EET — Étude de l’Existant.

- Cert_EET — Benchmark Phase 1.

- Cert_EET — Cahier des Charges.

*Cert_EET — Architecture Decision Records — v2.2 — Sprints 0–1 — mai 2026, révisé juillet 2026*

*Iyed Omri · ESPRIT Entreprise*

Page | 2 

## Comments

[^c15] Omri IYED: Dans ce contexte, “boilerplate” désigne le code répétitif et la configuration de base qu’un développeur doit écrire avant de commencer la logique métier réelle de l’application. Avec des frameworks comme Spring Boot, il y a souvent : plus de fichiers de configuration,  plus d’annotations,  plus de structure obligatoire,  et davantage de classes/interfaces à créer.  Cela augmente la quantité de code “standard” à écrire avant d’obtenir une fonctionnalité opérationnelle. À l’inverse, NestJS réduit généralement cette charge grâce à : une structure plus légère,  des conventions intégrées,  et un développement plus rapide en TypeScript.