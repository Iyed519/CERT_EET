# Cert_EET — Sprint 3 · Sprint Backlog (version de clôture)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 3 — « Parcours certifiant complet : ateliers, certificat vérifiable, assistance IA »
> **Période :** réalisée **08/11 → 09/11/2026** (PR #40 → #65) · **Équipe :** 1 porteur de projet, avec un
> agent de développement (Claude) qui exécute la procédure par story (voir Revue, §3)
> **Statut :** ✅ **CLÔTURÉ** — bloc A engagé **14/14** (54 pts) + bloc B d'extension **4/4** (24 pts) +
> 2 stories ajoutées en cours de sprint (8 pts) = **20 stories, 86 pts** ; 5 PR de maintenance.

---

## 0. À quoi sert ce document (et comment le lire)

Le **Sprint Backlog** est l'un des trois artefacts de Scrum. Cette version est l'**état de clôture** ; elle
répond à trois questions :

- **Pourquoi** ce sprint existe → le **Sprint Goal** (§1).
- **Quoi** on s'est engagé à faire, et ce qui a été livré → les **stories** (§2).
- **Comment** on l'a réalisé → la procédure par story et les tâches (§3).

Le bilan, la démonstration et la rétrospective sont dans la **Revue de Sprint** (`docs/Sprint3_Review.md`) ;
le détail technique de chaque story dans son journal (`engineering-log/35` à `54`).

> **Mini-lexique Scrum :** **Story** = une fonctionnalité vue par l'utilisateur · **Points** = estimation
> de complexité (pas des heures) · **Committed** = engagement ferme du sprint · **Stretch** = bonus si
> marge · **Chore** = travail de maintenance sans story · **DoD** = Definition of Done.

---

## 1. Sprint Goal (le « pourquoi »)

> **Compléter le parcours certifiant : finir le QCM anti-fraude, faire évaluer des ateliers pratiques
> par le formateur, délivrer un certificat vérifiable avec QR code — puis, si le temps le permet,
> l'assistance IA du formateur.**

**Verdict : ✅ atteint, extension comprise** (preuves par maillon : Revue de Sprint, §2).

---

## 2. Stories sélectionnées (le « quoi »)

### 2.1 Engagement ferme (committed) — bloc A, état réel

| # | Story | Épop. | Points | MoSCoW | PR | Journal | Statut |
|---|-------|-------|:-----:|:------:|:--:|:--:|:------:|
| 1 | US-QCM-10 — Bloquer les sessions multiples | E3 | 3 | Must | #40 | 35 | ✅ Terminé |
| 2 | US-ATEL-01 — Créer un atelier | E4 | 3 | Must | #41, #43 | 36 | ✅ Terminé |
| 3 | US-ATEL-02 — Grille de notation pondérée | E4 | 5 | Must | #44 | 37 | ✅ Terminé |
| 4 | US-ATEL-03 — Publier l'atelier | E4 | 2 | Must | #45 | 38 | ✅ Terminé |
| 5 | US-ATEL-04 — Soumettre un livrable (MinIO + SHA-256) | E4 | 5 | Must | #47 | 39 | ✅ Terminé |
| 6 | US-ATEL-06 — Corriger critère par critère | E4 | 5 | Must | #49 | 40 | ✅ Terminé |
| 7 | US-ATEL-07 — Feedback immuable + notification | E4 | 3 | Must | #50 | 41 | ✅ Terminé |
| 8 | US-ATEL-08 — Consulter son feedback | E4 | 2 | Should | #51 | 42 | ✅ Terminé |
| 9 | US-CERT-01 — Émission asynchrone (file, PDF, SHA-256, QR) | E5 | 8 | Must | #52 | 43 | ✅ Terminé |
| 10 | US-ATEL-09 — Déclencher la certification | E4 | 3 | Must | #53 | 44 | ✅ Terminé |
| 11 | US-CERT-03 — Consulter / télécharger son certificat | E5 | 2 | Must | #54 | 45 | ✅ Terminé |
| 12 | US-CERT-04 — Vérification publique sans compte | E5 | 5 | Must | #55 | 46 | ✅ Terminé |
| 13 | US-CERT-05 — Protection + minimisation de la page publique | E5 | 3 | Must | #56 | 47 | ✅ Terminé |
| 14 | US-CERT-06 — Révoquer un certificat | E5 | 5 | Must | #57 | 48 | ✅ Terminé |
| | **Total engagé** | | **54 pts** | | | | **14/14 terminées** |

> *US-ATEL-01 a reçu un complément (#43) : les fichiers de code source (`.py`, `.java`, `.ts`…) acceptés
> comme livrables, demandé après la première fusion. Même story, deux PR.*

### 2.2 Extension (stretch) — bloc B, assistance IA

| Ordre | Story | Épop. | Points | MoSCoW | PR | Journal | Statut |
|:-----:|-------|-------|:-----:|:------:|:--:|:--:|:------:|
| 15 | US-IA-01 — Déposer et indexer un support (pgvector) | E6 | 8 | Must | #60 | 49 | ✅ Terminé |
| 16 | US-IA-02 — Lancer une génération paramétrée | E6 | 3 | Must | #61 | 50 | ✅ Terminé |
| 17 | US-IA-03 — Pipeline RAG de génération de questions | E6 | 8 | Must | #64 | 53 | ✅ Terminé |
| 18 | US-IA-04 — Révision humaine des suggestions | E6 | 5 | Must | #65 | 54 | ✅ Terminé |
| | **Total extension** | | **24 pts** | | | | **4/4 terminées** |

> *Le bloc B demandait une décision sur le modèle de langage avant de démarrer : **API hébergée
> (Anthropic Claude)** derrière une interface, pour la qualité du français et du JSON strict ; un
> fournisseur factice sert aux tests et à la CI (décision du porteur, 09/11).*

### 2.3 Ajoutées en cours de sprint (décision du porteur, 09/11)

| Story | Épop. | Points | MoSCoW | PR | Journal | Statut |
|-------|-------|:-----:|:------:|:--:|:--:|:------:|
| US-FORM-05 — Ressources de module : liens et vidéos *(révision v1.5)* | E2 | 3 | Should | #62 | 51 | ✅ Terminé |
| US-FORM-06 — Ressources de module : fichiers *(révision v1.5)* | E2 | 5 | Should | #63 | 52 | ✅ Terminé |
| **Total ajouté** | | **8 pts** | | | | **2/2 terminées** |

> *Demande du 09/11 : « un support pédagogique peut-il être une vidéo, un lien YouTube… visible par les
> apprenants ? » — la réponse était déjà décidée (révision v1.5) ; les deux stories ont été faites avant
> US-IA-03.*

### 2.4 Maintenance (chores) — sans points

| PR | Objet | Origine |
|:--:|-------|---------|
| #42 | Rechargement à chaud sous Docker Windows (scrutation api + web, `WATCHPACK_POLLING`) | Rétro. Sprint 2, action 2 |
| #46 | CI e2e déterministe : suites en série, test de concurrence d'US-ATEL-03 durci | Incident (§7 de la Revue) |
| #48 | Dev : délai de grâce de 240 s pour la sonde de santé de l'api | Démarrage lent sous Windows |
| #58 | CI : job frontend (`tsc --noEmit` + `next lint`) | Rétro. Sprint 2, action 2 |
| #59 | Tests : délai par défaut des e2e à 30 s | Rétro. Sprint 2, action 2 |

### 2.5 Reporté (non démarré) — ⏭ Sprint 4

Extension du Sprint 2 non reprise : US-FORM-04 (3), US-FORM-02 (2), US-INSC-02 (3), US-INSC-03 (2),
US-QCM-02 (3). Stories voisines du périmètre livré : US-QCM-11 historique des tentatives (3), US-ATEL-05
remplacer son livrable (2), US-CERT-02 reprise + alerte (3, **en grande partie couverte** par US-CERT-01 :
trois tentatives, relance et liste administrateur), US-CERT-07 / 08, US-IA-05 traçabilité de l'origine IA
(3, **amorcée** : origine des questions, audit des générations), US-IA-06 abstraction LLM (3, **amorcée** :
interface `FournisseurLlm`), US-IA-07 suivi en temps réel (SSE).

### 2.6 Prérequis techniques introduits pendant le sprint

| Brique | Story | Décision |
|---|---|---|
| **MinIO** (stockage objet) | US-ATEL-04 (#47) | Image `bitnamilegacy/minio:2025.4.22` : MinIO ne publie plus d'images (journal 39) |
| **BullMQ** (file de travaux sur Redis) | US-CERT-01 (#52) | Successeur maintenu de Bull (ADR-04) ; workers dans le processus de l'API |
| **PDFKit + QR + SHA-256** | US-CERT-01 (#52) | Empreinte du PDF final stockée dans `certificats` (ADR-10) |
| **pgvector** (PostgreSQL) | US-IA-01 (#60) | Image `pgvector/pgvector:pg16` déjà en place ; index HNSW cosinus |
| **Modèle de langage** | US-IA-03 (#64) | Anthropic (`@anthropic-ai/sdk` 1.3.0) derrière `FournisseurLlm` ; clé dans l'environnement seulement |

---

## 3. Plan de réalisation (le « comment »)

### 3.1 Procédure appliquée à chaque story

Le sprint n'a pas été découpé en tâches chiffrées en heures : chaque story a suivi **la même procédure
en trois étapes**, décrite dans le document de passation du sprint et vérifiée à chaque PR.

| Étape | Contenu | Preuve |
|---|---|---|
| **0 — Préparer** | Branche `feature/US-XXX-…` depuis `main` à jour ; relecture des documents (Backlog, UC, DS, ADR, diagrammes d'états) ; **tableau D** des désaccords et choix, recommandation appliquée | Section « Décisions » du journal |
| **1 — Construire** | Entité + migration réversible (CHECK pour chaque borne) → règles pures `*.regles.ts` → service (transactions, verrous de ligne, horloge PostgreSQL) → contrôleur (rôles, autorisation par ressource, Swagger) → DTO (messages français) → audit → écrans web → tests unitaires et e2e (nouveau marqueur, nettoyage avant et après, concurrence forcée) | Fichiers de la PR |
| **2 — Vérifier** | Lint 0, `tsc`, unitaires, cycle de migration (run / revert / run), **e2e complet en série**, **mutations** (chaque protection retirée une fois doit faire échouer un test), web `tsc` + `next lint`, **navigateur 1280 / 390 px** | Section « Vérification » du journal |
| **3 — Livrer** | Journal `engineering-log/NN`, PR (Objet · API · UI · Écarts assumés · Tests · Liste de contrôle), **CI verte sur le commit de tête**, fusion squash **épinglée sur ce commit**, **CI verte sur `main`** (API, Web, images api et web) | PR et historique de CI |

### 3.2 Tâches principales par story

| Story | Données | API | Web |
|---|---|---|---|
| US-QCM-10 | `tentatives_qcm.session_id` | claim `sid` = famille de jetons ; contrôle au démarrage, lecture, réponse, soumission ; miroir Redis ; audit `SESSION_MULTIPLE_REFUSEE` | message « autre appareil » |
| US-ATEL-01 | `ateliers` (+ élargissement des types, #43) | CRUD du brouillon sous le module, date limite contrôlée par PostgreSQL | liste et modale de l'atelier |
| US-ATEL-02 | `grilles`, `criteres`, `niveaux_performance` | critères, Σ ≤ 100 %, validation à 100 %, modèles, copie | grille en cartes, total en direct |
| US-ATEL-03 | — | publication sous verrou ; fiche apprenant `GET /mes-ateliers/:id` | bouton « Publier », fiche apprenant |
| US-ATEL-04 | `livrables`, `fichiers_livrables` | dépôt multipart, signature des fichiers, SHA-256, MinIO, email | zone de dépôt |
| US-ATEL-06 | `corrections`, `notes_criteres` + déclencheur de cohérence | ouvrir, noter, télécharger en flux | liste des livrables, page de correction |
| US-ATEL-07 | finalisation + déclencheurs d'immuabilité | finaliser, email | « Envoyer le feedback » |
| US-ATEL-08 | `consultations_feedback` | feedback dans la fiche, badge | « Mon feedback », badge |
| US-CERT-01 | `certificats` + déclencheur | file BullMQ, worker, PDF, QR, SHA-256, relance admin | `/admin/certificats` |
| US-ATEL-09 | — | éligibilité après chaque note, demande unique | état de la certification dans « Mon espace » |
| US-CERT-03 | — | `GET /mes-certificats`, PDF au propriétaire | « Mes certificats » |
| US-CERT-04 | — | `GET /api/verification/:id` public, empreinte recalculée | page `/verifier/[id]`, comparaison de PDF dans le navigateur |
| US-CERT-05 | — | limite 20 / min / IP, `trust proxy`, en-têtes | métadonnées `noindex` |
| US-CERT-06 | colonnes de révocation + déclencheur | révocation à double confirmation, email | modale « Révoquer » |
| US-IA-01 | `supports_pedagogiques`, `segments_support` (`vector(384)`) | dépôt 202, worker d'indexation, extraction PDF / PPTX / DOCX / TXT / MD | bloc « Supports pour l'IA » |
| US-IA-02 | `generations_ia` | lancement 202, une génération en cours, plafond horaire | modale « Générer » |
| US-FORM-05 | `ressources_module` | liens et vidéos, ordre, accès apprenant | « Ressources du cours », lecteur intégré |
| US-FORM-06 | colonnes fichier | dépôt, lien signé 10 min, lecture par plages | lecteur vidéo / audio, image, PDF |
| US-IA-03 | `suggestions_questions_ia` | worker RAG, fournisseurs LLM, validation, lecture | « Voir les questions » |
| US-IA-04 | `questions.origine`, décision + déclencheur | accepter / modifier / rejeter | écran de révision, pastilles « IA » |

> **Bilan tâches.** Committed : 14 stories. Stretch : 4 stories. Ajoutées : 2. Maintenance : 5 PR.
> **Total livré Sprint 3 : 20 stories (86 pts).**

---

## 4. Task board (instantané de clôture)

| À faire | En cours | Terminé |
|---|---|---|
| ⏭ Sprint 4 : FORM04 · FORM02 · INSC02 · INSC03 · QCM02 · QCM11 · ATEL05 · CERT02 (reste) · IA05 · IA06 (reste) · IA07 | — | **QCM10 · ATEL01 · ATEL02 · ATEL03 · ATEL04 · ATEL06 · ATEL07 · ATEL08 · CERT01 · ATEL09 · CERT03 · CERT04 · CERT05 · CERT06** (committed) · **IA01 · IA02 · IA03 · IA04** (stretch) · **FORM05 · FORM06** (ajoutées) |

> **Sprint clôturé : l'engagement et l'extension sont vides en « À faire ».**

---

## 5. Ordre de réalisation (chemin critique) — réalisé

```
US-QCM-10 (#40)
  → US-ATEL-01 (#41, #43) → US-ATEL-02 (#44) → US-ATEL-03 (#45) → US-ATEL-04 (#47, MinIO)
    → US-ATEL-06 (#49) → US-ATEL-07 (#50) → US-ATEL-08 (#51)
      → US-CERT-01 (#52, BullMQ) → US-ATEL-09 (#53) → US-CERT-03 (#54)
        → US-CERT-04 (#55) → US-CERT-05 (#56) → US-CERT-06 (#57)
          → chores #58, #59
            → [stretch] US-IA-01 (#60, pgvector) → US-IA-02 (#61)
              → [ajout] US-FORM-05 (#62) → US-FORM-06 (#63)
                → [stretch] US-IA-03 (#64, LLM) → US-IA-04 (#65)
Maintenance intercalée : #42, #46, #48.
```
Ordre identique au plan (US-CERT-01 avant US-ATEL-09, qui l'appelle) ; les ressources de module ont été
insérées avant US-IA-03 à la demande du porteur.

---

## 6. Definition of Done (rappel)

Développée selon ses critères d'acceptation · **testée** (unit + e2e, branches d'erreur, concurrence forcée
quand une course existe) · chaque protection **prouvée par mutation** · règles transverses (RBAC +
autorisation par ressource, validation serveur, audit) · **API documentée** (Swagger) · **CI verte sur la PR
et sur `main`** (API, Web, images) · front vérifié dans un navigateur (1280 / 390 px) · journal écrit ·
démontrable en Sprint Review. Convention : 1 story = 1 branche = 1 PR = squash-merge épinglé ; branches
conservées.

---

## 7. Risques & dépendances — bilan

- **MinIO introuvable en CI.** ✅ Contourné : image Bitnami archivée figée (journal 39) — ⚠ elle ne reçoit
  plus de mises à jour (piste : construire l'image depuis les sources de MinIO).
- **File de travaux (ADR-04).** ✅ BullMQ sur le Redis existant, worker dans l'API : aucun nouveau service.
- **Modèle de langage.** ✅ Décision prise (Anthropic) ; ⚠ l'appel réel n'a pas pu être vérifié dans
  l'espace de travail (réseau) : essai facultatif à lancer sur le poste avec la clé.
- **Modèle d'embeddings neuronal.** ⚠ Non vérifiable (dépôt de modèles injoignable, ONNX absent de l'image
  alpine) : fournisseur lexical local derrière une interface (journal 49).
- **Front hors CI.** ✅ Levé (#58).
- **Calendrier.** ⚠ Date de fin du Backlog (24/10/2026) toujours dépassée : re-planification avec
  l'encadrant (Revue, §9).
- **Secrets de la branche `docs`.** ⚠ Rotation toujours à faire avant tout partage du dépôt (Revue, §9).

---

*Sprint Backlog · Cert_EET — Sprint 3 · **CLÔTURÉ** · committed 14/14 (54 pts) + stretch 4/4 (24 pts) +
ajout 2 (8 pts) · Iyed Omri, PFE ESPRIT.*
