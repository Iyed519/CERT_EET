Cert_EET — Architecture logique

**Cert_EET**

**Architecture logique**

Plateforme de Certification et de Micro-Certification Digitale

Projet de Fin d'Études — ESPRIT, Ingénierie Logicielle

Iyed Omri  ·  Juin 2026

# 1. Vue d'ensemble

L'architecture logique de Cert_EET suit le modèle classique en **trois couches (architecture 3-tiers)**, le standard des applications web modernes. Chaque couche a une responsabilité unique et ne communique qu'avec la couche adjacente, ce qui garantit une séparation nette des préoccupations et une évolution indépendante de chaque partie.

La **couche présentation** gère l'interface utilisateur. La **couche métier** (ou couche application) contient toute la logique fonctionnelle. La **couche données** assure la persistance. La figure ci-dessous résume cette organisation.

*Figure 1 — Architecture logique 3-tiers de Cert_EET.*

# 2. Les trois couches

**Couche Présentation — Frontend Next.js. **Elle produit l'interface web consommée par les utilisateurs (apprenants, formateurs, administrateurs). Construite avec Next.js (**ADR-03**), elle utilise le rendu côté serveur pour les tableaux de bord et le rendu statique pour la page publique de vérification des certificats. Elle ne contient aucune logique métier : elle se contente d'afficher les données et de transmettre les actions de l'utilisateur à la couche métier via des appels HTTPS / REST.

**Couche Métier — API NestJS. **C'est le cœur du système. Construite avec NestJS (**ADR-02**), elle expose une API REST documentée (OpenAPI) et des flux temps réel (SSE). Toute la logique fonctionnelle y réside, organisée en neuf modules correspondant aux fonctionnalités du cahier des charges : authentification et contrôle d'accès par rôle, QCM, ateliers, certificats, assistance IA, notifications et audit. Cette couche valide les règles métier, applique la sécurité et orchestre l'accès aux données.

**Couche Données — PostgreSQL, Redis, MinIO. **Elle assure la persistance (**ADR-04**). *PostgreSQL* stocke les données relationnelles (utilisateurs, formations, certificats, audit) et, grâce à l'extension pgvector, les vecteurs nécessaires à l'assistance IA. *Redis* fournit le cache, la gestion des sessions et la file de tâches asynchrones. *MinIO* stocke les fichiers volumineux (PDF de certificats, livrables d'ateliers) via une interface compatible S3. La couche métier accède à PostgreSQL au travers de l'ORM TypeORM.

# 3. Pourquoi ce découpage

La séparation en trois couches est un choix d'ingénierie éprouvé, retenu pour trois raisons concrètes. **Maintenabilité** : une modification de l'interface (couche présentation) n'affecte pas la logique métier ; un changement de base de données reste confiné à la couche données. **Testabilité** : la logique métier peut être testée indépendamment de l'interface et de la base. **Évolutivité** : chaque couche peut monter en charge séparément — par exemple en multipliant les instances de l'API sans toucher au reste. Ce découpage répond directement aux exigences de maintenabilité (NF6) et de scalabilité (NF5) du cahier des charges.

Iyed Omri — PFE ESPRIT 2026     ·     Page  /