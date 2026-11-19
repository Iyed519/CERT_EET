# Cert_EET — Sprint 6 · Sprint Backlog (version de clôture)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 6 — « Prêt pour la démonstration : session stable, navigation par rôle, pilotage du formateur, demandes du formateur »
> **Planifié et réalisé le :** 11/11/2026 · **Équipe :** 1 porteur de projet, avec un agent de
> développement (Claude) qui exécute la procédure par story, sans intervention pendant le sprint
> **Prérequis :** Sprint 5 clôturé (PR #90 → #96).
> **Statut :** ✅ **CLÔTURÉ** — 6 / 6 stories, 26 pts (PR #97 → #102). Revue : `docs/Sprint6_Review.md`.

---

## 0. À quoi sert ce document

Le **Sprint Backlog** combine le **Sprint Goal** (pourquoi, §1), les **stories sélectionnées** (quoi, §2)
et le **plan de réalisation** (comment, §3). Cette version est celle de **clôture** : chaque ligne porte sa
PR et son journal.

---

## 1. Sprint Goal (le « pourquoi »)

> **Rendre la plateforme démontrable sans accroc devant l'encadrant : une session qui survit au
> rechargement, une arrivée directe sur la page de chaque rôle, un tableau de bord pour le formateur,
> la possibilité pour le formateur de demander ou de proposer une formation, et une recette complète de
> la navigation avec un jeu de démonstration.**

*En clair :* le porteur présente l'application le lendemain. Un rafraîchissement de page le
déconnectait ; chaque connexion menait à une page intermédiaire ; le formateur n'avait pas de vue
d'ensemble ni de moyen d'exprimer un souhait d'enseignement ; et aucune donnée de démonstration
cohérente n'existait.

---

## 2. Stories sélectionnées (le « quoi »)

| # | Story | Épop. | Points | MoSCoW | PR | Journal | Statut |
|---|-------|-------|:-----:|:------:|:--:|:------:|:------:|
| 0 | US-AUTH-17 — Garder la session après un rafraîchissement de page *(bloquant)* | E1 | 3 | Must | #97 | 83 | ✅ |
| 1 | US-NAV-01 — Redirection par rôle après connexion | E1 | 3 | Must | #98 | 84 | ✅ |
| 2 | US-DASH-03 — Tableau de bord global du formateur | E8 | 5 | Must | #99 | 85 | ✅ |
| 3 | US-FORM-07 — Le formateur demande à enseigner une formation existante | E4 | 5 | Should | #100 | 86 | ✅ |
| 4 | US-FORM-08 — Le formateur propose une nouvelle formation | E4 | 5 | Should | #101 | 87 | ✅ |
| 5 | US-QUAL-01 — Audit complet de navigation (avant la démo) | Qualité | 5 | Must | #102 | 88 | ✅ |
| | **Total** | | **26 pts** | | | | **6 / 6** |

---

## 3. Plan de réalisation (le « comment »)

### 3.1 Ordre et justification

```
US-AUTH-17 → US-NAV-01                      (la session, puis où elle mène)
  → US-DASH-03                              (la page d'arrivée du formateur)
    → US-FORM-07 → US-FORM-08               (ses demandes, la plus simple d'abord)
      → US-QUAL-01                          (la recette de tout, en dernier)
```

- **Session d'abord** : tant qu'un F5 déconnecte, aucune autre page ne se démontre.
- **Navigation ensuite** : la décision « quelle page pour qui » s'appuie sur l'état « session en
  cours de restauration » d'US-AUTH-17.
- **Tableau de bord avant les demandes** : il porte les boutons « Demander » / « Proposer » et les
  compteurs, ajoutés story par story (aucun lien mort entre deux fusions).
- **Affectation avant proposition** : US-FORM-08 reprend la structure, les écrans et le style d'emails
  d'US-FORM-07, et ajoute le statut BROUILLON.
- **Audit en dernier** : il vérifie le produit final et fournit les données de démonstration.

### 3.2 Points d'attention (tranchés à l'étape 0, tableaux D des journaux)

| Story | Points d'attention et décision |
|---|---|
| US-AUTH-17 | Jeton en mémoire seulement (anti-XSS, inchangé) ; une seule restauration par chargement ; aucune page rendue avant ; course côté api rendue atomique (un seul gagnant, famille jamais révoquée par une course) plutôt qu'un « délai de grâce » ; zone nginx dédiée au refresh. |
| US-NAV-01 | Une seule fonction `pageAccueilDuRole` ; chemin de retour interne seulement (refus de `//`, `/\`, schémas) ; décision unique dans la coquille, pas de garde par page. |
| US-DASH-03 | Périmètre par `formation_formateurs` ; deux requêtes quel que soit le nombre de formations ; moyennes pondérées. |
| US-FORM-07 | Index unique partiel + verrou ; acceptation et affectation dans la même transaction ; une seule décision gagne. |
| US-FORM-08 | Statut BROUILLON (migration d'énumération réversible) ; limite de 5 sous verrou ; publication distincte de la réouverture. |
| US-QUAL-01 | Outil rejouable (pas une vérification ponctuelle) ; jeu de démonstration idempotent qui passe par l'api pour tout ce qui a des règles métier. |

### 3.3 Procédure par story (inchangée)

Étape 0 (branche depuis `main` à jour, tableau D) → étape 1 (migration run / revert / run, règles pures,
service, contrôleur, DTO, audit, écrans dans le style commun, unitaires, e2e avec un marqueur unique et la
concurrence forcée) → étape 2 (8 à 15 mutants, tous tués ; e2e complet en série, unitaires, lint sans
avertissement, `tsc` ; web `tsc`, `next lint`, `next build` ; navigateur 1280 / 390 px derrière nginx) →
étape 3 (journal `engineering-log/83+`, PR en français, CI verte sur le commit de tête, fusion squash
épinglée, CI verte sur `main` : API, Web et les deux images).

---

## 4. Definition of Done

Inchangée depuis le Sprint 3, avec un ajout : pour toute page touchée, scénario navigateur rejoué derrière
nginx (https://localhost), à 1280 et 390 px, en build de production.

---

## 5. Risques & dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| Démonstration le lendemain | Toute régression visible | Une story à la fois, CI verte sur `main` entre chaque fusion, audit de navigation final |
| Rotation du jeton de session sous requêtes concurrentes | Déconnexions aléatoires | Brûlage atomique (api) + single-flight et Web Locks (web), prouvés en e2e et dans le navigateur |
| Ajout d'une valeur d'énumération (BROUILLON) | Écrans et tableaux de bord incomplets | Types `Record<StatutFormation>` : le compilateur liste chaque endroit à compléter ; migration réversible |
| Données de démonstration incohérentes | Pages vides ou erreurs en direct | Parcours réels via l'api (QCM, livrables, certificats) ; chargement idempotent |

---

*Sprint Backlog · Cert_EET — Sprint 6 · clôturé · 6 stories, 26 pts · Iyed Omri, PFE ESPRIT.*
