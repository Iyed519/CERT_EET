Cert_EET — Diagramme de packages

**Cert_EET**

**Diagramme de packages**

Document maitre — carte des dossiers & vue en couches

Projet de Fin d'Etudes — ESPRIT, Ingenierie Logicielle

Iyed Omri  ·  Version 1.0  ·  Juin 2026

# Sommaire

# 1. Objet et conventions

Ce document presente le diagramme de packages de la plateforme Cert_EET sous deux vues complementaires. La premiere (PKG-01) est une carte des dossiers : elle reflete fidelement l'organisation du code source NestJS dans le dossier src/. La seconde (PKG-02) est une vue en couches : elle regroupe ces dossiers en quatre couches architecturales et explicite les regles de dependance autorisees entre elles.

**Caractere du diagramme. **Le diagramme de packages est avant tout un outil de documentation : il aide le jury et les futurs developpeurs a se reperer dans le depot et a comprendre les regles qui maintiennent l'architecture modulaire dans le temps. PKG-02 va plus loin que la simple cartographie en formalisant la direction autorisee des dependances.

**Demarche. **L'arborescence est celle reellement adoptee pour le projet (modules / shared / common / config). Le decoupage en couches applique la contrainte de modularite du cahier des charges (section 6.2 : modules independants et evolutifs) et le principe de separation des preoccupations documente dans le dossier de conception du diagramme de classes.

**Conventions. **Routage orthogonal strict, packages en notation UML onglet (dossier a languette), dependances « import » en fleche pointillee. Code couleur rappele ci-dessous.

| **Vert — metier** | **Bleu — config** | **Gris — transverse** | **Jaune — application** | **Rouge — regle violee** |
| --- | --- | --- | --- | --- |

# 2. PKG-01 — Carte des dossiers (src/)

**Pourquoi cette vue. **Elle donne une correspondance directe entre le diagramme et le depot Git : chaque package est un dossier reel. Un membre du jury qui demande "ou se trouve ce module ?" trouve la reponse immediatement.

**Ce qu****'****elle montre. **Les neuf modules metier sous modules/, le code partage sous shared/ (dto, entities, interfaces, enums), les aspects transverses sous common/ (filters, interceptors, pipes, decorators), la configuration sous config/, et le point d'entree main.ts.

**Choix de lisibilite. **Seul le module auth/ est eclate pour montrer la structure type d'un module NestJS (module, controller, service, dto, guards, strategies). Les huit autres modules suivent exactement la meme structure et sont representes en boites compactes pour eviter une repetition illisible.

**Sources : **Arborescence src/ du projet · ADR-02 (NestJS) · conventions de modules NestJS

*Figure 1 — PKG-01 (rendu Graphviz, routage orthogonal). Version pleine resolution dans le dossier.*

# 3. PKG-02 — Vue en couches & regles de dependance

**Pourquoi cette vue. **C'est la vue architecturale. Elle ne se contente pas de lister les dossiers : elle impose un sens de dependance. Cette discipline est ce qui empeche le code de devenir un plat de spaghettis a mesure que le projet grandit.

**Ce qu****'****elle montre. **Quatre couches empilees — Application (main.ts), Modules metier, Transverse (shared + common), Configuration (socle) — avec des dependances qui ne vont que vers le bas. Une fleche rouge barree illustre explicitement une dependance interdite (shared important un module), pour rendre la regle visuellement incontestable.

**Les regles formalisees. **Le diagramme materialise quatre regles que tout developpeur du projet doit respecter :

| **Regle** | **Enonce** |
| --- | --- |
| **Regle 1** | main.ts importe les modules ; aucun module n'importe main.ts. |
| **Regle 2** | Les modules metier importent shared/common, jamais l'inverse (evite le couplage circulaire). |
| **Regle 3** | Tout depend de config ; config ne depend de rien (couche socle, la plus basse). |
| **Regle 4** | Les modules metier sont independants entre eux : leurs interactions passent par les interfaces (cf. COMP-01), pas par des imports croises directs. |

**Sources : **CdC 6.2 (modularite) · dossier de conception du diagramme de classes (separation des preoccupations) · COMP-01 (interfaces)

*Figure 2 — PKG-02 (rendu Graphviz). La fleche rouge barree est un contre-exemple : dependance montante interdite.*

# 4. Matrice de tracabilite

La matrice relie chaque package metier a sa couche, au module NestJS correspondant, au package du diagramme de classes (Domain Model) et au besoin fonctionnel couvert. Elle garantit la coherence entre l'organisation du code et le modele de domaine.

| **Package src/** | **Couche** | **Module NestJS** | **Package classes** | **Besoin** |
| --- | --- | --- | --- | --- |
| **modules/auth** | Metier | AuthModule | Utilisateurs & Securite | F5·F7 |
| **modules/users** | Metier | UsersModule | Utilisateurs & Securite | F5 |
| **modules/formations** | Metier | FormationsModule | Formations & Pedagogie | — |
| **modules/qcm** | Metier | QCMModule | Evaluations QCM | F1 |
| **modules/ateliers** | Metier | AteliersModule | Ateliers | F2 |
| **modules/certificats** | Metier | CertificatsModule | Certification | F3 |
| **modules/assistance-ia** | Metier | AssistanceIAModule | Assistance IA | F4 |
| **modules/notifications** | Metier | NotificationsModule | Transverse | F6 |
| **modules/audit** | Metier | AuditModule | Transverse | NF3 |
| **shared + common** | Transverse | (shared modules) | Transverse · Enumerations | — |
| **config** | Configuration | ConfigModule | — | NF9 |

**Cible de coherence. **Chaque package de modules/ correspond a un module NestJS (un decorateur @Module) et a un package fonctionnel du diagramme de classes. Cette correspondance triple — dossier, module, package de domaine — assure qu'un lecteur peut naviguer sans rupture entre le code, l'architecture et le modele metier.

# 5. Rendu et reproduction

Chaque vue est fournie dans son sous-dossier sous trois formes : source PlantUML (.puml), source Graphviz (.dot) et image (.png).

**Rendu de reference (Graphviz). **Les PNG ont ete produits via Graphviz pour un controle precis du routage orthogonal :

dot -Tpng -Gdpi=160 PKG02_Vue_Couches/Cert_EET_PKG02_Vue_Couches.dot -o sortie.png

**Rendu PlantUML. **Les sources .puml utilisent la syntaxe package native (package <<Folder>>, linetype ortho) pour StarUML ou l'extension VS Code :

java -jar plantuml.jar PKG02_Vue_Couches/Cert_EET_PKG02_Vue_Couches.puml

Iyed Omri — PFE ESPRIT 2026     ·     Page  /