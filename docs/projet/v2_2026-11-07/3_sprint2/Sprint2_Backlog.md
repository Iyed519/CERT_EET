# Cert_EET — Sprint 2 · Sprint Backlog (version de clôture)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 2 — « Formations, inscriptions & moteur de QCM anti-fraude »
> **Période :** planifiée 22/05 → 04/06/2026 (Gantt, 2 semaines) · **réalisée 05/10 → 07/11/2026**
> (PR #23 → #38) · **Équipe :** 1 développeur (solo)
> **Statut :** ✅ **CLÔTURÉ** — committed **12/12** (46 pts) + stretch **1/7** (2 pts) ; 6 stories
> d'extension (16 pts) reportées en tête du Sprint 3.

---

## 0. À quoi sert ce document (et comment le lire)

Le **Sprint Backlog** est l'un des trois artefacts de Scrum. C'est un document **vivant** : il évolue
pendant le sprint et reflète la réalité à la fin. Cette version est l'**état de clôture** ; elle répond à
trois questions :

- **Pourquoi** ce sprint existe → le **Sprint Goal** (§1).
- **Quoi** on s'est engagé à faire, et ce qui a été livré → les **stories** (§2).
- **Comment** on l'a réalisé → le **plan de tâches** (§3).

Le bilan, la démonstration et la rétrospective sont dans la **Revue de Sprint** (`docs/Sprint2_Review.md`) ;
le détail technique de chaque story dans son journal (`engineering-log/21` à `34`).

> **Mini-lexique Scrum :** **Story** = une fonctionnalité vue par l'utilisateur · **Points** = estimation
> de complexité (pas des heures) · **Committed** = engagement ferme du sprint · **Stretch** = bonus si
> marge · **Enabler** = travail technique indispensable aux stories · **DoD** = Definition of Done.

---

## 1. Sprint Goal (le « pourquoi »)

> **Permettre de structurer l'offre de formation (créer/configurer une formation, y affecter un
> formateur, y inscrire des apprenants) ET de faire passer des QCM certifiants dont toute la logique
> anti-fraude — randomisation, minuterie et scoring — s'exécute côté serveur et reste donc
> incontournable.**

**Verdict : ✅ atteint** (preuves par maillon : Revue de Sprint, §2).

---

## 2. Stories sélectionnées (le « quoi »)

### 2.1 Engagement ferme (committed) — état réel

| # | Story | Épop. | Points | MoSCoW | PR | Statut |
|---|-------|-------|:-----:|:------:|:--:|:------:|
| 0 | *Enabler* — Modèle de données + migrations | E0/E2/E3 | — | — | #23 | ✅ Terminé |
| 1 | US-FORM-01 — Créer et configurer une formation | E2 | 5 | Must | #24 | ✅ Terminé |
| 2 | US-FORM-03 — Affecter un formateur à une formation | E2 | 2 | Must | #25 | ✅ Terminé |
| 3 | US-AUTH-16 — Autorisation par ressource (ADR-11) | E1 | 3 | Must | #26 | ✅ Terminé |
| 4 | US-INSC-01 — S'inscrire à une formation ouverte | E2 | 3 | Must | #29 | ✅ Terminé |
| 5 | US-INSC-04 — Accéder aux modules et choisir une évaluation | E2 | 3 | Must | #30 | ✅ Terminé |
| 6 | US-QCM-01 — Créer le contenu d'un QCM | E3 | 5 | Must | #31 | ✅ Terminé |
| 7 | US-QCM-03 — Configurer les paramètres anti-fraude | E3 | 5 | Must | #32 | ✅ Terminé |
| 8 | US-QCM-04 — Publier un QCM (fenêtre d'ouverture) | E3 | 2 | Must | #33 | ✅ Terminé |
| 9 | US-QCM-05 — Démarrer une tentative (contrôle serveur) | E3 | 3 | Must | #34 | ✅ Terminé |
| 10 | US-QCM-06 — Randomisation + non-exposition des bonnes réponses | E3 | 5 | Must | #35 | ✅ Terminé |
| 11 | US-QCM-07 — Minuterie serveur + sauvegarde + clôture à l'échéance | E3 | 5 | Must | #36 | ✅ Terminé |
| 12 | US-QCM-08 — Notation serveur pondérée + tentative figée | E3 | 5 | Must | #37 | ✅ Terminé |
| | **Total engagé** | | **46 pts** | | | **12/12 terminées** |

> *Correction de total : la version planifiée de ce document et le Plan de Sprint annonçaient « ~51 pts »
> engagés (et une « vélocité cible ~48 ») ; la somme du tableau fait **46**. Le total est corrigé ici,
> sans changer aucune estimation.*

### 2.2 Extension (stretch)

| Ordre | Story | Épop. | Points | MoSCoW | Statut |
|:-----:|-------|-------|:-----:|:------:|:------:|
| 1 | US-QCM-09 — Voir son résultat (immédiat ou différé) | E3 | 2 | Should | ✅ Terminé (PR #38) |
| 2 | US-FORM-04 — Le formateur gère le contenu pédagogique de ses formations *(révision v1.4)* | E2 | 3 | Should | ⏭ Sprint 3 |
| 3 | US-FORM-05 — Ressources de module : liens *(révision v1.5)* | E2 | 3 | Should | ⏭ Sprint 3 |
| 4 | US-FORM-02 — Clôturer / archiver une formation | E2 | 2 | Should | ⏭ Sprint 3 |
| 5 | US-INSC-02 — Gérer les inscriptions (admin, import CSV) | E2 | 3 | Should | ⏭ Sprint 3 |
| 6 | US-INSC-03 — Se désinscrire (soft : statut Suspendue) | E2 | 2* | Should | ⏭ Sprint 3 |
| 7 | US-QCM-02 — Importer des questions depuis une banque | E3 | 3 | Should | ⏭ Sprint 3 |
| | **Total extension** | | **18 pts** | | **2 livrés · 16 reportés** |

> *Ordre de réalisation choisi en cours de sprint (US-QCM-09 d'abord, pour boucler le parcours de
> l'apprenant). \*Point estimé. Les stories reportées passent en tête du Sprint 3, dans cet ordre.*

### 2.3 Évolution de périmètre (décisions prises en cours de sprint)

| Date | Décision | Effet sur ce sprint |
|---|---|---|
| 10/10/2026 | **Révision v1.4** — le formateur affecté gère le contenu pédagogique de ses formations | US-FORM-04 ajoutée à l'extension |
| 11/10/2026 | **Révision v1.5** — ressources de module consultables par l'apprenant | US-FORM-05 (liens) ajoutée à l'extension ; US-FORM-06 (fichiers) au Sprint 4 |
| 12/10/2026 | **Révision v1.6** — surveillance webcam | US-QCM-12 au Sprint 5+ (Could, sous conditions) ; paramètre affiché « Bientôt actif » |
| En cours de sprint | **Écarts assumés avec DS-02 / DS-09** (409 pour les refus liés au temps, routes REST, échéance décidée par PostgreSQL, état final NOTEE, audit `TENTATIVE_NOTEE`, avancement recalculé à la notation, corrigé sur une route dédiée) | Tracés dans chaque journal ; tableau dans la Revue, §6 |
| 06/11/2026 | **US-QCM-09, D4** — en affichage immédiat, le corrigé attend la dernière tentative | Critère d'acceptation amendé (Backlog Produit v1.7) |

### 2.4 Prérequis techniques (enablers) — réalisés

1. **Modèle de données + migrations** — ✅ PR #23 (journal 21) : 12 tables, deux migrations réversibles,
   garanties portées par le schéma (unicités, clés étrangères, bonne réponse jamais chargée par défaut).
   Une troisième migration (trigger d'immuabilité des tentatives notées) est venue avec US-QCM-08.
2. **Autorisation par ressource (ADR-11)** — ✅ story formelle US-AUTH-16 (PR #26), réalisée avant les
   stories QCM comme prévu.
3. **Documentation API (Swagger)** — ✅ chaque nouvel endpoint documenté au fil de l'eau
   (`@ApiOperation`, toutes les `@ApiResponse`).

---

## 3. Plan de réalisation — décomposition en tâches (le « comment »)

> *Découpage et estimations du planning (en heures). Les intitulés de routes sont ceux prévus ; les routes
> réellement livrées, quand elles diffèrent, sont dans le journal de la story.*

### Enabler technique — Modèle de données & migrations *(≈ 8 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| DATA-1 | Entités `Formation` + `Module` + enums | 2,0 | ✅ |
| DATA-2 | Entités `Inscription` + `AffectationFormateur` + contraintes d'unicité | 1,5 | ✅ |
| DATA-3 | Entités `QCM` + `Question` + `Option` (bonne réponse non exposée) | 2,0 | ✅ |
| DATA-4 | Entité `TentativeQCM` + enum d'états | 1,0 | ✅ |
| DATA-5 | Migrations + relations/index + tests de migration | 1,5 | ✅ |

### US-FORM-01 — Créer et configurer une formation *(≈ 7 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| FORM01-1 | DTO + `POST /formations` (admin) + validation (capacité, seuils) | 2,0 | ✅ |
| FORM01-2 | Modules de la formation (CRUD) | 2,0 | ✅ |
| FORM01-3 | `GET /formations` + `GET /formations/:id` + statuts | 1,5 | ✅ |
| FORM01-4 | Audit + tests unit/e2e | 1,5 | ✅ |

### US-FORM-03 — Affecter un formateur *(≈ 3 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| FORM03-1 | `POST /formations/:id/formateurs` (admin) + unicité | 1,5 | ✅ |
| FORM03-2 | Retrait d'affectation + email + audit + tests | 1,5 | ✅ |

### US-AUTH-16 — Autorisation par ressource (ADR-11) *(≈ 5 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| AUTH16-1 | Garde réutilisable `@FormateurDeLaFormation` | 2,0 | ✅ |
| AUTH16-2 | Branchement sur les routes formateur + 403 | 1,5 | ✅ |
| AUTH16-3 | Tests (affecté / non affecté / admin) + audit `ACCES_RESSOURCE_REFUSE` | 1,5 | ✅ |

### US-INSC-01 — S'inscrire à une formation *(≈ 4 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INSC01-1 | `POST /formations/:id/inscriptions` (apprenant) + capacité / ouverture sous verrou | 2,0 | ✅ |
| INSC01-2 | Statut + email de bienvenue + audit + tests (dont concurrence forcée) | 2,0 | ✅ |

### US-INSC-04 — Accéder aux modules et choisir une évaluation *(≈ 4 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| INSC04-1 | « Mon espace » : modules et QCM publiés filtrés par inscription active | 2,0 | ✅ |
| INSC04-2 | Refus si non inscrit / suspendu (403 audité) + tests | 2,0 | ✅ |

### US-QCM-01 — Créer le contenu d'un QCM *(≈ 7 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM01-1 | Création d'un QCM dans un module (formateur affecté) + questions / options | 3,0 | ✅ |
| QCM01-2 | Édition questions / options + explications ; contenu figé à la 1re tentative | 2,0 | ✅ |
| QCM01-3 | Tests (contenu, autorisation par ressource) | 2,0 | ✅ |

### US-QCM-03 — Configurer l'anti-fraude *(≈ 6 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM03-1 | Paramètres (durée, randomisation, tentatives, mode résultat, fenêtre, tirage K/N) | 2,5 | ✅ |
| QCM03-2 | Validation de cohérence + persistance + règles figées + tests | 2,0 | ✅ |
| QCM03-3 | Doc Swagger des paramètres | 1,5 | ✅ |

### US-QCM-04 — Publier un QCM *(≈ 3 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM04-1 | Transition NON_PUBLIE → PUBLIE + revérification sous verrou | 1,5 | ✅ |
| QCM04-2 | Audit `QCM_PUBLIE` + tests | 1,5 | ✅ |

### US-QCM-05 — Démarrer une tentative (accès serveur) *(≈ 5 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM05-1 | `POST /qcm/:id/tentatives` : inscription + fenêtre + tentatives + délai (horloge de la base) | 2,5 | ✅ |
| QCM05-2 | Création `TentativeQCM` (EN_COURS), reprise d'une tentative en cours + tests | 2,5 | ✅ |

### US-QCM-06 — Randomisation + non-exposition des réponses *(≈ 6 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM06-1 | Tirage cryptographique questions & options, figé par tentative (`planTirage`) | 3,0 | ✅ |
| QCM06-2 | Questions servies en liste blanche **sans** bonne réponse + tests de non-fuite | 3,0 | ✅ |

### US-QCM-07 — Minuterie serveur *(≈ 7 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM07-1 | Échéance fixée par PostgreSQL, miroir Redis `timer:{id}` | 2,0 | ✅ |
| QCM07-2 | Sauvegarde des réponses au fil de l'eau + restauration | 2,5 | ✅ |
| QCM07-3 | Clôture à l'échéance (ABANDONNEE_TIMER) + soumission + balayage 60 s + tests | 2,5 | ✅ |

### US-QCM-08 — Notation serveur + figer *(≈ 6 h)* — ✅ Terminé
| Tâche | Description | Est. | Statut |
|---|---|:--:|:--:|
| QCM08-1 | Score pondéré côté serveur (comparaison aux bonnes réponses en base) | 2,5 | ✅ |
| QCM08-2 | Tentative NOTEE immuable (trigger) + audit `TENTATIVE_NOTEE` + avancement | 1,5 | ✅ |
| QCM08-3 | Tests (notation, immuabilité, concurrence, cas limites) | 2,0 | ✅ |

### US-QCM-09 — Voir son résultat *(extension)* — ✅ Terminé
| Tâche | Description | Statut |
|---|---|:--:|
| QCM09-1 | Règles de disponibilité (mode, fermeture, tentatives restantes) + route `GET /tentatives/:id/correction` | ✅ |
| QCM09-2 | État du corrigé dans la consultation, sans aucune réponse + tests de non-fuite | ✅ |
| QCM09-3 | Bouton « Voir le corrigé » ou date de disponibilité ; corrigé par question | ✅ |

### Extension reportée — ⏭ Sprint 3
US-FORM-04 (tâches FORM04-1 à 3, révision v1.4) · US-FORM-05 (révision v1.5) · US-FORM-02 · US-INSC-02 ·
US-INSC-03 · US-QCM-02 — non démarrées.

> **Front.** Les écrans de chaque story (formations admin, « Mes formations », catalogue, inscriptions,
> « Mon espace », éditeur et paramètres de QCM, passage avec compte à rebours, résultat et corrigé) ont été
> livrés avec elles et vérifiés dans un navigateur (1280 px et 390 px), `tsc --noEmit` + `next lint` ;
> le front reste hors CI (dette Sprint 1, action de rétrospective).

> **Bilan tâches.** Committed : 12 stories + l'enabler, toutes tâches terminées. Stretch : 1 story livrée.
> **Total livré Sprint 2 : 13 stories (48 pts).**

---

## 4. Task board (instantané de clôture)

| À faire | En cours | Terminé |
|---|---|---|
| ⏭ Sprint 3 : FORM04 · FORM05 · FORM02 · INSC02 · INSC03 · QCM02 (extension) | — | **DATA · FORM01 · FORM03 · AUTH16 · INSC01 · INSC04 · QCM01 · QCM03 · QCM04 · QCM05 · QCM06 · QCM07 · QCM08** (committed) · **QCM09** (stretch) |

> WIP = 1 (contexte solo). **Sprint clôturé : l'engagement est vide en « À faire ».**

---

## 5. Ordre de réalisation (chemin critique) — réalisé

```
Enabler DATA (#23)
  → US-FORM-01 (#24) → US-FORM-03 (#25) → US-AUTH-16 (#26)
    → US-INSC-01 (#27, annulée par #28, rétablie par #29) → US-INSC-04 (#30)
      → US-QCM-01 (#31) → US-QCM-03 (#32) → US-QCM-04 (#33)
        → US-QCM-05 (#34) → US-QCM-06 (#35) → US-QCM-07 (#36) → US-QCM-08 (#37)
          → [stretch] US-QCM-09 (#38)
```
Ordre identique au plan (§5 de la version planifiée).

---

## 6. Definition of Done (rappel)

Développée selon ses critères d'acceptation · **testée** (unit + e2e, branches d'erreur) · règles
transverses (RBAC **+ autorisation par ressource**, validation serveur, audit) · **API documentée**
(Swagger) · **CI verte** · revue de code · front vérifié dans un navigateur · démontrable en Sprint Review.
Convention : 1 story = 1 branche = 1 PR = squash-merge ; un journal `engineering-log/` par story.

---

## 7. Risques & dépendances — bilan

- **Complexité anti-fraude (QCM-06/07/08).** ✅ Maîtrisée : tests de non-fuite sur le trafic réel, horloge
  de la base, concurrence forcée, mutations. ADR de référence : **ADR-04 (PostgreSQL + Redis)** — Redis
  tient la minuterie en miroir ; l'échéance est décidée par PostgreSQL (écart assumé, journal 32).
- **Autorisation par ressource (ADR-11).** ✅ US-AUTH-16 livrée avant les stories QCM.
- **Front hors CI.** ⚠ Toujours vrai ; vérification manuelle à chaque story ; job CI web en tête du
  Sprint 3.
- **MinIO.** Non nécessaire ce sprint ; monté au Sprint 4 (ateliers, US-FORM-06).
- **Calendrier.** ⚠ ≈ 5 semaines réalisées pour 2 planifiées : re-planification au Sprint 3 Planning
  (Revue, §9).

---

*Sprint Backlog · Cert_EET — Sprint 2 · **CLÔTURÉ** · committed 12/12 (46 pts) + stretch 1/7 (2 pts) ·
Iyed Omri, PFE ESPRIT.*
