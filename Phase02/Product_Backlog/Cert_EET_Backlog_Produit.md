# Cert_EET — Backlog Produit

> **Projet :** Cert_EET — Plateforme de Certification et de Micro-Certification Digitale
> **Cadre :** PFE Ingénierie Logicielle — ESPRIT · Iyed Omri
> **Méthode :** Agile Scrum · sprints de 2 semaines · 12 sprints (24 avr. → 24 oct. 2026)
> **Version du document :** 1.0 (en cours — épopées E0 et E1)

---

## A. Conventions du backlog

**Sources (seule vérité) :** Cahier des Charges v4 (F1–F7, NF1–NF9) · ADR-01 à ADR-10 · 4 diagrammes de cas d'utilisation + vue globale · 16 diagrammes de séquence (DS-01 à DS-16) · diagrammes d'activité/états · notes techniques (auth/sécurité, synchrone/asynchrone, RAG) · planning Gantt (12 sprints) · glossaire technique.

**Identifiants :** épopées `E0`–`E8` · stories `US-[DOMAINE]-NN` (ex. `US-AUTH-03`, `US-INFRA-05`).

**Priorisation MoSCoW :** *Must* (indispensable / P0 ou prérequis bloquant) · *Should* (forte valeur) · *Could* (utile, reportable) · *Won't* (hors périmètre de cette version).

**Estimation :** suite de Fibonacci (1, 2, 3, 5, 8, 13).

**Traçabilité :** chaque story est reliée à au moins une exigence F/NF, à un UC et/ou un DS quand applicable, et à l'ADR pertinent. Les stories purement techniques (E0) sont tracées vers les **ADR + exigences NF** (pas de UC fonctionnel).

**Qualité :** chaque story respecte INVEST (Indépendante, Négociable, à Valeur, Estimable, Petite, Testable). Critères d'acceptation au format **Gherkin français** (Étant donné… / Quand… / Alors…), avec au moins un chemin nominal et un chemin alternatif/erreur issu des branches d'erreur des DS.

> *Les livrables transverses — Definition of Ready / Definition of Done, matrice de traçabilité synthétique, récapitulatif chiffré et hypothèses & questions ouvertes — figureront en fin de document une fois toutes les épopées rédigées.*

---

## E0 Épopée — Socle & Infrastructure

- **Besoins couverts (F / NF) :** Aucune fonctionnalité F directe — épopée d'habilitation. Sert NF5 (scalabilité), NF6 (maintenabilité/tests), NF8 (interopérabilité / API documentée), NF9 (portabilité / environnements reproductibles), et conditionne NF1/NF2/NF3. ADR de référence : ADR-02 (NestJS), ADR-03 (Next.js), ADR-04 (PostgreSQL + Redis), ADR-07 (Docker), ADR-09 (CI/CD GitHub Actions).
- **Acteurs concernés :** Équipe projet / développeur (pas d'acteur métier). Bénéficie indirectement à tous les acteurs.
- **Objectif métier (valeur) :** Mettre en place le socle technique non négociable du Sprint 0/1 (dépôt versionné, conteneurisation, CI/CD, base de données) afin que tout le développement fonctionnel ultérieur soit reproductible, testé et déployable. Le Cahier des Charges le rappelle : *« Le Sprint 0 est non négociable — aucune ligne de code fonctionnel n'est écrite avant que l'architecture, le backlog et l'infrastructure de base soient en place. »*
- **Cas d'utilisation rattachés (UC) :** Transverse — aucun UC fonctionnel (stories techniques). Traçabilité assurée vers les ADR et les NF.
- **Sprint(s) cible (Gantt) :** Sprint 0 (dépôt Git, cadrage : ADR/ERD/maquettes/backlog déjà produits) et Sprint 1 (Docker Compose, CI/CD de base, structure base de données).

### Tableau des user stories — E0

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-INFRA-01 | En tant qu'équipe, je veux un dépôt Git structuré avec conventions et branches protégées afin de partir d'une base de code homogène et tracée. | Must | 2 | Transverse (technique) / ADR-09 | NF6 | — |
| US-INFRA-02 | En tant qu'équipe, je veux un squelette applicatif backend NestJS + frontend Next.js afin de démarrer le développement sur une fondation cohérente (TypeScript de bout en bout). | Must | 3 | Transverse / ADR-02, ADR-03 | NF6, NF7 | US-INFRA-01 |
| US-INFRA-03 | En tant qu'équipe, je veux un environnement Docker Compose multi-services (backend, frontend, PostgreSQL, Redis, reverse proxy) afin de démarrer toute la plateforme d'une seule commande, à l'identique partout. | Must | 5 | Transverse / ADR-07 | NF9, NF5 | US-INFRA-02 |
| US-INFRA-04 | En tant qu'équipe, je veux le schéma de base de données initial et les migrations afin de persister les données métier avec intégrité référentielle. | Must | 5 | Transverse / ADR-04 | NF6 | US-INFRA-03 |
| US-INFRA-05 | En tant qu'équipe, je veux un pipeline d'intégration continue (lint + tests) afin de garantir la qualité à chaque modification du code. | Must | 3 | Transverse / ADR-09 | NF6 | US-INFRA-01 |
| US-INFRA-06 | En tant qu'équipe, je veux un pipeline de déploiement continu vers la recette afin de livrer automatiquement une version testée et conteneurisée. | Must | 5 | Transverse / ADR-09, ADR-07 | NF9 | US-INFRA-03, US-INFRA-05 |
| US-INFRA-07 | En tant qu'équipe, je veux une gestion sécurisée des secrets afin qu'aucune clé sensible ne soit committée ni exposée. | Must | 2 | Transverse / ADR-07, ADR-08 | NF3 | US-INFRA-03 |
| US-INFRA-08 | En tant qu'équipe, je veux une documentation d'API (OpenAPI/Swagger) et un README technique afin de faciliter l'intégration et l'onboarding. | Should | 3 | Transverse / ADR-02 | NF8, NF6 | US-INFRA-02 |

**Total E0 : 8 stories — 28 points.**

#### Critères d'acceptation (Gherkin français)

**[US-INFRA-01] — Dépôt Git & conventions**
- **Nominal :** *Étant donné* un nouveau projet, *Quand* le dépôt est initialisé sur GitHub avec l'arborescence `src/modules`, des branches protégées et des conventions (commits, ESLint + Prettier), *Alors* tout contributeur peut cloner et démarrer sur une base homogène.
- **Alternatif / erreur :** *Étant donné* un commit ne respectant pas le lint/format, *Quand* il est poussé, *Alors* le contrôle (hook ou CI) bloque l'intégration jusqu'à correction.

**[US-INFRA-02] — Squelette applicatif (NestJS + Next.js)**
- **Nominal :** *Étant donné* le dépôt, *Quand* on génère le backend NestJS (TypeScript strict) et le frontend Next.js (App Router), *Alors* l'application démarre en local avec une route de santé côté API et une page d'accueil côté frontend.
- **Alternatif / erreur :** *Étant donné* une variable de configuration requise manquante, *Quand* l'application démarre, *Alors* elle échoue immédiatement avec un message clair (fail-fast) plutôt que de démarrer partiellement.

**[US-INFRA-03] — Docker Compose multi-services**
- **Nominal :** *Étant donné* le code et ses dépendances, *Quand* on lance `docker compose up`, *Alors* backend, frontend, PostgreSQL, Redis et reverse proxy démarrent ensemble, dans le bon ordre, en une seule commande ; des fichiers d'override permettent d'adapter dev / recette / prod sans dupliquer la configuration.
- **Alternatif / erreur :** *Étant donné* PostgreSQL non encore prêt, *Quand* le backend démarre, *Alors* il attend le health check de la base avant d'accepter du trafic (pas de démarrage prématuré).

**[US-INFRA-04] — Schéma BDD & migrations**
- **Nominal :** *Étant donné* le Domain Model, *Quand* on applique les migrations TypeORM, *Alors* les tables (users, formations, certificats, audit…) sont créées avec clés primaires UUID, clés étrangères et contraintes d'intégrité ; les volumes PostgreSQL/Redis sont persistés.
- **Alternatif / erreur :** *Étant donné* une migration en échec, *Quand* elle est appliquée, *Alors* la transaction est annulée (rollback) et la base reste dans un état cohérent.

**[US-INFRA-05] — Pipeline d'intégration continue (CI)**
- **Nominal :** *Étant donné* une pull request, *Quand* elle est ouverte, *Alors* GitHub Actions exécute lint (ESLint/Prettier) + tests unitaires + tests d'intégration (Jest/Supertest) et publie la couverture.
- **Alternatif / erreur :** *Étant donné* un test en échec ou une couverture sous le seuil défini pour les modules critiques (QCM, certification, authentification), *Quand* la CI s'exécute, *Alors* la PR est marquée en échec et ne peut être fusionnée.

**[US-INFRA-06] — Pipeline de déploiement continu (CD)**
- **Nominal :** *Étant donné* une fusion sur la branche principale, *Quand* le workflow de déploiement s'exécute, *Alors* les images Docker sont construites, poussées vers un registre, puis déployées en environnement de recette.
- **Alternatif / erreur :** *Étant donné* un build ou un déploiement en échec, *Quand* le workflow s'exécute, *Alors* le déploiement est interrompu, la recette conserve la version précédente et l'équipe est notifiée.

**[US-INFRA-07] — Gestion des secrets**
- **Nominal :** *Étant donné* des secrets (clés JWT RS256, clés d'API LLM, mots de passe BDD), *Quand* l'application démarre, *Alors* ils sont injectés via variables d'environnement / secrets Docker et ne figurent jamais dans le dépôt.
- **Alternatif / erreur :** *Étant donné* un secret requis absent, *Quand* l'application démarre, *Alors* elle refuse de démarrer avec un message explicite, sans appliquer de valeur par défaut non sécurisée.

**[US-INFRA-08] — Documentation d'API & README**
- **Nominal :** *Étant donné* l'API NestJS, *Quand* elle expose ses endpoints, *Alors* une documentation OpenAPI 3.0 / Swagger UI est générée automatiquement et un README décrit le démarrage Docker et l'architecture.
- **Alternatif / erreur :** *Étant donné* un endpoint sans contrat/annotation, *Quand* la documentation est générée, *Alors* l'écart est visible (endpoint non documenté) et corrigé avant livraison.

---

## E1 Épopée — Authentification & Sécurité

- **Besoins couverts (F / NF) :** F7 (Sécurité et Conformité, P1) ; contribue à F5 (RBAC, via l'application des rôles) ; NF3 (JWT, MFA, RBAC, audit logs), NF1 (refresh transparent), NF2 (disponibilité), NF4 (souveraineté/RGPD — audit immuable, anonymisation, données chiffrées au repos). ADR de référence : ADR-08 (JWT RS256 + MFA TOTP + RBAC).
- **Acteurs concernés :** Apprenant, Formateur, Administrateur (tout utilisateur authentifiable). Le Visiteur Public est hors périmètre (acteur anonyme sans compte).
- **Objectif métier (valeur) :** Garantir que seules les bonnes personnes accèdent aux bonnes ressources, de façon traçable et révocable. C'est le socle de confiance qui conditionne toutes les autres épopées : un QCM anti-fraude, une certification ou une donnée pédagogique n'ont de valeur que si l'identité et les droits sont fiables. Couvre les attentes du commanditaire (déploiement souverain possible, journaux d'audit pour les bilans et audits RGPD d'ESPRIT).
- **Cas d'utilisation rattachés (UC) :** UC transverse « S'authentifier » (préalable à tous les UC des 4 acteurs, DS-01) · UC « Gérer son profil » (compte propre, tous rôles, DS-10) · UC1 Admin « Gérer les comptes » (volets activation et réinitialisation, DS-15 P1) · UC2 Admin « Attribuer les rôles » (volet application RBAC, DS-15 P3) · UC9 Admin « Configurer la plateforme » (politiques de sécurité) · UC10 Admin « Consulter les journaux d'audit » (volet immuabilité, DS-16 P5).
- **Sprint(s) cible (Gantt) :** Sprint 1 principal (« Backend fondations : authentification JWT/MFA, RBAC 3 rôles, structure BDD »), avec durcissement sécurité (OWASP, tests de charge) en Sprint 10. Dépend du socle E0 (Docker, Redis, reverse proxy, BDD, service email).

### Tableau des user stories — E1

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-AUTH-01 | En tant qu'utilisateur, je veux me connecter avec mon email et mon mot de passe afin d'accéder à mon espace selon mon rôle. | Must | 5 | UC « S'authentifier » / DS-01 (ét. 1-2) | NF3, NF1 | E0 (BDD, Redis), entité User |
| US-AUTH-02 | En tant qu'utilisateur sensible (Formateur/Admin), je veux valider un second facteur (TOTP) à la connexion afin de protéger mon compte contre le vol de mot de passe. | Should | 3 | UC « S'authentifier » / DS-01 (ét. 3) | NF3 | US-AUTH-01, US-AUTH-09 |
| US-AUTH-03 | En tant qu'utilisateur connecté, je veux que ma session se rafraîchisse automatiquement afin de ne pas être déconnecté en pleine activité. | Must | 3 | UC « S'authentifier » / DS-01 (ét. 4) | NF1, NF3 | US-AUTH-01 |
| US-AUTH-04 | En tant qu'utilisateur, je veux me déconnecter et révoquer immédiatement mes jetons afin qu'aucune session ne reste exploitable. | Must | 2 | UC « S'authentifier » / DS-01 (ét. 5) | NF3 | US-AUTH-01, Redis (E0) |
| US-AUTH-05 | En tant qu'utilisateur nouvellement créé, je veux activer mon compte via un lien à usage unique afin de définir mon mot de passe et accéder à la plateforme. | Must | 3 | UC1 Admin / DS-15 (P1) + états *EN_ATTENTE_ACTIVATION→ACTIF* | NF3 | Création compte (E2/DS-15), service email (E0) |
| US-AUTH-06 | En tant qu'utilisateur ayant oublié mon mot de passe, je veux le réinitialiser via un lien envoyé par email afin de récupérer l'accès à mon compte en autonomie. | Must | 3 | UC « Gérer son profil » / mécanisme lien email DS-15 (P1) | NF3 | Service email (E0), US-AUTH-05 (primitive lien) |
| US-AUTH-07 | En tant qu'utilisateur authentifié, je veux modifier mes informations personnelles afin de garder mon profil à jour. | Should | 2 | UC « Gérer son profil » / DS-10 (P1) | NF3 | US-AUTH-01 |
| US-AUTH-08 | En tant qu'utilisateur authentifié, je veux changer mon mot de passe afin de sécuriser mon compte, en déconnectant toutes mes sessions. | Must | 3 | UC « Gérer son profil » / DS-10 (P2) | NF3 | US-AUTH-01, Redis |
| US-AUTH-09 | En tant qu'utilisateur, je veux activer la double authentification (MFA TOTP) afin de renforcer la sécurité de mon compte. | Should | 3 | UC « Gérer son profil » / DS-10 (P3) | NF3 | US-AUTH-01 |
| US-AUTH-10 | En tant qu'utilisateur, je veux désactiver la MFA afin de pouvoir la réinitialiser ou changer d'application d'authentification. | Could | 2 | UC « Gérer son profil » / DS-10 (P4) | NF3 | US-AUTH-09 |
| US-AUTH-11 | En tant que système, je veux appliquer le contrôle d'accès par rôle (RBAC) sur chaque endpoint afin que chacun n'accède qu'à ce que son rôle autorise. | Must | 5 | UC2 Admin / DS-01, DS-15 (P3) | NF3 (F5) | US-AUTH-01, modèle de rôles (E2) |
| US-AUTH-12 | En tant qu'institution, je veux journaliser de façon immuable les actions sensibles afin d'assurer la traçabilité et la conformité (audits, RGPD). | Must | 5 | UC10 Admin / DS-16 (P5) | NF3, NF4 | E0 (BDD), intercepteur global |
| US-AUTH-13 | En tant que système, je veux chiffrer les échanges (TLS) et durcir les endpoints sensibles afin de protéger les données en transit et contre les abus. | Must | 3 | UC9 Admin / DEP-03 | NF3, NF2 | E0 (reverse proxy Docker) |

**Total E1 : 13 stories — 42 points.**

#### Critères d'acceptation (Gherkin français)

**[US-AUTH-01] — Se connecter**
- **Nominal :** *Étant donné* un compte au statut `ACTIF` avec MFA désactivée, *Quand* l'utilisateur soumet un email valide et le bon mot de passe, *Alors* le système vérifie le hash via `bcrypt.compare()`, émet un access token RS256 (15 min) et un refresh token (7 j), crée la session en base, met à jour `derniereConnexion`, et le redirige vers son espace selon son rôle.
- **Alternatif / erreur (identifiants invalides) :** *Étant donné* un email inconnu **ou** un mot de passe incorrect, *Quand* l'utilisateur soumet le formulaire, *Alors* le système renvoie un message d'erreur **générique identique** dans les deux cas (sécurité par opacité) et n'émet aucun jeton.
- **Alternatif / erreur (compte non actif) :** *Étant donné* un compte `DESACTIVE`, `ANONYMISE` ou `EN_ATTENTE_ACTIVATION`, *Quand* l'utilisateur fournit même de bons identifiants, *Alors* la connexion est refusée avec le même message générique et aucun jeton n'est émis.

**[US-AUTH-02] — MFA à la connexion**
- **Nominal :** *Étant donné* un utilisateur `ACTIF` avec `mfaActive = true` ayant fourni des identifiants valides, *Quand* le système détecte la MFA, *Alors* il émet un `mfaToken` temporaire (5 min) au lieu des jetons définitifs ; puis *Quand* l'utilisateur saisit un code TOTP valide, *Alors* le système le vérifie côté serveur, supprime la `mfa_session` de Redis (usage unique) et émet l'access + refresh tokens.
- **Alternatif / erreur :** *Étant donné* un `mfaToken` expiré (> 5 min) ou un code TOTP invalide, *Quand* l'utilisateur soumet le code, *Alors* le système refuse, n'émet aucun jeton définitif et invite à recommencer.

**[US-AUTH-03] — Rafraîchir la session**
- **Nominal :** *Étant donné* un access token expiré et un refresh token valide non blacklisté, *Quand* le frontend intercepte un HTTP 401, *Alors* il appelle l'endpoint de refresh, le serveur vérifie le refresh token et la blocklist Redis, émet un nouvel access token (sans renouveler le refresh token) et rejoue la requête de façon transparente.
- **Alternatif / erreur :** *Étant donné* un refresh token expiré ou blacklisté, *Quand* le frontend tente le refresh, *Alors* le serveur renvoie 401 et l'utilisateur est redirigé vers `/login`.

**[US-AUTH-04] — Se déconnecter**
- **Nominal :** *Étant donné* un utilisateur connecté, *Quand* il clique sur « Déconnexion », *Alors* le système place l'access token **et** le refresh token sur la blocklist Redis (TTL = durée restante), met `active = false` sur la session, journalise `LOGOUT` et invalide l'accès immédiatement.
- **Alternatif / erreur :** *Étant donné* un jeton déjà blacklisté ou une session déjà fermée, *Quand* l'appel de déconnexion est rejoué, *Alors* l'opération reste idempotente et ne renvoie pas d'erreur exploitable.

**[US-AUTH-05] — Activer son compte**
- **Nominal :** *Étant donné* un compte créé par l'administrateur au statut `EN_ATTENTE_ACTIVATION` avec un token d'activation (UUID, TTL 48 h) reçu par email, *Quand* l'utilisateur clique sur le lien dans les 48 h et définit un mot de passe conforme à la politique, *Alors* le système hache le mot de passe (`bcrypt`, cost 12), passe le compte à `ACTIF`, journalise l'activation et autorise la connexion.
- **Alternatif / erreur :** *Étant donné* un token expiré (TTL ≥ 48 h) ou déjà consommé, *Quand* l'utilisateur clique sur le lien, *Alors* l'activation est refusée, le compte reste `EN_ATTENTE_ACTIVATION` et un nouveau lien doit être demandé à l'administrateur.

**[US-AUTH-06] — Réinitialiser un mot de passe oublié**
- **Nominal :** *Étant donné* un utilisateur ayant oublié son mot de passe, *Quand* il saisit son email sur la page « Mot de passe oublié », *Alors* le système envoie (si le compte existe et est `ACTIF`) un lien de réinitialisation à usage unique et à durée limitée — même mécanisme que le lien d'activation — ; après clic, l'utilisateur définit un nouveau mot de passe conforme, **toutes ses sessions actives sont invalidées** (Redis) et l'action est journalisée (`MDP_RESET`).
- **Alternatif / erreur (email inconnu) :** *Étant donné* un email non rattaché à un compte, *Quand* l'utilisateur le soumet, *Alors* le système affiche un message neutre identique (« si un compte existe, un email a été envoyé ») sans révéler l'existence du compte (anti-énumération, cohérent avec la sécurité par opacité de DS-01).
- **Alternatif / erreur (lien expiré/consommé) :** *Étant donné* un lien de réinitialisation expiré ou déjà utilisé, *Quand* l'utilisateur clique, *Alors* la réinitialisation est refusée et un nouveau lien doit être demandé.

**[US-AUTH-07] — Modifier mes informations**
- **Nominal :** *Étant donné* un utilisateur authentifié, *Quand* il modifie son nom/prénom et enregistre, *Alors* le système met à jour les champs, journalise `PROFIL_MODIFIE` et confirme.
- **Alternatif / erreur :** *Étant donné* une tentative de modification de l'email (champ non éditable par l'utilisateur), *Quand* la requête est envoyée, *Alors* le champ email est ignoré et reste inchangé.

**[US-AUTH-08] — Changer mon mot de passe**
- **Nominal :** *Étant donné* un utilisateur authentifié fournissant l'ancien mot de passe correct et un nouveau mot de passe conforme (longueur, complexité), *Quand* il valide, *Alors* le système vérifie l'ancien via `bcrypt.compare()`, hache le nouveau (`bcrypt`, cost 12), **invalide TOUTES les sessions actives** dans Redis, journalise `MDP_CHANGE` et informe que toutes les sessions ont été déconnectées.
- **Alternatif / erreur :** *Étant donné* un ancien mot de passe incorrect, *Quand* l'utilisateur valide, *Alors* le système renvoie HTTP 401 « mot de passe actuel incorrect » et ne modifie rien.

**[US-AUTH-09] — Activer la MFA**
- **Nominal :** *Étant donné* un utilisateur authentifié, *Quand* il lance l'activation MFA, *Alors* le système génère un secret TOTP, affiche un QR code (`otpauth://`) + le secret en texte, et n'active réellement la MFA (`mfaActive = true`) qu'après saisie d'un code TOTP de confirmation valide ; l'action est journalisée (`MFA_ACTIVE`).
- **Alternatif / erreur :** *Étant donné* un code TOTP de confirmation invalide, *Quand* l'utilisateur le soumet, *Alors* la MFA reste inactive (`mfaActive = false`) et l'utilisateur est invité à recommencer.

**[US-AUTH-10] — Désactiver la MFA**
- **Nominal :** *Étant donné* un utilisateur avec MFA active, *Quand* il demande la désactivation et fournit son mot de passe **et** un code TOTP actuel valides, *Alors* le système supprime le `mfaSecret`, passe `mfaActive = false`, journalise `MFA_DESACTIVE` et confirme.
- **Alternatif / erreur :** *Étant donné* un mot de passe ou un code TOTP invalide, *Quand* l'utilisateur valide la désactivation, *Alors* le système renvoie HTTP 401 « vérification échouée » et la MFA reste active.

**[US-AUTH-11] — Contrôle d'accès par rôle (RBAC)**
- **Nominal :** *Étant donné* un endpoint protégé par un rôle requis (décorateur `Roles` + guard NestJS), *Quand* un utilisateur authentifié dont le rôle correspond appelle l'endpoint, *Alors* l'accès est autorisé.
- **Alternatif / erreur :** *Étant donné* un utilisateur dont le rôle ne correspond pas (ou un jeton absent/invalide), *Quand* il appelle l'endpoint, *Alors* le guard renvoie HTTP 403 (ou 401) et l'action est refusée ; de plus, un changement de rôle invalide **immédiatement** les sessions actives de l'utilisateur concerné (reconnexion forcée).

**[US-AUTH-12] — Journal d'audit immuable**
- **Nominal :** *Étant donné* une action sensible (connexion, soumission QCM, émission/révocation de certificat, changement de rôle, désactivation/anonymisation de compte…), *Quand* elle est exécutée, *Alors* un intercepteur global insère une entrée d'audit (horodatage, action, acteur, cible, IP, résultat) dans une table PostgreSQL dédiée.
- **Alternatif / erreur :** *Étant donné* une tentative de modification ou de suppression d'un journal d'audit, *Quand* la requête est émise, *Alors* aucune route API `DELETE`/`UPDATE` n'existe sur `/audit-logs` et l'immuabilité est garantie (INSERT seul).

**[US-AUTH-13] — Chiffrement en transit & durcissement**
- **Nominal :** *Étant donné* une requête entrante, *Quand* elle traverse le reverse proxy (DMZ), *Alors* le TLS est terminé au reverse proxy, l'en-tête HSTS est appliqué et un rate-limiting protège les endpoints sensibles (connexion, réinitialisation de mot de passe, vérification publique de certificat) ; les services internes communiquent dans le réseau Docker privé.
- **Alternatif / erreur :** *Étant donné* une requête HTTP non sécurisée ou un volume de requêtes dépassant le seuil, *Quand* elle est reçue, *Alors* elle est redirigée vers HTTPS ou limitée/rejetée par le rate-limiter de la DMZ.

---

## E2 Épopée — Comptes, rôles & formations

- **Besoins couverts (F / NF) :** F5 (Gestion Multi-Rôles RBAC, P0 — Critique) ; NF4 (RGPD — anonymisation, suspension plutôt que suppression), NF3 (traçabilité des actions admin). ADR de référence : ADR-04 (PostgreSQL, transactions ACID), ADR-08 (RBAC).
- **Acteurs concernés :** Administrateur (gouvernance), Apprenant (inscription/désinscription, accès), Formateur (affectation aux formations).
- **Objectif métier (valeur) :** Donner à l'institution le contrôle complet du référentiel humain et pédagogique — qui existe, avec quel rôle, rattaché à quelle formation — dans le respect du RGPD (suspension, anonymisation) et avec une traçabilité intégrale. C'est le socle de données sans lequel ni les évaluations (E3/E4) ni la certification (E5) n'ont d'objet.
- **Cas d'utilisation rattachés (UC) :** UC1 Admin « Gérer les comptes » · UC2 Admin « Attribuer les rôles » · UC3-UC5 Admin « Gérer les formations / inscriptions » · UC1 Apprenant « S'inscrire / se désinscrire » · DS-08, DS-09, DS-11, DS-15, DS-16 (P1).
- **Sprint(s) cible (Gantt) :** Sprint 1 (comptes, rôles — avec les fondations backend) et Sprint 2 (formations, inscriptions — prérequis aux modules d'évaluation).

### Tableau des user stories — E2

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-CPT-01 | En tant qu'administrateur, je veux créer un compte utilisateur afin d'enrôler apprenants, formateurs et administrateurs. | Must | 3 | UC1 Admin / DS-15 (P1) | NF3 | E0, E1 (états compte) |
| US-CPT-02 | En tant qu'administrateur, je veux importer des comptes en masse via CSV afin d'enrôler une promotion entière en une opération. | Should | 3 | UC1 Admin / DS-15 (P1) | NF3 | US-CPT-01 |
| US-CPT-03 | En tant qu'administrateur, je veux désactiver ou bannir un compte avec motif afin de gérer les départs et les suspensions, sans jamais me verrouiller hors de la plateforme. | Must | 3 | UC1 Admin / DS-15 (P2) | NF3 | US-CPT-01, Redis |
| US-CPT-04 | En tant qu'administrateur, je veux anonymiser un compte (droit à l'oubli RGPD) afin d'effacer les données personnelles tout en conservant les données pédagogiques. | Should | 3 | UC1 Admin / DS-15 (P4) + état *ANONYMISE* | NF4 | US-CPT-03 |
| US-ROL-01 | En tant qu'administrateur, je veux changer le rôle d'un utilisateur (double confirmation) afin d'ajuster ses droits, avec prise d'effet immédiate. | Must | 3 | UC2 Admin / DS-15 (P3) | NF3 | US-AUTH-11 (RBAC), Redis |
| US-FORM-01 | En tant qu'administrateur, je veux créer et configurer une formation afin de structurer l'offre certifiante (objectifs, capacité, seuils, modèle de certificat). | Must | 5 | UC3 Admin / DS-16 (P1) | — | E0 |
| US-FORM-02 | En tant qu'administrateur, je veux clôturer ou archiver une formation afin de figer son cycle de vie, les certificats émis restant vérifiables. | Should | 2 | UC3 Admin / DS-16 (P1) | NF3 | US-FORM-01 |
| US-FORM-03 | En tant qu'administrateur, je veux affecter un formateur à une formation afin qu'il puisse créer les évaluations et corriger les apprenants. | Must | 2 | UC3 Admin / DS-16 (P1) | NF3 | US-FORM-01 |
| US-INSC-01 | En tant qu'apprenant, je veux m'inscrire à une formation ouverte afin d'accéder à ses modules et évaluations. | Must | 3 | UC1 Apprenant / DS-08 | NF3 | US-FORM-01 |
| US-INSC-02 | En tant qu'administrateur, je veux gérer les inscriptions (inscrire, suspendre, ré-inscrire, import CSV) afin de piloter les cohortes. | Should | 3 | UC4 Admin / DS-08 (P3), DS-11 (P2) | NF3 | US-INSC-01 |
| US-INSC-03 | En tant qu'apprenant, je veux me désinscrire d'une formation afin de quitter un parcours, mes certificats déjà obtenus restant valides. | Should | 2 | UC1 Apprenant / DS-11 (P1) | NF3 | US-INSC-01 |
| US-INSC-04 | En tant qu'apprenant, je veux accéder aux modules de ma formation et choisir une évaluation afin de progresser dans mon parcours. | Must | 3 | UC App / DS-09 | NF3 | US-INSC-01 |

**Total E2 : 12 stories — 35 points.**

#### Critères d'acceptation (Gherkin français)

**[US-CPT-01] — Créer un compte**
- **Nominal :** *Étant donné* un administrateur authentifié, *Quand* il saisit identité, email et rôle et soumet, *Alors* le système vérifie l'unicité de l'email, crée le compte au statut `EN_ATTENTE_ACTIVATION`, génère un token d'activation (UUID, TTL 48 h), envoie l'email d'activation et journalise `COMPTE_CREE`.
- **Alternatif / erreur :** *Étant donné* un email déjà utilisé, *Quand* l'administrateur soumet, *Alors* le système renvoie HTTP 409 « Cet email est déjà utilisé » et ne crée rien.

**[US-CPT-02] — Import CSV en masse**
- **Nominal :** *Étant donné* un fichier CSV de promotion, *Quand* l'administrateur l'importe, *Alors* le système valide les colonnes obligatoires, les formats d'email et l'absence de doublons avant import, puis crée les comptes en `EN_ATTENTE_ACTIVATION` avec envoi des emails d'activation.
- **Alternatif / erreur :** *Étant donné* un fichier comportant des lignes invalides (email malformé, doublon), *Quand* il est importé, *Alors* le système rejette ces lignes en les listant et n'importe que les lignes valides (ou bloque l'import selon le mode choisi), sans création partielle silencieuse.

**[US-CPT-03] — Désactiver / bannir un compte**
- **Nominal :** *Étant donné* un compte actif et un motif saisi, *Quand* l'administrateur le désactive, *Alors* le système passe le statut à `DESACTIVE`, invalide toutes les sessions actives (blocklist Redis) et journalise `COMPTE_DESACTIVE` avec le motif.
- **Alternatif / erreur (anti-lockout) :** *Étant donné* une tentative de désactivation du **dernier administrateur actif**, *Quand* elle est soumise, *Alors* le système renvoie HTTP 403 « Il doit rester au moins un administrateur actif » et n'effectue rien.

**[US-CPT-04] — Anonymiser un compte (RGPD)**
- **Nominal :** *Étant donné* un compte inactif avec des données pédagogiques rattachées, *Quand* l'administrateur confirme l'anonymisation (avec son mot de passe), *Alors* dans une transaction atomique PostgreSQL le système remplace les données personnelles par des pseudonymes (nom, email, matricule, secrets effacés), passe le statut à `ANONYMISE`, conserve tentatives/livrables/certificats, journalise `COMPTE_ANONYMISE` et invalide les sessions.
- **Alternatif / erreur :** *Étant donné* un mot de passe administrateur incorrect, *Quand* l'anonymisation est confirmée, *Alors* la transaction n'est pas démarrée et aucune donnée n'est modifiée.

**[US-ROL-01] — Changer le rôle d'un utilisateur**
- **Nominal :** *Étant donné* un administrateur fournissant le nouveau rôle et son mot de passe, *Quand* il valide, *Alors* le système vérifie le mot de passe admin via `bcrypt.compare()`, met à jour le rôle, invalide les sessions de l'utilisateur (le nouveau rôle prend effet à la reconnexion) et journalise `ROLE_CHANGE` (ancien/nouveau rôle, adminId).
- **Alternatif / erreur :** *Étant donné* un mot de passe administrateur incorrect, *Quand* il valide, *Alors* le système renvoie HTTP 401 et ne change pas le rôle.

**[US-FORM-01] — Créer et configurer une formation**
- **Nominal :** *Étant donné* un administrateur authentifié, *Quand* il saisit titre, description, objectifs, capacité, seuils de validation et modèle de certificat, *Alors* le système crée la formation au statut `Ouverte`, la rend visible au catalogue et journalise `FORMATION_CREEE`.
- **Alternatif / erreur :** *Étant donné* des paramètres incohérents (capacité ≤ 0, seuil hors [0,100]), *Quand* il soumet, *Alors* le système renvoie HTTP 400 avec les erreurs de validation.

**[US-FORM-02] — Clôturer / archiver une formation**
- **Nominal :** *Étant donné* une formation ouverte, *Quand* l'administrateur la clôture puis l'archive, *Alors* le système met le statut à `Fermée` puis `Archivée`, journalise l'action et garantit que **les certificats déjà émis restent vérifiables publiquement**.
- **Alternatif / erreur :** *Étant donné* une formation avec des évaluations en cours, *Quand* l'administrateur tente de l'archiver, *Alors* le système avertit et demande confirmation explicite avant de figer le parcours.

**[US-FORM-03] — Affecter un formateur**
- **Nominal :** *Étant donné* une formation créée, *Quand* l'administrateur y affecte un formateur, *Alors* le système enregistre l'affectation, notifie le formateur et lui ouvre les droits de création d'évaluations sur cette formation (RBAC).
- **Alternatif / erreur :** *Étant donné* un utilisateur sans rôle Formateur, *Quand* l'administrateur tente de l'affecter, *Alors* le système refuse l'affectation.

**[US-INSC-01] — S'inscrire à une formation**
- **Nominal :** *Étant donné* un apprenant consultant le catalogue, *Quand* il demande l'inscription à une formation ouverte avec places disponibles, *Alors* le système crée l'inscription (`EnCours`), donne accès aux modules et journalise l'action.
- **Alternatif / erreur :** *Étant donné* une formation complète (capacité atteinte), *Quand* l'apprenant demande l'inscription, *Alors* le système refuse avec « Formation complète » et n'inscrit pas.

**[US-INSC-02] — Gérer les inscriptions (Admin)**
- **Nominal :** *Étant donné* un administrateur, *Quand* il inscrit, suspend ou ré-inscrit un apprenant (ou importe une liste CSV), *Alors* le système met à jour le statut d'inscription, notifie l'apprenant et journalise chaque opération.
- **Alternatif / erreur :** *Étant donné* un retrait forcé d'un apprenant ayant une activité enregistrée, *Quand* l'administrateur l'applique, *Alors* le système suspend l'inscription (mode `soft`, statut `Suspendue`) plutôt que de la supprimer, pour conserver la traçabilité.

**[US-INSC-03] — Se désinscrire**
- **Nominal :** *Étant donné* un apprenant inscrit, *Quand* il confirme sa désinscription après affichage des conséquences, *Alors* le système passe l'inscription à `Suspendue` (jamais de suppression), retire l'accès, conserve les certificats obtenus et notifie les formateurs.
- **Alternatif / erreur :** *Étant donné* une inscription qui n'appartient pas à cet apprenant, *Quand* la désinscription est tentée, *Alors* le système refuse (inscription non trouvée pour cet utilisateur).

**[US-INSC-04] — Accéder aux modules et choisir une évaluation**
- **Nominal :** *Étant donné* un apprenant inscrit et actif, *Quand* il ouvre sa formation, *Alors* le système affiche les modules accessibles et lui permet de lancer un QCM (DS-02) ou de soumettre un livrable (DS-03) selon le module.
- **Alternatif / erreur :** *Étant donné* un apprenant dont l'inscription est `Suspendue`, *Quand* il tente d'accéder aux modules, *Alors* l'accès est refusé.

---

## E3 Épopée — Évaluations QCM anti-fraude

- **Besoins couverts (F / NF) :** F1 (Moteur QCM anti-fraude, P0 — Critique) ; NF3 (intégrité/anti-fraude), NF1 (réactivité). ADR de référence : ADR-04 (Redis pour le timer serveur).
- **Acteurs concernés :** Formateur (création, configuration anti-fraude, publication), Apprenant (passage du QCM), Système (scoring serveur).
- **Objectif métier (valeur) :** Transformer un simple quiz en **évaluation certifiante** : toute la logique sensible (timer, randomisation, scoring, blocage) est exécutée côté serveur et donc incontournable. C'est l'un des quatre différenciants P0 du projet : sans anti-fraude robuste, la certification n'a aucune valeur probante.
- **Cas d'utilisation rattachés (UC) :** UC1+UC2 Formateur « Créer un QCM / Configurer l'anti-fraude » · UC2 Apprenant « Passer un QCM » · DS-02, DS-12 · état *TentativeQCM* (EN_COURS → SOUMISE / ABANDONNEE_TIMER → NOTEE).
- **Sprint(s) cible (Gantt) :** Sprint 2 (moteur de questions, randomisation serveur, minuterie, scoring) et Sprint 3 (anti-fraude avancée, historique des tentatives, limitation des sessions).

### Tableau des user stories — E3

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-QCM-01 | En tant que formateur, je veux créer le contenu d'un QCM (questions, options, explications) afin de constituer une évaluation. | Must | 5 | UC1 For / DS-12 (P1-2) | NF3 | E2 (formation, RBAC) |
| US-QCM-02 | En tant que formateur, je veux importer des questions depuis ma banque afin de réutiliser du contenu sans le recopier. | Should | 3 | UC1 For / DS-12 (P2) | — | US-QCM-01 |
| US-QCM-03 | En tant que formateur, je veux configurer les paramètres anti-fraude afin de sécuriser l'évaluation. | Must | 5 | UC2 For / DS-12 (P3) | NF3 | US-QCM-01 |
| US-QCM-04 | En tant que formateur, je veux publier un QCM afin de le rendre accessible aux apprenants pendant sa fenêtre d'ouverture. | Must | 2 | UC2 For / DS-12 (P3) | NF3 | US-QCM-03 |
| US-QCM-05 | En tant qu'apprenant, je veux démarrer une tentative dont l'accès est contrôlé côté serveur afin de passer le QCM dans des conditions équitables. | Must | 3 | UC2 App / DS-02 (ét. 1) | NF3 | US-QCM-04, US-INSC-04 |
| US-QCM-06 | En tant que système, je veux randomiser les questions/options et ne jamais transmettre les bonnes réponses au client afin d'empêcher la triche. | Must | 5 | DS-02 (ét. 2) | NF3 | US-QCM-05 |
| US-QCM-07 | En tant que système, je veux gérer la minuterie côté serveur (Redis) avec auto-sauvegarde et soumission automatique à expiration afin que le temps ne soit pas contournable. | Must | 5 | DS-02 (ét. 3) + état *TentativeQCM* | NF3 | US-QCM-05, Redis |
| US-QCM-08 | En tant que système, je veux calculer le score côté serveur (pondéré) et figer la tentative afin de produire un résultat fiable et immuable. | Must | 5 | DS-02 (ét. 4) + *NOTEE* | NF3 | US-QCM-07 |
| US-QCM-09 | En tant qu'apprenant, je veux voir mon résultat selon le mode configuré (immédiat ou différé) afin de connaître mon score sans fuite des réponses. | Should | 2 | DS-02 (ét. 5) | NF3 | US-QCM-08 |
| US-QCM-10 | En tant que système, je veux bloquer les sessions multiples et limiter tentatives/délai afin d'empêcher le brute-force et le passage simultané. | Must | 3 | DS-02 (ét. 1) | NF3 | US-QCM-05, Redis |
| US-QCM-11 | En tant qu'apprenant et formateur, je veux un historique complet et immuable des tentatives afin de garder une trace certifiante (date, score, durée, détail). | Should | 3 | F1 / état *TentativeQCM* | NF3 | US-QCM-08 |

**Total E3 : 11 stories — 41 points.**

#### Critères d'acceptation (Gherkin français)

**[US-QCM-01] — Créer le contenu d'un QCM**
- **Nominal :** *Étant donné* un formateur affecté à la formation, *Quand* il crée un QCM et ajoute des questions, *Alors* le système crée le QCM en `Brouillon`, valide chaque question (≥ 2 options, ≥ 1 correcte, QCU → exactement 1 correcte) et l'enregistre.
- **Alternatif / erreur :** *Étant donné* une question sans bonne réponse ou avec une seule option, *Quand* le formateur l'ajoute, *Alors* le système renvoie un message de validation ciblé et n'enregistre pas la question.

**[US-QCM-02] — Importer depuis la banque**
- **Nominal :** *Étant donné* une banque de questions du formateur, *Quand* il en sélectionne pour son QCM, *Alors* le système crée une **liaison** (sans copie) entre le QCM et les questions existantes.
- **Alternatif / erreur :** *Étant donné* une recherche sans résultat, *Quand* le formateur importe, *Alors* le système indique qu'aucune question ne correspond, sans modifier le QCM.

**[US-QCM-03] — Configurer l'anti-fraude**
- **Nominal :** *Étant donné* un QCM contenant des questions, *Quand* le formateur règle les paramètres (randomisation, durée, fenêtre, tentatives, délai, blocage multi-session, affichage, seuil, pondération, proctoring), *Alors* le système valide les contraintes (dates cohérentes, valeurs dans les plages) et passe le QCM en `NonPublié`.
- **Alternatif / erreur :** *Étant donné* `dateOuverture ≥ dateFermeture` ou un seuil hors [0,100], *Quand* il enregistre, *Alors* le système renvoie HTTP 400 avec les erreurs.

**[US-QCM-04] — Publier un QCM**
- **Nominal :** *Étant donné* un QCM avec au moins une question et une configuration, *Quand* le formateur le publie, *Alors* le système passe le statut à `Publié`, journalise `QCM_PUBLIE` et le rend visible dès l'ouverture de la fenêtre.
- **Alternatif / erreur :** *Étant donné* un QCM sans question ou sans configuration, *Quand* il tente de publier, *Alors* le système refuse avec « QCM incomplet pour publication ».

**[US-QCM-05] — Démarrer une tentative (contrôle serveur)**
- **Nominal :** *Étant donné* un apprenant inscrit, *Quand* il démarre une tentative, *Alors* le système vérifie côté serveur : QCM `Publié`, `NOW()` dans la fenêtre, `nbTentativesPassees < max`, délai respecté, pas de session active ailleurs ; puis crée la tentative `EN_COURS`.
- **Alternatif / erreur :** *Étant donné* une condition non remplie (hors fenêtre, quota atteint, délai non respecté), *Quand* il démarre, *Alors* le système refuse avec le **motif précis** correspondant.

**[US-QCM-06] — Randomisation & confidentialité des réponses**
- **Nominal :** *Étant donné* une tentative créée avec randomisation activée, *Quand* le système charge les questions, *Alors* il mélange l'ordre des questions et des options (Fisher-Yates), tire K questions parmi N si une banque est configurée, et **ne transmet jamais** le champ `estCorrecte` au frontend.
- **Alternatif / erreur :** *Étant donné* une inspection du trafic réseau côté client, *Quand* l'apprenant l'examine, *Alors* aucune bonne réponse n'y figure (vérifiable par test d'intégration).

**[US-QCM-07] — Minuterie serveur & auto-save**
- **Nominal :** *Étant donné* une tentative `EN_COURS`, *Quand* le timer démarre, *Alors* il est géré par un TTL Redis (jamais côté client), les réponses sont auto-sauvegardées (~ toutes les 10 s) et le timer est vérifié à chaque requête.
- **Alternatif / erreur (timeout) :** *Étant donné* un timer expiré (TTL = 0) sans soumission, *Quand* le système le détecte, *Alors* la tentative passe à `ABANDONNEE_TIMER`, les réponses partielles sont conservées et la tentative est envoyée au scoring.

**[US-QCM-08] — Scoring serveur & immuabilité**
- **Nominal :** *Étant donné* une tentative soumise, *Quand* le scoring s'exécute, *Alors* le système compare les réponses aux `estCorrecte` en base, calcule `score = Σ(pondération × correcte) / Σ(pondération) × 100`, met la tentative à `NOTEE`, nettoie Redis (timer + verrou) et journalise `QCM_SOUMIS`.
- **Alternatif / erreur :** *Étant donné* une tentative déjà `NOTEE`, *Quand* une renotation est tentée, *Alors* le système la refuse (état immuable, historique certifiant).

**[US-QCM-09] — Affichage du résultat**
- **Nominal (immédiat) :** *Étant donné* un QCM en affichage immédiat, *Quand* l'apprenant soumet, *Alors* il voit son score + les bonnes réponses + les explications.
- **Alternatif (différé) :** *Étant donné* un QCM en affichage différé, *Quand* l'apprenant soumet, *Alors* il ne voit que son score ; les corrections ne sont révélées qu'après la fermeture de la fenêtre d'examen.

**[US-QCM-10] — Blocage multi-session & limitation**
- **Nominal :** *Étant donné* une tentative active sur un appareil, *Quand* l'apprenant tente de démarrer le QCM sur un second appareil, *Alors* le système bloque le second passage (verrou de session).
- **Alternatif / erreur :** *Étant donné* un délai minimum entre tentatives non écoulé, *Quand* l'apprenant relance, *Alors* le système refuse avec le temps restant à attendre.

**[US-QCM-11] — Historique des tentatives**
- **Nominal :** *Étant donné* des tentatives notées, *Quand* l'apprenant ou le formateur consulte l'historique, *Alors* le système affiche par tentative : date, score, durée effective et détail des réponses, en lecture seule.
- **Alternatif / erreur :** *Étant donné* une demande de modification d'une tentative passée, *Quand* elle est émise, *Alors* le système la refuse (immuabilité).

## E4 Épopée — Ateliers pratiques & correction

- **Besoins couverts (F / NF) :** F2 (Ateliers Pratiques évalués, P0 — Critique) ; NF3 (intégrité — hash de traçabilité, feedback immuable). ADR de référence : ADR-07 (stockage MinIO/S3), ADR-10 (SHA-256 natif).
- **Acteurs concernés :** Formateur (création atelier + grille, correction), Apprenant (soumission de livrable, consultation feedback), Système (verrouillage des statuts, déclenchement certification).
- **Objectif métier (valeur) :** Évaluer des compétences pratiques via un vrai workflow formateur (grille pondérée, correction critère par critère, feedback structuré) — une lacune quasi-universelle du marché (G2 du benchmark). Le verrouillage progressif des statuts et le hash de traçabilité garantissent l'équité et l'antériorité contre le plagiat.
- **Cas d'utilisation rattachés (UC) :** UC3+UC4 Formateur « Créer un atelier / une grille » · UC4 Apprenant « Soumettre un livrable » · UC5 Formateur « Corriger » · DS-03, DS-13 · AC-03 · état *Livrable* (BROUILLON → SOUMIS → EN_CORRECTION → NOTE).
- **Sprint(s) cible (Gantt) :** Sprint 4 (création formateur, soumission apprenant, workflow de statuts) et Sprint 5 (interface de correction, grille, feedback, notifications).

### Tableau des user stories — E4

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-ATEL-01 | En tant que formateur, je veux créer un atelier (énoncé, date limite, types de livrables) afin de proposer une évaluation pratique. | Must | 3 | UC3 For / DS-13 (P1) | — | E2 (formation) |
| US-ATEL-02 | En tant que formateur, je veux définir une grille de notation pondérée afin d'évaluer chaque livrable de façon objective et reproductible. | Must | 5 | UC4 For / DS-13 (P2) | NF3 | US-ATEL-01 |
| US-ATEL-03 | En tant que formateur, je veux publier l'atelier afin de le rendre accessible aux apprenants inscrits. | Must | 2 | UC3 For / DS-13 (P3) | — | US-ATEL-02 |
| US-ATEL-04 | En tant qu'apprenant, je veux soumettre un livrable afin de faire évaluer mon travail, avec une preuve d'antériorité. | Must | 5 | UC4 App / DS-03 (P1) | NF3 | US-ATEL-03, MinIO |
| US-ATEL-05 | En tant qu'apprenant, je veux remplacer mon livrable avant la date limite afin de corriger ma soumission. | Should | 2 | UC4 App / DS-03 (P1) | NF3 | US-ATEL-04 |
| US-ATEL-06 | En tant que formateur, je veux corriger un livrable critère par critère afin de produire une note pondérée fiable. | Must | 5 | UC5 For / DS-03 (P2) + AC-03 | NF3 | US-ATEL-04 |
| US-ATEL-07 | En tant que formateur, je veux envoyer un feedback immuable et notifier l'apprenant afin de clore la correction de manière traçable. | Must | 3 | UC5 For / DS-03 (P2) | NF3 | US-ATEL-06 |
| US-ATEL-08 | En tant qu'apprenant, je veux consulter mon feedback détaillé afin de comprendre ma note et progresser. | Should | 2 | UC App / DS-03 (P2) | — | US-ATEL-07 |
| US-ATEL-09 | En tant que système, je veux déclencher l'émission du certificat quand toutes les conditions sont réunies afin d'automatiser la certification. | Must | 3 | DS-03 → DS-04 / AC-03 | NF3 | US-ATEL-07, E5 |

**Total E4 : 9 stories — 30 points.**

#### Critères d'acceptation (Gherkin français)

**[US-ATEL-01] — Créer un atelier**
- **Nominal :** *Étant donné* un formateur affecté, *Quand* il configure titre, énoncé, module, date limite, types/taille de livrables et tolérance de retard, *Alors* le système crée l'atelier en `Brouillon`.
- **Alternatif / erreur :** *Étant donné* une date limite dans le passé, *Quand* il enregistre, *Alors* le système signale l'incohérence et n'enregistre pas.

**[US-ATEL-02] — Définir la grille de notation**
- **Nominal :** *Étant donné* un atelier en `Brouillon`, *Quand* le formateur ajoute des critères pondérés (avec niveaux Insuffisant → Excellent), *Alors* le système valide en temps réel que le total des pondérations reste ≤ 100 % et exige un total **exactement égal à 100 %** pour finaliser ; il peut enregistrer la grille comme modèle réutilisable.
- **Alternatif / erreur :** *Étant donné* un total de pondérations ≠ 100 % (ou un ajout dépassant 100 %), *Quand* il finalise, *Alors* le système refuse la validation avec un message explicite.

**[US-ATEL-03] — Publier l'atelier**
- **Nominal :** *Étant donné* un atelier avec grille validée et date limite future, *Quand* le formateur publie, *Alors* le système passe le statut à `Publié` et le rend visible aux apprenants inscrits.
- **Alternatif / erreur :** *Étant donné* une grille non validée (≠ 100 %), *Quand* il publie, *Alors* le système refuse la publication.

**[US-ATEL-04] — Soumettre un livrable**
- **Nominal :** *Étant donné* un atelier publié avant la date limite, *Quand* l'apprenant dépose un livrable conforme (type, taille), *Alors* le système calcule un `hashTracabilite` (SHA-256 du contenu), téléverse le fichier sur MinIO/S3, crée la soumission `version: 1` (statut `SOUMIS`) et notifie le formateur.
- **Alternatif / erreur :** *Étant donné* une date limite dépassée, un fichier trop volumineux ou un format non autorisé, *Quand* l'apprenant soumet, *Alors* le système rejette (HTTP 403 deadline / 400 format) sans enregistrer.

**[US-ATEL-05] — Remplacer un livrable**
- **Nominal :** *Étant donné* un livrable déjà soumis et la date limite non dépassée, *Quand* l'apprenant en dépose une nouvelle version, *Alors* le système incrémente la version, supprime l'ancien fichier et recalcule le hash.
- **Alternatif / erreur :** *Étant donné* un livrable déjà en correction (`EN_CORRECTION`), *Quand* l'apprenant tente de le remplacer, *Alors* le système refuse (verrouillage).

**[US-ATEL-06] — Corriger un livrable**
- **Nominal :** *Étant donné* un livrable `SOUMIS`, *Quand* le formateur ouvre la correction, *Alors* le système passe le livrable à `EN_CORRECTION` (verrouillé pour l'apprenant), charge la grille, permet de noter chaque critère (niveau + commentaire) et recalcule en temps réel le score pondéré.
- **Alternatif / erreur :** *Étant donné* une correction incomplète (critères non tous notés ou total ≠ 100 %), *Quand* le formateur finalise, *Alors* le système refuse la finalisation (« correction incomplète »).

**[US-ATEL-07] — Feedback immuable & notification**
- **Nominal :** *Étant donné* une correction complète, *Quand* le formateur l'envoie, *Alors* le système enregistre le feedback (immuable après envoi), passe le livrable à `NOTE` et notifie l'apprenant.
- **Alternatif / erreur :** *Étant donné* une tentative de modification d'un feedback déjà envoyé, *Quand* elle est émise, *Alors* le système la refuse (immuabilité).

**[US-ATEL-08] — Consulter son feedback**
- **Nominal :** *Étant donné* un livrable `NOTE`, *Quand* l'apprenant ouvre son atelier, *Alors* le système affiche la note globale, le détail par critère et le commentaire général.
- **Alternatif / erreur :** *Étant donné* un livrable encore `EN_CORRECTION`, *Quand* l'apprenant le consulte, *Alors* le système indique que la correction est en cours, sans révéler de note partielle.

**[US-ATEL-09] — Déclencher la certification**
- **Nominal :** *Étant donné* une correction finalisée, *Quand* le système évalue l'éligibilité, *Alors* si tous les QCM requis ≥ seuil **ET** tous les ateliers ≥ seuil **ET** formation non clôturée, il déclenche l'émission du certificat (DS-04, asynchrone).
- **Alternatif / erreur :** *Étant donné* un score sous le seuil ou des modules manquants, *Quand* l'évaluation s'exécute, *Alors* aucune certification n'est déclenchée (« certification non éligible »).

---

## E5 Épopée — Certification numérique vérifiable

- **Besoins couverts (F / NF) :** F3 (Certification Numérique Vérifiable, P0 — Critique) ; NF3 (immuabilité, intégrité SHA-256), NF4 (minimisation RGPD sur la page publique), NF2 (page publique rapide et disponible). ADR de référence : ADR-04 (Bull/Redis), ADR-10 (SHA-256 + QR + URL publique).
- **Acteurs concernés :** Système (émission asynchrone), Apprenant (consultation/téléchargement), Visiteur Public (vérification anonyme), Administrateur (révocation).
- **Objectif métier (valeur) :** Produire un certificat infalsifiable et vérifiable par n'importe qui, sans compte, en scannant un QR code — la lacune G3 du benchmark. L'empreinte SHA-256, l'URL publique et le cycle de vie maîtrisé (émission, révocation, expiration) donnent au document sa valeur probante institutionnelle.
- **Cas d'utilisation rattachés (UC) :** UC App « Consulter son certificat » · UC1-3 Visiteur Public « Scanner / Vérifier / Consulter » · UC6 Admin « Révoquer » · DS-04, DS-05, DS-07 · AC-01/AC-02 · état *Certificat* (EN_ATTENTE_GENERATION → EN_GENERATION → ACTIF → REVOQUE/EXPIRE).
- **Sprint(s) cible (Gantt) :** Sprint 6 (génération PDF, QR code, SHA-256, URL de vérification publique).

### Tableau des user stories — E5

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-CERT-01 | En tant que système, je veux générer le certificat de façon asynchrone (PDF + SHA-256 + QR) afin de ne jamais bloquer le serveur. | Must | 8 | DS-04 / AC-02 + état *Certificat* | NF3, NF1 | E4 (déclenchement), Bull/Redis, MinIO |
| US-CERT-02 | En tant que système, je veux gérer les échecs de génération (retry + alerte admin) afin de garantir qu'aucun certificat ne reste bloqué. | Should | 3 | DS-04 / AC-02 | NF2 | US-CERT-01 |
| US-CERT-03 | En tant qu'apprenant, je veux consulter et télécharger mon certificat afin de disposer de ma preuve de réussite. | Must | 2 | UC App / DS-04, DS-05 | — | US-CERT-01 |
| US-CERT-04 | En tant que visiteur, je veux vérifier l'authenticité d'un certificat sans compte afin de confirmer sa validité. | Must | 5 | UC1-3 VP / DS-05 | NF3 | US-CERT-01 |
| US-CERT-05 | En tant que système, je veux protéger la page publique (rate limiting) et n'exposer que des données minimales afin de respecter le RGPD et de résister aux abus. | Must | 3 | DS-05 (ét. 2-3) | NF4, NF2 | US-CERT-04, Redis |
| US-CERT-06 | En tant qu'administrateur, je veux révoquer un certificat (motif, double confirmation) afin de l'invalider, sans jamais supprimer sa trace. | Must | 5 | UC6 Admin / DS-07 | NF3 | US-CERT-01 |
| US-CERT-07 | En tant que système, je veux faire expirer automatiquement les certificats échus afin de refléter leur cycle de vie. | Could | 2 | état *Certificat* (EXPIRE) | NF3 | US-CERT-01 |
| US-CERT-08 | En tant qu'administrateur, je veux réémettre un certificat après une révocation pour erreur afin de corriger une émission erronée. | Could | 2 | DS-07 (cas particulier) → DS-04 | NF3 | US-CERT-06 |

**Total E5 : 8 stories — 30 points.**

#### Critères d'acceptation (Gherkin français)

**[US-CERT-01] — Émission asynchrone**
- **Nominal :** *Étant donné* une éligibilité validée, *Quand* l'émission est déclenchée, *Alors* le système crée le certificat en `EN_ATTENTE_GENERATION`, met un job en file Bull et retourne immédiatement (HTTP 202) ; le worker passe à `EN_GENERATION`, génère le PDF (PDFKit), calcule le SHA-256, génère le QR (URL + UUID seulement), téléverse sur MinIO, passe à `ACTIF` et notifie l'apprenant.
- **Alternatif / erreur :** *Étant donné* un échec ponctuel du worker, *Quand* le job s'exécute, *Alors* il est rejoué avec backoff exponentiel (5/10/20 s) jusqu'à 3 tentatives, sans bloquer le thread web.

**[US-CERT-02] — Gestion des échecs**
- **Nominal :** *Étant donné* trois tentatives échouées, *Quand* l'échec devient définitif, *Alors* le système remet le certificat en `EN_ATTENTE_GENERATION` (ou `EXPIRE` selon la politique) et alerte l'administrateur.
- **Alternatif / erreur :** *Étant donné* un service de stockage indisponible, *Quand* le worker tente l'upload, *Alors* le job échoue proprement et entre dans la politique de reprise (pas de certificat partiel publié).

**[US-CERT-03] — Consulter/télécharger son certificat**
- **Nominal :** *Étant donné* un certificat `ACTIF`, *Quand* l'apprenant l'ouvre, *Alors* le système affiche ses métadonnées et permet de télécharger le PDF certifié (avec QR et empreinte en pied de page).
- **Alternatif / erreur :** *Étant donné* un certificat encore `EN_GENERATION`, *Quand* l'apprenant le consulte, *Alors* le système indique que la génération est en cours.

**[US-CERT-04] — Vérification publique**
- **Nominal :** *Étant donné* un visiteur scannant le QR (ou saisissant l'URL), *Quand* la page publique s'ouvre, *Alors* le système recherche l'UUID et affiche : `ACTIF` → badge vert après recalcul et comparaison du SHA-256 ; `REVOQUE` → badge rouge + date ; `EXPIRE` → badge gris ; UUID inconnu → badge orange « introuvable ».
- **Alternatif / erreur (intégrité) :** *Étant donné* un PDF dont le hash recalculé ne correspond pas à l'empreinte enregistrée, *Quand* la vérification s'exécute, *Alors* le système affiche « Intégrité compromise ».

**[US-CERT-05] — Protection & minimisation de la page publique**
- **Nominal :** *Étant donné* la page publique de vérification, *Quand* un visiteur la consulte, *Alors* seules des données minimales sont exposées (nom/prénom, titre, dates, organisme, mention), jamais l'email ni les notes détaillées ; chaque consultation est journalisée et le compteur incrémenté.
- **Alternatif / erreur (abus) :** *Étant donné* plus de 20 requêtes/min depuis une même IP, *Quand* les requêtes arrivent, *Alors* le système renvoie HTTP 429 (rate limiting Redis).

**[US-CERT-06] — Révoquer un certificat**
- **Nominal :** *Étant donné* un certificat `ACTIF`, *Quand* l'administrateur le révoque avec motif normalisé (FRAUDE / ERREUR_ADMIN / DISCIPLINAIRE / JUDICIAIRE), description et double confirmation (mot de passe), *Alors* dans une transaction atomique le système passe le statut à `REVOQUE`, enregistre la révocation, journalise l'action (immuable), **conserve le PDF et le hash**, et notifie l'apprenant ; la page publique affiche immédiatement « Révoqué ».
- **Alternatif / erreur :** *Étant donné* un certificat déjà révoqué (HTTP 409) ou un mot de passe admin incorrect (HTTP 401), *Quand* la révocation est soumise, *Alors* le système la refuse sans rien modifier.

**[US-CERT-07] — Expiration automatique**
- **Nominal :** *Étant donné* un certificat dont la date d'expiration est atteinte, *Quand* le cron s'exécute, *Alors* le système le bascule en `EXPIRE` (badge gris) ; il reste consultable publiquement.
- **Alternatif / erreur :** *Étant donné* un certificat déjà `REVOQUE`, *Quand* le cron passe, *Alors* son statut n'est pas modifié (état terminal).

**[US-CERT-08] — Réémission après révocation pour erreur**
- **Nominal :** *Étant donné* une révocation de motif `ERREUR_ADMIN`, *Quand* l'administrateur déclenche la réémission, *Alors* le système appelle l'émission (DS-04) avec les données corrigées et produit un nouveau certificat `ACTIF`.
- **Alternatif / erreur :** *Étant donné* une révocation de motif `FRAUDE`, *Quand* une réémission est tentée, *Alors* le système ne propose pas la réémission automatique (cas non prévu pour ce motif).

## E6 Épopée — Assistance IA aux formateurs (génération QCM + supports RAG)

- **Besoins couverts (F / NF) :** F4 (Assistant IA de Génération de Questions QCM, P0 — Critique — fonctionnalité différenciante) ; NF3 (traçabilité, humain dans la boucle), NF1 (asynchronisme). ADR de référence : ADR-05 (couche d'abstraction LLM), ADR-04 (Bull/Redis), ADR-06 (SSE).
- **Acteurs concernés :** Formateur (upload de supports, génération, révision), Système / Worker IA (indexation, pipeline RAG), LLM externe (génération).
- **Objectif métier (valeur) :** Faire gagner au formateur un temps considérable sur la rédaction de QCM de qualité, en générant des questions **ancrées dans ses vrais supports de cours** (RAG) et **toujours validées par un humain**. C'est le différenciant N4 absent de toutes les plateformes du benchmark (lacune G1). Le coût LLM est maîtrisé car borné (génération occasionnelle côté formateur, pas un chatbot par étudiant — cf. pivot §13.6).
- **Cas d'utilisation rattachés (UC) :** UC10+UC11 Formateur « Générer des questions par IA » · DS-06 · AC-04 · état *SuggestionQuestionIA* (PROPOSEE → ACCEPTEE/MODIFIEE/REJETEE) et statut *SupportPedagogique* (EnIndexation → Indexé).
- **Sprint(s) cible (Gantt) :** Sprint 7 (upload + indexation RAG, intégration API LLM, génération par lot) et Sprint 8 (interface de révision formateur, ajout à la banque).

### Tableau des user stories — E6

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-IA-01 | En tant que formateur, je veux uploader et faire indexer un support pédagogique afin de fournir une source fiable à la génération IA. | Must | 8 | UC10 For / DS-06 (P1) + AC-04 | NF1 | E0 (pgvector, Bull), MinIO |
| US-IA-02 | En tant que formateur, je veux lancer une génération de questions paramétrée afin d'obtenir des suggestions adaptées à mon module. | Must | 3 | UC10 For / DS-06 (P2) | — | US-IA-01 |
| US-IA-03 | En tant que système, je veux exécuter le pipeline RAG (retrieval + génération) afin de produire des questions ancrées dans le support. | Must | 8 | DS-06 (pipeline) / AC-04 | NF3 | US-IA-02, ADR-05 |
| US-IA-04 | En tant que formateur, je veux réviser chaque suggestion (accepter / modifier / rejeter) afin de garder le contrôle humain sur le contenu certifiant. | Must | 5 | UC11 For / DS-06 (P3) + état *SuggestionQuestionIA* | NF3 | US-IA-03 |
| US-IA-05 | En tant qu'institution, je veux tracer chaque génération et l'origine IA des questions afin d'assurer la transparence et l'auditabilité. | Should | 3 | DS-06 / §13.6 | NF3 | US-IA-04 |
| US-IA-06 | En tant qu'équipe, je veux une couche d'abstraction LLM afin de changer de fournisseur (GPT-4o / Claude / Mistral) sans refondre le code métier. | Should | 3 | ADR-05 | NF8 | US-IA-03 |
| US-IA-07 | En tant que formateur, je veux être notifié en temps réel de l'avancement (indexation/génération) afin de suivre les traitements asynchrones. | Could | 3 | ADR-06 (SSE) / DS-06 | NF1 | US-IA-01, US-IA-02 |

**Total E6 : 7 stories — 33 points.**

#### Critères d'acceptation (Gherkin français)

**[US-IA-01] — Upload & indexation d'un support**
- **Nominal :** *Étant donné* un formateur, *Quand* il téléverse un PDF/PPTX/TXT rattaché à un module, *Alors* le système répond immédiatement (`statut: EnIndexation`), met un job Bull en file ; le worker extrait le texte, le découpe en chunks (≈ 512 tokens, overlap 50), calcule les embeddings, les stocke dans pgvector, passe le support à `Indexé` et notifie le formateur.
- **Alternatif / erreur :** *Étant donné* un fichier illisible ou un format non pris en charge, *Quand* l'indexation s'exécute, *Alors* le job échoue proprement et le support n'est pas marqué `Indexé` (le formateur en est informé).

**[US-IA-02] — Lancer une génération**
- **Nominal :** *Étant donné* un support `Indexé`, *Quand* le formateur règle les paramètres (nombre, types, niveau, focus thématique) et lance, *Alors* le système crée une `GenerationIA` (`EnCours`), met un job en file et répond HTTP 202.
- **Alternatif / erreur :** *Étant donné* aucun support indexé pour le module, *Quand* le formateur tente de générer, *Alors* le système l'invite d'abord à indexer un support (prérequis manquant).

**[US-IA-03] — Pipeline RAG (retrieval + génération)**
- **Nominal :** *Étant donné* un job de génération, *Quand* le worker s'exécute, *Alors* il calcule l'embedding de la requête, récupère les 8 passages les plus proches par similarité cosinus dans pgvector (uniquement le support ciblé), construit le prompt (contexte + format JSON strict), appelle le LLM, parse et valide les suggestions (structure, options, une seule correcte en QCU), puis les insère en `PROPOSEE`.
- **Alternatif / erreur :** *Étant donné* une réponse LLM mal formée, *Quand* le parsing/validation échoue, *Alors* la suggestion invalide est écartée et la génération n'expose que des suggestions valides (aucune publication automatique).

**[US-IA-04] — Réviser les suggestions (humain dans la boucle)**
- **Nominal :** *Étant donné* des suggestions `PROPOSEE`, *Quand* le formateur accepte (avec ou sans modification), *Alors* la suggestion devient une vraie `Question` dans la banque, avec origine `IA` ou `IA_MODIFIEE` ; *Quand* il rejette, la suggestion passe `REJETEE` (archivée, tracée).
- **Alternatif / erreur :** *Étant donné* une suggestion non révisée, *Quand* on tente de l'utiliser dans un QCM, *Alors* le système refuse — **aucune suggestion n'est publiable sans validation explicite** (règle non contournable).

**[US-IA-05] — Traçabilité des générations**
- **Nominal :** *Étant donné* un lot de génération, *Quand* il est exécuté, *Alors* le système enregistre formateur, module, modèle LLM, paramètres, date, et le statut final de chaque suggestion ; une question acceptée conserve la mention de son origine IA.
- **Alternatif / erreur :** *Étant donné* une demande d'audit, *Quand* l'administrateur la consulte, *Alors* l'historique complet des générations et décisions est disponible.

**[US-IA-06] — Couche d'abstraction LLM**
- **Nominal :** *Étant donné* l'interface `ILLMProvider`, *Quand* on change de fournisseur (variable de configuration), *Alors* aucun module métier n'est modifié (seul l'adaptateur change).
- **Alternatif / erreur :** *Étant donné* un fournisseur LLM indisponible, *Quand* une génération est lancée, *Alors* le job entre dans la politique de reprise et le formateur est informé en cas d'échec persistant.

**[US-IA-07] — Notifications temps réel (SSE)**
- **Nominal :** *Étant donné* une indexation ou une génération en cours, *Quand* l'état progresse, *Alors* le frontend reçoit des événements SSE et affiche l'avancement sans rechargement.
- **Alternatif / erreur :** *Étant donné* une connexion SSE interrompue, *Quand* elle se rétablit, *Alors* l'état courant est récupéré via un appel REST de repli (pas d'information perdue).

---

## E7 Épopée — Chatbot IA apprenant *(hors périmètre — fonctionnalité pivotée)*

- **Statut :** **Won't (cette version)** — épopée **explicitement de-scopée** par le projet.
- **Besoins couverts (F / NF) :** Aucune story dérivable des sources actuelles.
- **Justification (sources) :** Le dossier de conception (§13.6, « Pivot F4 ») acte le retrait du chatbot conversationnel étudiant : les entités `ConversationChatbot`, `MessageChatbot` et `ContexteApprenant` ont été **supprimées du modèle** et remplacées par l'assistance IA aux formateurs (génération de questions par RAG). Motifs : coût LLM proportionnel au nombre d'étudiants (non borné) versus génération côté formateur structurellement maîtrisable, et valeur métier plus immédiate. Le benchmark situe d'ailleurs la cible Cert_EET au niveau **N4 (IA pédagogique intégrée formateur)**, et non N3 (IA conversationnelle apprenant).
- **Conséquence pour le backlog :** la valeur IA du projet est intégralement portée par **E6 (Assistance IA aux formateurs)**. Aucune user story n'est créée ici pour ne pas inventer de périmètre absent des documents. Si ESPRIT souhaitait réintroduire un assistant conversationnel apprenant (niveau N3) dans une version ultérieure, il ferait l'objet d'un nouvel ADR (coût, souveraineté, modération) et d'une épopée dédiée — voir « Hypothèses & questions ouvertes ».

**Total E7 : 0 story — 0 point (de-scopé).**

## E8 Épopée — Suivi, analytics & reporting

- **Besoins couverts (F / NF) :** F6 (Analytics et Reporting, P1 — Majeure) ; NF3 (isolation RBAC, audit), NF1/NF2 (exports asynchrones non bloquants). ADR de référence : ADR-04 (Bull pour les exports), ADR-06 (notifications).
- **Acteurs concernés :** Formateur (suivi pédagogique de ses formations, alertes, exports), Administrateur (vue globale, supervision certificats, rapports institutionnels, audit).
- **Objectif métier (valeur) :** Donner à chaque rôle la visibilité dont il a besoin — au formateur le pilotage pédagogique et la détection du décrochage, à l'institution les indicateurs globaux, la supervision des certificats et les rapports pour les bilans/audits. L'isolation RBAC garantit que le formateur ne voit que ses formations ; les exports lourds sont asynchrones.
- **Cas d'utilisation rattachés (UC) :** UC7+UC8+UC9 Formateur « Suivi / Alertes / Export » · UC5+UC7+UC10 Admin « Supervision / Tableau de bord / Audit » · DS-14, DS-16 (P2-P5).
- **Sprint(s) cible (Gantt) :** alertes de décrochage en Sprint 8 (avec l'IA V2), tableaux de bord par rôle et exports PDF/CSV en Sprint 9.

### Tableau des user stories — E8

| ID | User story (En tant que… je veux… afin de…) | MoSCoW | Points | UC / DS liés | NF | Dépendances |
|---|---|---|---|---|---|---|
| US-SUIVI-01 | En tant que formateur, je veux un tableau de bord pédagogique de mes formations afin de piloter la progression des apprenants. | Should | 5 | UC7 For / DS-14 (P1) | NF3 | E3, E4 (données) |
| US-SUIVI-02 | En tant que système, je veux détecter automatiquement les décrochages afin d'alerter le formateur à temps. | Should | 5 | UC8 For / DS-14 (P2) | NF3 | US-SUIVI-01 |
| US-SUIVI-03 | En tant que formateur, je veux traiter une alerte (action + marquage) afin de suivre mes interventions. | Could | 2 | UC8 For / DS-14 (P2) | NF3 | US-SUIVI-02 |
| US-RPT-01 | En tant que formateur, je veux exporter un rapport de session (PDF/CSV) afin de partager un bilan. | Should | 3 | UC9 For / DS-14 (P3) | NF1 | US-SUIVI-01, Bull |
| US-DASH-01 | En tant qu'administrateur, je veux un tableau de bord global afin de suivre l'activité de toute la plateforme. | Should | 5 | UC7 Admin / DS-16 (P2) | NF3 | E2, E5 (données) |
| US-DASH-02 | En tant qu'administrateur, je veux superviser tous les certificats afin de contrôler leur statut et leurs consultations. | Should | 3 | UC5 Admin / DS-16 (P3) | NF3 | E5 |
| US-RPT-02 | En tant qu'administrateur, je veux exporter des rapports institutionnels afin d'alimenter bilans, audits et financements. | Should | 3 | UC Admin / DS-16 (P4) | NF1 | US-DASH-01, Bull |
| US-AUDIT-01 | En tant qu'administrateur, je veux consulter les journaux d'audit (filtrables, en lecture seule) afin d'assurer la conformité. | Should | 3 | UC10 Admin / DS-16 (P5) | NF3 | US-AUTH-12 (journal) |

**Total E8 : 8 stories — 29 points.**

#### Critères d'acceptation (Gherkin français)

**[US-SUIVI-01] — Tableau de bord pédagogique**
- **Nominal :** *Étant donné* un formateur, *Quand* il ouvre son tableau de bord, *Alors* le système n'affiche que ses formations (isolation RBAC) avec KPIs (inscrits/actifs/décrocheurs, taux de complétion, scores moyens, histogramme) et une vue individuelle triable/filtrable.
- **Alternatif / erreur :** *Étant donné* une tentative d'accès aux données d'une formation qu'il n'anime pas, *Quand* la requête est émise, *Alors* le système refuse (HTTP 403).

**[US-SUIVI-02] — Alertes de décrochage automatiques**
- **Nominal :** *Étant donné* des critères factuels (absence > 7 j, 2 échecs QCM consécutifs, livrable en retard > 48 h, score en chute), *Quand* le cron s'exécute, *Alors* le système crée les alertes correspondantes et notifie le formateur (badge + email optionnel).
- **Alternatif / erreur :** *Étant donné* un apprenant ne remplissant aucun critère, *Quand* le cron passe, *Alors* aucune alerte n'est générée pour lui (pas de faux positif).

**[US-SUIVI-03] — Traiter une alerte**
- **Nominal :** *Étant donné* une alerte ouverte, *Quand* le formateur saisit l'action menée et la marque « Traitée », *Alors* le système enregistre l'action et journalise `ALERTE_TRAITEE`.
- **Alternatif / erreur :** *Étant donné* une alerte déjà traitée, *Quand* le formateur la rouvre, *Alors* le système conserve l'historique des actions sans l'écraser.

**[US-RPT-01] — Exporter un rapport de session (Formateur)**
- **Nominal :** *Étant donné* une formation du formateur, *Quand* il demande un export (global / individuel / par module, format PDF ou CSV), *Alors* le système génère le rapport de façon asynchrone (Bull) et le met à disposition sur notification.
- **Alternatif / erreur :** *Étant donné* un volume de données important, *Quand* l'export est lancé, *Alors* le thread web n'est pas bloqué (HTTP 202) et l'utilisateur est prévenu à la fin.

**[US-DASH-01] — Tableau de bord global (Admin)**
- **Nominal :** *Étant donné* un administrateur, *Quand* il ouvre le tableau de bord global, *Alors* le système affiche des indicateurs agrégés tous rôles (utilisateurs par rôle, formations en cours, certificats émis/révoqués, évaluations, activité récente, alertes système).
- **Alternatif / erreur :** *Étant donné* une période sans données, *Quand* le tableau se charge, *Alors* le système affiche des indicateurs à zéro sans erreur.

**[US-DASH-02] — Superviser les certificats (Admin)**
- **Nominal :** *Étant donné* un administrateur, *Quand* il ouvre la supervision des certificats, *Alors* le système liste les certificats (UUID, titulaire, formation, score, statut, nombre de consultations publiques) et permet d'ouvrir une fiche détaillée (historique, empreinte SHA-256).
- **Alternatif / erreur :** *Étant donné* un filtre sur un statut donné, *Quand* il est appliqué, *Alors* seuls les certificats correspondants sont affichés.

**[US-RPT-02] — Rapports institutionnels (Admin)**
- **Nominal :** *Étant donné* un administrateur, *Quand* il génère un rapport institutionnel (type, format, période), *Alors* le système agrège les données sur la période, produit le fichier de façon asynchrone (Bull) et notifie à la disponibilité.
- **Alternatif / erreur :** *Étant donné* une période invalide (début > fin), *Quand* il lance la génération, *Alors* le système renvoie une erreur de validation.

**[US-AUDIT-01] — Consulter les journaux d'audit (Admin)**
- **Nominal :** *Étant donné* un administrateur, *Quand* il ouvre le journal d'audit, *Alors* le système affiche les entrées (horodatage, action, acteur, cible, IP, résultat) avec filtres par type d'action et par période, en lecture seule.
- **Alternatif / erreur :** *Étant donné* une tentative de modification/suppression d'une entrée, *Quand* elle est émise, *Alors* le système la refuse — aucune route `UPDATE`/`DELETE` n'existe sur les journaux (immuabilité).

---

# Livrables transverses

## L1. Definition of Ready (DoR) & Definition of Done (DoD)

### Definition of Ready — une story est prête à entrer en sprint si :
- elle suit le format « En tant que… je veux… afin de… » et apporte une valeur claire (INVEST) ;
- ses critères d'acceptation Gherkin (nominal + erreur) sont rédigés et compris ;
- sa traçabilité est établie (au moins une exigence F/NF, et le UC/DS applicable) ;
- ses dépendances sont identifiées et non bloquantes pour le sprint ;
- elle est estimée en points (Fibonacci) et tient dans un sprint (sinon, elle est découpée) ;
- les données/maquettes/contrats d'API nécessaires sont disponibles ou planifiés.

### Definition of Done — une story est terminée si (base CdC §7.1, étendue) :
- la fonctionnalité est **développée** conformément aux critères d'acceptation ;
- elle est **testée** : tests unitaires + tests d'intégration, avec un seuil de couverture renforcé sur les modules critiques (QCM, certification, authentification) ;
- les **chemins d'erreur** des DS correspondants sont couverts par des tests ;
- les règles transverses de sécurité s'appliquent (RBAC, journal d'audit, validation serveur) ;
- l'**API est documentée** (OpenAPI) et le code respecte le lint/format (CI verte) ;
- la story est **déployée en environnement de recette** via la CI/CD ;
- elle est **revue** (revue de code) et démontrable en Sprint Review.

## L2. Matrice de traçabilité synthétique (Besoin → Épopée → US → UC/DS)

| Besoin | Priorité | Épopée(s) | US représentatives | UC / DS |
|---|---|---|---|---|
| F1 — QCM anti-fraude | P0 | E3 | US-QCM-01 → 11 | UC1-2 For, UC2 App / DS-02, DS-12 |
| F2 — Ateliers pratiques | P0 | E4 | US-ATEL-01 → 09 | UC3-5 For, UC4 App / DS-03, DS-13 |
| F3 — Certification vérifiable | P0 | E5 | US-CERT-01 → 08 | UC App, UC1-3 VP, UC6 Admin / DS-04, DS-05, DS-07 |
| F4 — Assistant IA génération QCM | P0 | E6 | US-IA-01 → 07 | UC10-11 For / DS-06 |
| F5 — Gestion multi-rôles (RBAC) | P0 | E2 (+ E1 pour l'application RBAC) | US-CPT-*, US-ROL-01, US-FORM-*, US-INSC-*, US-AUTH-11 | UC1-5 Admin, UC1 App / DS-08, DS-09, DS-11, DS-15, DS-16 |
| F6 — Analytics et reporting | P1 | E8 | US-SUIVI-*, US-DASH-*, US-RPT-*, US-AUDIT-01 | UC7-9 For, UC5/7/10 Admin / DS-14, DS-16 |
| F7 — Sécurité et conformité | P1 | E1 | US-AUTH-01 → 13 | « S'authentifier », UC9-10 Admin / DS-01, DS-10, DS-15 |
| NF1 — Performance (< 3 s) | — | E1, E5, E6, E8 | US-AUTH-03, US-CERT-01, US-IA-*, exports async | DS-04, DS-06 |
| NF2 — Disponibilité | — | E0, E1, E5 | US-INFRA-*, US-AUTH-13, US-CERT-05 | DEP-03 |
| NF3 — Sécurité (JWT/MFA/RBAC/audit) | — | E1 (+ transverse) | US-AUTH-01/02/11/12, US-QCM-06/07/08 | DS-01, DS-16 (P5) |
| NF4 — Souveraineté / RGPD | — | E1, E2, E5 | US-AUTH-12, US-CPT-04, US-CERT-05 | DS-15 (P4), DS-05 |
| NF5/NF6 — Scalabilité / Maintenabilité | — | E0 | US-INFRA-03/04/05/08 | ADR-02/04/07/09 |
| NF8 — Interopérabilité (API REST/OpenAPI) | — | E0, E6 | US-INFRA-08, US-IA-06 | ADR-02, ADR-05 |
| NF9 — Portabilité (Docker) | — | E0 | US-INFRA-03/06 | ADR-07 |

## L3. Récapitulatif chiffré

### Par épopée

| Épopée | Stories | Points |
|---|---|---|
| E0 — Socle & Infrastructure | 8 | 28 |
| E1 — Authentification & Sécurité | 13 | 42 |
| E2 — Comptes, rôles & formations | 12 | 35 |
| E3 — Évaluations QCM anti-fraude | 11 | 41 |
| E4 — Ateliers pratiques & correction | 9 | 30 |
| E5 — Certification numérique vérifiable | 8 | 30 |
| E6 — Assistance IA aux formateurs | 7 | 33 |
| E7 — Chatbot IA apprenant *(de-scopé)* | 0 | 0 |
| E8 — Suivi, analytics & reporting | 8 | 29 |
| **Total** | **76** | **268** |

### Par sprint (rattachement Gantt principal)

| Sprint | Période | Épopées / contenu | Points indicatifs |
|---|---|---|---|
| Sprint 0 | 24 avr. – 07 mai | E0 (cadrage, dépôt Git) | ~5 |
| Sprint 1 | 08 – 21 mai | E0 (Docker, CI/CD, BDD) + E1 (auth/MFA/RBAC) + E2 (comptes/rôles) | ~80 |
| Sprint 2 | 22 mai – 04 juin | E2 (formations, inscriptions) + E3 (moteur QCM, randomisation, timer, scoring) | ~50 |
| Sprint 3 | 05 – 18 juin | E3 (anti-fraude avancée, historique, multi-session) | ~15 |
| Sprint 4 | 19 juin – 02 juil. | E4 (création atelier, soumission, workflow statuts) | ~13 |
| Sprint 5 | 03 – 16 juil. | E4 (correction, grille, feedback, notifications) | ~17 |
| Sprint 6 | 17 – 30 juil. | E5 (certification : PDF, QR, SHA-256, vérification) | ~30 |
| Sprint 7 | 31 juil. – 13 août | E6 (upload/indexation RAG, intégration LLM, génération) | ~22 |
| Sprint 8 | 14 – 27 août | E6 (révision formateur, banque) + E8 (alertes décrochage) | ~18 |
| Sprint 9 | 28 août – 10 sept. | E8 (tableaux de bord, exports PDF/CSV, audit) | ~22 |
| Sprint 10 | 11 – 24 sept. | Durcissement transverse : sécurité OWASP, charge, perf (clôt US-AUTH-13, NF) | — |
| Sprint 11-12 | 25 sept. – 24 oct. | Recette finale, documentation, rapport PFE, soutenance | — |

> Les points par sprint sont indicatifs ; le Sprint Planning ajuste la sélection selon la vélocité réelle (les Sprints 1 et 2 sont volontairement denses car ils combinent plusieurs épopées fondatrices, et seront équilibrés au refinement).

## L4. Hypothèses & questions ouvertes

1. **E7 — chatbot apprenant (de-scopé).** Le retrait est documenté (§13.6, pivot F4). *Question :* ESPRIT confirme-t-il l'exclusion définitive pour cette version, ou souhaite-t-il une épopée « future » (niveau N3) conditionnée à un nouvel ADR (coût LLM, souveraineté, modération) ?
2. **« Mot de passe oublié » (US-AUTH-06).** Confirmé comme existant côté produit ; les sources ne décrivent pas un DS dédié. *Hypothèse retenue :* le flux réutilise la **primitive de lien email à usage unique** de l'activation (DS-15 P1) avec anti-énumération. À valider (TTL du lien de réinitialisation, canal email).
3. **Verrouillage anti-force-brute sur la connexion.** Le rate-limiting est sourcé pour la page publique (glossaire) et la DMZ (DEP-03), mais **le seuil exact de blocage du login** (nombre de tentatives, durée) n'est pas spécifié. À définir en Sprint 10 (durcissement).
4. **Proctoring webcam (10ᵉ paramètre anti-fraude, DS-12 P3).** Mentionné comme **optionnel**. *Question :* est-il dans le périmètre PFE (faisabilité, RGPD) ou différé ?
5. **Durée de validité / date d'expiration des certificats (US-CERT-07).** L'état `EXPIRE` existe mais la **politique de durée** n'est pas précisée. À définir avec ESPRIT.
6. **Service email (SMTP).** Les flux d'activation/réinitialisation/notifications supposent un fournisseur email configuré (adaptateur `IEmailProvider`). *Hypothèse :* SMTP institutionnel disponible dès le Sprint 1.
7. **Cibles chiffrées NF (NF1 < 3 s, NF5 scalabilité).** Les seuils précis de charge et de montée en charge ne sont pas tous quantifiés ; à confirmer pour cadrer les tests de charge du Sprint 10.
8. **Seuils de la DoD (couverture de tests).** Le pourcentage de couverture exigé sur les modules critiques reste à arrêter avec l'encadrant.
9. **Numérotation des UC.** Les libellés transverses (« S'authentifier », « Gérer son profil ») n'ont pas de numéro UC dans les diagrammes par acteur ; la traçabilité s'appuie sur le DS correspondant. À harmoniser si une numérotation UC transverse est ajoutée.

---

*Fin du backlog produit — Cert_EET v1.0 · 9 épopées (E7 de-scopée), 76 user stories, 268 points · Iyed Omri, PFE ESPRIT.*




