# Cert_EET — Sprint 2 · Sprint Backlog

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 2 — « Formations, inscriptions & moteur de QCM anti-fraude »
> **Période (planifiée, Gantt) :** 22 mai → 04 juin 2026 (2 semaines) · **Équipe :** 1 développeur (solo)
> **Prérequis :** Sprint 1 clôturé (socle Docker, CI/CD, BDD+migrations, Redis, auth/MFA, RBAC, audit).
> **Statut :** 🟡 **PLANIFIÉ** (non démarré).

---

## 0. À quoi sert ce document (et comment le lire)

Ce **Sprint Backlog** combine le **Sprint Goal** (pourquoi, §1), les **stories sélectionnées** (quoi,
§2), les **prérequis techniques** (§2.3), et le **plan de tâches** (comment, §3). C'est le plan du sprint.

> **Rappel lexique :** *Story* = fonctionnalité vue par l'utilisateur · *Points* = complexité (pas des
> heures) · *Committed* = engagement ferme · *Stretch* = bonus si marge · *DoD* = Definition of Done.
> *MoSCoW* = priorisation (Must / Should / Could / Won't).

---

## 1. Sprint Goal (le « pourquoi »)

> **Permettre de structurer l'offre de formation (créer/configurer une formation, y affecter un
> formateur, y inscrire des apprenants) ET de faire passer des QCM certifiants dont toute la logique
> anti-fraude — randomisation, minuterie et scoring — s'exécute côté serveur et reste donc
> incontournable.**

*En clair :* après ce sprint, un administrateur crée une formation et y affecte un formateur ; un
apprenant s'inscrit et accède aux modules ; un formateur crée un QCM et le publie ; un apprenant le passe
dans des conditions anti-fraude réelles (temps géré par le serveur, questions mélangées, bonnes réponses
jamais envoyées au navigateur, score calculé côté serveur). **C'est le premier sprint qui livre de la
valeur métier visible et le différenciant P0 du projet (évaluation certifiante).**

---

## 2. Stories sélectionnées (le « quoi »)

Vélocité cible ~48 pts committed (sprint volontairement plus serré que le Sprint 1 : le moteur
anti-fraude concentre beaucoup de logique serveur et de sécurité — chaque point y est plus « lourd »).

### 2.1 Engagement ferme (committed) — ~51 pts

| # | Story | Épop. | Points | MoSCoW | DS | Dépendances |
|---|-------|-------|:-----:|:------:|----|-------------|
| 0 | US-AUTH-16 — Autorisation par ressource (un formateur n'agit que sur ses formations affectées, ADR-11) | E1 | 3 | Must | DS-16 | US-AUTH-11 (RBAC), US-FORM-03 |
| 1 | US-FORM-01 — Créer et configurer une formation (objectifs, capacité, seuils, modèle de certificat, modules) | E2 | 5 | Must | DS-16 | E0 |
| 2 | US-FORM-03 — Affecter un formateur à une formation | E2 | 2 | Must | DS-16 | US-FORM-01 |
| 3 | US-INSC-01 — S'inscrire à une formation ouverte | E2 | 3 | Must | DS-08 | US-FORM-01 |
| 4 | US-INSC-04 — Accéder aux modules et choisir une évaluation | E2 | 3 | Must | DS-09 | US-INSC-01 |
| 5 | US-QCM-01 — Créer le contenu d'un QCM (questions, options, explications) | E3 | 5 | Must | DS-12 | US-FORM-01, RBAC |
| 6 | US-QCM-03 — Configurer les paramètres anti-fraude | E3 | 5 | Must | DS-12 | US-QCM-01 |
| 7 | US-QCM-04 — Publier un QCM (fenêtre d'ouverture) | E3 | 2 | Must | DS-12 | US-QCM-03 |
| 8 | US-QCM-05 — Démarrer une tentative (accès contrôlé côté serveur) | E3 | 3 | Must | DS-02 | US-QCM-04, US-INSC-04 |
| 9 | US-QCM-06 — Randomiser questions/options + ne jamais envoyer les bonnes réponses au client | E3 | 5 | Must | DS-02 | US-QCM-05 |
| 10 | US-QCM-07 — Minuterie serveur (Redis) + auto-sauvegarde + soumission auto à expiration | E3 | 5 | Must | DS-02 | US-QCM-05, Redis |
| 11 | US-QCM-08 — Scoring serveur pondéré + figer la tentative (immuable) | E3 | 5 | Must | DS-02 | US-QCM-07 |
| | **Total committed** | | **~51 pts** | | | |

### 2.2 Extension (stretch — si la marge le permet)

| Ordre | Story | Épop. | Points | MoSCoW | Notes |
|:-----:|-------|-------|:-----:|:------:|-------|
| 12 | US-FORM-02 — Clôturer / archiver une formation | E2 | 2 | Should | Fige le cycle de vie ; certificats restent vérifiables |
| 13 | US-INSC-02 — Gérer les inscriptions (admin, import CSV) | E2 | 3 | Should | Piloter les cohortes |
| 14 | US-INSC-03 — Se désinscrire (soft : statut Suspendue) | E2 | 2* | Should | *point estimé ; jamais de suppression |
| 15 | US-QCM-02 — Importer des questions depuis une banque | E3 | 3 | Should | Réutiliser du contenu |
| 16 | US-QCM-09 — Voir son résultat (immédiat ou différé) | E3 | 2 | Should | Sans fuite des réponses |

> **Reporté au Sprint 3 (anti-fraude avancée) :** US-QCM-10 (blocage sessions multiples + limites),
> US-QCM-11 (historique immuable des tentatives). Conforme au rattachement Gantt de l'épopée E3.

### 2.3 Prérequis techniques (à faire en début de sprint — enablers)

Ces éléments ne sont pas des stories « utilisateur » mais sont **indispensables** avant de coder les
fonctionnalités ci-dessus :

1. **Modèle de données + migrations** (reprend le mécanisme d'US-INFRA-04). Nouvelles entités :
   - `Formation` (titre, description, objectifs, capacité, seuils de réussite, modèle de certificat, statut), `Module` (rattaché à une formation, type : QCM / livrable) ;
   - `Inscription` (apprenant ↔ formation, statut : ACTIVE / SUSPENDUE) ;
   - `AffectationFormateur` (formateur ↔ formation) ;
   - `QCM` (rattaché à un module, paramètres anti-fraude, fenêtre d'ouverture, statut), `Question`, `Option` (avec marqueur « bonne réponse » **jamais exposé côté client**), `TentativeQCM` (états : EN_COURS → SOUMISE / ABANDONNEE_TIMER → NOTEE).
2. **Autorisation par ressource (ADR-11) → story dédiée US-AUTH-16** (voir §2.1). Un garde complémentaire
   au RBAC global : un formateur ne peut créer/gérer un QCM que **sur les formations auxquelles il est
   affecté** (US-FORM-03). Implémentée comme un guard/décorateur réutilisable
   (`@FormateurDeLaFormation` ou équivalent), testé. ✅ Décidé : **story formelle** ajoutée au Product
   Backlog (épopée E1, ADR-11) et engagée ici, réalisée **avant** les stories QCM (chemin critique).
3. **Documentation API (Swagger)** : chaque nouvel endpoint est documenté au fil de l'eau (acquis
   d'US-INFRA-08 : `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` sur les routes protégées).

---

## 3. Plan de réalisation — décomposition en tâches (le « comment »)

### Enabler technique — Modèle de données & migrations *(≈ 8 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| DATA-1 | Entités `Formation` + `Module` + enums (statut formation/module) | 2,0 |
| DATA-2 | Entités `Inscription` + `AffectationFormateur` + contraintes d'unicité | 1,5 |
| DATA-3 | Entités `QCM` + `Question` + `Option` (bonne réponse non exposée) | 2,0 |
| DATA-4 | Entité `TentativeQCM` + enum d'états | 1,0 |
| DATA-5 | Migration(s) + relations/index + tests de migration | 1,5 |

### US-AUTH-16 — Autorisation par ressource (ADR-11) *(≈ 5 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| AUTH16-1 | Guard/décorateur « formateur affecté à la formation » (réutilisable) | 2,0 |
| AUTH16-2 | Branchement sur les routes QCM (création/config/publication) + 403 | 1,5 |
| AUTH16-3 | Tests (formateur affecté vs non affecté vs admin) + audit | 1,5 |

### US-FORM-01 — Créer et configurer une formation *(≈ 7 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| FORM01-1 | DTO + `POST /formations` (admin) + validation (capacité, seuils) | 2,0 |
| FORM01-2 | Modules de la formation (CRUD minimal) | 2,0 |
| FORM01-3 | `GET /formations` + `GET /formations/:id` + statuts | 1,5 |
| FORM01-4 | Audit (`FORMATION_CREEE`) + tests unit/e2e | 1,5 |

### US-FORM-03 — Affecter un formateur *(≈ 3 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| FORM03-1 | `POST /formations/:id/formateurs` (admin) + unicité | 1,5 |
| FORM03-2 | Retrait d'affectation + audit + tests | 1,5 |

### US-INSC-01 — S'inscrire à une formation *(≈ 4 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| INSC01-1 | `POST /formations/:id/inscriptions` (apprenant) + capacité/ouverture | 2,0 |
| INSC01-2 | Statut inscription + notification + audit + tests | 2,0 |

### US-INSC-04 — Accéder aux modules et choisir une évaluation *(≈ 4 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| INSC04-1 | `GET /formations/:id/modules` filtré par inscription active | 2,0 |
| INSC04-2 | Refus si inscription suspendue (403) + tests | 2,0 |

### US-QCM-01 — Créer le contenu d'un QCM *(≈ 7 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM01-1 | DTO + `POST /modules/:id/qcm` (formateur affecté) + questions/options | 3,0 |
| QCM01-2 | Édition questions/options + explications | 2,0 |
| QCM01-3 | Tests (contenu, autorisation par ressource) | 2,0 |

### US-QCM-03 — Configurer l'anti-fraude *(≈ 6 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM03-1 | Paramètres (durée, randomisation, nb tentatives, mode résultat, fenêtre) | 2,5 |
| QCM03-2 | Validation + persistance + tests | 2,0 |
| QCM03-3 | Doc Swagger des paramètres | 1,5 |

### US-QCM-04 — Publier un QCM *(≈ 3 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM04-1 | Transition de statut (BROUILLON → PUBLIE) + contrôle fenêtre | 1,5 |
| QCM04-2 | Audit + tests | 1,5 |

### US-QCM-05 — Démarrer une tentative (accès serveur) *(≈ 5 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM05-1 | `POST /qcm/:id/tentatives` : contrôle inscription + fenêtre + éligibilité | 2,5 |
| QCM05-2 | Création `TentativeQCM` (EN_COURS) + tests | 2,5 |

### US-QCM-06 — Randomisation + non-exposition des réponses *(≈ 6 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM06-1 | Tirage/mélange questions & options côté serveur (par tentative) | 3,0 |
| QCM06-2 | Payload apprenant **sans** les bonnes réponses + tests de non-fuite | 3,0 |

### US-QCM-07 — Minuterie serveur (Redis) *(≈ 7 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM07-1 | Clé Redis par tentative (deadline) + TTL | 2,0 |
| QCM07-2 | Auto-sauvegarde des réponses en cours | 2,5 |
| QCM07-3 | Soumission automatique à expiration (ABANDONNEE_TIMER/SOUMISE) + tests | 2,5 |

### US-QCM-08 — Scoring serveur + figer *(≈ 6 h)*
| Tâche | Description | Est. |
|---|---|:--:|
| QCM08-1 | Calcul du score pondéré côté serveur (comparaison aux bonnes réponses) | 2,5 |
| QCM08-2 | Figer la tentative (NOTEE, immuable) + audit | 1,5 |
| QCM08-3 | Tests (scoring, immuabilité, cas limites) | 2,0 |

> **Front (hors CI).** Les écrans correspondants (liste formations, inscription, passage de QCM avec
> minuterie, résultat) sont à prévoir côté `apps/web` ; vérification manuelle (`tsc --noEmit` + `next
> lint`) tant que le front n'est pas en CI (dette Sprint 1).

---

## 4. Task board (instantané de départ)

| À faire | En cours | Terminé |
|---|---|---|
| Enablers (DATA, AUTHZ) · FORM-01/03 · INSC-01/04 · QCM-01/03/04/05/06/07/08 | — | — |

> WIP = 1 (contexte solo). Ordre : enablers d'abord, puis E2 (formations/inscriptions), puis E3 (QCM).

---

## 5. Ordre de réalisation (chemin critique)

```
Enabler DATA (modèle + migrations)
  → US-FORM-01 → US-FORM-03 → US-AUTH-16 (autorisation par ressource, ADR-11)
    → US-INSC-01 → US-INSC-04
      → US-QCM-01 → US-QCM-03 → US-QCM-04
        → US-QCM-05 → US-QCM-06 → US-QCM-07 → US-QCM-08
```
*Stretch intercalés selon la marge : FORM-02, INSC-02/03, QCM-02/09.*

---

## 6. Definition of Done (rappel, inchangée)

Développée selon ses critères d'acceptation · **testée** (unit + e2e, branches d'erreur) · règles
transverses (RBAC **+ autorisation par ressource**, validation serveur, audit) · **API documentée**
(Swagger) · **CI verte** · revue de code · démontrable en Sprint Review. Convention : 1 story = 1 branche
= 1 PR = squash-merge ; un journal `engineering-log/` par story.

---

## 7. Risques & dépendances

- **Complexité anti-fraude (QCM-06/07/08).** La logique serveur (randomisation, minuterie Redis, scoring,
  non-fuite des réponses) est le cœur de valeur mais aussi le plus risqué : prévoir des tests de sécurité
  spécifiques (aucune bonne réponse ne doit transiter côté client ; le temps ne doit pas être
  contournable). ADR de référence : **ADR-04 (Redis pour le timer serveur)**.
- **Autorisation par ressource (ADR-11) — US-AUTH-16.** Story engagée, réalisée avant les stories QCM
  (le formateur ne doit pouvoir créer un QCM que sur ses formations affectées).
- **Front hors CI.** Risque de régression non détecté automatiquement ; vérification manuelle.
- **MinIO (stockage de fichiers).** Pas nécessaire ce sprint (il concerne les livrables d'ateliers, E4 /
  Sprint 4) — à monter à ce moment-là.

---

*Sprint Backlog · Cert_EET — Sprint 2 · PLANIFIÉ · ~51 pts committed + stretch · Iyed Omri, PFE ESPRIT.*
