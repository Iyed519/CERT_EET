# Cert_EET — Architecture Decision Records · v3.0 (révisions de fin de projet)

> **Version :** 3.0 — 18/11/2026 · **Auteur :** Iyed Omri · PFE ESPRIT 2026
> **Base :** `Cert_EET_ADR_v2_2` (ADR-01 à ADR-13, Sprints 0–1). Selon l'Annexe B de la v2.2, **un ADR
> validé est immuable** : ce document n'en réécrit aucun, il ajoute des **révisions** (suffixe `-R`) qui
> consignent ce qui a réellement été construit, et **quatre nouveaux ADR** (ADR-14 à ADR-17).
> **Vérifié sur :** `main` = `e7216f2` (PR #141) — `package.json`, `docker-compose*.yml`, migrations,
> `configuration.ts`, `deploy/hetzner/`, journaux `engineering-log/`.

---

## 1. Synthèse des décisions (état final)

| ADR | Décision | Choix retenu à la fin du projet | Statut |
|---|---|---|---|
| ADR-01 | Approche | Solution sur mesure full-stack | Adopté, inchangé |
| ADR-02 | Backend | NestJS 10 · TypeScript strict · monolithe modulaire (20 modules) | Adopté — **R1** |
| ADR-03 | Frontend | Next.js 14 (App Router) · CSS maison (charte ESPRIT) | Adopté — **R1** |
| ADR-04 | Données | PostgreSQL 16 + pgvector · Redis 7 (AOF) · BullMQ · MinIO | Adopté — **R1** |
| ADR-05 | LLM | Claude Sonnet 5.5 (`claude-sonnet-5-5`) derrière `FournisseurLlm` | Adopté — **R1** |
| ADR-06 | Temps réel | SSE seulement (WebSocket jamais activé) | Adopté — **R1** |
| ADR-07 | Déploiement | Docker Compose ; démonstration en ligne sur Hetzner | Adopté — **R1** |
| ADR-08 | Sécurité | JWT RS256 + rotation + MFA TOTP + RBAC + garde par ressource | Adopté — R1, R2, **R3** |
| ADR-09 | CI/CD | GitHub Actions (CI api / web / ml) + CD vers GHCR | Adopté — **R1** |
| ADR-10 | Certification | PDFKit + QR + SHA-256 + page publique | Adopté — **R1** |
| ADR-11 | Inscription & onboarding | Modèle ouvert curaté | Adopté, complété (US-FORM-07/08) |
| ADR-12 | Profil apprenant | Référentiel normalisé | Adopté, inchangé |
| ADR-13 | Création de comptes par l'admin | Retirée ; import CSV (US-CPT-02) | Adopté, inchangé |
| **ADR-14** | IA prédictive | LightGBM dans un service `ml` FastAPI séparé | **Nouveau** |
| **ADR-15** | Surveillance des QCM | Détection d'objets MediaPipe dans le navigateur | **Nouveau** |
| **ADR-16** | Hébergement de la démonstration | Hetzner Cloud + DuckDNS + Let's Encrypt | **Nouveau** |
| **ADR-17** | Méthode de réalisation | Développement par un agent IA suivant une procédure | **Nouveau** |

---

## 2. Révisions des ADR existants

### ADR-02-R1 — Backend (bilan)
- **Versions :** NestJS 10.4, TypeORM 0.3.30, TypeScript strict.
- **Modules :** 20 modules métier (`apps/api/src/modules`) plus un socle (`config`, `database`, `common`,
  `mail`, `redis`, `stockage`). Les workers BullMQ et les balayages planifiés tournent **dans le
  processus de l'API** (désactivables par variable) au lieu d'un conteneur worker séparé : un seul
  processus à exploiter ; les travaux passent par Redis, ils pourront être déplacés plus tard.
- **Écart avec la conception :** pas de `NotificationsModule` ni de table de notifications — les
  notifications sont des e-mails (`MailService`) et des compteurs (`GET /api/navigation/compteurs`).

### ADR-03-R1 — Frontend (bilan)
- **Next.js 14** (App Router). **Tailwind CSS, Zustand et TanStack Query n'ont pas été utilisés** : une
  feuille de style unique (`globals.css`, jetons de la charte ESPRIT, US-UI-02) et un client `lib/api.ts`
  (rafraîchissement « single-flight », US-AUTH-17) ont suffi.
- La page publique de vérification est un **composant client** qui interroge l'API (et non une page
  statique avec revalidation) : le statut est donc toujours celui de la base.
- Accessibilité : contrastes WCAG 2.1 AA vérifiés automatiquement par l'audit de navigation (US-UI-08).

### ADR-04-R1 — Données (bilan)
- **BullMQ 6.4.2** remplace Bull (successeur maintenu). Six files : `certificats`, `rapports`,
  `activations-comptes`, `ia-indexation`, `ia-generation`, `ia-extraction`.
- **pgvector** : colonne `vector(384)`, index **HNSW** cosinus (`segments_support`).
- **MinIO** (`bitnamilegacy/minio:2025.4.22`, MinIO ne publie plus d'images) : certificats, livrables,
  supports, ressources, captures et photos de surveillance, rapports.
- **Immuabilité dans la base :** 10 déclencheurs (journal d'audit, tentatives notées, livrables notés,
  corrections terminées, notes de critère, certificats actifs, actions d'alerte, décisions sur les
  suggestions et les questions extraites).
- **pgcrypto n'est pas utilisé** (empreintes calculées par Node.js).
- **Bilan :** 43 migrations, 48 tables métier, 27 types ENUM (voir `10_diagrammes/classes`).
- **Sauvegardes :** non automatisées (`deploy/hetzner/scripts/sauvegarder.sh` à la demande).

### ADR-05-R1 — Fournisseur LLM (bilan)
- **Choix effectif : Anthropic Claude**, modèle `claude-sonnet-5-5`, SDK `@anthropic-ai/sdk` 1.3.0
  (choisi au Sprint 3 ; l'ADR-05 citait GPT-4o « à valider »). JSON imposé par un **outil**
  (`tool_choice: auto`, les modèles récents refusant `tool` / `any`, PR #105).
- **Abstraction `FournisseurLlm`** : `anthropic`, `compatible-openai` (tout service `/chat/completions` :
  OpenAI, Mistral, ou modèle local via vLLM / Ollama — US-IA-06), `factice` (tests) et `non-configure`.
  **La clé Anthropic prime** (US-IA-09) : plus de réponse d'exemple silencieuse.
- **Trois usages** au lieu d'un : génération de questions (RAG), **extraction de questions d'un
  document** (US-IA-08, images et PDF scannés lus par le modèle), **analyse des points faibles** dans les
  rapports (US-IA-10).
- **Embeddings :** fournisseur local par **hachage** (384 dimensions), sans service externe ; l'interface
  `FournisseurEmbeddings` permet de brancher un vrai modèle sans changer le schéma.
- **Confidentialité :** aucune identité d'apprenant envoyée ; bonnes réponses non envoyées quand le
  corrigé n'est pas disponible.

### ADR-06-R1 — Temps réel (bilan)
- **SSE seulement** (US-IA-07) : `GET /api/supports/:id/evenements`, `GET /api/generations/:id/evenements`,
  état relu en base chaque seconde, fin à l'état final ou après 10 minutes. Lecture par `fetch` en flux
  (jeton dans l'en-tête) plutôt qu'`EventSource`. **WebSocket jamais activé** : aucun besoin
  bidirectionnel n'est apparu.

### ADR-07-R1 — Déploiement (bilan)
- Trois façons de lancer la même pile : **développement** (`docker-compose.yml` + `.dev.yml`, Mailhog),
  **recette** (`.recette.yml`, images GHCR), **démonstration en ligne** (`deploy/hetzner/`, voir ADR-16).
- 7 conteneurs de base (nginx, web, api, ml, postgres, redis, minio) ; 8 services sur le serveur de
  démonstration (+ Mailhog lié à 127.0.0.1).
- **La cible de production reste un hébergement en Tunisie** (souveraineté, NF4) ; elle n'est pas
  réalisée.

### ADR-08-R3 — Sécurité (bilan Sprints 5–6 et mise en ligne)
- **Limites de débit en deux couches** (nginx + `LimiteRequetesGuard` sur Redis) : connexion 30 / min / IP,
  MFA 30 / min, refresh 120 / min, mot de passe oublié 5 / 15 min, vérification publique 20 / min.
- **TLS** profil Mozilla « intermediate » (TLS 1.2 / 1.3), HSTS 2 ans, CSP (API et web), helmet 8.3.0,
  corps JSON 100 ko, CORS sans `*` (US-AUTH-13).
- **Mot de passe oublié / changement** (US-AUTH-06 / 08) : lien à usage unique de 30 minutes (empreinte
  SHA-256 en base), toutes les sessions révoquées.
- **Restauration au rechargement** (US-AUTH-17) : jeton d'accès en mémoire seulement, une restauration
  unique, rotation du refresh **atomique** (une seule requête gagne, sans révoquer la famille).
- **Écart :** la désactivation de la MFA n'exige que le code TOTP (US-AUTH-10 demandait aussi le mot de
  passe).

### ADR-09-R1 — CI/CD (bilan)
- `ci.yml` : trois jobs — **API** (lint, unitaires + couverture, migrations, e2e avec MinIO), **Web**
  (`tsc`, `next lint`, tests des règles pures), **ML** (pytest, construction et santé de l'image).
- `cd.yml` : déclenché par une CI verte sur `main` (`workflow_run`), construit et pousse les images
  `cert_eet-api` et `cert_eet-web` sur **GHCR**. Le déploiement automatique en recette n'est pas
  réalisé : `docker compose pull` manuel ; la démonstration se met à jour par `mettre-a-jour.sh`.

### ADR-10-R1 — Certification (bilan)
- SHA-256 calculé sur le **PDF final**, stocké dans `certificats` (pas de table d'empreintes) ; QR vers
  `/verifier/{id}` (UUID v4).
- Ajouts : **expiration** (durée de validité de la formation, balayage horaire, US-CERT-07),
  **réémission** après révocation pour erreur (nouveau certificat lié, US-CERT-08), **échec définitif**
  alerté et reprise automatique (US-CERT-02), titulaire anonymisé (US-CPT-04).
- Écart : métadonnées PDF de base (`Title`, `Subject`) et non XMP.

---

## 3. Nouveaux ADR

### ADR-14 — Prédiction des apprenants à risque : LightGBM dans un service séparé
**Contexte.** Les quatre règles d'alerte (US-SUIVI-02) réagissent tard. Cert_EET n'a pas encore
d'historique pour entraîner un modèle.
**Décision.** Modèle **LightGBM** (`risque_v1` : 200 arbres, 15 feuilles, taux 0,05) entraîné sur le jeu
public **OULAD** (32 593 inscriptions, CC BY 4.0) avec **16 variables transposables**, servi par un
conteneur **FastAPI** interne (`ml`), appelé une fois par jour par l'API (lots de 200, délai 3 s, sans
reprise). Niveau (seuil 0,355) + 3 raisons SHAP ; scores conservés 180 jours.
**Justification.** Meilleur choix sur données tabulaires de taille moyenne ; explications exactes
(TreeSHAP) ; Python isolé avec les versions exactes de l'entraînement ; une panne du service ne casse rien
(les règles continuent).
**Alternatives écartées.** Réseau de neurones (moins adapté, moins explicable) ; régression logistique
(comparée : LightGBM ne la devance que de peu, PR-AUC 0,740 contre 0,731) ; modèle dans le
processus de l'API (voir `docs/IA_PREDICTION_RISQUE.md`, Q9 : isolement des pannes et versions
exactes de l'entraînement).
**Conséquences.** Résultats non garantis sur Cert_EET tant que le modèle n'est pas **réentraîné** sur ses
propres données ; précision plus faible pour les femmes, documentée ; déclaration INPDP avant production.

### ADR-15 — Surveillance des QCM : détection d'objets dans le navigateur
**Contexte.** Les captures toutes les 2 minutes revues à la main (US-QCM-12) ne suffisaient pas.
**Décision.** **MediaPipe Object Detector, EfficientDet-Lite0 int8** (Apache-2.0, entraîné sur COCO,
utilisé tel quel), exécuté **dans le navigateur de l'apprenant** ; modèle et WASM servis par la plateforme
(aucun appel à un tiers) ; seules les alertes et une photo partent au serveur ; le formateur décide.
**Justification.** La vidéo ne quitte jamais le poste ; aucun serveur de calcul ; licence compatible.
**Alternatives écartées.** YOLO (AGPL-3.0, licence payante pour un usage institutionnel fermé) ; analyse
côté serveur d'un flux vidéo (coût, données) ; TensorFlow.js COCO-SSD.
**Conséquences.** Contournable par un utilisateur très technique (l'analyse est sur son poste) : c'est
une couche parmi d'autres ; scores modestes du modèle le plus léger ; consentement, aucune
reconnaissance faciale, photos supprimées à 30 jours ; accord de l'encadrant et déclaration INPDP requis.

### ADR-16 — Hébergement de la démonstration en ligne
**Contexte.** Présenter la plateforme en conditions réelles (OAuth, e-mails, HTTPS) depuis n'importe quel
poste.
**Décision.** **Hetzner Cloud CPX32** (4 vCPU, 8 Go, 160 Go, Ubuntu 24.04, Helsinki), nom **DuckDNS**
(`cert-eet.duckdns.org`), certificat **Let's Encrypt**, pare-feu 22/80/443, pile Compose en mode dev,
**Gmail SMTP** et applications OAuth dédiées ; fichiers versionnés dans `deploy/hetzner/`.
**Alternatives écartées** (journal 120) : DigitalOcean, Azure for Students, Google Cloud, Oracle Always
Free, GitHub Codespaces (inéligibilité, prépaiement, échec de création, pile jamais saine) ; poste
personnel (trop léger).
**Conséquences.** Environnement **de démonstration hébergé en Europe**, pas une production : un seul
serveur, pas de sauvegarde automatique, certificat à renouveler avant le 13/02/2027.

### ADR-17 — Méthode de réalisation : agent de développement IA encadré
**Contexte.** À partir du Sprint 3, le volume restant dépassait la capacité d'un développeur seul.
**Décision.** Le code est écrit par un **agent de développement (Claude, d'Anthropic)** qui applique une
procédure fixée par le porteur : table de décisions avant de coder, une story = une branche = une PR,
tests unitaires et e2e avec concurrence forcée, tests de mutation, CI verte obligatoire, journal par story.
Le porteur fixe le périmètre, tranche les décisions, relit et teste sur son poste.
**Conséquences.** Vélocité non comparable à celle d'un développeur seul (Sprint 3 : 86 points en 2 jours) ;
ce qui reste comparable d'un sprint à l'autre est l'**exigence de preuve** (Definition of Done).

---

## 4. Annexe A — Pile technique réelle

| Couche | Technologie (version) | ADR |
|---|---|---|
| Backend | NestJS 10.4 · TypeScript · TypeORM 0.3.30 | 02, 04 |
| Frontend | Next.js 14.2 · React 18.3 · CSS maison | 03 |
| Base de données | PostgreSQL 16 + pgvector (HNSW, 384 dimensions) | 04, 05 |
| Files et cache | Redis 7 (AOF) · BullMQ 6.4.2 | 04 |
| Stockage objet | MinIO (S3) | 04 |
| IA générative | Claude Sonnet 5.5 · SDK Anthropic 1.3.0 · adaptateur compatible OpenAI | 05 |
| IA prédictive | LightGBM 4.7.0 · scikit-learn 1.9.1 · FastAPI | 14 |
| IA de vision | MediaPipe tasks-vision 1.2.0 · EfficientDet-Lite0 int8 | 15 |
| Certificats | PDFKit 0.20.2 · qrcode · SHA-256 (crypto Node) | 10 |
| Sécurité | JWT RS256 · TOTP · Passport (OAuth seulement) · otplib · helmet 8.3.0 · bcryptjs | 08 |
| Passerelle | nginx 1.27 · Let's Encrypt | 07, 16 |
| CI/CD | GitHub Actions · GHCR | 09 |
| Tests | Jest · Supertest · Playwright (recette) · pytest | 09 |

*Cert_EET — ADR v3.0 · révisions de fin de projet · 18/11/2026 · Iyed Omri*
