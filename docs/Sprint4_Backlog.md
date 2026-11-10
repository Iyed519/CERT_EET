# Cert_EET — Sprint 4 · Sprint Backlog (version planifiée)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 4 — « Suivi, tableaux de bord et reporting ; stories reportées soldées »
> **Planifié le :** 10/11/2026 (Sprint Planning) · **Équipe :** 1 porteur de projet, avec un agent de
> développement (Claude) qui exécute la procédure par story
> **Prérequis :** Sprint 3 clôturé (PR #66) — parcours certifiant complet, assistance IA.
> **Statut :** 🟡 **PLANIFIÉ**.

---

## 0. À quoi sert ce document

Le **Sprint Backlog** combine le **Sprint Goal** (pourquoi, §1), les **stories sélectionnées** (quoi, §2)
et le **plan de réalisation** (comment, §3). Il sera mis à jour à la clôture (« version de clôture »), avec la
Revue de Sprint (`docs/Sprint4_Review.md`).

> **Lexique :** *Story* = fonctionnalité vue par l'utilisateur · *Points* = complexité (pas des heures) ·
> *Committed* = engagement ferme · *Stretch* = bonus si marge · *DoD* = Definition of Done.

---

## 1. Sprint Goal (le « pourquoi »)

> **Donner à chaque rôle la visibilité dont il a besoin — suivi pédagogique et alertes de décrochage pour
> le formateur, tableau de bord global, supervision des certificats, rapports et journal d'audit pour
> l'administrateur — et solder les stories reportées depuis le Sprint 2.**

*En clair :* après ce sprint, le formateur voit en un écran où en sont les apprenants de ses formations,
est alerté quand l'un d'eux décroche, et exporte un bilan ; l'administrateur pilote la plateforme
(indicateurs, certificats, rapports institutionnels) et consulte le journal d'audit en lecture seule. Les
sept stories qui glissent depuis deux sprints sont faites : plus aucune dette de périmètre.

**Pourquoi maintenant.** Les épopées E1 à E6 sont livrées : la plateforme produit des données (tentatives,
corrections, certificats, audit) que personne ne peut encore lire d'un coup d'œil. E8 est la dernière épopée
P1 (F6 « Analytics et Reporting ») et la vitrine naturelle de la soutenance. Les reportées, elles, ferment
des trous visibles du parcours (archiver une formation, se désinscrire, remplacer un livrable, historique).

---

## 2. Stories sélectionnées (le « quoi »)

### 2.1 Engagement ferme (committed) — 47 pts

| # | Story | Épop. | Points | MoSCoW | UC / DS |
|---|-------|-------|:-----:|:------:|---|
| 1 | US-AUDIT-01 — Consulter les journaux d'audit (filtres, lecture seule) | E8 | 3 | Should | UC10 Admin / DS-16 P5 |
| 2 | US-DASH-02 — Superviser les certificats (consultations, fiche) | E8 | 3 | Should | UC5 Admin / DS-16 P3 |
| 3 | US-DASH-01 — Tableau de bord global (admin) | E8 | 5 | Should | UC7 Admin / DS-16 P2 |
| 4 | US-SUIVI-01 — Tableau de bord pédagogique (formateur) | E8 | 5 | Should | UC7 For / DS-14 P1 |
| 5 | US-SUIVI-02 — Alertes de décrochage automatiques | E8 | 5 | Should | UC8 For / DS-14 P2 |
| 6 | US-SUIVI-03 — Traiter une alerte | E8 | 2 | Could | UC8 For / DS-14 P2 |
| 7 | US-RPT-01 — Exporter un rapport de session (PDF / CSV, asynchrone) | E8 | 3 | Should | UC9 For / DS-14 P3 |
| 8 | US-RPT-02 — Rapports institutionnels (admin, asynchrone) | E8 | 3 | Should | UC Admin / DS-16 P4 |
| 9 | US-FORM-02 — Clôturer / archiver une formation | E2 | 2 | Should | UC3 Admin / DS-16 P1 |
| 10 | US-INSC-02 — Gérer les inscriptions (admin, import CSV) | E2 | 3 | Should | UC4 Admin / DS-08 P3, DS-11 P2 |
| 11 | US-INSC-03 — Se désinscrire | E2 | 2 | Should | UC1 App / DS-11 P1 |
| 12 | US-FORM-04 — Contenu pédagogique géré par le formateur *(révision v1.4)* | E2 | 3 | Should | UC3 Admin / DS-16 P1 / ADR-11 |
| 13 | US-QCM-02 — Importer des questions depuis sa banque | E3 | 3 | Should | UC1 For / DS-12 P2 |
| 14 | US-QCM-11 — Historique des tentatives | E3 | 3 | Should | F1 / état *TentativeQCM* |
| 15 | US-ATEL-05 — Remplacer son livrable | E4 | 2 | Should | UC4 App / DS-03 P1 |
| | **Total engagé** | | **47 pts** | | |

### 2.2 Extension (stretch) — 16 pts, dans cet ordre

| Ordre | Story | Épop. | Points | MoSCoW | Note |
|:-----:|-------|-------|:-----:|:------:|---|
| 16 | US-IA-05 — Traçabilité des générations | E6 | 3 | Should | Amorcée (origine des questions, audit) |
| 17 | US-CERT-02 — Gestion des échecs : alerte administrateur | E5 | 3 | Should | Reprises déjà livrées par US-CERT-01 |
| 18 | US-IA-06 — Couche d'abstraction LLM | E6 | 3 | Should | Amorcée (`FournisseurLlm`) |
| 19 | US-IA-07 — Suivi en temps réel (SSE) | E6 | 3 | Could | ADR-06 |
| 20 | US-CERT-07 — Expiration automatique | E5 | 2 | Could | Demande une date d'expiration (modèle) |
| 21 | US-CERT-08 — Réémission après révocation pour erreur | E5 | 2 | Could | |
| | **Total extension** | | **16 pts** | | |

### 2.3 Hors sprint (décisions du porteur)

- **Mots de passe, secrets, comptes** (US-AUTH-06 mot de passe oublié, US-AUTH-08 changer son mot de
  passe, US-AUTH-13, rotation des secrets de la branche `docs`) : **fin de projet**.
- **US-QCM-12** surveillance webcam (Could, 8) : conditionnée à l'accord de l'encadrant et à une décision
  sur la protection des données.
- **US-CPT-02** import CSV de comptes, **US-CPT-04** anonymisation : perspectives.

---

## 3. Plan de réalisation (le « comment »)

### 3.1 Ordre et justification

```
US-AUDIT-01 → US-DASH-02 → US-DASH-01           (administrateur : lire ce qui existe déjà)
  → US-SUIVI-01 → US-SUIVI-02 → US-SUIVI-03     (formateur : vue, puis alertes, puis traitement)
    → US-RPT-01 → US-RPT-02                     (exports asynchrones : réutilisent les agrégats)
      → US-FORM-02 → US-INSC-02 → US-INSC-03    (cycle de vie : formation, inscriptions)
        → US-FORM-04 → US-QCM-02 → US-QCM-11 → US-ATEL-05
          → [stretch] US-IA-05 → US-CERT-02 → US-IA-06 → US-IA-07 → US-CERT-07 → US-CERT-08
```

- **Lire avant d'écrire** : le journal d'audit et les certificats existent ; les afficher est le plus
  court chemin vers de la valeur, et fixe les filtres / pagination réutilisés ensuite.
- **Les agrégats d'abord, les exports ensuite** : les rapports (RPT-01, RPT-02) réutilisent les calculs des
  tableaux de bord (SUIVI-01, DASH-01) et la file BullMQ déjà en place.
- **Les reportées en bloc**, du cycle de vie (formation, inscriptions) vers le contenu.

### 3.2 Points d'attention par story (à confirmer à l'étape 0, tableau D)

| Story | Points d'attention |
|---|---|
| US-AUDIT-01 | Lecture seule (aucune route UPDATE / DELETE ; le déclencheur d'immuabilité existe déjà) ; filtres action, acteur, cible, résultat, période ; pagination par curseur ou page ; jamais de données sensibles en clair. |
| US-DASH-02 | Compter les consultations publiques à partir de l'audit `CERTIFICAT_VERIFIE` ; fiche : historique (audit), empreinte ; filtres de statut déjà présents (`/admin/certificats`). |
| US-DASH-01 | Agrégats en SQL (une requête par bloc), période paramétrable ; zéro sans erreur sur une période vide. |
| US-SUIVI-01 | Isolation : seulement les formations où le formateur est affecté (garde par ressource, 403 tracé sinon) ; KPIs inscrits / actifs / décrocheurs, complétion, scores moyens, histogramme ; vue individuelle triable. |
| US-SUIVI-02 | Tâche planifiée (balayage) idempotente : une alerte ouverte par apprenant et par critère (UNIQUE partiel) ; critères factuels (absence > 7 j, 2 échecs QCM consécutifs, livrable en retard > 48 h, score en chute) ; badge + email facultatif ; aucun faux positif. |
| US-SUIVI-03 | Historique des actions (jamais écrasé) ; audit `ALERTE_TRAITEE` ; réouverture possible. |
| US-RPT-01 / RPT-02 | File BullMQ (comme les certificats), 202, fichier dans le stockage, lien de téléchargement réservé au demandeur, email à la fin ; CSV (séparateur `;`, UTF-8 avec BOM pour Excel) et PDF (PDFKit) ; période invalide = 400. |
| US-FORM-02 | Transitions OUVERTE → FERMEE → ARCHIVEE ; confirmation explicite si des évaluations sont en cours ; certificats émis toujours vérifiables. |
| US-INSC-02 | Suspendre plutôt que supprimer ; ré-inscrire ; import CSV borné (taille, lignes) avec rapport ligne par ligne ; notification. |
| US-INSC-03 | Conséquences affichées, confirmation ; SUSPENDUE ; certificats conservés ; formateurs notifiés. |
| US-FORM-04 | Champs pédagogiques seulement (400 sur les réglages institutionnels) ; formateur affecté (403 tracé sinon) ; modules : ajout, renommage, ordre, suppression (409 si du contenu y est rattaché). |
| US-QCM-02 | Liaison sans copie (`qcm_questions`) ; banque = questions des QCM du formateur ; question liée à un QCM déjà tenté : non modifiable ailleurs. |
| US-QCM-11 | Lecture seule ; apprenant (les siennes) et formateur affecté ; durée effective, détail des réponses (sans exposer les bonnes réponses tant que le corrigé n'est pas disponible). |
| US-ATEL-05 | Avant la date limite et tant que SOUMIS ; version + 1 ; ancien objet retiré après succès ; hash recalculé ; refus si EN_CORRECTION (409). |

### 3.3 Procédure par story (inchangée)

Étape 0 (branche, documents, tableau D) → étape 1 (migration, règles pures, service, contrôleur, DTO, audit,
écrans, tests unitaires et e2e avec un nouveau marqueur et la concurrence forcée) → étape 2 (lint, `tsc`,
unitaires, cycle de migration, e2e complet en série, mutations, web `tsc` + `next lint`, navigateur 1280 /
390 px) → étape 3 (journal `engineering-log/55+`, PR, CI verte sur le commit de tête, fusion squash
épinglée, CI verte sur `main`).

---

## 4. Definition of Done

Celle du Sprint 3 (Revue du Sprint 3, §6), sans changement : critères d'acceptation, tests unitaires + e2e,
concurrence forcée, mutations, RBAC + autorisation par ressource, validation serveur, audit, Swagger, CI
verte sur la PR et sur `main` (API, Web, images), navigateur desktop et mobile, journal.

---

## 5. Risques & dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| Agrégats lents sur de gros volumes | Tableaux de bord > NF1 (3 s) | Requêtes SQL agrégées indexées ; exports lourds en asynchrone |
| Faux positifs des alertes | Formateur submergé, perte de confiance | Critères factuels seulement, une alerte ouverte par critère, tests « aucune alerte » |
| Données personnelles dans les exports | RGPD | Liste blanche des colonnes, accès au seul demandeur, lien temporaire |
| Banque de questions partagée entre QCM | Modifier une question change un QCM tenté | Question liée à un QCM tenté = figée |
| Date de fin du projet dépassée | Soutenance | Re-planification par le porteur avec l'encadrant (hors agent) |

---

## 6. Démonstration prévue (Sprint Review)

1. Administrateur : journal d'audit filtré (action, période) ; aucune modification possible.
2. Administrateur : supervision des certificats (consultations publiques, fiche avec historique).
3. Administrateur : tableau de bord global ; rapport institutionnel (CSV / PDF) reçu par email.
4. Formateur : tableau de bord de sa formation, vue individuelle ; alerte de décrochage → action → « Traitée ».
5. Formateur : export du rapport de session.
6. Cycle de vie : archiver une formation (certificats toujours vérifiables), suspendre / ré-inscrire,
   import CSV, désinscription de l'apprenant.
7. Formateur : modifier le contenu pédagogique, importer des questions de sa banque.
8. Apprenant : historique de ses tentatives ; remplacer son livrable avant la date limite.

---

*Sprint Backlog · Cert_EET — Sprint 4 · planifié · committed 47 pts + stretch 16 pts · Iyed Omri, PFE ESPRIT.*
