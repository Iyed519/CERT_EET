# Cert_EET — Glossaire des Termes Techniques, de Conception et Stratégiques

> Document de référence — compagnon de `Cert_EET_DiagrammeClasses_Justifications.md`
> Version 1.1 · Juin 2026 · Iyed Omri · PFE ESPRIT — Ingénierie Logicielle
>
> Ce glossaire définit **chaque terme technique, de conception ou stratégique** employé dans le
> document de justifications du diagramme de classes. Format : **Terme — définition générale.**
> *Dans Cert_EET :* application concrète au projet (quand pertinent).
> Les termes sont regroupés par domaine pour faciliter la lecture ; un index alphabétique figure en fin de document.

---

## Table des matières

- [A. Modélisation UML](#a-modélisation-uml)
- [B. Conception orientée objet et principes](#b-conception-orientée-objet-et-principes)
- [C. Persistance et base de données](#c-persistance-et-base-de-données)
- [D. Architecture et technologies](#d-architecture-et-technologies)
- [E. Sécurité et cryptographie](#e-sécurité-et-cryptographie)
- [F. Concepts métier et stratégiques](#f-concepts-métier-et-stratégiques)
- [Index alphabétique](#index-alphabétique)

---

## A. Modélisation UML

**UML (Unified Modeling Language)** — Langage de modélisation graphique normalisé (version 2.5) servant à décrire la structure et le comportement d'un système logiciel. Il définit 13 types de diagrammes répartis en structurels (statiques) et comportementaux (dynamiques).

**Diagramme de classes** — Diagramme **structurel** décrivant les classes du système, leurs attributs, leurs méthodes et leurs relations. Il représente ce qui ne change pas dans le temps (l'architecture des données).

**Domain Model (modèle du domaine)** — Variante du diagramme de classes centrée sur les **entités métier** et leurs relations, sans détails d'implémentation (pas de contrôleurs, services, ni structures techniques). Il répond à « quelles sont les choses du domaine et comment sont-elles reliées ? ». *Dans Cert_EET :* chaque classe du Domain Model devient une table en base.

**Entité métier** — Objet significatif du domaine d'affaires, doté d'une identité propre et d'un cycle de vie (ex. un certificat, une tentative de QCM). À distinguer de l'*objet-valeur*.

**Classe** — Modèle (gabarit) décrivant un ensemble d'objets partageant les mêmes attributs et comportements. Une classe est instanciée en objets.

**Attribut** — Donnée caractérisant une classe (ex. `dateEmission`, `statut`). En base, un attribut devient typiquement une colonne.

**Compartiment** — Une des trois bandes horizontales d'un rectangle de classe en UML : le nom (en haut), les attributs (au milieu), les opérations (en bas).

**Méthode (opération)** — Comportement qu'une classe sait exécuter (ex. `revoquer()`, `calculerScore()`). Elle agit généralement sur les attributs de sa classe.

**Visibilité** — Niveau d'accès à un attribut ou une méthode, noté par un symbole : `+` public (accessible partout), `-` privé (accessible uniquement dans la classe), `#` protégé (accessible dans la classe et ses sous-classes).

**Association** — Lien structurel durable entre deux classes (ex. un apprenant « passe » des tentatives). Représentée par un trait, éventuellement nommé et orienté.

**Association binaire** — Association reliant exactement deux classes (le cas le plus courant).

**Multiplicité (cardinalité)** — Nombre d'instances d'une classe pouvant participer à une association, indiqué à chaque extrémité : `1` (exactement un), `0..1` (zéro ou un, optionnel), `0..*` (zéro à plusieurs), `1..*` (au moins un), `2..*` (au moins deux), `*` (plusieurs). *Note :* « un-vers-plusieurs » et « plusieurs-vers-un » désignent la même association lue dans deux sens opposés.

**Relation N–N (plusieurs-à-plusieurs / many-to-many)** — Association où chaque côté peut être relié à plusieurs instances de l'autre (ex. un apprenant suit plusieurs formations, une formation accueille plusieurs apprenants). Se traduit en base par une table de liaison.

**Navigabilité** — Sens dans lequel on peut accéder d'une classe à l'autre via l'association, indiqué par une flèche. Limiter la navigabilité réduit le couplage. *Dans Cert_EET :* `Reponse → Question` (la réponse connaît sa question, pas l'inverse).

**Agrégation** — Relation « tout/partie » **faible** (losange creux `o--`) : la partie peut exister indépendamment du tout et être **partagée** entre plusieurs touts. Supprimer le tout ne détruit pas la partie. *Dans Cert_EET :* `QCM o-- Question` (une question de la banque survit à la suppression d'un QCM).

**Composition** — Relation « tout/partie » **forte** (losange plein `*--`) : la partie n'existe pas sans le tout et n'appartient qu'à un seul propriétaire. Supprimer le tout détruit ses parties. *Dans Cert_EET :* `Question *-- Option` (une option meurt avec sa question).

**Cycle de vie** — Suite des états par lesquels passe un objet, de sa création à sa fin. Critère central pour distinguer composition (cycles liés) et agrégation (cycles indépendants).

**Classe d'association** — Classe attachée à une association pour porter les attributs propres au **lien** lui-même (et non à l'une des deux classes reliées). Notée `(A, B) .. C`. *Dans Cert_EET :* `Inscription` (date, statut, avancement du lien apprenant↔formation) et `NoteCritere` (note + commentaire du lien correction↔critère).

**Objet-valeur (value object)** — Objet défini **uniquement par ses valeurs**, sans identité propre ni cycle de vie indépendant ; il n'a de sens qu'au sein de l'objet qui le contient, et il est immuable. *Dans Cert_EET :* `EmpreinteSHA256`, `ContexteApprenant`.

**Généralisation (héritage)** — Relation « est-un » par laquelle une sous-classe hérite des attributs et méthodes d'une super-classe (flèche à triangle creux `<|--`). *Dans Cert_EET :* `Apprenant`, `Formateur`, `Administrateur` héritent de `User`.

**Classe abstraite** — Classe non instanciable directement, servant uniquement de super-type à factoriser. Souvent porteuse d'au moins une méthode abstraite. *Dans Cert_EET :* `User`.

**Méthode abstraite** — Opération déclarée dans une classe (la signature) mais sans implémentation, laissée aux sous-classes. *Dans Cert_EET :* `getPermissions()`.

**Dépendance** — Relation d'usage **ponctuel** (flèche pointillée `..>`), sans lien structurel durable : une classe « utilise » ou « dérive de » une autre sans la posséder. *Dans Cert_EET :* `VisiteurPublic ..> VerificationCertificat`.

**Stéréotype** — Étiquette entre guillemets `«…»` étendant la signification d'un élément UML. *Dans Cert_EET :* `«abstract»`, `«value object»`, `«association class»`, `«immuable»`, `«non persisté»`.

**Énumération (enum)** — Type dont les valeurs possibles sont une liste fermée et nommée (ex. `StatutCertificat`). Apporte la sûreté de typage et la lisibilité.

**Attribut dérivé** — Attribut calculé à partir d'autres données plutôt que stocké (noté `/`). *Dans Cert_EET :* le taux d'avancement peut être dérivé des QCM passés et ateliers soumis.

**Diagramme d'états-transitions** — Diagramme comportemental décrivant le cycle de vie d'un objet : ses états successifs et les événements qui déclenchent les transitions. *Dans Cert_EET :* aligné sur les énumérations de statut (Certificat, TentativeQCM, Livrable, CompteUtilisateur).

**Diagramme de cas d'utilisation** — Diagramme comportemental modélisant les fonctionnalités du système du point de vue des acteurs.

**Diagramme de séquence** — Diagramme comportemental montrant l'ordre chronologique des interactions (messages) entre objets pour un scénario donné.

---

## B. Conception orientée objet et principes

**Programmation orientée objet (POO)** — Paradigme organisant le logiciel autour d'objets combinant données (attributs) et comportements (méthodes).

**Encapsulation** — Principe consistant à masquer l'état interne d'un objet et à n'exposer qu'une interface de comportement contrôlée. Protège les invariants métier. *Dans Cert_EET :* on appelle `revoquer()` plutôt que d'écrire directement `statut = REVOQUE`.

**Invariant métier** — Règle qui doit rester vraie en permanence pour qu'un objet soit cohérent (ex. « un certificat émis ne se modifie jamais »). L'encapsulation sert à le garantir.

**Polymorphisme** — Capacité d'objets de classes différentes à répondre à une même opération de manière spécifique. *Dans Cert_EET :* `getPermissions()` renvoie un résultat différent selon le rôle.

**Abstraction** — Action de ne retenir d'un concept que les aspects pertinents, en masquant les détails. Une classe abstraite en est l'expression.

**Abstraction prématurée** — Erreur consistant à créer une généralisation (super-classe commune) avant qu'un réel besoin partagé n'existe, ce qui complexifie inutilement. *Dans Cert_EET :* évitée en ne reliant pas `QCM` et `Atelier` par héritage.

**Instantané (snapshot)** — Copie figée de l'état de certaines données à un moment précis, prise pour être utilisée puis jetée (non maintenue à jour). *Dans Cert_EET :* `ContexteApprenant`, construit à l'instant d'une question au chatbot.

**Délégation** — Mécanisme par lequel un objet confie une partie de son travail à un autre objet mieux placé. *Dans Cert_EET :* `TentativeQCM` délègue les règles de scoring au `QCM`.

**DRY (Don't Repeat Yourself)** — Principe « ne te répète pas » : toute connaissance doit avoir une représentation unique. *Dans Cert_EET :* attributs communs factorisés dans `User`.

**Séparation des préoccupations (separation of concerns)** — Principe de découpage du système en parties traitant chacune d'un aspect distinct (domaine, présentation, persistance…). *Dans Cert_EET :* le Domain Model ne mélange pas les entités métier et les couches techniques.

**SOLID** — Acronyme de cinq principes de conception orientée objet (SRP, OCP, LSP, ISP, DIP). Deux sont mobilisés ici : SRP et LSP.

**SRP (Single Responsibility Principle)** — « Principe de responsabilité unique » : une classe ne devrait avoir qu'une seule raison de changer. *Dans Cert_EET :* la décision de révoquer (Administrateur) est distincte de l'exécution du changement d'état (Certificat).

**LSP (Liskov Substitution Principle)** — « Principe de substitution de Liskov » : une instance d'une sous-classe doit pouvoir remplacer une instance de la super-classe sans rompre le programme. *Dans Cert_EET :* partout où un `User` est attendu, un `Apprenant`/`Formateur`/`Administrateur` convient.

**GRASP (General Responsibility Assignment Software Patterns)** — Ensemble de principes guidant l'**attribution des responsabilités** (méthodes) aux classes. Le plus utilisé ici est *Information Expert*.

**Information Expert (expert en information)** — Principe GRASP : confier une responsabilité à la classe qui détient l'information nécessaire pour l'assumer. *Dans Cert_EET :* `GrilleNotation.validerPonderations()` car la grille détient ses critères.

**Couplage (coupling)** — Degré de dépendance entre classes. Un **faible couplage** est recherché (moins de dépendances = plus facile à modifier). Réduit par la limitation de la navigabilité.

**Cohésion (cohesion)** — Degré auquel les éléments d'une classe concourent à une seule responsabilité claire. Une **forte cohésion** est recherchée (une classe = un travail cohérent).

**Responsabilité** — Obligation d'une classe d'assurer un comportement ou de connaître une information. Bien répartir les responsabilités est l'objet de GRASP.

---

## C. Persistance et base de données

**Persistance** — Capacité à conserver l'état des objets au-delà de l'exécution du programme, généralement en base de données. *Dans Cert_EET :* à l'inverse, `VisiteurPublic` est « non persisté ».

**Base de données relationnelle** — Système stockant les données en tables liées par des clés. *Dans Cert_EET :* PostgreSQL.

**PostgreSQL** — Système de gestion de base de données relationnelle open source, robuste et standard. Base principale de Cert_EET (utilisateurs, formations, certificats, audit).

**ORM (Object-Relational Mapping)** — Technique/outil traduisant automatiquement les objets du code en lignes de tables relationnelles (et inversement), évitant d'écrire du SQL manuel.

**TypeORM** — ORM pour TypeScript/Node.js, utilisé avec NestJS. *Dans Cert_EET :* chaque classe du Domain Model devient une entité TypeORM (`@Entity`).

**Entité (au sens ORM)** — Classe annotée (`@Entity()`) que l'ORM associe à une table. Chaque instance correspond à une ligne.

**Table** — Structure tabulaire (lignes/colonnes) stockant les instances d'une entité.

**Clé primaire (Primary Key, PK)** — Colonne identifiant de façon unique chaque ligne d'une table. *Dans Cert_EET :* généralement un UUID.

**Clé étrangère (Foreign Key, FK)** — Colonne d'une table référençant la clé primaire d'une autre table, matérialisant une association. *Dans Cert_EET :* une `Option` porte une FK vers sa `Question`.

**UUID (Universally Unique Identifier)** — Identifiant de 128 bits unique au monde, non séquentiel (donc non devinable). *Dans Cert_EET :* identifiant des certificats exposé dans l'URL publique de vérification.

**Table de liaison (table de jointure / junction table)** — Table intermédiaire matérialisant une relation N–N ; elle contient les clés étrangères des deux entités liées, plus d'éventuels attributs propres au lien. *Dans Cert_EET :* table d'inscription (apprenant_id, formation_id, date, statut, avancement).

**Cascade (suppression en cascade)** — Comportement où la suppression d'une ligne parente supprime automatiquement ses lignes enfants. *Dans Cert_EET :* associée aux compositions (`onDelete: 'CASCADE'`).

**onDelete** — Option ORM/SQL définissant l'effet de la suppression d'un parent sur ses enfants : `CASCADE` (supprime les enfants), `SET NULL` (vide la référence), `RESTRICT` (interdit la suppression). *Dans Cert_EET :* `CASCADE` pour les compositions, `RESTRICT`/`SET NULL` pour les agrégations.

**Single Table Inheritance (STI)** — Stratégie de persistance d'une hiérarchie d'héritage dans **une seule** table, avec une colonne discriminante indiquant la sous-classe. *Dans Cert_EET :* une table `users` avec une colonne `role`.

**Colonne discriminante (discriminator)** — Colonne identifiant, en STI, à quelle sous-classe appartient une ligne. *Dans Cert_EET :* `role`.

**Embedded value (valeur embarquée)** — Objet-valeur stocké directement dans les colonnes de la table de l'objet propriétaire, sans table séparée. *Dans Cert_EET :* `EmpreinteSHA256` peut être embarquée dans la table `certificat`.

---

## D. Architecture et technologies

**NestJS** — Framework backend Node.js structuré en modules, contrôleurs, services et providers, basé sur TypeScript. Architecture backend de Cert_EET.

**Module (NestJS)** — Unité d'organisation regroupant contrôleurs et services d'un même domaine fonctionnel (ex. `QCMModule`). À ne pas confondre avec le `Module` métier (subdivision d'une formation).

**Contrôleur** — Composant NestJS qui reçoit les requêtes HTTP et délègue au service. Présent dans les diagrammes de séquence, **absent** du Domain Model.

**Service** — Composant NestJS contenant la logique applicative et orchestrant les entités. Absent du Domain Model.

**DTO (Data Transfer Object)** — Objet servant à transporter des données entre couches (ex. valider une requête entrante), distinct de l'entité métier.

**Repository** — Composant d'accès aux données encapsulant les opérations de lecture/écriture en base.

**API REST** — Style d'architecture exposant des ressources via des endpoints HTTP. *Dans Cert_EET :* API RESTful documentée (NF8).

**Endpoint** — Point d'accès d'une API, identifié par une URL et un verbe HTTP (GET, POST…).

**Node.js** — Environnement d'exécution JavaScript côté serveur, mono-thread (un seul fil principal exécutant le code).

**Event loop (boucle d'événements)** — Mécanisme de Node.js qui exécute les tâches une par une sur le thread principal. Le bloquer fige tout le serveur.

**Synchrone** — Mode d'exécution où l'on attend la fin d'une opération avant de continuer. Bloquant.

**Asynchrone** — Mode où l'on lance une opération et continue sans attendre, en étant notifié à la fin (callbacks, `async/await`). Non bloquant pour les opérations d'entrée/sortie.

**I/O (Input/Output)** — Opérations sortant du programme (disque, réseau, base de données). Naturellement gérées en asynchrone.

**CPU-bound** — Tâche limitée par la puissance de calcul (ex. hacher un gros PDF). L'asynchrone seul ne la déporte pas du thread principal.

**Worker Thread** — Thread secondaire d'un même processus Node.js, capable d'exécuter du calcul en parallèle. *Dans Cert_EET :* re-hachage par lot de certificats.

**File de tâches (queue)** — Mécanisme où des tâches lourdes sont mises en attente pour être traitées en arrière-plan par un processus séparé.

**Bull** — Bibliothèque Node.js de files de tâches, adossée à Redis. *Dans Cert_EET :* génération asynchrone des PDF de certificats et des rapports.

**Worker** — Processus séparé qui consomme une file de tâches et exécute le travail lourd hors du processus web. *Dans Cert_EET :* génère PDF + SHA-256 + QR puis notifie l'apprenant.

**Redis** — Base de données en mémoire utilisée pour le cache et le stockage des files Bull. *Dans Cert_EET :* cache + queue.

**SSE (Server-Sent Events)** — Technologie permettant au serveur de pousser des données vers le navigateur en flux continu. *Dans Cert_EET :* affichage progressif (streaming) des réponses du chatbot.

**LLM (Large Language Model)** — Grand modèle de langage (ex. GPT-4o, Claude, Mistral) générant du texte. *Dans Cert_EET :* moteur du chatbot contextualisé (F4), interchangeable via une couche d'abstraction.

**Docker / conteneurisation** — Technologie empaquetant une application et ses dépendances dans des conteneurs reproductibles, facilitant le déploiement et la scalabilité (NF5, NF9).

---

## E. Sécurité et cryptographie

**RBAC (Role-Based Access Control)** — Contrôle d'accès basé sur les rôles : les permissions sont attachées à des rôles, eux-mêmes attribués aux utilisateurs. *Dans Cert_EET :* trois rôles (Apprenant, Formateur, Administrateur) — besoin F5.

**Authentification** — Vérification de l'identité d'un utilisateur (établir *qui* il est). *Dans Cert_EET :* méthode `authentifier()` de `User`.

**Autorisation** — Détermination des actions qu'un utilisateur authentifié a le droit d'effectuer (établir *ce qu'il peut faire*). Gérée par le RBAC.

**JWT (JSON Web Token)** — Jeton d'authentification autoportant (stateless) prouvant l'identité d'un utilisateur sans interroger la base à chaque requête. *Dans Cert_EET :* besoin F7.

**Access token (jeton d'accès)** — Jeton JWT de courte durée donnant accès aux ressources.

**Refresh token (jeton de rafraîchissement)** — Jeton de plus longue durée servant à obtenir un nouvel access token sans re-saisir les identifiants. *Dans Cert_EET :* `TokenJWT.type` ∈ {Access, Refresh}.

**MFA (Multi-Factor Authentication) / double authentification** — Authentification multi-facteurs : exige au moins deux preuves d'identité (mot de passe + code). *Dans Cert_EET :* optionnelle, recommandée pour Formateur/Administrateur (F7).

**TLS (Transport Layer Security)** — Protocole chiffrant les communications réseau (le « S » de HTTPS). *Dans Cert_EET :* chiffrement en transit (F7), page de vérification servie en HTTPS uniquement.

**bcrypt** — Algorithme de hachage de mots de passe, lent par conception pour résister au cassage par force brute. *Dans Cert_EET :* les mots de passe sont stockés en hash bcrypt, non réversibles.

**Hachage (hash)** — Transformation d'une donnée en une empreinte de taille fixe, non réversible. Sert à vérifier l'intégrité ou stocker des secrets.

**SHA-256** — Fonction de hachage cryptographique produisant une empreinte de 256 bits. *Dans Cert_EET :* scelle le contenu d'un certificat ; toute altération du PDF invalide la vérification (F3).

**Empreinte cryptographique** — Résultat d'un hachage, servant de « signature » d'intégrité d'un contenu. *Dans Cert_EET :* `EmpreinteSHA256`.

**Intégrité** — Garantie qu'une donnée n'a pas été altérée. Vérifiée en recalculant et comparant le hash. *Dans Cert_EET :* `Certificat.verifierIntegrite()`.

**QR code** — Code-barres 2D scannable. *Dans Cert_EET :* imprimé sur le certificat, il contient uniquement l'URL publique de vérification (aucune donnée personnelle).

**Immuabilité (inaltérabilité)** — Propriété d'un objet qui ne peut être modifié après sa création. *Dans Cert_EET :* un certificat émis et un journal d'audit sont immuables ; on révoque sans modifier ni supprimer.

**Audit log (journal d'audit)** — Enregistrement horodaté et non modifiable des actions sensibles, à des fins de sécurité et de conformité. *Dans Cert_EET :* entité `AuditLog`, stéréotype `«immuable»` (NF3, UC10 Admin).

**Anti-fraude** — Ensemble de mécanismes empêchant la tricherie lors d'une évaluation. *Dans Cert_EET :* randomisation, timer serveur, blocage des sessions multiples (F1, `ConfigurationAntiFraude`).

**Randomisation** — Mélange aléatoire de l'ordre des questions et/ou des options, côté serveur, pour empêcher la copie entre apprenants.

**Proctoring** — Surveillance d'un examen à distance (ex. vérification d'identité par webcam). *Dans Cert_EET :* proctoring léger optionnel (UC2 Formateur).

**Rate limiting (limitation de débit)** — Plafonnement du nombre de requêtes par client sur une période, pour contrer les abus (ex. force brute). *Dans Cert_EET :* protège la page publique de vérification.

**RGPD** — Règlement général sur la protection des données. *Dans Cert_EET :* divulgation minimale côté visiteur, anonymisation des comptes — garantie volontaire d'ESPRIT.

**Minimisation des données** — Principe RGPD de ne traiter que les données strictement nécessaires. *Dans Cert_EET :* la vérification publique n'expose que le minimum (« vérification, pas exposition »).

**Anonymisation** — Suppression irréversible du caractère identifiant de données personnelles, comme alternative à la suppression d'un compte ayant des données rattachées. *Dans Cert_EET :* état `ANONYMISE` du compte (UC1 Admin).

---

## F. Concepts métier et stratégiques

**Cert_EET** — Plateforme de certification et de micro-certification numérique d'ESPRIT Entreprise, objet du PFE.

**Certification certifiante** — Validation officielle et vérifiable de compétences à l'issue d'une formation. *Dans Cert_EET :* aboutit à un certificat numérique vérifiable (F3).

**Micro-certification** — Attestation de compétences ciblées et de courte durée (badges numériques), montant en puissance dans le recrutement.

**Benchmark** — Étude comparative de solutions concurrentes pour situer le projet. *Dans Cert_EET :* comparaison de 6 plateformes (Moodle, TalentLMS, 360Learning, Open edX, Docebo, Canvas).

**Lacune G3** — Lacune structurelle identifiée par le benchmark : les plateformes concurrentes génèrent des certificats PDF **non vérifiables**. *Dans Cert_EET :* justifie l'effort cryptographique (SHA-256, QR, URL publique) et l'acteur Visiteur Public.

**Différenciateur (fonctionnalité différenciante)** — Caractéristique absente de la concurrence qui distingue le produit. *Dans Cert_EET :* le chatbot IA contextualisé (F4) et la détection de décrochage assistée par IA.

**Décrochage** — Désengagement progressif d'un apprenant menant à l'abandon. *Dans Cert_EET :* détecté par le chatbot en « Mode Suivi », générant une `AlerteDecrochage` au formateur (UC8 Formateur).

**Livrable** — Production concrète (code, document, lien…) déposée par un apprenant en réponse à un atelier. *Dans Cert_EET :* entité `Livrable`, soumise puis corrigée (F2).

**Grille de notation** — Ensemble structuré de critères pondérés servant à évaluer un livrable de façon transparente et auditable. *Dans Cert_EET :* `GrilleNotation`, réutilisable comme modèle (UC4 Formateur).

**Critère** — Dimension d'évaluation d'une grille (ex. « Sécurité de l'API »), dotée d'une pondération. *Dans Cert_EET :* `Critere`.

**Niveau de performance** — Palier qualitatif d'un critère (ex. Insuffisant → Excellent), associé à une plage de points et à un descripteur. *Dans Cert_EET :* `NiveauPerformance`.

**Pondération** — Poids relatif d'un élément dans un calcul de note (en % ou en coefficient). *Dans Cert_EET :* poids d'une question dans un QCM, d'un critère dans une grille.

**Scoring** — Calcul automatique du score d'une évaluation à partir des réponses et des pondérations. *Dans Cert_EET :* effectué côté serveur (`QCM.calculerScore()`, `TentativeQCM`).

**Seuil de validation** — Score minimum requis pour réussir une évaluation. *Dans Cert_EET :* paramètre de `ConfigurationAntiFraude` (ex. 60 %).

**Révocation** — Invalidation publique d'un certificat émis (fraude, erreur, décision), **sans** le supprimer. *Dans Cert_EET :* entité `Revocation`, décidée par l'administrateur (UC6 Admin).

**Contexte (injection de contexte)** — Données personnalisées (profil, scores, lacunes) fournies au LLM pour adapter ses réponses à l'apprenant. *Dans Cert_EET :* `ContexteApprenant`, construit dynamiquement et injecté dans le chatbot (F4).

**Acteur** — Entité externe (humain ou système) interagissant avec le système, au sens UML. *Dans Cert_EET :* Apprenant, Formateur, Administrateur, Visiteur Public.

**Anti-plagiat / preuve d'antériorité** — Mécanisme attestant qu'un travail a bien été déposé à une date donnée et n'a pas été altéré depuis. *Dans Cert_EET :* l'attribut `Livrable.hashTracabilite` enregistre une empreinte du dépôt à des fins de traçabilité.

**Verrouillage progressif** — Restriction croissante des actions possibles au fil du cycle de vie d'un objet. *Dans Cert_EET :* un livrable est librement remplaçable avant la date limite, puis verrouillé dès l'ouverture de la correction (UC4).

---

## Index alphabétique

Abstraction · Abstraction prématurée · Access token · Acteur · Agrégation · Anonymisation · Anti-fraude · Anti-plagiat · API REST · Association · Association binaire · Asynchrone · Attribut · Attribut dérivé · Audit log · Authentification · Autorisation · Base de données relationnelle · bcrypt · Benchmark · Bull · Cardinalité · Cascade · Cert_EET · Certification certifiante · Classe · Classe abstraite · Classe d'association · Clé étrangère · Clé primaire · Cohésion · Colonne discriminante · Compartiment · Composition · Conteneurisation · Contexte · Contrôleur · Couplage · CPU-bound · Critère · Cycle de vie · Décrochage · Délégation · Dépendance · Diagramme de cas d'utilisation · Diagramme de classes · Diagramme d'états-transitions · Diagramme de séquence · Différenciateur · Docker · Domain Model · DRY · DTO · Embedded value · Empreinte cryptographique · Encapsulation · Endpoint · Énumération · Entité métier · Entité (ORM) · Event loop · File de tâches · Généralisation · GRASP · Grille de notation · Hachage · Héritage · Immuabilité · Information Expert · Instantané · Intégrité · Invariant métier · I/O · JWT · Lacune G3 · LLM · LSP · Méthode · Méthode abstraite · Micro-certification · Minimisation des données · Module (NestJS) · MFA / double authentification · Multiplicité · Navigabilité · NestJS · Niveau de performance · Node.js · Objet-valeur · onDelete · ORM · Persistance · Polymorphisme · Pondération · POO · PostgreSQL · Proctoring · Programmation orientée objet · QR code · Randomisation · Rate limiting · RBAC · Redis · Refresh token · Relation N–N · Repository · Responsabilité · Révocation · RGPD · Scoring · Séparation des préoccupations · Service · Seuil de validation · SHA-256 · Single Table Inheritance · SOLID · SRP · SSE · Stéréotype · Synchrone · Table · Table de liaison · TLS · TypeORM · UML · UUID · Value object · Verrouillage progressif · Visibilité · Worker · Worker Thread

---

*Fin du document — Glossaire des termes techniques · Cert_EET v1.1*
