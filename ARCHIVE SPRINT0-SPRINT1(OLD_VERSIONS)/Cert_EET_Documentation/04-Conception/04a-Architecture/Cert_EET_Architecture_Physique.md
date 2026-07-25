Cert_EET — Architecture physique

**Cert_EET**

**Architecture physique**

Plateforme de Certification et de Micro-Certification Digitale

Projet de Fin d'Études — ESPRIT, Ingénierie Logicielle

Iyed Omri  ·  Juin 2026

# 1. Vue d'ensemble

L'architecture physique décrit l'infrastructure réelle sur laquelle Cert_EET s'exécute : les machines, les conteneurs et les communications réseau. Là où l'architecture logique répond à la question « comment le code est-il organisé », l'architecture physique répond à « où s'exécute chaque élément et comment ils communiquent ».

L'ensemble du système est **conteneurisé avec Docker et orchestré par Docker Compose** (**ADR-07**). Une seule commande démarre la totalité de l'environnement, ce qui rend le déploiement reproductible entre développement, recette et production. La figure ci-dessous présente cette infrastructure.

*Figure 1 — Architecture physique : déploiement conteneurisé de Cert_EET.*

# 2. Les nœuds du déploiement

**Le client. **L'utilisateur accède à la plateforme depuis un navigateur web ou un mobile. Toutes les communications avec le serveur sont chiffrées en HTTPS / TLS.

**Le reverse proxy (Nginx). **Point d'entrée unique de l'hôte, il assure la terminaison TLS, sert le frontend et route les appels vers l'API. Il constitue la première ligne de sécurité (**ADR-08**).

**Le frontend et l****'****API. **Le conteneur *Frontend (Next.js)* produit les pages ; le conteneur *API (NestJS)* exécute la logique métier et expose les endpoints REST et SSE. L'API est prévue pour fonctionner en plusieurs instances afin d'absorber la charge (NF5).

**Le worker. **C'est la pièce la plus structurante du déploiement (**ADR-04**). Node.js s'exécutant sur un thread unique, les traitements lourds — génération de PDF de certificats, indexation et appels IA, envoi d'emails — sont déportés dans un processus worker séparé, alimenté par une file de tâches (Bull, persistée dans Redis). L'API empile la tâche et répond immédiatement ; le worker la traite en arrière-plan. Le temps de réponse de l'API reste ainsi protégé.

**Les bases de données. ***PostgreSQL*, *Redis* et *MinIO* s'exécutent chacun dans leur conteneur, avec des volumes persistés sur l'hôte pour conserver les données entre redémarrages.

**Les services externes. **L'API du modèle de langage (interchangeable — GPT-4o, Claude ou Mistral, **ADR-05**) et le service SMTP restent hors de l'hôte. Ils sont sollicités par le worker au travers d'adaptateurs, ce qui permet de les remplacer sans modifier le code métier.

# 3. Souveraineté et portabilité

Parce que l'ensemble est auto-hébergeable, Cert_EET peut être déployé sur une infrastructure locale ou un VPS sans aucune dépendance à un cloud applicatif. Cette capacité répond à l'exigence de souveraineté des données (NF4) : la décision d'hébergement reste entièrement à la discrétion d'ESPRIT Entreprise. La conteneurisation garantit par ailleurs la portabilité (NF9) — les mêmes images Docker fonctionnent à l'identique sur tous les environnements.

Iyed Omri — PFE ESPRIT 2026     ·     Page  /