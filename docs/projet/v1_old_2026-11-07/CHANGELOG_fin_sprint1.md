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

---

*CHANGELOG · Cert_EET · PFE ESPRIT 2026 · Iyed Omri. Trace technique détaillée : `engineering-log/`.*
