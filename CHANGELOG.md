# CHANGELOG — Cert_EET

> Journal des changements du dépôt, du plus récent au plus ancien.
> Projet : **Cert_EET** (Certification ESPRIT Entreprise) — PFE ESPRIT 2026 · Iyed Omri.
>
> **Comment lire ce fichier.** Chaque entrée correspond à une **story** (une fonctionnalité) livrée via
> une **Pull Request** (PR). Pour chaque story : **Quoi** (ce qui a été fait), **Pourquoi** (le besoin),
> et le **numéro de PR**. Les termes techniques (CI, CD, JWT, RBAC, MFA…) sont expliqués dans le
> **glossaire en fin de fichier**.
>
> **Conventions du dépôt.** 1 story = 1 branche = 1 PR = squash-merge, avec **CI verte obligatoire** avant
> intégration. Un journal technique détaillé par story est disponible dans `engineering-log/`.

---

## [Sprint 2] — Formations, inscriptions & moteur de QCM anti-fraude — ✅ CLÔTURÉ

**Résumé :** 13 stories livrées (12 engagées, 46 pts + 1 d'extension, 2 pts) et le modèle de données,
du 05/10 au 07/11/2026 (PR #23 → #38). **741 tests automatisés verts** (468 unitaires + 273 e2e). Un
administrateur organise une formation, un apprenant s'y inscrit et passe un **QCM certifiant** dont
toutes les règles — tirage, temps, notation, corrigé — sont décidées par le serveur. Revue de sprint et
rétrospective : `docs/Sprint2_Review.md`.

### Socle

#### Enabler — Modèle de données du Sprint 2 — PR #23 · journal `engineering-log/21`
- **Quoi :** 12 tables du cœur métier (formations, modules, inscriptions, affectations, QCM,
  configuration anti-fraude, questions, options, tentatives, réponses) en deux migrations réversibles.
  **Pourquoi :** aucune story ne se code sans elles ; le schéma porte lui-même une partie des garanties
  (unicités, clés étrangères, bonne réponse jamais chargée par défaut).

### Formations & autorisation (E2 / E1)

#### US-FORM-01 — Créer et configurer une formation — PR #24 · journal `engineering-log/22`
- **Quoi :** l'administrateur crée, modifie une formation (objectifs, capacité, seuil, modèle de
  certificat) et gère ses modules ; chaque écriture est auditée. **Pourquoi :** la racine du métier.

#### US-FORM-03 — Affecter un formateur à une formation — PR #25 · journal `engineering-log/23`
- **Quoi :** affectation et retrait de formateurs, email au formateur, audit. **Pourquoi :** c'est la
  donnée que lit l'autorisation par ressource.

#### US-AUTH-16 — Autorisation par ressource — PR #26 · journal `engineering-log/24`
- **Quoi :** garde réutilisable `@FormateurDeLaFormation` : un formateur n'agit que sur ses formations
  affectées, sinon **403** + audit `ACCES_RESSOURCE_REFUSE` ; écran « Mes formations ». **Pourquoi :** le
  rôle seul ne dit pas *sur quelle* formation un formateur peut agir (ADR-11).

### Inscriptions (E2)

#### US-INSC-01 — S'inscrire à une formation — PR #29 · journal `engineering-log/25`
- **Quoi :** inscription immédiate à une formation ouverte ; capacité jamais dépassée (transaction +
  verrou), email de bienvenue, audit ; catalogue, fiche, « Mes inscriptions ». **Pourquoi :** sans
  inscription, pas d'accès aux évaluations. *(Une première fusion, #27, a été annulée par erreur via le
  bouton « Revert » (#28), puis rétablie par #29.)*

#### US-INSC-04 — Accéder aux modules et choisir une évaluation — PR #30 · journal `engineering-log/26`
- **Quoi :** « Mon espace » : progression, échéance, modules dans l'ordre, QCM publiés avec mon
  avancement ; 403 audité si non inscrit ou suspendu. **Pourquoi :** porte d'entrée du passage d'un QCM.

### Moteur de QCM anti-fraude (E3)

#### US-QCM-01 — Créer le contenu d'un QCM — PR #31 · journal `engineering-log/27`
- **Quoi :** questions à choix unique, multiple ou vrai / faux, options, pondérations, explications,
  validées par le serveur ; contenu figé dès la première tentative (sauf explications). **Pourquoi :** la
  matière de l'évaluation, stable une fois l'examen commencé.

#### US-QCM-03 — Paramètres anti-fraude d'un QCM — PR #32 · journal `engineering-log/28`
- **Quoi :** randomisation, tirage K parmi N, durée, fenêtre, tentatives, délai, mode d'affichage du
  résultat, seuil ; cohérence vérifiée, règles figées à la première tentative (seule la fermeture peut
  être repoussée). **Pourquoi :** transformer un quiz en évaluation certifiante. *(Webcam et copier-coller :
  enregistrés, signalés « Bientôt actif », non appliqués — révision v1.6.)*

#### US-QCM-04 — Publier un QCM — PR #33 · journal `engineering-log/29`
- **Quoi :** publication après revérification complète sous verrou, audit `QCM_PUBLIE` ; le QCM apparaît
  dans « Mon espace » avec sa fenêtre. **Pourquoi :** séparer préparation et mise à disposition.

#### US-QCM-05 — Démarrer une tentative (contrôle serveur) — PR #34 · journal `engineering-log/30`
- **Quoi :** démarrage vérifié avec l'horloge de la base (publié, inscrit, dans la fenêtre, tentative
  restante, délai) ; refus **409** avec motif précis ; échéance jamais après la fermeture ; reprise d'une
  tentative en cours. **Pourquoi :** l'entrée de l'examen est le premier point de triche possible.

#### US-QCM-06 — Randomisation et confidentialité des réponses — PR #35 · journal `engineering-log/31`
- **Quoi :** tirage cryptographique des questions et des options, figé par tentative (`planTirage`) ;
  questions servies en liste blanche, sans bonne réponse, explication ni pondération (test de non-fuite
  sur le trafic réel). **Pourquoi :** ni le voisin ni l'inspecteur réseau ne donnent la réponse.

#### US-QCM-07 — Minuterie serveur et sauvegarde des réponses — PR #36 · journal `engineering-log/32`
- **Quoi :** réponses enregistrées au fil de l'eau et restaurées ; refus dès l'échéance fixée par
  PostgreSQL (clôture ABANDONNEE_TIMER, réponses conservées) ; soumission ; balayage des tentatives
  échues toutes les 60 s ; Redis en miroir. **Pourquoi :** le temps n'est pas contournable et une coupure
  ne fait rien perdre.

#### US-QCM-08 — Notation serveur et tentative figée — PR #37 · journal `engineering-log/33`
- **Quoi :** score pondéré (choix multiple en tout ou rien), réussite au seuil, correction écrite par
  réponse, état **NOTEE** protégé par un **trigger** (aucune modification possible, même en SQL),
  avancement de l'inscription recalculé, audit `TENTATIVE_NOTEE`. **Pourquoi :** un résultat fiable et
  immuable, base de la future certification.

#### US-QCM-09 — Voir son résultat (corrigé) — PR #38 · journal `engineering-log/34` *(extension)*
- **Quoi :** route `GET /tentatives/:id/correction` : par question, ma réponse, juste / faux, points,
  bonne réponse, explication ; disponible après la fermeture en mode différé, après la dernière tentative
  en mode immédiat, sinon 409 avec la date. **Pourquoi :** comprendre ses erreurs sans faire fuiter le
  corrigé vers une autre tentative ou un autre apprenant.

### Décisions de périmètre (Sprint 2)
- **Révision v1.4 (10/10)** — US-FORM-04 : le formateur affecté gère le contenu pédagogique de ses
  formations (extension, reportée au Sprint 3).
- **Révision v1.5 (11/10)** — ressources de module : US-FORM-05 liens (extension, reportée au Sprint 3),
  US-FORM-06 fichiers (Sprint 4, avec MinIO).
- **Révision v1.6 (12/10)** — US-QCM-12 surveillance webcam (Could, Sprint 5+, sous conditions :
  encadrant, protection des données).
- **Écarts assumés avec DS-02 / DS-09** (409 pour les refus liés au temps, routes REST, échéance décidée
  par PostgreSQL, état final NOTEE, audit `TENTATIVE_NOTEE`, avancement recalculé à la notation, corrigé
  sur une route dédiée et après la dernière tentative) : tableau dans `docs/Sprint2_Review.md` §6.
- **Reporté au Sprint 3 :** US-FORM-04, US-FORM-05, US-FORM-02, US-INSC-02, US-INSC-03, US-QCM-02
  (16 pts d'extension).

---

## [Sprint 1] — Fondations backend & infrastructure — ✅ CLÔTURÉ

**Résumé :** 15 stories livrées (9 engagées + 6 d'extension + bonus), 110 tests automatisés verts,
pipelines CI **et** CD opérationnels. Le socle technique de la plateforme est en place.

### Infrastructure (E0)

#### US-INFRA-06 — Pipeline CD (livraison continue vers GHCR) — PR mergée · journal `engineering-log/20`
- **Quoi :** un workflow qui, après une CI verte sur `main`, **construit et publie** les images Docker de
  production (API + web) sur **GHCR** (le magasin d'images de GitHub).
- **Pourquoi :** avoir en permanence une version installable prête à déployer, sans fabrication manuelle.
- **Détails :** déclenché via `workflow_run` (donc **seulement si la CI réussit**) + `workflow_dispatch`
  (manuel) ; images `cert_eet-api` et `cert_eet-web` taguées `latest` + SHA court ; authentification par
  `GITHUB_TOKEN` (aucun secret externe). `docker-compose.recette.yml` référence les images GHCR pour un
  `pull && up -d` direct. Déploiement sur serveur **manuel et documenté** (`docs/DEPLOIEMENT_RECETTE.md`)
  tant qu'il n'y a pas de VM de staging. **Validé : premier run CD vert en 4 min 07 s, 2 images publiées.**
- **Fichiers :** `.github/workflows/cd.yml` (nouveau), `docker-compose.recette.yml` (images GHCR),
  `docs/DEPLOIEMENT_RECETTE.md` (nouveau).

#### US-INFRA-08 — Documentation API (OpenAPI / Swagger) — PR #20 · journal `engineering-log/19`
- **Quoi :** finaliser la page interactive `/api/docs` qui documente toute l'API et permet de la tester.
- **Pourquoi :** mode d'emploi de l'API (démo, intégration frontend, contrat d'API — exigence de la DoD).
- **Détails :** `@ApiBearerAuth('access-token')` appliqué de façon **ciblée** → **17 routes protégées**
  affichent un cadenas, **11 routes publiques** n'en ont pas ; schéma bearer JWT nommé ;
  `persistAuthorization` (le jeton collé survit au rafraîchissement) ; `/api/docs-json` exposé ; 5 tags
  décrits ; réponses du endpoint `health` documentées. **Lint propre + 110 tests verts.**

#### US-INFRA-05 — Pipeline CI (intégration continue)
- **Quoi :** un robot GitHub Actions qui vérifie le code à chaque modification (style + 110 tests avec
  PostgreSQL et Redis réels + couverture). **Pourquoi :** détecter les erreurs immédiatement ; CI verte
  requise avant tout merge.

#### US-INFRA-04 — Schéma de base de données + migrations
- **Quoi :** structure de la base (User, AuditLog, RefreshToken, Formation…) + mécanisme de migrations +
  compte admin initial. **Pourquoi :** des données bien rangées et une évolution de schéma contrôlée.

#### US-INFRA-03 — Docker Compose multi-services
- **Quoi :** 5 conteneurs orchestrés (api, web, postgres, redis, nginx) + Dockerfiles multi-stage.
  **Pourquoi :** une appli qui tourne pareil partout (dev, test, production).

#### US-INFRA-07 — Gestion des secrets
- **Quoi :** clés RS256 injectées hors du code, `.env.example`, démarrage fail-fast si un secret manque.
  **Pourquoi :** ne jamais exposer d'information sensible dans le code.

#### US-INFRA-02 — Squelette NestJS + Next.js
- **Quoi :** initialisation du backend (NestJS) et du frontend (Next.js) + endpoint `/health`.
  **Pourquoi :** une structure de départ propre.

### Authentification (E1)

#### US-AUTH-09 + US-AUTH-02 — MFA (double authentification TOTP) — PR #19 · journal `engineering-log/18`
- **Quoi :** activation de la double authentification par QR code, puis connexion en deux temps (mot de
  passe **puis** code à 6 chiffres). **Pourquoi :** protéger les comptes même en cas de mot de passe volé.
- **Détails :** secret en attente stocké en Redis (TTL court, jamais en base tant que non confirmé) ;
  jeton MFA à usage unique (anti-rejeu) ; désactivation protégée par code TOTP.

#### US-AUTH-12 — Journal d'audit immuable — PR #17 · journal `engineering-log/16`
- **Quoi :** enregistrement inaltérable des actions sensibles (writer unique + trigger base de données qui
  empêche modification/suppression) + consultation et export CSV. **Pourquoi :** traçabilité fiable et
  crédible (exigence institutionnelle).

#### US-AUTH-14 — Connexion sociale Google & GitHub — PR #12, #13
- **Quoi :** connexion via un compte Google ou GitHub (OAuth2, Passport), liaison au compte par email.
  **Pourquoi :** réduire la friction d'inscription. L'émission de session reste faite maison (JWT RS256).

#### US-AUTH-11 — Contrôle d'accès par rôle (RBAC)
- **Quoi :** gardes globaux qui vérifient l'identité (jeton) puis le rôle (autorisé ?) ; routes publiques
  marquées `@Public` ; `GET /auth/me`. **Pourquoi :** chaque rôle (apprenant/formateur/admin) n'accède
  qu'à ce qui le concerne.

#### US-AUTH-03 — Rafraîchir la session avec rotation
- **Quoi :** renouvellement silencieux de la session avec **rotation** (ancien jeton brûlé) et
  **détection de rejeu** (révocation de toute la famille si un jeton volé est réutilisé).
  **Pourquoi :** rester connecté sans compromettre la sécurité (défense OWASP).

#### US-AUTH-04 — Se déconnecter
- **Quoi :** déconnexion qui **invalide réellement** les jetons (denylist Redis). **Pourquoi :** une vraie
  déconnexion, pas un simple oubli côté navigateur.

#### US-AUTH-01 — Se connecter
- **Quoi :** connexion email + mot de passe (bcrypt), émission de jetons JWT RS256 (access 15 min / refresh
  7 j). **Pourquoi :** la porte d'entrée de l'application.

### Comptes & inscription (E2 / Sprint 2 tiré en avance)

#### US-ROL-02 — Demande de changement de rôle (self-service) — PR #18 · journal `engineering-log/17`
- **Quoi :** un utilisateur demande un changement de rôle ; un admin approuve ou rejette. **Pourquoi :**
  gouvernance des rôles sans intervention manuelle systématique.

#### US-CPT-03 — Désactiver / réactiver un compte (anti-lockout) — PR #16 · journal `engineering-log/15`
- **Quoi :** suspension/réactivation d'un compte **avec motif**, avec garde empêchant de désactiver le
  dernier administrateur. **Pourquoi :** gouvernance des comptes sans risque de blocage total.

#### US-ROL-01 — L'admin change le rôle d'un utilisateur — PR #15
- **Quoi :** changement de rôle avec **invalidation immédiate** des sessions. **Pourquoi :** le nouveau
  rôle s'applique instantanément.

#### US-AUTH-15 — Profil apprenant — PR #14
- **Quoi :** complétion de profil à la première connexion + référentiel des établissements tunisiens.
  **Pourquoi :** données apprenant structurées pour la suite (formations, certificats).

#### US-CPT-05 — Auto-inscription publique + refonte UI auth — PR #10, #11
- **Quoi :** création de compte apprenant (email + mot de passe) avec vérification email + design system.
  **Pourquoi :** ouvrir la plateforme en self-service (modèle type Coursera/edX).

### Décisions de périmètre (Sprint 1)
- **D4 — Retrait de US-CPT-01 (admin crée un compte) et US-AUTH-05 (activation).** Remplacées par
  l'auto-inscription (US-CPT-05) + OAuth (US-AUTH-14). Tracé dans l'ADR.
- **ADR-08-R1 / ADR-11** — rotation des refresh tokens confirmée ; modèle d'inscription ouvert curaté +
  onboarding formateur par ressource (à détailler au Sprint 2).

---

## Glossaire

- **CI (Intégration Continue)** — robot qui vérifie le code à chaque modification (style + tests).
- **CD (Livraison Continue)** — robot qui, après la CI, fabrique et publie les versions installables.
- **Docker / image / conteneur** — Docker met l'appli dans une **boîte** standardisée ; l'**image** est la
  boîte scellée prête à lancer ; le **conteneur** est la boîte en train de tourner.
- **GHCR** — GitHub Container Registry, le magasin en ligne où sont publiées les images Docker.
- **JWT** — jeton signé prouvant l'identité ; **access token** (court) + **refresh token** (pour renouveler).
- **Rotation / détection de rejeu** — à chaque renouvellement, l'ancien jeton est invalidé ; un jeton volé
  réutilisé est détecté et toute la famille est révoquée.
- **RBAC** — contrôle d'accès basé sur les rôles (apprenant / formateur / administrateur).
- **MFA / TOTP** — double authentification ; code à 6 chiffres changeant toutes les 30 s.
- **OpenAPI / Swagger** — standard de description d'API + page web interactive générée (`/api/docs`).
- **Lint** — vérification automatique du style et des erreurs courantes du code.
- **Migration** — script qui fait évoluer la structure de la base de façon contrôlée.
- **PR (Pull Request)** — proposition de modification relue avant intégration.
- **squash-merge** — intégration qui condense les commits d'une branche en un seul, propre, sur `main`.
- **Story points** — estimation de complexité (échelle relative), pas des heures.
- **Autorisation par ressource** — au-delà du rôle, vérifier *sur quelle* ressource on agit (« sa »
  formation).
- **Tentative** — un passage de QCM : EN_COURS → SOUMISE ou ABANDONNEE_TIMER (temps écoulé) → NOTEE.
- **Tirage / randomisation** — choix et ordre des questions et options propres à une tentative, faits
  au hasard par le serveur puis figés.
- **Non-fuite / liste blanche** — aucune bonne réponse ne part vers le navigateur ; on liste ce qu'on
  envoie plutôt que de retirer ce qu'on cache.
- **Balayage** — tâche serveur qui, toutes les 60 s, clôt et note les tentatives échues.
- **Verrou / transaction** — empêche deux requêtes simultanées de modifier la même donnée (ex. : la
  dernière place d'une formation).
- **Trigger** — règle posée dans la base elle-même ; ici, elle refuse toute modification d'une tentative
  notée.
- **HTTP 403 / 409** — 403 : « tu n'as pas le droit » ; 409 : « pas maintenant » (hors fenêtre, temps
  écoulé, corrigé pas encore disponible).
- **Test e2e / test de mutation** — e2e : appelle la vraie API sur une vraie base ; mutation : on retire
  volontairement une protection pour vérifier que le test échoue.

---

*CHANGELOG · Cert_EET · PFE ESPRIT 2026 · Iyed Omri. Trace technique détaillée : `engineering-log/`.*
