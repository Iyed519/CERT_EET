# Cert_EET — Plan de Sprint 2

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri
> **Sprint :** 2 — « Formations, inscriptions & moteur de QCM anti-fraude »
> **Période (Gantt) :** 22 mai → 04 juin 2026 (2 semaines · 10 jours ouvrés)
> **Équipe :** 1 développeur (solo)
> **Objectif Gantt :** E2 (formations, inscriptions) + E3 (moteur de QCM : randomisation serveur, minuterie, scoring)
> **Prérequis :** Sprint 1 clôturé (Docker, CI/CD, BDD+migrations, Redis, auth/MFA, RBAC, audit).
>
> **v1.1 (07/11/2026, clôture du sprint) :** totaux corrigés (engagement = **46 pts**, somme du tableau §3.1 ; la v1.0 annonçait « ~51 »), extension complétée par US-FORM-04 et US-FORM-05 (révisions v1.4 / v1.5 du Backlog Produit), référence ADR-04 précisée. Réalisé : 05/10 → 07/11/2026, 46/46 + 2 pts d'extension — voir `docs/Sprint2_Review.md` et `docs/Sprint2_Backlog.md`.
>
> *L'état d'avancement au jour le jour vit dans le Sprint Backlog (`Cert_EET_Sprint2_Backlog.md`). Ce plan est le document d'engagement : Sprint Goal, capacité, séquencement, risques, démo.*

---

## 1. Objectif du Sprint (Sprint Goal)

> **À la fin du Sprint 2, un administrateur crée et configure une formation et y affecte un formateur ; un apprenant s'inscrit et accède aux modules ; un formateur crée et publie un QCM sur ses formations affectées ; un apprenant passe ce QCM dans des conditions anti-fraude réelles — temps géré côté serveur (Redis), questions/options randomisées, bonnes réponses jamais envoyées au client, score calculé et figé côté serveur.**

C'est le premier sprint à **valeur métier visible** et le différenciant **P0** du projet : sans moteur d'évaluation anti-fraude robuste, la certification (sprints suivants) n'aurait aucune valeur probante. Entièrement **démontrable** en Sprint Review (cf. §7).

---

## 2. Hypothèse de capacité

Contrairement au Sprint 1, on dispose maintenant d'une **vélocité réelle** (Sprint 1 a livré committed 41 + stretch 25). Mais le Sprint 2 est de nature différente : beaucoup moins d'outillage balisé, beaucoup plus de **logique serveur sensible et sécuritaire** (randomisation, minuterie incontournable, scoring, non-fuite des réponses). Chaque point y est « plus lourd » et plus risqué.

- 10 jours ouvrés − cérémonies ≈ **9 jours productifs**.
- **Capacité de planification retenue : 46 points en engagement ferme + ~12 points en extension (stretch)** *(v1.1 : la v1.0 indiquait « ~51 », erreur d'addition ; extension portée à 18 pts par les révisions v1.4 / v1.5)*.

> Le périmètre Gantt (~50 pts) est tenu en engagement ferme. L'extension (FORM-02, INSC-02/03, QCM-02/09) glisse au Sprint 3 si la vélocité réelle sur le moteur anti-fraude est plus basse que prévu.

---

## 3. Sprint Backlog

### 3.1 Engagé (noyau — chemin critique du Sprint Goal)

| Ordre | ID | Story | Épop. | Points | Pourquoi dans le noyau |
|---|---|---|---|---|---|
| 0 | *(enabler)* | Modèle de données + migrations (Formation, Module, Inscription, AffectationFormateur, QCM, Question, Option, TentativeQCM) | E0/E2/E3 | — | Rien ne se code sans les entités |
| 1 | US-FORM-01 | Créer et configurer une formation | E2 | 5 | Racine de tout le métier (formations, inscriptions, QCM) |
| 2 | US-FORM-03 | Affecter un formateur à une formation | E2 | 2 | Prérequis de l'autorisation par ressource |
| 3 | US-AUTH-16 | Autorisation par ressource (formateur ↔ formations affectées, ADR-11) | E1 | 3 | Un formateur ne doit agir que sur ses formations |
| 4 | US-INSC-01 | S'inscrire à une formation ouverte | E2 | 3 | Sans inscription, pas d'accès aux évaluations |
| 5 | US-INSC-04 | Accéder aux modules et choisir une évaluation | E2 | 3 | Porte d'entrée du passage de QCM |
| 6 | US-QCM-01 | Créer le contenu d'un QCM | E3 | 5 | Base du moteur d'évaluation |
| 7 | US-QCM-03 | Configurer les paramètres anti-fraude | E3 | 5 | Durée, randomisation, tentatives, mode résultat |
| 8 | US-QCM-04 | Publier un QCM (fenêtre d'ouverture) | E3 | 2 | Rend le QCM accessible aux apprenants |
| 9 | US-QCM-05 | Démarrer une tentative (accès contrôlé serveur) | E3 | 3 | Entrée du parcours apprenant |
| 10 | US-QCM-06 | Randomisation + non-exposition des bonnes réponses | E3 | 5 | Cœur anti-fraude (triche impossible côté client) |
| 11 | US-QCM-07 | Minuterie serveur (Redis) + auto-save + auto-submit | E3 | 5 | Le temps n'est pas contournable |
| 12 | US-QCM-08 | Scoring serveur pondéré + figer la tentative | E3 | 5 | Résultat fiable et immuable |
| | | **Total engagé** | | **46** | |

### 3.2 Extension (stretch — visé, dans cet ordre de priorité)

| Ordre | ID | Story | Épop. | Points | Note |
|---|---|---|---|---|---|
| 13 | US-FORM-02 | Clôturer / archiver une formation | E2 | 2 | Fige le cycle de vie |
| 14 | US-INSC-02 | Gérer les inscriptions (admin, import CSV) | E2 | 3 | Piloter les cohortes |
| 15 | US-INSC-03 | Se désinscrire (soft, statut Suspendue) | E2 | 2* | *estimé |
| 16 | US-QCM-02 | Importer des questions depuis une banque | E3 | 3 | Réutilisation de contenu |
| 17 | US-QCM-09 | Voir son résultat (immédiat ou différé) | E3 | 2 | Sans fuite des réponses |
| 18 | US-FORM-04 | Le formateur gère le contenu pédagogique de ses formations | E2 | 3 | Révision v1.4 (10/10/2026) |
| 19 | US-FORM-05 | Ressources de module : liens | E2 | 3 | Révision v1.5 (11/10/2026) |
| | | **Total extension** | | **~12 → 18** | *v1.1 : + US-FORM-04, US-FORM-05* |

### 3.3 Explicitement reporté au Sprint 3 (et au-delà)

- **Anti-fraude avancée** : US-QCM-10 (blocage sessions multiples, limites tentatives/délai), US-QCM-11 (historique immuable des tentatives) → Sprint 3.
- **Ateliers pratiques (E4)** et **MinIO** (stockage des livrables) → Sprint 4.
- **Certification (E5)**, **IA formateur (E6)**, **analytics (E8)** → sprints ultérieurs.
- **Onboarding formateur curaté complet (ADR-11)** : US-AUTH-16 couvre l'autorisation par ressource ; le workflow d'éligibilité formateur (dossier approuvé) sera détaillé avec l'épopée formateur.

---

## 4. Découpage en tâches (Sprint Planning)

Le détail tâche par tâche (avec estimations) vit dans le **Sprint 2 Backlog, §3**. Synthèse :

- **Enabler données** : entités + enums + migrations + tests de migration (≈ 8 h).
- **US-FORM-01 / 03** : CRUD formation + modules, affectation formateur, audit (≈ 10 h).
- **US-AUTH-16** : guard « formateur affecté » réutilisable + branchement routes QCM + tests (≈ 5 h).
- **US-INSC-01 / 04** : inscription (capacité/ouverture) + accès modules filtré par inscription (≈ 8 h).
- **US-QCM-01 / 03 / 04** : contenu QCM, paramètres anti-fraude, publication (≈ 16 h).
- **US-QCM-05 / 06 / 07 / 08** : démarrage tentative, randomisation + non-fuite, minuterie Redis, scoring + figer (≈ 24 h). **Cœur de valeur et de risque.**

---

## 5. Séquencement indicatif (jour par jour)

| Jour | Focus | Stories |
|---|---|---|
| **J1** | Sprint Planning (matin) + modèle de données | Enabler DATA (entités + migrations) |
| **J2** | Formations | US-FORM-01, US-FORM-03 |
| **J3** | Autorisation par ressource + inscriptions | US-AUTH-16, US-INSC-01 |
| **J4** | Accès modules + début QCM | US-INSC-04, US-QCM-01 (début) |
| **J5** | Contenu & config QCM | US-QCM-01 (fin), US-QCM-03 · *Refinement Sprint 3 (fin de journée)* |
| **J6** | Publication + démarrage tentative | US-QCM-04, US-QCM-05 |
| **J7** | Anti-fraude cœur | US-QCM-06 (randomisation + non-fuite) |
| **J8** | Minuterie serveur | US-QCM-07 (Redis, auto-save, auto-submit) |
| **J9** | Scoring + intégration | US-QCM-08 · tests e2e du parcours complet · corrections |
| **J10** | Stabilisation + clôture | Finalisation tests/docs · **Sprint Review** · **Rétrospective** |

**Principe :** le **socle de données est front-loadé (J1)** car il débloque tout ; les formations/inscriptions précèdent le QCM (dépendances) ; le **cœur anti-fraude (J6-J9)** est traité en continu avec ses tests de sécurité dédiés.

---

## 6. Dépendances & risques

| Risque | Impact | Mitigation |
|---|---|---|
| **Complexité du moteur anti-fraude** (QCM-06/07/08) | Cœur de valeur instable ou contournable | Tests de sécurité dédiés : aucune bonne réponse côté client, temps non contournable (horloge serveur) ; s'appuyer sur DS-02 et ADR-04 (PostgreSQL + Redis) |
| **Minuterie serveur Redis** (expiration, auto-submit, reprise) | Tentatives perdues ou temps triché | Clé par tentative avec deadline absolue + TTL ; auto-save régulière ; tests d'expiration et de reconnexion |
| **Autorisation par ressource** (US-AUTH-16) mal câblée | Un formateur agit sur une formation non affectée (faille) | Guard réutilisable testé (affecté / non affecté / admin) **avant** d'ouvrir les routes QCM |
| **Modèle de données** trop rigide | Reprises coûteuses en E4/E5 | Anticiper `Module` polymorphe (QCM / livrable) et `TentativeQCM` extensible |
| **Front hors CI** | Régression non détectée | Vérification manuelle (`tsc --noEmit` + `next lint`) ; dette Sprint 1 à résorber |
| Sur-engagement (46 pts denses) | Glissement | WIP strict ; l'extension glisse **dans l'ordre** au Sprint 3 |

---

## 7. Plan de démonstration (Sprint Review)

1. **Admin** crée une formation (objectifs, capacité, seuils, modules) et **affecte un formateur**.
2. **Apprenant** s'inscrit à la formation ouverte → accède aux **modules**.
3. **Formateur** (affecté) crée un **QCM**, configure l'**anti-fraude** (durée, randomisation), et **publie** ; démontrer qu'un formateur **non affecté** est **refusé (403)** — US-AUTH-16.
4. **Apprenant** démarre une tentative : questions **mélangées**, **minuterie serveur** visible, les bonnes réponses **n'apparaissent pas** dans les données réseau (ouvrir l'inspecteur réseau pour le prouver).
5. **Expiration du temps** → soumission automatique ; **score calculé côté serveur** et **tentative figée** (immuable).
6. Montrer la **doc Swagger** des nouveaux endpoints et la **CI verte**.

---

## 8. Cérémonies Scrum

| Cérémonie | Quand | Objet |
|---|---|---|
| Sprint Planning | J1 (matin) | Valider le Sprint Goal et le sprint backlog |
| Daily (auto-point) | Chaque jour (≤ 15 min) | Avancement, blocages, re-priorisation |
| Backlog Refinement | J5 | Affiner/estimer le Sprint 3 (anti-fraude avancée, historique) |
| Sprint Review | J10 | Démo (§7) au commanditaire / encadrant |
| Rétrospective | J10 | Vélocité réelle sur le moteur anti-fraude, ajustements |

---

## 9. Definition of Done (rappel)

Une story est *Done* si : développée selon ses critères d'acceptation · **testée** (unitaire + intégration, branches d'erreur) · règles transverses appliquées (**RBAC + autorisation par ressource**, validation serveur, journalisation d'audit) · **API documentée** (Swagger) · **CI verte** · revue de code faite · démontrable en Review. Convention : 1 story = 1 branche = 1 PR = squash-merge ; un journal `engineering-log/` par story.

---

*Plan de Sprint 2 · Cert_EET v1.1 — engagé 46 pts / extension 18 pts · Iyed Omri, PFE ESPRIT.*
