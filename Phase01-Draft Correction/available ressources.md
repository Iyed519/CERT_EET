# Standards E-Learning & Étapes Phase 2

---

## Standards d'interopérabilité

### SCORM — Sharable Content Object Reference Model

SCORM est le standard international le plus répandu pour créer et diffuser des contenus e-learning.

**Ce que ça signifie concrètement pour Moodle :**

- Il est possible d'importer dans Moodle des modules de formation créés avec des outils comme **Articulate Storyline**, **Adobe Captivate**, **iSpring**, etc.
- Une fois importé, le module SCORM fonctionne comme un cours : il suit la progression de l'apprenant, enregistre les notes, le temps passé, et l'état de complétion.
- Moodle communique avec ce contenu (ex : savoir si l'utilisateur a terminé le module à 100 %).

> **En résumé :** SCORM permet à Moodle d'être compatible avec presque tous les contenus e-learning professionnels du marché. C'est un point crucial si des modules existent déjà ou si l'on souhaite en acquérir.

---

### xAPI — Tin Can API

xAPI est le standard moderne qui remplace progressivement SCORM. Il permet de suivre des activités d'apprentissage très variées, bien au-delà des simples modules e-learning.

**Exemples d'usages :**

- Simulation interactive
- Formation en présentiel
- Vidéo YouTube
- Session sur mobile
- Expérience en réalité virtuelle

**Fonctionnement :** xAPI enregistre tout sous forme de *statements* :
> *"Omri a terminé la formation Sécurité"*
> *"Omri a regardé la vidéo 3 min 45"*

> **Avantage :** Beaucoup plus flexible et puissant que SCORM.

---

### LTI 1.3 — Learning Tools Interoperability

LTI 1.3 est un standard permettant d'intégrer facilement des outils externes directement dans Moodle.

**Exemples d'intégrations possibles :**

- Zoom / Microsoft Teams
- Google Docs
- Khan Academy
- Simulateurs métiers
- Plateformes externes

L'intégration est propre et sécurisée grâce au **Single Sign-On (SSO)** — l'utilisateur n'a pas besoin de se reconnecter.

---

### Tableau récapitulatif

| Standard  | Usage principal                          | Niveau              |
|-----------|------------------------------------------|---------------------|
| SCORM     | Importer des modules e-learning          | Classique           |
| xAPI      | Suivre toutes sortes d'activités         | Moderne & puissant  |
| LTI 1.3   | Intégrer des outils externes             | Interopérabilité    |

---

## Étapes de la Phase 2

### 1. Validation formelle
Présenter ce document à l'encadrant pédagogique et obtenir un accord formel sur la recommandation de développement sur mesure.

### 2. Architecture Decision Records (ADR)
Formaliser les décisions architecturales fondamentales :
- Style architectural
- Base de données
- Authentification
- Mécanisme de certification
- Stratégie LLM

### 3. Conception générale
Élaborer les livrables de conception :
- Modèle de données (ERD)
- Diagrammes d'architecture système
- Maquettes UX par rôle
- Backlog produit initial

### 4. Sprint 0
Initialiser l'infrastructure technique :
- Dépôt Git
- Pipeline CI/CD (GitHub Actions)
- Environnements Docker (dev / staging / prod)
- Structure **NestJS + Next.js**

### 5. Backlog produit
Rédiger pour chacun des modules fonctionnels identifiés :
- Epics
- User Stories
- Critères d'acceptation
