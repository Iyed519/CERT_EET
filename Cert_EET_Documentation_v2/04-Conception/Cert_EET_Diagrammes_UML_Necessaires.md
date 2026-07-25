# Cert_EET — Diagrammes UML Nécessaires pour le Projet

> Document de planification des livrables UML pour le PFE
> Version 2.0 · Juin 2026 · Iyed Omri · PFE ESPRIT Ingénierie Logicielle

---

## Table des matières

1. [Vue d'ensemble — Les 13 diagrammes UML 2.5](#vue-densemble)
2. [Tableau de priorité pour le PFE Cert_EET](#tableau-de-priorité)
3. [Détail des 7 diagrammes recommandés](#détail-des-diagrammes)
4. [Planning suggéré](#planning-suggéré)
5. [Conseils pour la soutenance](#conseils-pour-la-soutenance)
6. [Recommandation finale d'ordre de production](#recommandation-finale)

---

## Vue d'ensemble

UML 2.5 définit **13 types de diagrammes**, répartis en deux grandes catégories :

### Diagrammes structurels (statiques)
Décrivent l'architecture, les composants, les classes — ce qui **ne change pas** dans le temps.

- Diagramme de classes
- Diagramme d'objets
- Diagramme de composants
- Diagramme de déploiement
- Diagramme de packages
- Diagramme de structure composite
- Diagramme de profils

### Diagrammes comportementaux (dynamiques)
Décrivent les interactions, les flux, les changements d'état — ce qui **évolue** dans le temps.

- Diagramme de cas d'utilisation ✅
- Diagramme d'activité
- Diagramme de séquence
- Diagramme de communication
- Diagramme d'états-transitions
- Diagramme de vue d'ensemble des interactions
- Diagramme de timing

**Important** : aucun PFE n'utilise les 13 diagrammes. Le tableau ci-dessous identifie ceux qui sont **réellement nécessaires** pour Cert_EET.

---

## Tableau de priorité

| Priorité | Diagramme | Pourquoi en avoir besoin | Quand le faire |
|---|---|---|---|
| 🔴 **Indispensable** | **Cas d'utilisation** | Modéliser les fonctionnalités vues par les acteurs | ✅ FAIT (Étape 2) |
| 🔴 **Indispensable** | **Classes (Domain Model)** | Modéliser les entités métier — base de l'architecture | Avant le code |
| 🔴 **Indispensable** | **Séquence** | Modéliser les scénarios critiques (passer un QCM, émettre un certificat) | Avant le code |
| 🟠 **Fortement recommandé** | **Activité** | Modéliser les workflows (correction, révocation) | Avant le code |
| 🟠 **Fortement recommandé** | **États-transitions** | Modéliser le cycle de vie des objets clés (Certificat, TentativeQCM) | Avant le code |
| 🟠 **Fortement recommandé** | **Déploiement** | Modéliser l'infrastructure (NestJS, PostgreSQL, Redis, Bull) | Après architecture |
| 🟡 **Recommandé (optionnel)** | **Composants** | Modéliser les modules NestJS et leurs dépendances | Si temps disponible |
| 🟡 **Recommandé (optionnel)** | **Packages** | Vue d'organisation du code (structure dossiers) | Si temps disponible |
| ⚪ **Pas nécessaire** | Objets, Communication, Timing, Profils, Structure composite, Vue d'ensemble des interactions | Pas pertinents pour ce type de projet | À éviter |

---

## Détail des diagrammes

### 🔴 1. Diagramme de classes (Domain Model) — INDISPENSABLE

**Objectif** : C'est le **squelette de votre application**. Il modélise toutes les entités métier (utilisateurs, certificats, QCM, tentatives, livrables...) avec leurs attributs, méthodes et relations.

**Classes à modéliser pour Cert_EET** (environ 20-30 au total) :

#### Utilisateurs et rôles
- `User` (classe abstraite)
- `Apprenant` (hérite de User)
- `Formateur` (hérite de User)
- `Administrateur` (hérite de User)
- `VisiteurPublic` (non persisté — acteur uniquement)

#### Formation et structure pédagogique
- `Formation`
- `Module`
- `Inscription` (table de liaison apprenant ↔ formation)

#### Module QCM (F1)
- `QCM`
- `Question`
- `Option` (choix de réponse)
- `BanqueQuestions`
- `ConfigurationAntiFraude`
- `TentativeQCM`
- `Reponse` (réponse d'un apprenant à une question)

#### Module Ateliers (F2)
- `Atelier`
- `GrilleNotation`
- `Critere` (d'une grille)
- `NiveauPerformance`
- `Livrable`
- `FichierLivrable`
- `Correction`
- `Feedback`

#### Module Certification (F3)
- `Certificat`
- `Revocation`
- `EmpreinteSHA256`

#### Module Assistance IA aux Formateurs (F4)
- `SupportPedagogique` (document de cours indexé pour le RAG)
- `GenerationIA` (lot de génération : module source, paramètres, modèle LLM)
- `SuggestionQuestionIA` (question candidate, statut de validation)
- `AlerteDecrochage`

#### Transverse
- `AuditLog`
- `Notification`
- `SessionUtilisateur`
- `TokenJWT`

**Comment c'est utilisé** : ce diagramme devient directement vos **entités TypeORM/Prisma** dans NestJS et vos **tables PostgreSQL**. Chaque relation `1-N`, `N-N` ou héritage doit être traduisible en schéma de base.

**Effort estimé** : 1 à 2 jours.

---

### 🔴 2. Diagramme de séquence — INDISPENSABLE

**Objectif** : montrer **l'ordre exact des interactions** entre objets pour un scénario donné — qui appelle qui, dans quel ordre, avec quels messages.

**Scénarios critiques à modéliser** (5 à 8 diagrammes) :

| # | Scénario | Pourquoi c'est critique |
|---|---|---|
| 1 | **Passer un QCM** (de l'ouverture à la soumission) | Cœur de l'évaluation, complexe (timer serveur, anti-fraude, randomisation) |
| 2 | **Émettre un certificat** | Workflow asynchrone avec file Bull (cf. note technique) |
| 3 | **Vérifier un certificat publiquement** (Visiteur scanne QR) | Démontre la chaîne cryptographique et la lacune G3 du benchmark |
| 4 | **Soumettre + Corriger un livrable** | Interaction Apprenant ↔ Formateur asynchrone |
| 5 | **Générer des questions QCM avec l'IA** (du choix du module à la validation des suggestions) | Démontre le pipeline RAG : upload support → indexation → génération LLM → révision formateur → ajout banque |
| 6 | **Authentification + MFA** | Sécurité (justifie F7 du CdC) |
| 7 | **Révoquer un certificat** | Action irréversible avec audit |
| 8 | **Détection de décrochage et alerte formateur** (pas pour ce stage — peut-être après le lancement) | Analyse automatique des patterns d'activité → génération alerte → notification formateur |

**Acteurs/objets à inclure dans les diagrammes** :
- Acteurs humains (Apprenant, Formateur, Administrateur, Visiteur)
- Contrôleurs NestJS (`QCMController`, `CertificatController`, etc.)
- Services (`QCMService`, `CertificatService`, `LLMService`...)
- Repositories (accès BDD)
- Systèmes externes (API LLM, Service SMTP, Bull queue, Redis)

**Comment c'est utilisé** : ces diagrammes guident directement l'écriture de vos **services NestJS** et la définition des **endpoints REST**.

**Effort estimé** : 2 à 3 jours.

---

### 🟠 3. Diagramme d'activité — FORTEMENT RECOMMANDÉ

**Objectif** : modéliser des **workflows métier** avec branches conditionnelles, parallélisme et points de décision.

**Workflows à modéliser** (3 à 4 diagrammes) :

| # | Workflow | Pourquoi |
|---|---|---|
| 1 | **Cycle complet de certification** (inscription → modules → évaluations → certificat) | Vue d'ensemble du parcours apprenant |
| 2 | **Correction d'un atelier** (avec branches : note suffisante / insuffisante, certificat émis ou non) | Logique métier complexe avec décisions |
| 3 | **Génération de questions QCM par IA** (upload support → indexation → paramétrage → génération → révision formateur → ajout banque) | Démontre le pipeline RAG et le principe « humain dans la boucle » |
| 4 | **Génération PDF asynchrone** (file Bull, retry policy, fallback en cas d'échec) | Aligne avec votre note synchrone/asynchrone |

**Différence importante avec le diagramme de séquence** :
- **Séquence** = "qui parle à qui, dans quel ordre"
- **Activité** = "quelles étapes s'enchaînent et avec quelles conditions"

**Éléments à utiliser** :
- Nœuds d'action (rectangles arrondis)
- Nœuds de décision (losanges) pour les branches if/else
- Barres de synchronisation pour le parallélisme (fork/join)
- Couloirs (swimlanes) pour montrer qui fait quoi (Apprenant / Système / Formateur)

**Effort estimé** : 1 à 2 jours.

---

### 🟠 4. Diagramme d'états-transitions — FORTEMENT RECOMMANDÉ

**Objectif** : modéliser le **cycle de vie** d'un objet qui passe par plusieurs états avec des transitions déclenchées par des événements.

**Objets à modéliser** (3 à 4 diagrammes) :

#### 4.1 Cycle de vie d'un **Certificat**
```
[État initial]
    ↓ (validation des conditions de réussite)
EnAttenteGeneration
    ↓ (job Bull traité)
EnGeneration
    ↓ (PDF généré + SHA-256 calculé)
Actif
    ↓ (révocation par admin)         ↓ (date d'expiration atteinte)
Revoqué                              Expiré
    ↓ (jamais)                        ↓ (jamais)
[Final]                              [Final]
```

#### 4.2 Cycle de vie d'une **TentativeQCM**
```
EnCours (timer démarré côté serveur)
    ↓ (soumission manuelle)    ↓ (timer expiré)    ↓ (déconnexion + reprise)
Soumise                        AbandonnéeTimer     EnCours (reprise)
    ↓ (scoring auto)
Notee
    ↓ (jamais)
[Final - immuable]
```

#### 4.3 Cycle de vie d'un **Livrable** (verrouillage progressif)
```
Brouillon
    ↓ (apprenant soumet)
Soumis
    ↓ (apprenant remplace avant deadline)    ↓ (formateur ouvre la correction)
Soumis (nouvelle version)                    EnCorrection
                                                  ↓ (formateur envoie feedback)
                                              Noté
                                                  ↓ (jamais)
                                              [Final - immuable]
```

#### 4.4 Cycle de vie d'un **CompteUtilisateur**
```
EnAttenteActivation (email envoyé)
    ↓ (clic sur lien activation + mot de passe défini)
Actif
    ↓ (admin désactive)              ↓ (admin supprime avec données)
Désactivé                            Anonymisé
    ↓ (admin réactive)                ↓ (jamais)
Actif                                [Final]
```

**Pourquoi ces 4 diagrammes** : ils sont simples mais **très valorisés** par un jury car ils prouvent que vous avez réfléchi aux transitions d'état **avant de coder**. Ils correspondent aussi aux contraintes d'immuabilité et de verrouillage progressif décrites dans vos `.md` descriptifs.

**Effort estimé** : 1 jour.

---

### 🟠 5. Diagramme de déploiement — FORTEMENT RECOMMANDÉ

**Objectif** : représenter **l'infrastructure physique** sur laquelle s'exécute votre application — serveurs, conteneurs, bases de données, services externes.

**Éléments à modéliser** (un seul diagramme global) :

#### Côté client
- **Navigateur web** (Chrome, Firefox, Safari, Edge)
- **Smartphone** (pour le scan QR code par le Visiteur Public)

#### Couche présentation
- **Frontend SPA** (React / Angular / Vue selon votre choix)
- Servi via CDN ou Nginx

#### Couche API
- **API Gateway NestJS** (cluster Node.js, plusieurs instances pour scalabilité)
- Endpoints REST + WebSocket / SSE (pour notifications IA et alertes temps réel)

#### Couche données
- **PostgreSQL** (base principale — utilisateurs, formations, certificats, audit)
- **Redis** (cache + queue Bull — cf. note synchrone/asynchrone)

#### Workers asynchrones
- **Worker Bull** (génération PDF, envoi emails, analyse LLM)

#### Stockage
- **MinIO ou S3** (stockage des PDFs de certificats et fichiers de livrables)

#### Services externes
- **API LLM** (OpenAI GPT-4o / Anthropic Claude / Mistral — swappable)
- **Service SMTP** (envoi d'emails)
- **Service MFA** (authentification multi-facteurs — F7)

#### Protocoles entre nœuds
- HTTPS partout (TLS)
- WebSocket (SSE pour les notifications IA et alertes)
- Connexions PostgreSQL et Redis chiffrées

**Pourquoi ce diagramme est important** : c'est celui que vous montrez au jury pour **justifier vos choix d'architecture** et les exigences non-fonctionnelles (NF1 performance, NF2 sécurité, NF3 audit, NF4 disponibilité).

**Effort estimé** : 0.5 jour.

---

### 🟡 6. Diagramme de composants — RECOMMANDÉ (optionnel)

**Objectif** : modéliser les **modules logiciels** et leurs interfaces (ports, dépendances entre composants).

**Modules NestJS à représenter pour Cert_EET** :

#### Modules métier
- `AuthModule` (JWT + MFA)
- `UsersModule` (gestion comptes, RBAC)
- `FormationsModule`
- `QCMModule`
- `AteliersModule`
- `CertificatsModule`
- `AssistanceIAModule` (génération QCM, RAG, alertes décrochage)
- `NotificationsModule`
- `AuditModule`

#### Modules d'infrastructure
- `LLMAdapterModule` (interface swappable GPT/Claude/Mistral)
- `EmailAdapterModule` (SMTP)
- `StorageAdapterModule` (S3/MinIO)
- `QueueAdapterModule` (Bull/Redis)

#### Modules transverses
- `LoggerModule`
- `ConfigModule`
- `DatabaseModule`

**Représenter** : les interfaces (`<<provided>>`, `<<required>>`), les dépendances entre modules, et le composant `<<external>>` pour les services hors NestJS.

**Quand le faire** : si votre diagramme de déploiement est déjà très détaillé, ce diagramme devient redondant. **Priorisez les autres diagrammes**, faites celui-ci en dernier si vous avez le temps.

**Effort estimé** : 0.5 jour.

---

### 🟡 7. Diagramme de packages — RECOMMANDÉ (optionnel)

**Objectif** : organiser la **structure de votre code source** en packages avec leurs dépendances.

**Pour Cert_EET (basé sur NestJS)**, ça reflète votre organisation `src/` :

```
src/
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   ├── guards/
│   │   └── strategies/
│   ├── qcm/
│   ├── ateliers/
│   ├── certificats/
│   ├── assistance-ia/
│   ├── notifications/
│   └── audit/
├── shared/
│   ├── dto/
│   ├── entities/
│   ├── interfaces/
│   └── enums/
├── common/
│   ├── filters/        (gestion d'erreurs globales)
│   ├── interceptors/   (logging, transformation)
│   ├── pipes/          (validation)
│   └── decorators/
├── config/
│   └── configuration.ts
└── main.ts
```

**Caractère** : c'est un diagramme **de documentation** plutôt que de conception. Il aide le jury et les futurs développeurs à se repérer dans le repo.

**Quand le faire** : en dernier, ou pas du tout si votre repo Git est déjà bien organisé et documenté dans le README.

**Effort estimé** : 0.5 jour.

---

## Planning suggéré

Ordre chronologique recommandé pour produire l'ensemble des diagrammes :

| Phase | Diagrammes | Effort estimé | Cumul |
|---|---|---|---|
| **1. Spécification** | ✅ Cas d'utilisation (fait) | — | — |
| **2. Conception statique** | Classes (Domain Model) | 1-2 jours | 2 j |
| **3. Conception dynamique** | Séquence (5-8 scénarios) | 2-3 jours | 5 j |
| **3. Conception dynamique** | Activité (3-4 workflows) | 1-2 jours | 7 j |
| **3. Conception dynamique** | États-transitions (4 objets clés) | 1 jour | 8 j |
| **4. Architecture** | Déploiement | 0.5 jour | 8.5 j |
| **4. Architecture** | Composants (optionnel) | 0.5 jour | 9 j |
| **5. Documentation** | Packages (optionnel) | 0.5 jour | 9.5 j |

**Total estimé** : 7 à 10 jours pour produire l'ensemble des diagrammes nécessaires.

---

## Conseils pour la soutenance

Trois pièges classiques à éviter lors de la soutenance PFE :

### 1. Ne pas faire trop de diagrammes
Un jury préfère 7 diagrammes pertinents et bien construits que 13 diagrammes superficiels. **La qualité compte plus que la quantité**. Mieux vaut un diagramme de classes complet avec 25 entités bien reliées qu'un diagramme de classes avec 50 entités mal articulées.

### 2. Faire correspondre les diagrammes au code
Chaque classe du diagramme de classes doit exister dans le code, chaque service appelé dans le diagramme de séquence doit avoir sa méthode dans le code NestJS. **Un jury technique vérifie cette cohérence** en demandant : "où est cette classe dans votre code ?" ou "à quel endpoint correspond cette interaction ?".

### 3. Justifier chaque diagramme dans le rapport
Ne mettez jamais un diagramme sans paragraphe d'introduction qui explique :
- **Pourquoi** vous l'avez fait (quelle question il répond)
- **Ce qu'il apporte** à la compréhension du système
- **Quels choix de conception** il illustre

Exemple de bonne introduction :
> *"La figure 5.3 présente le diagramme d'états-transitions du certificat. Ce diagramme illustre l'immuabilité institutionnelle du certificat : une fois émis, il ne peut être ni modifié ni supprimé — seule une révocation est possible, et celle-ci préserve la trace cryptographique pour garantir l'auditabilité (cf. NF3 du cahier des charges)."*

### Bonus : règles de cohérence transversale
- Les acteurs des cas d'utilisation doivent apparaître dans au moins un diagramme de séquence
- Les classes du Domain Model doivent apparaître dans les diagrammes de séquence en tant qu'instances
- Les états des diagrammes d'états-transitions doivent correspondre à un attribut `statut` dans le Domain Model
- Les services dans les composants doivent correspondre aux modules du diagramme de déploiement

---

## Recommandation finale

Pour avancer méthodiquement, voici l'**ordre logique** de production :

1. ✅ **Cas d'utilisation** —
2. 🔜 **Vue globale consolidée des UC** (Étape 1) — pour clôturer le chapitre cas d'utilisation
3. 🎯 **Diagramme de classes (Domain Model)** — c'est le prochain gros morceau
4. 🎯 **Diagrammes de séquence** sur les 5-7 scénarios critiques
5. **États-transitions** pour `Certificat`, `TentativeQCM`, `Livrable`, `CompteUtilisateur`
6. **Activité** pour les workflows complexes (correction, génération PDF asynchrone)
7. **Déploiement** pour l'architecture finale
8. **Composants** (optionnel)
9. **Packages** (optionnel)

---

## Tableau de synthèse final

| # | Diagramme | Type | Quantité estimée | Priorité | Statut |
|---|---|---|---|---|---|
| 1 | Cas d'utilisation | Comportemental | 4-5 diagrammes (par acteur) + 1 global | 🔴 Indispensable | ✅ FAIT |
| 2 | Classes (Domain Model) | Structurel | 1 diagramme global (~36 classes) | 🔴 Indispensable | ✅ FAIT |
| 3 | Séquence | Comportemental | 5 à 8 diagrammes | 🔴 Indispensable | ⏳ À faire |
| 4 | Activité | Comportemental | 3 à 4 diagrammes | 🟠 Fortement recommandé | ⏳ À faire |
| 5 | États-transitions | Comportemental | 3 à 4 diagrammes | 🟠 Fortement recommandé | ⏳ À faire |
| 6 | Déploiement | Structurel | 1 diagramme global | 🟠 Fortement recommandé | ⏳ À faire |
| 7 | Composants | Structurel | 1 diagramme global | 🟡 Recommandé (optionnel) | ⏳ À faire |
| 8 | Packages | Structurel | 1 diagramme global | 🟡 Recommandé (optionnel) | ⏳ À faire |

**Total final** : entre 15 et 22 diagrammes UML pour le rapport PFE complet.

---

*Fin du document — Planning des diagrammes UML pour Cert_EET v2.0*
