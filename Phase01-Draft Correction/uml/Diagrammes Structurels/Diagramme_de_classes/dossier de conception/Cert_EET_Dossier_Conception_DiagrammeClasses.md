# Cert_EET — Dossier de Conception du Diagramme de Classes

> Document de conception · Version 3.2 · Juin 2026
> Iyed Omri — Projet de Fin d'Études, ESPRIT — Ingénierie Logicielle
>
> **Objet.** Ce dossier présente, de manière exhaustive et auto-portante, la conception du
> diagramme de classes (Domain Model) de la plateforme Cert_EET. Pour chaque décision de
> modélisation, nous exposons l'option retenue, sa justification théorique et sa conséquence sur
> l'implémentation. Il s'adresse au jury de soutenance, aux encadrants et à tout lecteur externe
> souhaitant comprendre et auditer nos choix.
>
> **Cadre de référence.** Notre démarche s'appuie sur la spécification UML 2.5 de l'OMG, sur le
> *Domain-Driven Design* (E. Evans), sur les patrons d'attribution de responsabilités *GRASP*
> (C. Larman), sur les principes *SOLID* (R. C. Martin), sur les patrons d'architecture applicative
> de M. Fowler et sur le modèle relationnel de E. F. Codd. Les termes techniques en *italique* sont
> définis dans le document compagnon `Cert_EET_Glossaire_Termes_Techniques.md`.

---

## Sommaire

1. [Périmètre et démarche de conception](#1-périmètre-et-démarche-de-conception)
2. [Conventions de modélisation](#2-conventions-de-modélisation)
3. [Héritage (généralisation)](#3-héritage-généralisation)
4. [Multiplicités — référentiel exhaustif des relations](#4-multiplicités--référentiel-exhaustif-des-relations)
5. [Composition vs Agrégation](#5-composition-vs-agrégation)
6. [Classes d'association](#6-classes-dassociation)
7. [Objets-valeurs (value objects)](#7-objets-valeurs)
8. [Dépendances et navigabilité](#8-dépendances-et-navigabilité)
9. [Attribution des méthodes aux classes](#9-attribution-des-méthodes-aux-classes)
10. [Stéréotypes](#10-stéréotypes)
11. [Énumérations et cohérence avec les états-transitions](#11-énumérations-et-cohérence-avec-les-états-transitions)
12. [Justification des attributs, classe par classe](#12-justification-des-attributs-classe-par-classe)
13. [Décisions de conception notables](#13-décisions-de-conception-notables)
14. [Évolution par rapport à la liste initiale d'entités](#14-évolution-par-rapport-à-la-liste-initiale-dentités)
15. [Matrice de traçabilité entités ↔ besoins fonctionnels](#15-matrice-de-traçabilité-entités--besoins-fonctionnels)
16. [Synthèse des principes et patrons appliqués](#16-synthèse-des-principes-et-patrons-appliqués)

---

## 1. Périmètre et démarche de conception

### 1.1 Objet et destinataires

Ce dossier documente le diagramme de classes de Cert_EET, plateforme de certification et de micro-certification numérique d'ESPRIT Entreprise. Il vise à rendre chaque choix **traçable** (rattaché à une exigence) et **justifiable** (adossé à un principe reconnu), de sorte qu'un lecteur externe puisse en vérifier la cohérence sans connaissance préalable du projet.

### 1.2 De la spécification au modèle

Nous avons dérivé le modèle de trois sources : le cahier des charges (besoins fonctionnels F1 à F7 et non fonctionnels), les descriptions de cas d'utilisation des quatre acteurs (Apprenant, Formateur, Administrateur, Visiteur Public) et la note technique sur le traitement synchrone/asynchrone. Aucune entité n'a été introduite sans une exigence la motivant.

### 1.3 Vue d'ensemble

Le modèle comporte **36 classes** et **8 énumérations**, organisées en **8 packages**. Il totalise **41 associations et dépendances**, **3 généralisations** et **2 classes d'association**, l'ensemble étant justifié dans les sections suivantes. Le package 6 a été refondu en juin 2026 : les entités du chatbot étudiant ont été remplacées par les entités de l'**assistance IA aux formateurs** (`SupportPedagogique`, `GenerationIA`, `SuggestionQuestionIA`).

---

## 2. Conventions de modélisation

### 2.1 Un *Domain Model* distinct du modèle d'implémentation

**Choix retenu.** Le diagramme ne comporte que des *entités métier*, à l'exclusion des contrôleurs, services, DTO et repositories de la couche applicative.

**Justification.** Nous appliquons le principe de *séparation des préoccupations* (E. Dijkstra) et l'architecture en couches de M. Fowler. Le diagramme de classes répond à une question structurelle relevant de la couche domaine ; l'orchestration et le découpage technique sont traités par les diagrammes de séquence et de composants. Mêler ces préoccupations nuirait à la cohésion attendue d'un modèle de domaine au sens du *Domain-Driven Design*.

**Conséquence.** Chaque classe correspond à une *entité* *TypeORM* (`@Entity()`) et à une table *PostgreSQL*, sans dette de traduction.

### 2.2 Conventions de nommage : langage unifié du domaine

**Choix retenu.** Classes en français, `PascalCase` ; attributs et opérations en `camelCase`.

**Justification.** Ce choix met en œuvre le *langage ubiquitaire* du *Domain-Driven Design* : spécification, modèle et code partagent un vocabulaire unique, ce qui supprime les pertes sémantiques aux frontières entre artefacts. Les sources étant en français, l'emploi du même lexique élimine une étape de traduction reconnue comme source d'incohérences.

**Conséquence.** Traçabilité immédiate entre artefacts ; les identifiants techniques normalisés (UUID, JWT, SHA-256) conservent leur forme universelle.

### 2.3 Visibilité et encapsulation

**Choix retenu.** Attributs privés (`-`), opérations métier publiques (`+`).

**Justification.** Application de la *dissimulation d'information* (D. Parnas, 1972) et de l'*encapsulation* : un objet expose un comportement contrôlé et masque sa représentation. L'accès direct à l'état est proscrit au profit d'opérations garantissant les *invariants métier* (immuabilité du certificat, verrouillage du livrable).

**Conséquence.** Les invariants sont protégés au niveau du code ; les attributs deviennent des colonnes, les opérations l'API de domaine.

### 2.4 Typage des statuts par énumérations

**Choix retenu.** Les statuts à valeurs fermées sont typés par des *énumérations*.

**Justification.** *Sûreté de typage* (vérification statique interdisant toute valeur illégale, logique *fail-fast*) et *cohérence intra-modèle* exigée par UML : les états d'un diagramme d'états-transitions correspondent à un attribut `statut` du modèle.

**Conséquence.** Alignement mécanique entre diagramme de classes et diagrammes d'états-transitions.

### 2.5 Organisation en packages alignés sur les besoins fonctionnels

**Choix retenu.** Les classes sont regroupées en huit packages correspondant aux domaines fonctionnels (Utilisateurs & Sécurité, Formations & Pédagogie, Évaluations QCM, Ateliers, Certification, **Assistance IA aux Formateurs**, Transverse, Énumérations).

**Justification.** Ce découpage applique le principe de *forte cohésion* à l'échelle du modèle et anticipe la modularité de l'implémentation : chaque package se projette sur un module NestJS au périmètre clair. Il matérialise par ailleurs la couverture des besoins F1 à F7 (cf. §15).

**Conséquence.** Lisibilité accrue du diagramme et frontière nette entre sous-domaines, facilitant la répartition du développement et la maintenance.

### 2.6 Conventions de représentation graphique

**Choix retenu.** Le diagramme adopte un **routage orthogonal** (tous les liens en segments horizontaux et verticaux) et un **code couleur par type de relation**, rappelé dans la légende :

| Couleur | Type de relation |
|---|---|
| Noir | Héritage (généralisation) |
| Rouge | Composition |
| Vert | Agrégation |
| Bleu | Association |
| Gris pointillé | Dépendance |
| Orange pointillé | Raccordement d'une classe d'association |

Chaque package reçoit en outre un fond pastel distinct.

**Justification.** Ces conventions s'alignent sur la pratique des outils de modélisation de référence (Visual Paradigm, StarUML, Enterprise Architect). Le routage orthogonal et la distinction chromatique des liens réduisent la charge cognitive du lecteur : la nature d'une relation se lit instantanément à sa couleur, sans recourir à la seule forme des extrémités.

**Conséquence.** Le diagramme est exporté en SVG (vectoriel, net à tout zoom) et en PNG. À noter une contrainte technique de l'auto-disposition : sur un modèle de cette densité, le connecteur d'une classe d'association reliant deux packages distincts (`Inscription`) reste un trait plus long que les liens intra-package — sans incidence sur l'exactitude du modèle. Un éclatement en vues par package permettrait, le cas échéant, un rendu orthogonal parfait sur chaque planche.

---

## 3. Héritage (généralisation)

### 3.1 Classe abstraite `User` et sous-classes de rôle

**Choix retenu.** Une classe abstraite `User` factorise les propriétés communes ; `Apprenant`, `Formateur` et `Administrateur` en héritent.

**Justification.** Le besoin F5 (RBAC) définit trois rôles partageant une même identité de compte mais différant par leurs données et comportements. Cette situation relève d'une *généralisation* UML 2.5 (« est-un ») et applique le principe *DRY*. La classe est abstraite car aucun « compte générique » n'existe dans le domaine. L'opération `getPermissions()` est abstraite afin d'exploiter le *polymorphisme de sous-typage*. Le *principe de substitution de Liskov* (B. Liskov) est respecté : chaque sous-classe se substitue à `User` sans rompre les contrats.

**Conséquence.** Stratégie de persistance *Single Table Inheritance* (M. Fowler) : une table `users` avec une colonne discriminante `role`.

### 3.2 Exclusion de `VisiteurPublic` de la hiérarchie

**Choix retenu.** `VisiteurPublic` est modélisé hors de la hiérarchie `User`, stéréotypé `«non persisté»`.

**Justification.** Cet acteur est anonyme et non authentifié ; le faire hériter de `User` lui attribuerait des opérations qu'il ne peut honorer (authentification), ce qui violerait le *principe de substitution de Liskov*. Au sens du *Domain-Driven Design*, un acteur sans identité persistante n'est pas une *entité*.

**Conséquence.** Aucune table ; lien au modèle par une unique dépendance vers `VerificationCertificat`.

### 3.3 Absence de super-classe commune à `QCM` et `Atelier`

**Choix retenu.** Pas de super-classe « Évaluation ».

**Justification.** Les deux concepts ont des structures disjointes (auto-correction par scoring serveur pour le QCM, correction manuelle par grille pour l'atelier). Une super-classe quasi vide constituerait une *généralité spéculative* (anti-patron de M. Fowler), au détriment de la cohésion.

**Conséquence.** Deux sous-modèles autonomes, évoluant séparément.

---

## 4. Multiplicités — référentiel exhaustif des relations

### 4.1 Clarification : « un-vers-plusieurs » et « plusieurs-vers-un »

Une association binaire UML porte une multiplicité à chacune de ses extrémités. « Un-vers-plusieurs » et « plusieurs-vers-un » désignent une **même** association lue dans deux sens opposés ; la décision de conception porte donc sur la **valeur de chaque borne**, non sur un « sens ».

### 4.2 Méthode : contrainte structurelle vs accumulation temporelle

Nous distinguons deux justifications de la borne basse. Une **contrainte structurelle** fixe la borne à `1` ou `2` lorsque l'existence même de l'entité l'impose (une question exige au moins deux options). Une **accumulation temporelle** fixe la borne à `0` lorsque l'entité enfant n'existe pas encore à la création du parent (un apprenant n'a initialement aucune tentative).

### 4.3 Référentiel exhaustif

Les tableaux ci-dessous couvrent **l'intégralité** des relations du diagramme, regroupées par package. La colonne « Type » indique : *Assoc.* (association), *Compo.* (composition), *Agrég.* (agrégation), *Dép.* (dépendance), *Cl. assoc.* (classe d'association).

#### Généralisations

| Relation | Type | Justification |
|---|---|---|
| `Apprenant`, `Formateur`, `Administrateur` → `User` | Héritage | Trois rôles partageant l'identité de compte (F5) ; relation « est-un » (§3.1). |

#### Utilisateurs & Sécurité (F5/F7)

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `User` — `SessionUtilisateur` | `1` — `0..*` | Assoc. | Un compte ouvre plusieurs sessions au fil du temps (multi-appareils) ; chaque session est rattachée à un compte unique pour l'imputabilité (F7). |
| `SessionUtilisateur` ◆— `TokenJWT` | `1` — `1..2` | Compo. | Le `1..2` traduit le couple **access token + refresh token** émis par session (F7) : au moins le jeton d'accès, au plus les deux. Les jetons sont invalidés avec la session. |
| `User` — `Notification` | `1` — `0..*` | Assoc. | Un compte reçoit de multiples notifications ; chacune a un destinataire unique. |
| `User` — `AuditLog` | `0..1` — `0..*` | Assoc. | Le `0..1` côté utilisateur est délibéré : la plupart des entrées d'audit sont imputées à un acteur, mais certaines sont **systèmes** (tâches planifiées, expiration automatique) et n'ont pas d'auteur humain. |

#### Formations & Pédagogie

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `Formation` ◆— `Module` | `1` — `1..*` | Compo. | Une formation structure au moins un module (contrainte structurelle) ; un module relève d'une unique formation. |
| `Formateur` — `Formation` | `1..*` — `0..*` | Assoc. (N–N) | UC4 Admin : un formateur anime plusieurs formations, une formation compte au moins un responsable. |
| `Apprenant` — `Formation` | `0..*` — `0..*` | Cl. assoc. | Inscriptions multiples (UC4 Admin) ; relation porteuse de données → `Inscription` (§6). |

#### Évaluations QCM (F1)

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `Module` — `QCM` | `1` — `0..*` | Assoc. | Un module peut ne contenir aucun QCM ; un QCM cible un module. |
| `QCM` ◆— `ConfigurationAntiFraude` | `1` — `1` | Compo. | Tout QCM publié possède exactement une configuration anti-fraude (UC2 Formateur), indissociable. |
| `QCM` ◇— `Question` | `0..*` — `1..*` | Agrég. | Au moins une question par QCM ; question **réutilisable** depuis la banque (UC1) → agrégation (§5.3). |
| `BanqueQuestions` ◇— `Question` | `0..1` — `0..*` | Agrég. | Une question appartient à zéro ou une banque ; la banque regroupe des questions autonomes. |
| `Question` ◆— `Option` | `1` — `2..*` | Compo. | Au moins deux options : contrainte structurelle de la notion de choix. |
| `QCM` — `TentativeQCM` | `1` — `0..*` | Assoc. | Une tentative se rapporte à un QCM unique ; un QCM accumule des tentatives. |
| `Apprenant` — `TentativeQCM` | `1` — `0..*` | Assoc. | Accumulation temporelle de tentatives (plafond `nbTentativesMax` dynamique, non structurel) ; tentative rattachée à un apprenant unique pour l'intégrité de l'historique. |
| `TentativeQCM` ◆— `Reponse` | `1` — `0..*` | Compo. | Une tentative à peine démarrée ne contient encore aucune réponse. |
| `Reponse` → `Question` | `0..*` — `1` | Assoc. (orientée) | Une réponse vise une question ; navigabilité limitée à ce sens utile (§8). |
| `Reponse` → `Option` | `0..*` — `0..*` | Assoc. (orientée) | Options sélectionnées : `0..*` car selon le type (QCU/QCM) zéro, une ou plusieurs options sont cochées. |

#### Ateliers Pratiques (F2)

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `Module` — `Atelier` | `1` — `0..*` | Assoc. | Un module peut ne contenir aucun atelier ; un atelier cible un module. |
| `Atelier` ◇— `GrilleNotation` | `0..*` — `1` | Agrég. | Grille **réutilisable comme modèle** entre ateliers (UC4) → agrégation (§5.3). |
| `GrilleNotation` ◆— `Critere` | `1` — `1..*` | Compo. | Une grille comporte au moins un critère, qui n'existe pas hors d'elle. |
| `Critere` ◆— `NiveauPerformance` | `1` — `2..*` | Compo. | Au moins deux niveaux : une gradation suppose plusieurs paliers. |
| `Atelier` — `Livrable` | `1` — `0..*` | Assoc. | Un livrable répond à un atelier unique ; un atelier reçoit plusieurs livrables. |
| `Apprenant` — `Livrable` | `1` — `0..*` | Assoc. | Un livrable a un auteur unique. Avec le rattachement à l'atelier, le couple (apprenant, atelier) identifie la soumission. |
| `Livrable` ◆— `FichierLivrable` | `1` — `0..*` | Compo. | Les fichiers sont des composantes internes d'une soumission unique. |
| `Livrable` — `Correction` | `1` — `0..1` | Assoc. | Un livrable reçoit au plus une correction (UC5 Formateur). |
| `Correction` — `Formateur` | `0..*` — `1` | Assoc. | Une correction est produite par un formateur unique, traçable. |
| `Correction` ◆— `Feedback` | `1` — `1` | Compo. | Le feedback est le volet qualitatif indissociable d'une correction. |
| `Correction` — `Critere` | `1` — `1..*` | Cl. assoc. | Notation par critère → `NoteCritere` (§6). |

#### Certification Numérique (F3)

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `Apprenant` — `Certificat` | `1` — `0..*` | Assoc. | Un apprenant peut détenir plusieurs certificats (un par formation validée), chacun ayant un titulaire unique. |
| `Formation` — `Certificat` | `1` — `0..*` | Assoc. | Un certificat atteste d'une formation unique ; une formation en émet plusieurs (un par lauréat). |
| `Certificat` ◆— `EmpreinteSHA256` | `1` — `1` | Compo. | Empreinte calculée sur un certificat unique ; objet-valeur scellé (§7). |
| `Certificat` — `Revocation` | `1` — `0..1` | Assoc. | Un certificat est révoqué au plus une fois ; entité distincte conservant motif et pièces (UC6 Admin). |
| `Revocation` — `Administrateur` | `0..*` — `1` | Assoc. | Seul l'administrateur révoque ; traçabilité du décideur obligatoire. |
| `Certificat` — `VerificationCertificat` | `1` — `0..*` | Assoc. | Chaque consultation publique est journalisée (UC2/UC3 Visiteur, UC5 Admin). |
| `VisiteurPublic` ⇢ `VerificationCertificat` | — | Dép. | Acteur non persisté déclenchant une vérification, sans lien structurel (§8). |

> **Note.** La signature du certificat est **institutionnelle** : elle est portée par l'attribut `organismeEmetteur` (ESPRIT) et **non** par une relation vers un `Formateur` (cf. §13.1).

#### Assistance IA aux Formateurs (F4)

| Relation | Mult. | Type | Justification |
|---|---|---|---|
| `Module` — `SupportPedagogique` | `1` — `0..*` | Assoc. | Un module héberge ses supports de cours ; un support appartient à un module. |
| `Formateur` — `GenerationIA` | `1` — `0..*` | Assoc. | Un formateur lance plusieurs générations au fil du temps ; chaque génération est initiée par un formateur. |
| `GenerationIA` — `Module` | `0..*` — `1` | Assoc. | Une génération porte sur un module précis (la source du RAG). |
| `GenerationIA` ◆— `SuggestionQuestionIA` | `1` — `1..*` | Compo. | Un lot produit au moins une suggestion ; les suggestions n'existent pas sans leur lot. |
| `GenerationIA` — `SupportPedagogique` | `0..*` — `0..*` | Assoc. | Une génération s'appuie sur un ou plusieurs supports indexés du module. |
| `SuggestionQuestionIA` → `Question` | `0..1` — `0..1` | Assoc. (orientée) | Une suggestion acceptée donne lieu à une `Question` dans la banque ; navigabilité limitée à ce sens utile. |
| `AlerteDecrochage` — `Apprenant` | `0..*` — `1` | Assoc. | Une alerte concerne un apprenant. |
| `AlerteDecrochage` — `Formateur` | `0..*` — `1` | Assoc. | Une alerte notifie un formateur responsable. |

---

## 5. Composition vs Agrégation

### 5.1 Critère de décision fondé sur la sémantique UML 2.5

UML 2.5 distingue l'*agrégation composite* (losange plein) de l'*agrégation partagée* (losange creux) selon la coïncidence des cycles de vie et la possibilité de partage. Nous appliquons deux questions : (1) la partie peut-elle exister sans le tout ? si non, composition ; (2) une même instance peut-elle appartenir à plusieurs touts ? si oui, agrégation obligatoirement.

### 5.2 Compositions retenues

Toutes vérifient un cycle de vie coïncident et une partie non partagée : `Formation*--Module`, `QCM*--ConfigurationAntiFraude`, `Question*--Option`, `TentativeQCM*--Reponse`, `GrilleNotation*--Critere`, `Critere*--NiveauPerformance`, `Livrable*--FichierLivrable`, `Correction*--Feedback`, `Certificat*--EmpreinteSHA256`, `GenerationIA*--SuggestionQuestionIA`, `SessionUtilisateur*--TokenJWT`. Dans chaque cas, la partie n'a de sens qu'au sein de son tout et n'est jamais partagée.

### 5.3 Agrégations retenues

Dans les cas suivants, la partie est explicitement réutilisable selon les cas d'utilisation ; une composition constituerait une erreur de modélisation.

| Agrégation | Justification |
|---|---|
| `QCM ◇— Question` | UC1 : banque de questions réutilisables, tirage aléatoire de K parmi N ; la question survit à la suppression d'un QCM. |
| `BanqueQuestions ◇— Question` | Regroupement de questions autonomes, potentiellement référencées par plusieurs QCM. |
| `Atelier ◇— GrilleNotation` | UC4 : grille enregistrable comme modèle réutilisable (`estModele`). |

### 5.4 Conséquence sur la persistance

Conformément à l'*intégrité référentielle* (E. F. Codd) : la composition induit une suppression en cascade (`onDelete: 'CASCADE'`) avec clé étrangère vers un parent unique ; l'agrégation exclut la cascade (`'RESTRICT'`/`'SET NULL'`) et requiert souvent une table de liaison N–N.

### 5.5 Limite et discussion

La spécification UML 2.5 reconnaît que la sémantique de l'agrégation partagée dépend du domaine et comporte une part d'interprétation. Nos choix d'agrégation ne sont pas arbitraires : ils découlent des exigences de réutilisation formulées dans les cas d'utilisation (UC1, UC4), ce qui en assure la justifiabilité.

---

## 6. Classes d'association

**Choix retenu.** `Inscription` (entre `Apprenant` et `Formation`) et `NoteCritere` (entre `Correction` et `Critere`).

**Justification.** UML 2.5 prévoit la classe d'association lorsque des propriétés caractérisent le **lien** et non l'une des classes reliées. `Inscription` porte `dateInscription`, `dateEcheance`, `statut`, `tauxAvancement`, propres au couple (apprenant, formation) ; `NoteCritere` porte la note et le commentaire propres au couple (correction, critère), décrits à l'UC5 Formateur.

**Conséquence.** Chaque classe d'association devient une table de liaison enrichie (décomposition normalisée d'une relation N–N, modèle de Codd).

---

## 7. Objets-valeurs (value objects)

**Choix retenu.** `EmpreinteSHA256` est stéréotypé `«value object»`.

**Justification.** Le *Domain-Driven Design* distingue l'*entité* (identité suivie) de l'*objet-valeur* (défini par ses seuls attributs, immuable). `EmpreinteSHA256` est déterminée par la valeur du hash et n'a de sens qu'au sein du certificat qu'elle scelle ; orpheline, elle est dépourvue de signification.

**Note.** `ContexteApprenant`, précédemment stéréotypé `«value object»`, a été retiré du modèle avec le pivot F4 (cf. §13.6). La seule classe portant ce stéréotype est désormais `EmpreinteSHA256`.

**Conséquence.** `EmpreinteSHA256` se prête au patron *Embedded Value* (M. Fowler) : stockage dans les colonnes de la table propriétaire plutôt que dans une table dédiée.

---

## 8. Dépendances et navigabilité

**Choix retenu.** `VisiteurPublic ⇢ VerificationCertificat` est une *dépendance* ; `Reponse → Question` et `Reponse → Option` sont des associations orientées. Dans le package 6 (F4), `SuggestionQuestionIA → Question` est également une association orientée : une suggestion donne lieu à une question dans la banque, mais la question n'a pas besoin de connaître son origine IA.

**Justification.** Une dépendance UML exprime un usage ponctuel sans lien structurel ni clé étrangère, adapté à un acteur non persisté et à un instantané. La restriction de la *navigabilité* applique le principe de *faible couplage* (GRASP) : on n'expose que le sens d'accès utile.

**Conséquence.** Couplage minimisé, direction d'accès explicite pour chaque lien.

---

## 9. Attribution des méthodes aux classes

L'attribution applique le patron GRASP *Information Expert* : la responsabilité va à la classe détenant l'information nécessaire, complété par la *faible couplage* et la *forte cohésion*.

| Opération | Classe | Justification |
|---|---|---|
| `calculerScore(tentative)` | `QCM` | Détient les règles de scoring (pondérations, bonnes réponses, seuil). |
| `calculerScore()` / `estReussie()` | `TentativeQCM` | Détient les réponses ; déclenche le scoring en *déléguant* les règles au QCM. |
| `revoquer`, `estValide`, `verifierIntegrite`, `genererPDF` | `Certificat` | Agissent sur l'état et le contenu du certificat (F3, UC6). |
| `revoquerCertificat(c, m)` | `Administrateur` | La *décision* de révocation est une prérogative de l'acteur ; séparée de l'exécution (`Certificat.revoquer()`) — principe de responsabilité unique (*SRP*). |
| `corriger(livrable)` | `Formateur` | Seul le formateur corrige (F2, UC5). |
| `lancerGenerationIA(module)` | `Formateur` | Le formateur initie le lot de génération depuis sa formation (UC10) ; la méthode est sur le Formateur car c'est lui qui détient l'intention et le périmètre. |
| `lancer()` | `GenerationIA` | Le lot connaît ses propres paramètres (module, modèle, nb questions) ; *Information Expert*. |
| `accepter()` | `SuggestionQuestionIA` | Convertit la suggestion en `Question` dans la banque ; la suggestion détient toutes les données nécessaires à cette transformation. |
| `rejeter()` | `SuggestionQuestionIA` | Archive la suggestion avec statut `REJETEE` ; traçabilité du rejet pour amélioration future. |
| `calculerScoreTotal()` | `Correction` | Détient les notes par critère et la grille : expert de l'agrégation pondérée. |
| `validerPonderations()` | `GrilleNotation` | UC4 impose un total de 100 % ; la grille détient ses critères. |
| `soumettre`, `remplacer`, `verrouiller` | `Livrable` | Cycle de vie et verrouillage progressif (UC4). |
| `calculerAvancement()` | `Inscription` | Le taux d'avancement caractérise le lien apprenant↔formation. |
| `authentifier`, `activerCompte` | `User` | Comportements communs factorisés (*DRY*). |
| `getPermissions()` | `User` + sous-classes | Contrat commun, implémentations par rôle (polymorphisme, RBAC F5). |

---

## 10. Stéréotypes

Mécanisme d'extension de UML 2.5, nous en retenons cinq.

| Stéréotype | Classe(s) | Justification → Conséquence |
|---|---|---|
| `«abstract»` | `User` | Super-type non instanciable (§3.1) → polymorphisme via les sous-classes. |
| `«value object»` | `EmpreinteSHA256` | Objet sans identité propre (§7) → immuabilité, *Embedded Value*. |
| `«association class»` | `Inscription`, `NoteCritere` | Relations N–N enrichies (§6) → tables de liaison à colonnes supplémentaires. |
| `«immuable»` | `AuditLog` | Inaltérabilité requise (UC10 Admin, NF3) → aucune écriture après création. |
| `«non persisté»` | `VisiteurPublic` | Acteur anonyme (§3.2) → aucune table, lien par dépendance. |

---

## 11. Énumérations et cohérence avec les états-transitions

| Énumération | Valeurs | Diagramme d'états-transitions associé |
|---|---|---|
| `StatutCertificat` | EN_ATTENTE_GENERATION, EN_GENERATION, ACTIF, REVOQUE, EXPIRE | Cycle de vie du Certificat |
| `StatutTentative` | EN_COURS, SOUMISE, ABANDONNEE_TIMER, NOTEE | Cycle de vie de la TentativeQCM |
| `StatutLivrable` | BROUILLON, SOUMIS, EN_CORRECTION, NOTE | Cycle de vie du Livrable |
| `StatutCompte` | EN_ATTENTE_ACTIVATION, ACTIF, DESACTIVE, ANONYMISE | Cycle de vie du CompteUtilisateur |
| `StatutSuggestion` | PROPOSEE, ACCEPTEE, MODIFIEE, REJETEE | Cycle de vie de la SuggestionQuestionIA |
| `Role` | APPRENANT, FORMATEUR, ADMINISTRATEUR | RBAC (F5) |
| `TypeQuestion` | QCM, QCU, VRAI_FAUX, REPONSE_COURTE, ASSOCIATION | Typologies F1 — réutilisée par SuggestionQuestionIA |
| `MotifRevocation` | FRAUDE, ERREUR_ADMIN, DISCIPLINAIRE, JUDICIAIRE | Motifs imposés (UC6 Admin) |

Cette correspondance assure la cohérence transversale exigée par la norme : diagramme statique et diagrammes comportementaux décrivant le même objet ne divergent pas.

---

## 12. Justification des attributs, classe par classe

Les attributs d'identité et de libellé (`id` en UUID, `nom`, `titre`, `description`, dates de création) suivent une convention uniforme et ne sont pas redétaillés. Nous justifions ci-dessous les attributs porteurs d'un **choix de conception**.

### Utilisateurs & Sécurité

| Classe · attribut | Justification |
|---|---|
| `User.motDePasseHash` | Le mot de passe n'est **jamais** stocké en clair ; seul son haché *bcrypt* est conservé (F7), non réversible. |
| `User.role` | Sert de **colonne discriminante** pour la *Single Table Inheritance* et de socle au RBAC (F5). |
| `User.statut` | Porte le cycle de vie du compte (`StatutCompte`), dont l'état `ANONYMISE` répond à l'exigence RGPD. |
| `User.mfaActive` | Active l'authentification multi-facteurs, recommandée pour Formateur/Administrateur (F7). |
| `User.derniereConnexion` | Donnée de sécurité (détection d'inactivité, comptes dormants). |
| `Apprenant.matricule` | Identifiant institutionnel ESPRIT, distinct de l'`id` technique. |
| `Formateur.domaineExpertise` | Justifie l'affectation pédagogique aux formations pertinentes. |
| `SessionUtilisateur.adresseIP`, `userAgent` | Traçabilité et **détection des sessions multiples** (mesure anti-fraude F1, sécurité F7). |
| `SessionUtilisateur.dateExpiration` | Expiration automatique des sessions inactives. |
| `TokenJWT.type`, `revoque` | Distingue access/refresh et permet la **révocation** d'un jeton (liste de blocage, F7). |

### Formations & Pédagogie

| Classe · attribut | Justification |
|---|---|
| `Formation.noteMinCertification` | Seuil d'éligibilité à la certification (F3) ; pilote `estEligibleCertification()`. |
| `Formation.modeleCertificat` | Référence le gabarit PDF utilisé à l'émission. |
| `Formation.capaciteMax`, `statut` | Gestion des inscriptions et du cycle (Ouverte/Fermée/Archivée). |
| `Inscription.tauxAvancement` | Indicateur d'**analytics** (F6) et de détection de décrochage (F4). |
| `Inscription.dateEcheance`, `statut` | Pilotent les relances et l'état de l'inscription. |

### Évaluations QCM (F1)

| Classe · attribut | Justification |
|---|---|
| `Question.type` (`TypeQuestion`), `ponderation` | Déterminent le mode de correction et le poids dans le score. |
| `Question.explication` | Support du feedback pédagogique post-tentative. |
| `Option.estCorrecte` | Donnée sensible de correction : conservée côté serveur et **jamais transmise au client** (F1). |
| `ConfigurationAntiFraude.*` | Objet de configuration centralisant **toutes** les mesures anti-fraude F1 : `randomiserQuestions`/`randomiserOptions` (anti-copie), `dureeMaxMinutes` (timer serveur), `nbTentativesMax`/`delaiEntreTentatives` (limitation), `blocageSessionsMultiples`, `affichageResultats` (Immédiat/Différé), `scoreMinValidation`, `ponderationFormation`, `proctoringWebcam`, `desactiverCopierColler`. Regrouper ces paramètres dans une entité dédiée applique la *forte cohésion*. |
| `TentativeQCM.dureeEffective` | Mesure le temps réel, contrôlé par le timer serveur (anti-fraude). |
| `Reponse.estCorrecte`, `pointsObtenus` | Résultat du scoring serveur, figé à la soumission. |

### Ateliers Pratiques (F2)

| Classe · attribut | Justification |
|---|---|
| `Atelier.dateLimite`, `toleranceRetard` | Encadrent les soumissions et le traitement des retards (UC4). |
| `Atelier.typesLivrablesAcceptes`, `tailleMaxFichier`, `nbMaxFichiers` | Contraintes de dépôt, validées côté serveur. |
| `GrilleNotation.estModele` | Marque une grille **réutilisable** ; fonde l'agrégation `Atelier ◇— GrilleNotation` (§5.3). |
| `Critere.ponderation` | Poids du critère ; la somme doit valoir 100 % (`validerPonderations()`). |
| `NiveauPerformance.plagePointsMin/Max`, `descripteur` | Barème transparent et auditable d'évaluation. |
| `Livrable.hashTracabilite` | Empreinte du dépôt à des fins d'**intégrité et d'anti-plagiat** (preuve d'antériorité). |
| `Livrable.version` | Gère le **remplacement** d'un livrable avant la date limite (`remplacer()`). |
| `Livrable.liensExternes` | Supporte les livrables hébergés hors plateforme (dépôts Git, démos). |
| `FichierLivrable.typeMime`, `taille`, `cheminStockage` | Validation du dépôt et localisation du stockage. |
| `Correction.scoreTotal`, `statut` | Score agrégé et état (Brouillon/Terminée). |
| `Feedback.fichiersAnnotes`, `commentaireGeneral` | Retour qualitatif complétant la note (UC6 Formateur). |

### Certification (F3)

| Classe · attribut | Justification |
|---|---|
| `Certificat.organismeEmetteur` | Porte la **signature institutionnelle** (ESPRIT) ; remplace toute relation à un formateur signataire (§13.1). |
| `Certificat.urlVerification` | URL publique de vérification, encodée dans le QR code (réponse à la lacune G3). |
| `Certificat.nbConsultationsPubliques` | Compteur **dénormalisé** pour les performances de la page publique et du tableau de bord admin (§13.4). |
| `Certificat.cheminPdf` | Localisation du PDF généré de façon asynchrone (§13.3). |
| `Certificat.scoreFinal`, `mention`, `dateExpiration` | Contenu officiel et validité temporelle du certificat. |
| `EmpreinteSHA256.valeurHash`, `algorithme`, `dateCalcul` | Trace cryptographique d'intégrité (F3) ; `algorithme` documente la fonction utilisée pour l'auditabilité. |
| `Revocation.motif` (`MotifRevocation`), `piecesJointes` | Motif normalisé et justificatifs de la décision (UC6 Admin). |
| `VerificationCertificat.adresseIP`, `resultat`, `dateVerification` | Journalisation à des fins d'audit et d'anti-abus (*rate limiting*), en respectant la **minimisation des données** (RGPD). |

### Assistance IA aux Formateurs (F4)

| Classe · attribut | Justification |
|---|---|
| `SupportPedagogique.statut` | Trois états (EnIndexation / Indexé / Erreur) matérialisent le pipeline asynchrone (Bull/Redis) : l'indexation vectorielle est une opération *CPU-bound* qui ne peut pas bloquer l'*event loop*. Même pipeline que la génération des certificats PDF (§13.3). |
| `SupportPedagogique.typeFichier` | Contrôle des formats ingérés par le RAG (PDF, PPTX, TXT, MD) ; valeur libre pour ne pas contraindre les évolutions futures. |
| `GenerationIA.modeleUtilise` | Traçabilité du LLM ayant produit le lot ; permet de comparer la qualité selon le modèle et de reproduire une génération. |
| `GenerationIA.focusThematique` | Paramètre optionnel permettant au formateur de restreindre la génération à un sous-thème précis (ex. « uniquement la partie sécurité JWT »), améliorant la pertinence des suggestions. |
| `GenerationIA.statut` | Suivi du traitement asynchrone (EnCours / Terminée / Échouée). |
| `SuggestionQuestionIA.scoreConfianceIA` | Score fourni par le LLM exprimant son degré de certitude sur la suggestion. Affiché au formateur à titre indicatif, il oriente la révision (les suggestions à faible score méritent plus d'attention). |
| `SuggestionQuestionIA.statut` (`StatutSuggestion`) | Les quatre états (PROPOSEE → ACCEPTEE / MODIFIEE / REJETEE) tracent la décision du formateur pour chaque suggestion, ce qui permet l'analyse des taux d'acceptation par modèle ou par module. |
| `AlerteDecrochage.typeRisque`, `donneesFactuelles`, `suggestionAction` | L'alerte s'appuie sur des **faits** (et non un jugement) et propose une action, conformément à une IA d'aide à la décision. |
| `AlerteDecrochage.statut` | Suivi du traitement (Nouvelle/Traitée) par le formateur. |

### Transverse (F6/F7)

| Classe · attribut | Justification |
|---|---|
| `AuditLog.action`, `cible`, `adresseIP`, `resultat` | Imputabilité complète des actions sensibles ; entité immuable (NF3). |
| `AuditLog.detailsAvantApres` | Conserve le différentiel d'un changement pour la traçabilité. |
| `Notification.canal`, `type`, `lue` | Multicanal (InApp/Email), typage et suivi de lecture. |

---

## 13. Décisions de conception notables

### 13.1 Signature institutionnelle du certificat

**Décision.** Le certificat est signé par l'**institution** (ESPRIT), et non nominativement par un formateur. La signature est portée par l'attribut `Certificat.organismeEmetteur` ; aucune association `Formateur — Certificat` n'existe.

**Justification.** La valeur d'un certificat certifiant repose sur l'autorité de l'organisme émetteur, non sur une personne. Lier le certificat à un formateur introduirait une dépendance fragile (départ du formateur, réaffectation) et une ambiguïté de responsabilité. Modéliser l'émetteur comme une donnée institutionnelle reflète fidèlement le processus et préserve l'immuabilité du document.

**Conséquence.** Le modèle est simplifié (une association supprimée) et le certificat demeure valable indépendamment du cycle de vie des comptes formateurs.

### 13.2 Immuabilité du certificat et du journal d'audit

**Décision.** Un certificat émis et une entrée d'audit ne sont jamais modifiés ni supprimés.

**Justification.** Exigence NF3 et UC6/UC10 Admin. Toute correction d'un certificat passe par une **révocation suivie d'une réémission**, la trace cryptographique étant conservée. L'`AuditLog` est stéréotypé `«immuable»`.

**Conséquence.** Garantie de conformité et d'auditabilité ; opérations d'écriture restreintes au niveau applicatif.

### 13.3 Génération asynchrone du certificat

**Décision.** La génération du PDF, le calcul du SHA-256 et du QR code sont déportés dans une **file de tâches** (*Bull*/*Redis*), hors du cycle requête/réponse.

**Justification.** Conformément à notre note technique, ces traitements sont *CPU-bound* et bloqueraient l'*event loop* de Node.js. L'état `EN_GENERATION` de `StatutCertificat` matérialise cette phase asynchrone.

**Conséquence.** Réactivité préservée du serveur ; l'apprenant est notifié à la fin du traitement.

### 13.4 Dénormalisation maîtrisée du compteur de consultations

**Décision.** `Certificat.nbConsultationsPubliques` duplique une information dérivable du dénombrement des `VerificationCertificat`.

**Justification.** Il s'agit d'une *dénormalisation* assumée : la page publique de vérification et le tableau de bord administrateur consultent fréquemment ce compteur, dont le recalcul à la volée serait coûteux. Le compromis intégrité/performance est tranché en faveur de la performance, l'écart éventuel restant sans incidence métier.

**Conséquence.** Lecture immédiate du compteur ; mise à jour incrémentale à chaque vérification.

### 13.5 Logique d'évaluation côté serveur

**Décision.** Le scoring, le timer, la randomisation et le blocage des sessions multiples sont gérés exclusivement côté serveur.

**Justification.** Mesure anti-fraude centrale du besoin F1 : toute logique côté client serait contournable. Les bonnes réponses (`Option.estCorrecte`) ne sont jamais transmises au navigateur.

**Conséquence.** Intégrité des évaluations garantie ; l'historique des tentatives est immuable.

### 13.6 Pivot F4 : chatbot étudiant → assistance IA aux formateurs

**Décision.** La fonctionnalité IA (F4) a été recentrée : les entités du chatbot conversationnel étudiant (`ConversationChatbot`, `MessageChatbot`, `ContexteApprenant`) ont été retirées du modèle et remplacées par les entités de génération de questions assistée par IA (`SupportPedagogique`, `GenerationIA`, `SuggestionQuestionIA`).

**Justification.** La version initiale (chatbot étudiant) reposait sur une API LLM hébergée et un flux temps réel par message. Pour une plateforme à destination de milliers d'étudiants, ce modèle implique un coût proportionnel au volume d'utilisateurs sans plafond. La version retenue (génération de questions côté formateur) est **asynchrone et bornée** : le LLM est appelé occasionnellement, pour un périmètre défini (un module, un lot de N questions), par des dizaines de formateurs et non des milliers d'étudiants. Le coût est structurellement maîtrisable.

Par ailleurs, la valeur métier est plus immédiate : la rédaction de QCM de qualité (notamment les distracteurs) est une tâche longue et fastidieuse. Un assistant qui génère des propositions ancrées dans les vrais supports de cours (RAG sur `SupportPedagogique`) et soumises à la validation humaine obligatoire crée une valeur concrète et défendable.

**Principe « humain dans la boucle ».** Aucune suggestion IA n'est publiée automatiquement : la méthode `accepter()` de `SuggestionQuestionIA` requiert une action explicite du formateur. Ce choix est non seulement une garantie de qualité pédagogique mais aussi une réponse aux exigences éthiques de responsabilité humaine sur les contenus d'évaluation certifiante.

**Conséquence.** Trois entités retirées (`ConversationChatbot`, `MessageChatbot`, `ContexteApprenant`), trois ajoutées (`SupportPedagogique`, `GenerationIA`, `SuggestionQuestionIA`), une énumération ajoutée (`StatutSuggestion`). Le package 6 est renommé « Assistance IA aux Formateurs ». `AlerteDecrochage` est conservé dans ce package.

---

## 14. Évolution par rapport à la liste initiale d'entités

| Modification | Entité | Justification |
|---|---|---|
| Ajout | `VerificationCertificat` | Journalisation des consultations publiques (UC2/UC3 Visiteur) et comptage exposé à l'administrateur (UC5 Admin). |
| Ajout | `NoteCritere` | Classe d'association requise pour porter la note et le commentaire par critère (UC5 Formateur). |
| Ajout | `SupportPedagogique` | Source RAG de la génération IA ; sans elle, le LLM génère hors contexte (§13.6). |
| Ajout | `GenerationIA` | Lot de génération traçable (formateur, module, modèle, paramètres) ; analogie avec `TentativeQCM` pour les QCM (§13.6). |
| Ajout | `SuggestionQuestionIA` | Entité dédiée portant le statut de validation humaine (`StatutSuggestion`) et la méthode `accepter()` (§13.6). |
| Suppression | `ConversationChatbot`, `MessageChatbot`, `ContexteApprenant` | Pivot F4 : chatbot étudiant → assistance IA formateur (§13.6). |
| Suppression | relation `Formateur — Certificat` | Signature institutionnelle (§13.1) ; remplacée par l'attribut `organismeEmetteur`. |
| Conservation | `VisiteurPublic` | Maintenu comme classe-acteur `«non persisté»` pour matérialiser le périmètre de sécurité publique. |
| Conservation | `AlerteDecrochage` | Conservé dans le package 6 ; la détection de décrochage reste côté formateur. |
| Conservation | `SessionUtilisateur`, `TokenJWT`, `AuditLog`, `Notification` | Entités transverses justifiées par F6 et F7. |

La règle appliquée relève de la *traçabilité des exigences* : une entité ou une relation n'est retenue que si une exigence ou un cas d'utilisation la motive.

---

## 15. Matrice de traçabilité entités ↔ besoins fonctionnels

| Besoin (CdC) | Intitulé | Entités du Domain Model |
|---|---|---|
| F1 | Moteur QCM anti-fraude | QCM, Question, Option, BanqueQuestions, ConfigurationAntiFraude, TentativeQCM, Reponse |
| F2 | Ateliers pratiques évalués | Atelier, GrilleNotation, Critere, NiveauPerformance, Livrable, FichierLivrable, Correction, NoteCritere, Feedback |
| F3 | Certification numérique vérifiable | Certificat, EmpreinteSHA256, Revocation, VerificationCertificat |
| F4 | Assistance IA aux Formateurs | SupportPedagogique, GenerationIA, SuggestionQuestionIA, AlerteDecrochage |
| F5 | Gestion multi-rôles (RBAC) | User, Apprenant, Formateur, Administrateur, VisiteurPublic, Role |
| F6 | Analytics et reporting | Inscription, AuditLog, Notification |
| F7 | Sécurité et conformité | SessionUtilisateur, TokenJWT, AuditLog, EmpreinteSHA256, StatutCompte |
| Transverse | Structure pédagogique | Formation, Module, Inscription |

---

## 16. Synthèse des principes et patrons appliqués

| Principe / Patron | Source | Application |
|---|---|---|
| Séparation des préoccupations | E. Dijkstra ; M. Fowler | Domain Model exempt de couche technique (§2.1) |
| Langage ubiquitaire | DDD, E. Evans | Vocabulaire unique entre artefacts (§2.2) |
| Dissimulation d'information / encapsulation | D. Parnas | Attributs privés, comportement exposé (§2.3) |
| Forte cohésion | GRASP, C. Larman | Packages fonctionnels, `ConfigurationAntiFraude` (§2.5, §12) |
| DRY | Hunt & Thomas | Factorisation dans `User` (§3.1) |
| Généralisation et polymorphisme | UML 2.5 | Hiérarchie `User`, `getPermissions()` (§3.1) |
| Substitution de Liskov (LSP) | B. Liskov | Interchangeabilité des rôles ; exclusion du visiteur (§3) |
| Évitement de la généralité spéculative | M. Fowler | Pas de super-classe QCM/Atelier (§3.3) |
| Sémantique composition/agrégation | UML 2.5 | Distinction des relations tout/partie (§5) |
| Intégrité référentielle ; dénormalisation maîtrisée | E. F. Codd | Cascade, tables de liaison, compteur de consultations (§5.4, §13.4) |
| Entité vs objet-valeur ; Embedded Value | DDD ; M. Fowler | `EmpreinteSHA256` (§7) |
| Information Expert ; faible couplage | GRASP, C. Larman | Attribution des méthodes, navigabilité (§8, §9) |
| Responsabilité unique (SRP) | R. C. Martin | Séparation décision/exécution de la révocation (§9) |
| Traitement asynchrone | Architecture Node.js | Génération de certificat + indexation RAG par file de tâches (§13.3, §13.6) |
| Humain dans la boucle | IA responsable | Validation obligatoire du formateur sur chaque suggestion IA (§13.6) |
| Traçabilité des exigences | Ingénierie des besoins | Matrice de couverture F1–F7 (§14, §15) |

---

*Fin du dossier de conception du diagramme de classes · Cert_EET v3.2*
