Cert_EET — Diagramme de composants

**Cert_EET**

**Diagramme de composants**

Document maitre — architecture modulaire NestJS

Projet de Fin d'Etudes — ESPRIT, Ingenierie Logicielle

Iyed Omri  ·  Version 1.0  ·  Juin 2026

# Sommaire

# 1. Objet et conventions

Ce document presente le diagramme de composants de la plateforme Cert_EET. La ou le diagramme de deploiement (DEP-01) montre OU s'execute le logiciel, le diagramme de composants montre COMMENT les modules NestJS s'emboitent : quelles interfaces chaque module fournit, quelles interfaces il requiert, et quelles dependances relient le code metier aux adaptateurs d'infrastructure.

**Demarche. **Les seize modules et les trois services externes sont derives directement de la structure modulaire decrite dans le cahier des charges et les ADR (ADR-02 NestJS, ADR-05 abstraction LLM, ADR-06 SSE, ADR-08 JWT/MFA/RBAC). Le decoupage en modules metier, adaptateurs et transverses suit l'organisation reelle du dossier src/ NestJS.

**Valeur ajoutee par rapport au deploiement. **Ce diagramme rend explicites les contrats d'interface — en particulier les adaptateurs swappables (ILLMProvider, IStorageProvider, IEmailProvider, IQueueProvider) qui constituent le point differenciant de l'architecture : changer de fournisseur LLM ou de stockage ne touche aucun module metier.

**Conventions. **Routage orthogonal strict, composants stereotypes « module », interfaces fournies en notation lollipop (cercle plein) et interfaces requises en dependance pointillee. Code couleur rappele ci-dessous.

| **Vert — metier** | **Rouge — securite** | **Bleu — adaptateur** | **Gris — transverse** | **Orange — externe** |
| --- | --- | --- | --- | --- |

# 2. COMP-01 — Architecture des modules NestJS

**Pourquoi ce diagramme. **Il sert de plan de developpement : chaque composant correspond a un module NestJS reel, chaque interface a un contrat TypeScript. Le jury peut verifier la correspondance directe entre le diagramme et le code ("ou est ce module ?", "quel module fournit cette interface ?").

**Ce qu****'****il apporte. **Il isole les quatre adaptateurs d'infrastructure derriere des interfaces stables, materialisant le principe d'inversion de dependance : les modules metier dependent d'abstractions (les interfaces), jamais des implementations concretes (Bull, MinIO, OpenAI, SMTP).

**Choix illustres. **AssistanceIAModule apparait comme le composant le plus connecte (pipeline RAG : LLM + Queue + Storage + pgvector). AuthModule fournit les gardes JwtAuthGuard et RolesGuard consommes par tous les modules metier. AuditModule fournit un intercepteur global applique aux actions critiques.

**Sources : **Cahier des charges F1-F7 · ADR-02/05/06/08 · DS-06 / AC-04 (RAG) · DEP-01 (conteneurs)

*Figure 1 — COMP-01 (rendu Graphviz, routage orthogonal). Version pleine resolution dans le dossier.*

## 2.1 Modules et responsabilites

| **Module** | **Categorie** | **Responsabilite** | **Cle** |
| --- | --- | --- | --- |
| **AuthModule** | securite | JWT RS256, MFA TOTP, gardes RBAC |  |
| **UsersModule** | metier | Comptes utilisateurs, attribution des roles |  |
| **FormationsModule** | metier | Formations, modules, inscriptions |  |
| **QCMModule** | metier | QCM, anti-fraude, scoring serveur |  |
| **AteliersModule** | metier | Livrables, correction, feedback |  |
| **CertificatsModule** | metier | Emission, SHA-256, revocation |  |
| **AssistanceIAModule** | metier | RAG, generation QCM par IA, alertes |  |
| **NotificationsModule** | metier | Push temps reel via SSE |  |
| **AuditModule** | metier | Intercepteur global, journaux immuables |  |
| **LLMAdapterModule** | adaptateur | ILLMProvider — swap GPT/Claude/Mistral |  |
| **StorageAdapterModule** | adaptateur | IStorageProvider — S3/MinIO |  |
| **EmailAdapterModule** | adaptateur | IEmailProvider — SMTP |  |
| **QueueAdapterModule** | adaptateur | IQueueProvider — Bull/Redis |  |
| **ConfigModule** | transverse | Configuration typee |  |
| **DatabaseModule** | transverse | TypeORM, PostgreSQL, pgvector |  |
| **LoggerModule** | transverse | Logs structures |  |

## 2.2 Contrats d'interface (fournies / requises)

Le tableau resume les interfaces fournies par chaque composant et les modules qui les consomment. C'est le coeur du diagramme : il documente les points de decouplage de l'architecture.

| **Interface fournie** | **Fournie par** | **Requise par** |
| --- | --- | --- |
| **ILLMProvider** | LLMAdapterModule | AssistanceIAModule (pipeline RAG) |
| **IStorageProvider** | StorageAdapterModule | CertificatsModule, AteliersModule, AssistanceIAModule |
| **IEmailProvider** | EmailAdapterModule | NotificationsModule |
| **IQueueProvider** | QueueAdapterModule | CertificatsModule, AssistanceIAModule, QCMModule |
| **JwtAuthGuard + RolesGuard** | AuthModule | TOUS les modules metier |
| **SSE channel** | NotificationsModule | AssistanceIAModule, AteliersModule |
| **AuditInterceptor** | AuditModule | Actions critiques (certificat, QCM, revocation) |

**Modules transverses. **ConfigModule, DatabaseModule et LoggerModule sont requis par l'ensemble des modules metier et des adaptateurs. Leurs liens ne sont pas traces individuellement sur le diagramme pour preserver la lisibilite ; ils sont signales par une note.

# 3. Matrice de tracabilite

La matrice relie chaque composant a la decision d'architecture (ADR) qui le justifie, au besoin fonctionnel qu'il sert, et aux diagrammes amont qui le mettent en oeuvre.

| **Composant** | **ADR** | **Besoin** | **Diagrammes amont** |
| --- | --- | --- | --- |
| **AuthModule** | ADR-08 | F7 · NF3 | DEP-03 · UC RBAC |
| **QCMModule** | ADR-04 | F1 | DS-02 · etats TentativeQCM |
| **AteliersModule** | — | F2 | DS-03 · AC-03 |
| **CertificatsModule** | ADR-10 | F3 | DS-04/05/07 · AC-01/02 · etats Certificat |
| **AssistanceIAModule** | ADR-05 | F4 | DS-06 · AC-04 |
| **NotificationsModule** | ADR-06 | F4 · F6 | DS-06 (SSE) · AC-04 |
| **AuditModule** | ADR-08 | NF3 | tous les flux critiques |
| **LLMAdapterModule** | ADR-05 | F4 · NF4 | DS-06 · AC-04 |
| **StorageAdapterModule** | ADR-04 | F2 · F3 | AC-02 · DS-03 |
| **QueueAdapterModule** | ADR-04 | F3 · F4 | AC-02 · AC-04 · DS-04/06 |

**Cible de coherence. **Chaque composant correspond a un module NestJS du dossier src/ ; chaque interface fournie correspond a un contrat TypeScript (token d'injection) ; chaque adaptateur correspond a un service externe du diagramme de deploiement DEP-01.

# 4. Rendu et reproduction

Le diagramme est fourni sous trois formes dans son sous-dossier : source PlantUML (.puml), source Graphviz (.dot) et image (.png).

**Rendu de reference (Graphviz). **Les PNG ont ete produits via Graphviz pour un controle precis du routage orthogonal :

dot -Tpng -Gdpi=160 COMP01_Architecture_Modules/Cert_EET_COMP01_Architecture_Modules.dot -o sortie.png

**Rendu PlantUML. **La source .puml utilise la syntaxe composants native (component / interface / lollipop, componentStyle uml2) pour StarUML ou l'extension VS Code :

java -jar plantuml.jar COMP01_Architecture_Modules/Cert_EET_COMP01_Architecture_Modules.puml

Iyed Omri — PFE ESPRIT 2026     ·     Page  /