Cert_EET — Diagramme de deploiement

**Cert_EET**

**Diagramme de deploiement**

Document maitre — vue globale, vue en tiers, zoom securite

Projet de Fin d'Etudes — ESPRIT, Ingenierie Logicielle

Iyed Omri  ·  Version 1.0  ·  Juin 2026

# Sommaire

# 1. Objet et conventions

Ce document presente le diagramme de deploiement de la plateforme Cert_EET sous trois vues complementaires : une vue globale (DEP-01) qui represente l'infrastructure physique reelle, une vue logique en tiers (DEP-02) qui en donne une lecture conceptuelle par couches, et un zoom securite (DEP-03) qui detaille les zones de confiance et les flux de donnees sensibles. Les trois vues decrivent le meme systeme a des niveaux d'abstraction differents.

**Demarche. **La topologie est derivee directement du cahier des charges (sections 6.1 a 6.4, exigences NF1 a NF9), des Architecture Decision Records (ADR-02, 04, 05, 07, 08, 10) et de la note technique Synchrone/Asynchrone. Le worker asynchrone et la file Bull/Redis prolongent sur l'infrastructure les workflows modelises dans les diagrammes d'activite AC-02 et AC-04.

**Conventions. **Le rendu adopte un routage orthogonal strict, des noeuds stereotypes UML (« device », « execution environment », « container », « external », « artifact ») et un code couleur rappele ci-dessous. Les chemins de communication sont etiquetes par protocole et port.

| **Vert — donnees** | **Bleu — exec/worker** | **Orange — externe** | **Rouge — securite** | **Gris — client** |
| --- | --- | --- | --- | --- |

*Cette palette prolonge celle des diagrammes d**'**activite et de sequence du projet : bleu pour l**'**execution asynchrone, vert pour la persistance, rouge pour les points sensibles de securite.*

# 2. DEP-01 — Architecture de deploiement globale

**Pourquoi cette vue. **Ce diagramme est la vue de reference montree au jury. Il represente l'infrastructure physique complete : postes clients, hote Docker Compose unique englobant tous les conteneurs applicatifs et de donnees, et services externes. C'est lui qui justifie concretement les choix d'architecture face aux exigences non-fonctionnelles.

**Ce qu****'****elle apporte. **Il rend visibles trois choix structurants : la separation du worker Bull dans son propre conteneur (le travail lourd ne bloque pas le thread web, conformement a AC-02), la centralisation de la securite sur le reverse proxy Nginx (terminaison TLS), et l'auto-hebergeabilite de l'ensemble (souverainete NF4).

**Choix illustres. **Les chemins de communication sont tous etiquetes par protocole et port. Les notifications temps reel passent par SSE (actif) ; WebSocket est represente en pointille comme evolution future (ADR-03). Les trois zones internes (Edge, Application, Donnees) structurent l'hote sans le fragmenter en plusieurs diagrammes.

**Sources : **Cahier des charges 6.1-6.4 · ADR-04/05/07 · Note Synchrone/Asynchrone · AC-02 / AC-04

*Figure 1 — DEP-01 (rendu Graphviz, routage orthogonal).*

## 2.1 Noeuds cles

| **Noeud** | **Stereotype / role** | **Fonction** | **Cle** |
| --- | --- | --- | --- |
| **Reverse Proxy Nginx** | container · securite | Terminaison TLS, routage, timeout SSE |  |
| **API NestJS (cluster)** | container · exec | REST + SSE, multi-instances (NF5), RBAC |  |
| **Worker Bull** | container · async | PDF/SHA-256/QR, indexation RAG, emails |  |
| **PostgreSQL** | container · donnees | Relationnel + pgvector + pgcrypto |  |
| **Redis** | container · donnees | Cache, blacklist JWT, file Bull (AOF) |  |
| **MinIO** | container · donnees | Stockage S3 : PDF certifs + livrables |  |
| **API LLM / SMTP / MFA** | external | Services hors hote, swappables |  |

# 3. DEP-02 — Vue logique en tiers

**Pourquoi cette vue. **Cette vue conceptuelle complete DEP-01 en presentant l'architecture sous forme de cinq couches logiques empilees. La ou DEP-01 montre « ou tourne quoi », DEP-02 montre « comment les responsabilites sont separees » : presentation, passerelle, application synchrone, traitement asynchrone, donnees.

**Ce qu****'****elle apporte. **Elle isole clairement le tier asynchrone (file + worker) comme une couche a part entiere, ce qui materialise la decision d'architecture centrale du projet. Le sens de lecture vertical facilite l'explication orale au jury.

**Choix illustres. **Le decoupage en tiers est conceptuel et n'implique pas cinq machines : tous les tiers s'executent dans le meme hote Docker (cf. DEP-01). C'est une grille de lecture des responsabilites, pas une topologie physique distincte.

**Sources : **Cahier des charges 6.2 (contraintes architecturales) · ADR-02/04

*Figure 2 — DEP-02 (rendu Graphviz, routage orthogonal).*

## 3.1 Noeuds cles

| **Noeud** | **Stereotype / role** | **Fonction** | **Cle** |
| --- | --- | --- | --- |
| **Tier 1 — Presentation** | client | SPA Next.js + page de verif publique |  |
| **Tier 2 — Passerelle** | gateway | Nginx : TLS, routage, securite perimetre |  |
| **Tier 3 — Application** | service | API NestJS synchrone, Auth, modules metier |  |
| **Tier 4 — Asynchrone** | worker | File Bull + Worker : jobs lourds |  |
| **Tier 5 — Donnees ****&**** externes** | datastore | PostgreSQL, Redis, MinIO + LLM/SMTP/MFA |  |

# 4. DEP-03 — Zoom securite & flux de donnees

**Pourquoi cette vue. **Ce diagramme zoome sur les exigences de securite (NF2, NF3, F7). Il organise l'infrastructure en zones de confiance traversees par un flux de donnees sensibles, de la zone non fiable (Internet) jusqu'a la zone de donnees chiffrees au repos.

**Ce qu****'****elle apporte. **Il montre la chaine de controle complete : terminaison TLS en DMZ, verification JWT par cle publique RS256, application du RBAC, journalisation d'audit immuable, puis acces aux donnees chiffrees. Chaque franchissement de frontiere de confiance est explicite.

**Choix illustres. **La cle privee RS256 reste cantonnee a l'AuthModule ; le reverse proxy ne fait que relayer. Le blacklisting des JWT a la deconnexion passe par Redis. L'audit est en ecriture seule (INSERT), ce qui garantit l'immuabilite des journaux.

**Sources : **Cahier des charges F7 · NF2/NF3 · ADR-08 (JWT RS256 + MFA TOTP) · ADR-10 (SHA-256)

*Figure 3 — DEP-03 (rendu Graphviz, routage orthogonal).*

## 4.1 Noeuds cles

| **Noeud** | **Stereotype / role** | **Fonction** | **Cle** |
| --- | --- | --- | --- |
| **Zone non fiable** | trust boundary | Internet : navigateur, smartphone |  |
| **DMZ — Nginx** | trust boundary | TLS 1.3, HSTS, rate-limit |  |
| **AuthModule** | secured | JWT RS256 (cle privee), MFA TOTP, refresh |  |
| **Garde RBAC + Audit** | secured | Controle d'acces + journaux horodates |  |
| **Donnees chiffrees** | encrypted | PostgreSQL (pgcrypto), Redis, MinIO |  |

# 5. Matrice de tracabilite

La matrice relie chaque noeud d'infrastructure a la decision d'architecture (ADR) qui le justifie, a l'exigence non-fonctionnelle qu'il sert, et aux diagrammes amont qui le mettent en mouvement. Elle permet au jury de verifier qu'aucun choix technique n'est arbitraire.

| **Noeud / element** | **ADR** | **NF servie** | **Diagrammes amont** |
| --- | --- | --- | --- |
| **Reverse Proxy Nginx** | ADR-03/08 | NF2 · NF3 | DEP-03 (DMZ, TLS) |
| **API NestJS (cluster)** | ADR-02 | NF1 · NF5 | DS-01→16 · tous les UC |
| **Worker Bull** | ADR-04 | NF5 | AC-02 · AC-04 · DS-04 · DS-06 |
| **PostgreSQL + pgvector** | ADR-04/05 | NF3 | DS-06 (RAG) · modele de classes |
| **Redis (file + cache)** | ADR-04 | NF1 | AC-02 · AC-04 · etats-transitions |
| **MinIO (S3)** | ADR-04 | NF1 · NF4 | AC-02 (PDF) · DS-03 (livrables) |
| **API LLM swappable** | ADR-05 | NF4 | AC-04 · DS-06 |
| **AuthModule (JWT/MFA)** | ADR-08 | NF3 · F7 | DEP-03 · UC RBAC |

## 5.1 Couverture des exigences non-fonctionnelles

| **NF** | **Cible (CdC)** | **Reponse architecturale** |
| --- | --- | --- |
| **NF1** | API <= 500 ms · page < 3 s | Cluster API multi-instances + cache Redis |
| **NF2** | Disponibilite 99% | Replication PostgreSQL possible + cluster API |
| **NF3** | JWT RS256, MFA TOTP, RBAC, audit | Nginx TLS, AuthModule, blacklist Redis, audit en base |
| **NF4** | Hebergement local / VPS TN | Hote Docker entierement auto-hebergeable |
| **NF5** | Montee en charge | API et Worker scalables horizontalement |
| **NF9** | Docker Compose dev/recette/prod | L'execution environment entier est reproductible |

# 6. Rendu et reproduction

Chaque vue est fournie dans son sous-dossier sous trois formes : source PlantUML (.puml), source Graphviz (.dot) et image (.png). Les deux sources decrivent le meme diagramme.

**Rendu de reference (Graphviz). **Les PNG ont ete produits via Graphviz pour un controle precis du routage orthogonal :

dot -Tpng -Gdpi=160 DEP01_Architecture_Globale/Cert_EET_DEP01_Architecture_Globale.dot -o sortie.png

**Rendu PlantUML. **Le renderer PlantUML etant inaccessible dans l'environnement de production, les sources .puml (syntaxe deploiement, linetype ortho) sont fournies pour StarUML ou l'extension VS Code :

java -jar plantuml.jar DEP01_Architecture_Globale/Cert_EET_DEP01_Architecture_Globale.puml

Iyed Omri — PFE ESPRIT 2026     ·     Page  /