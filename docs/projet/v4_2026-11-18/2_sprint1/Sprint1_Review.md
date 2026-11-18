# Cert_EET — Sprint 1 · Revue de Sprint (Sprint Review)

> **Projet :** Cert_EET — Certification ESPRIT Entreprise · PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 1 — « Fondations backend & infrastructure »
> **Statut :** ✅ **CLÔTURÉ** — 9/9 stories engagées + 6/6 stories d'extension terminées (15 stories livrées).
> **But de ce document :** expliquer **simplement** ce qui a été construit pendant le Sprint 1, **pourquoi**,
> **comment ça marche**, et **comment le démontrer** — lisible par un non-spécialiste comme par le jury.

---

## 0. Comment lire ce document

Ce document est volontairement pédagogique. Chaque bloc suit la même logique :

- **Quoi** — ce qui a été fait, en une phrase simple.
- **Pourquoi** — le problème que ça résout.
- **Comment** — le mécanisme, expliqué sans jargon (le jargon est défini dans le **glossaire, §9**).

Si un mot technique n'est pas clair (CI, CD, Docker, JWT, RBAC, MFA…), saute directement au **glossaire
(§9)** : chaque terme y est expliqué avec une image concrète.

---

## 1. Le contexte en une page

Cert_EET est une **plateforme de formation et de certification** sur mesure pour ESPRIT Entreprise.
Aujourd'hui, l'institution utilise des outils éparpillés (Blackboard, Teams, Moodle) : silos, peu de
traçabilité, certificats peu crédibles. Le projet vise une plateforme **unifiée, souveraine (hébergée en
Tunisie), moderne**, avec des évaluations anti-fraude, des certifications vérifiables et un chatbot IA.

Un tel produit se construit par couches. On ne commence pas par les fonctionnalités visibles (les cours,
les certificats) : on commence par les **fondations** — le socle technique sur lequel tout le reste
reposera. **C'est l'objet du Sprint 1.**

Une image : avant de construire les étages d'un immeuble (les cours, les QCM, les certificats), il faut
couler les **fondations** (le serveur, la base de données, la sécurité, la chaîne de livraison). Un
étage bâti sur des fondations fragiles s'effondre. Le Sprint 1 a coulé ces fondations.

---

## 2. Le but du Sprint (Sprint Goal) et son verdict

> **Objectif engagé :** « Un backend entièrement conteneurisé, intégré en continu, avec authentification
> JWT complète (connexion, rafraîchissement avec rotation, déconnexion), contrôle d'accès par rôle (RBAC)
> et un schéma de base de données initial opérationnel. »

Traduit en langage simple, l'objectif était d'avoir :
1. une application qui tourne dans des **boîtes standardisées** (Docker) ;
2. un **robot** qui vérifie automatiquement le code à chaque modification (CI) ;
3. un système de **connexion sécurisé** (créer un compte, se connecter, rester connecté sans danger, se
   déconnecter) ;
4. une gestion de **qui a le droit de faire quoi** (les rôles : apprenant, formateur, administrateur) ;
5. une **base de données** structurée pour stocker tout ça.

**Verdict : objectif atteint — et dépassé.** En plus du socle, le sprint a livré en avance l'inscription
publique, la connexion via Google/GitHub, le profil apprenant, la double authentification (MFA), la
gouvernance des comptes et des rôles, le journal d'audit, la documentation d'API et la chaîne de
livraison automatique (CD).

---

## 3. Bilan chiffré

| Indicateur | Valeur | Ce que ça veut dire |
|---|---|---|
| Stories livrées | **15** | 9 engagées + 6 d'extension (« stretch ») |
| Points engagés | **41 pts** (9/9) | Unité d'effort Scrum ; tout l'engagement ferme est tenu |
| Points d'extension | **25 pts** (6/6) + 3 pts (US-CPT-03) | Bonus livré en plus de l'engagement |
| Pull Requests mergées | **#10 → #21** | Chaque story = 1 PR relue et intégrée |
| Tests automatisés (API) | **110 tests** verts | Le code est vérifié par la machine, pas à la main |
| Stories retirées (décision) | US-CPT-01, US-AUTH-05 | Abandonnées volontairement (voir §6, décision D4) |
| Journaux techniques | `engineering-log/` 14 → 20 | Un compte rendu écrit par story |

> **Note sur les « points ».** En Scrum, on n'estime pas en heures mais en **points de complexité**
> (story points) : une échelle relative (1, 2, 3, 5, 8…). 41 points « tenus » signifie que tout ce qui
> avait été promis pour ce sprint a été livré.

---

## 4. Ce qui a été construit (expliqué simplement)

On regroupe les livrables en trois familles (appelées **épopées** en Scrum) : **Infrastructure**,
**Authentification**, **Comptes & Rôles**.

### 4.1 Infrastructure — les fondations techniques

**US-INFRA-02 — Squelette NestJS + Next.js.**
*Quoi :* créer les deux applications vides mais fonctionnelles (le **backend** = le cerveau côté serveur,
en NestJS ; le **frontend** = la partie visible dans le navigateur, en Next.js).
*Pourquoi :* il faut une structure de départ propre avant d'écrire la moindre fonctionnalité.
*Comment :* initialisation des projets, configuration stricte, et une page `/health` qui répond « je suis
vivant » (utile pour la surveillance).

**US-INFRA-03 — Docker Compose multi-services.**
*Quoi :* mettre l'application dans des **boîtes Docker** (voir glossaire) et les faire tourner ensemble.
*Pourquoi :* pour que l'appli marche **pareil partout** (PC du développeur, serveur de test, serveur
final), sans « ça marche chez moi mais pas ailleurs ».
*Comment :* 5 boîtes orchestrées — l'**API** (backend), le **web** (frontend), **PostgreSQL** (la base de
données), **Redis** (une mémoire rapide), **nginx** (le portier qui reçoit les requêtes et les distribue).

**US-INFRA-04 — Schéma de base de données + migrations.**
*Quoi :* définir comment les données sont rangées (tables utilisateurs, sessions, audit…) et un mécanisme
pour faire évoluer cette structure proprement (**migrations**).
*Pourquoi :* une base bien structurée évite les incohérences et les pertes de données.
*Comment :* entités TypeORM (User, AuditLog, RefreshToken…), une première migration et un compte
administrateur créé automatiquement au démarrage (« seed »).

**US-INFRA-07 — Gestion des secrets.**
*Quoi :* protéger les informations sensibles (mots de passe, clés de chiffrement) pour qu'elles ne soient
**jamais** dans le code.
*Pourquoi :* mettre un secret dans le code, c'est comme écrire le code de sa carte bancaire sur la porte.
*Comment :* clés de signature RS256 générées et injectées à part ; démarrage « fail-fast » (l'appli refuse
de démarrer si un secret obligatoire manque, plutôt que de tourner en étant vulnérable).

**US-INFRA-05 — Pipeline CI (intégration continue).**
*Quoi :* un **robot** qui, à chaque modification du code, vérifie automatiquement qu'il respecte les règles
(lint) et que les tests passent.
*Pourquoi :* détecter les erreurs **tout de suite**, pas une fois en production.
*Comment :* workflow GitHub Actions qui installe, vérifie le style, lance 110 tests avec une vraie base
PostgreSQL + Redis, et calcule la couverture de tests.

**US-INFRA-08 — Documentation API (OpenAPI / Swagger).** *(stretch)*
*Quoi :* une **page web générée automatiquement** qui liste toutes les routes de l'API, les explique, et
permet de les tester depuis le navigateur (`/api/docs`).
*Pourquoi :* c'est le « mode d'emploi » de l'API — indispensable pour la démo, pour brancher le frontend,
et comme contrat entre backend et frontend.
*Comment :* 17 routes protégées affichent un **cadenas** (il faut un jeton pour y accéder), 11 routes
publiques n'en ont pas ; un bouton « Authorize » permet de coller un jeton et de tester les routes
protégées. Vérifié : lint propre + 110 tests verts.

**US-INFRA-06 — Pipeline CD (livraison continue).** *(stretch)*
*Quoi :* un **deuxième robot** qui, après chaque vérification réussie sur `main`, **fabrique les versions
installables** de l'application (les **images Docker** de production) et les **range dans un magasin en
ligne** (GHCR).
*Pourquoi :* avoir en permanence une version prête à déployer, sans fabrication manuelle.
*Comment :* le robot se déclenche **seulement si la CI est verte**, construit les images de l'API et du
site, et les publie sur GHCR avec deux étiquettes (`latest` = la dernière, et le numéro de version exact).
Le déploiement sur un vrai serveur reste manuel et documenté (voir §6, dette assumée). **Validé en
production : le premier run du CD a réussi en 4 min et publié les deux images.**

### 4.2 Authentification — « qui es-tu, et puis-je te faire confiance ? »

**US-AUTH-01 — Se connecter.** Connexion par email + mot de passe. Le mot de passe n'est jamais stocké en
clair (haché avec bcrypt). En cas de succès, le serveur délivre des **jetons JWT** (voir glossaire).

**US-AUTH-03 — Rafraîchir la session (avec rotation).** Pour rester connecté sans se reconnecter sans
cesse, l'application échange discrètement un « jeton de rafraîchissement ». À chaque échange, l'ancien
jeton est **brûlé** et un nouveau émis (**rotation**) ; si un jeton volé est réutilisé, tout le monde est
déconnecté (**détection de rejeu**). C'est une défense reconnue (OWASP).

**US-AUTH-04 — Se déconnecter.** La déconnexion **invalide réellement** les jetons (liste de blocage dans
Redis), au lieu de simplement « oublier » côté navigateur.

**US-AUTH-11 — Contrôle d'accès par rôle (RBAC).** Le système sait **qui a le droit de faire quoi** :
un apprenant ne peut pas accéder aux écrans d'administration. Techniquement, deux « gardes » globaux
vérifient d'abord l'identité (jeton valide ?) puis le rôle (autorisé ?) ; les routes publiques sont
marquées `@Public`.

**US-CPT-05 — Auto-inscription publique.** *(Sprint 2 tiré en avance)* N'importe qui peut créer un compte
apprenant (email + mot de passe), confirmé par un email de vérification.

**US-AUTH-14 — Connexion Google & GitHub.** *(Sprint 2 tiré)* Connexion via un compte Google ou GitHub
(OAuth2), avec liaison automatique au compte existant par email.

**US-AUTH-09 + US-AUTH-02 — MFA (double authentification).** *(stretch)* En plus du mot de passe, un
**code à 6 chiffres** qui change toutes les 30 secondes (TOTP, type Google Authenticator). Activation par
QR code, puis connexion en deux temps. Protège les comptes même si le mot de passe est volé.

**US-AUTH-12 — Journal d'audit immuable.** *(stretch)* Toutes les actions sensibles (connexion, changement
de rôle…) sont **enregistrées de façon inaltérable** : un seul composant peut écrire, et une règle dans la
base de données (trigger) empêche toute modification ou suppression. Consultable et exportable en CSV.

### 4.3 Comptes & Rôles — la gouvernance

**US-AUTH-15 — Profil apprenant.** *(Sprint 2 tiré)* À la première connexion, l'apprenant complète son
profil (niveau d'études, établissement…), avec un référentiel des universités/établissements tunisiens.

**US-CPT-03 — Désactiver / réactiver un compte.** Un admin peut suspendre un compte **avec un motif**,
avec une garde « anti-lockout » qui empêche de désactiver le dernier administrateur (sinon plus personne
ne pourrait administrer).

**US-ROL-01 — L'admin change le rôle d'un utilisateur.** Promouvoir un apprenant en formateur, par
exemple, avec **invalidation immédiate** de ses sessions (le nouveau rôle s'applique tout de suite).

**US-ROL-02 — Demande de changement de rôle (self-service).** Un utilisateur peut **demander** un
changement de rôle ; un admin approuve ou rejette.

---

## 5. Script de démonstration (pour la Sprint Review)

Ordre conseillé pour une démo fluide (≈ 10–15 min) :

1. **Documentation d'API** — ouvrir `http://localhost:3000/api/docs` :
   montrer les routes groupées par thème, les **cadenas** sur les routes protégées, puis cliquer
   « Authorize », coller un jeton, et exécuter `GET /api/me` → réponse **200** (ça prouve que la sécurité
   fonctionne).
2. **Inscription + connexion** — créer un compte, recevoir l'email de vérification, se connecter.
3. **Double authentification (MFA)** — activer la MFA (scan du QR code avec une app d'authentification),
   se déconnecter, puis se reconnecter : mot de passe **puis** code à 6 chiffres.
4. **Connexion sociale** — se connecter via Google (ou GitHub).
5. **Gouvernance (en admin)** — changer le rôle d'un utilisateur (ses sessions sont invalidées
   immédiatement), désactiver/réactiver un compte avec motif ; côté utilisateur, faire une demande de
   changement de rôle, puis l'approuver en admin.
6. **Journal d'audit** — montrer la liste des actions enregistrées, exporter en CSV, et expliquer
   l'immuabilité (impossible à modifier).
7. **CI / CD** — onglet **Actions** de GitHub : montrer **CI verte → CD déclenché automatiquement** ;
   puis l'onglet **Packages** : les images `cert_eet-api` et `cert_eet-web` publiées sur GHCR.
8. **Déploiement recette** — ouvrir `docs/DEPLOIEMENT_RECETTE.md` et expliquer la procédure
   (`pull` des images + `up -d`), en précisant que l'automatisation complète (SSH) viendra avec la VM.

---

## 6. Qualité, décisions et dette assumée

### Definition of Done (la « définition de terminé »)
Une story n'est déclarée **terminée** que si : elle respecte ses critères d'acceptation, elle est
**testée** (tests automatiques, y compris les cas d'erreur), les règles transverses sont appliquées
(sécurité, validation des entrées, journalisation), l'**API est documentée**, la **CI est verte**, la
revue de code est faite, et c'est **démontrable** en Sprint Review. Toutes les stories livrées respectent
cette définition.

### Décisions de périmètre (ce qu'on a volontairement changé)
- **D4 — Retrait de « l'admin crée un compte » (US-CPT-01) et de « activer son compte » (US-AUTH-05).**
  Le modèle a évolué vers une plateforme ouverte : les comptes viennent de l'auto-inscription
  (US-CPT-05) ou d'une connexion Google/GitHub. Créer des comptes à la main par l'admin n'a plus de sens,
  donc ces deux stories ont été retirées (c'est une décision assumée, tracée dans l'ADR).

### Dette technique assumée (ce qu'on sait qu'il reste à faire)
- **Déploiement recette manuel.** Le CD fabrique et publie les images, mais ne les installe pas encore
  tout seul sur un serveur (il n'y a pas encore de VM de test). L'étape d'installation automatique (SSH)
  viendra quand la VM tunisienne sera disponible. C'est documenté.
- **La CI ne teste que le backend** (`apps/api`). Le frontend (`apps/web`) n'est pas encore testé
  automatiquement — mais sa construction a été vérifiée manuellement et par le CD.
- **Durcissements de sécurité notés pour plus tard** : chiffrer le secret MFA au repos, ajouter des codes
  de secours MFA, scanner les images pour les failles connues (Trivy).

---

## 7. Métriques de livraison (vue synthétique)

```
Engagement ferme (committed)        ████████████████████  9/9  (41 pts)
Extension (stretch)                 ████████████████████  6/6  (25 pts)
  + US-CPT-03 (bonus)               ██                    1    (3 pts)
Tests automatisés                   ████████████████████  110 verts
Pipeline CI                         ✅ verte
Pipeline CD (1er run)               ✅ vert (4 min 07 s) → 2 images publiées sur GHCR
```

---

## 8. Et après (pistes pour le Sprint 2)

Le Sprint 2 attaquera le **cœur métier** (épopée Cours / Formations) :
- création de formations et inscriptions des apprenants ;
- ateliers évalués par un formateur, QCM avec mécanismes anti-fraude ;
- certifications numériques **vérifiables** ;
- chatbot IA contextuel ;
- onboarding formateur « curaté » + autorisation par ressource (ADR-11) ;
- passage de la CI sur le frontend, et déploiement recette automatique quand la VM Tunisie sera prête.

---

## 9. Glossaire (tous les termes techniques, expliqués simplement)

- **Backend / API** — la partie « cerveau » de l'application, côté serveur : elle traite les requêtes,
  applique les règles et parle à la base de données. Ici en **NestJS**.
- **Frontend / Web** — la partie visible dans le navigateur, celle avec laquelle l'utilisateur interagit.
  Ici en **Next.js**.
- **Docker** — un outil qui met une application et tout ce dont elle a besoin dans une **boîte**
  standardisée, pour qu'elle tourne pareil partout.
- **Image Docker** — la boîte *fabriquée et scellée*, prête à lancer (le « paquet installable »).
- **Conteneur** — une image *en train de tourner* (la boîte allumée).
- **docker-compose** — le fichier qui décrit plusieurs boîtes et comment les lancer ensemble.
- **PostgreSQL** — la base de données (là où les données sont stockées durablement).
- **Redis** — une mémoire ultra-rapide, utilisée ici pour les listes de blocage de jetons et les sessions
  temporaires (MFA).
- **nginx** — le « portier » qui reçoit les requêtes web et les distribue à l'API ou au site ; gère aussi
  le HTTPS.
- **CI (Intégration Continue)** — un robot qui vérifie automatiquement le code à chaque modification
  (style + tests).
- **CD (Livraison Continue)** — un robot qui, après la CI, fabrique et publie les versions installables.
- **GHCR (GitHub Container Registry)** — le « magasin » en ligne de GitHub où l'on range les images
  Docker publiées.
- **Pipeline / Workflow** — une suite d'étapes automatiques exécutées par un robot (GitHub Actions).
- **JWT (JSON Web Token)** — un « jeton » signé que le serveur délivre à la connexion ; le navigateur le
  présente ensuite pour prouver son identité à chaque requête. Un **access token** est de courte durée
  (15 min) ; un **refresh token** sert à en obtenir un nouveau sans se reconnecter.
- **Rotation des refresh tokens** — à chaque rafraîchissement, l'ancien jeton est invalidé et un nouveau
  émis : si un jeton est volé et réutilisé, la fraude est détectée.
- **RS256** — l'algorithme de signature des jetons (clé privée pour signer, clé publique pour vérifier).
- **RBAC (Role-Based Access Control)** — contrôle d'accès basé sur les rôles : qui a le droit de faire
  quoi (apprenant / formateur / administrateur).
- **MFA (Multi-Factor Authentication)** — double authentification : en plus du mot de passe, un deuxième
  facteur.
- **TOTP** — le type de code MFA : un code à 6 chiffres qui change toutes les 30 s (Google Authenticator,
  Authy…).
- **OpenAPI / Swagger** — un standard pour décrire une API ; Swagger génère une page web interactive à
  partir de cette description (`/api/docs`).
- **Lint** — une vérification automatique du style et des erreurs courantes du code.
- **Migration (base de données)** — un script qui fait évoluer la structure de la base de façon
  contrôlée et réversible.
- **Audit immuable** — un journal d'actions qu'on ne peut ni modifier ni supprimer (preuve fiable).
- **Story / User Story** — une fonctionnalité décrite du point de vue de l'utilisateur.
- **Story points** — une estimation de complexité (échelle relative), pas des heures.
- **Stretch** — des stories « bonus », tirées seulement s'il reste de la marge.
- **Pull Request (PR)** — une proposition de modification du code, relue avant d'être intégrée.
- **Branche / merge / squash-merge** — une ligne de travail isolée (branche) ; l'intégrer dans la ligne
  principale (`main`) s'appelle « merger » ; « squash » condense tous les commits en un seul propre.
- **`main`** — la branche principale, celle qui fait référence.

---

*Revue de Sprint · Cert_EET — Sprint 1 · Iyed Omri, PFE ESPRIT · ESPRIT Entreprise.*
