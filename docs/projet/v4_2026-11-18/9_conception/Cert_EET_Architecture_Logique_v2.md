# Cert_EET — Architecture logique (v2.0, état réalisé)

> **Version :** 2.0 — 18/11/2026 (v1.0 : juin 2026, 3 couches et « neuf modules ») · Iyed Omri
> **Figures :** `10_diagrammes/packages/Cert_EET_PKG02_Couches_Dependances.png` (couches) et
> `10_diagrammes/composants/Cert_EET_COMP01_Modules_API.png` (modules).

## 1. Style
**Architecture en couches (n-tiers)** : le modèle 3-tiers classique (présentation, métier, données) est
affiné en **cinq couches**, et l'API est un **monolithe modulaire** : une seule application NestJS
découpée en 20 modules métier. Chaque couche ne s'adresse qu'à la suivante.

## 2. Les cinq couches

| # | Couche | Technologie | Responsabilités |
|:-:|---|---|---|
| 1 | Présentation | Next.js 14 | interfaces apprenant, formateur, administrateur ; passage du QCM ; page publique de vérification ; analyse webcam (navigateur) |
| 2 | Passerelle | nginx | TLS, HSTS, CSP, limites de débit, routage de `/api` |
| 3 | Application | NestJS 10 | REST + SSE (OpenAPI) ; JWT, MFA, RBAC, gardes par ressource ; toutes les règles métier |
| 4 | Asynchrone | BullMQ + balayages | PDF / SHA-256 / QR ; indexation RAG ; génération et extraction IA ; rapports ; e-mails d'activation ; alertes, expiration, reprise, risque quotidien |
| 5 | Données et services | PostgreSQL + pgvector, Redis, MinIO, service `ml`, Claude, SMTP, OAuth | persistance et services externes |

## 3. Les 20 modules de l'API

| Groupe | Modules |
|---|---|
| Identité et comptes | `auth`, `admin`, `role-requests`, `referentiel`, `health` |
| Formations | `formations`, `inscriptions`, `demandes-affectation`, `propositions-formation`, `ressources` |
| Évaluations | `qcm`, `tentatives`, `surveillance`, `ateliers` |
| Certification et pilotage | `certificats`, `pilotage`, `rapports`, `audit` |
| Intelligence artificielle | `assistance-ia`, `prediction-risque` |

## 4. Pourquoi ce découpage
Maintenabilité et testabilité (règles pures dans des fichiers `*.regles.ts` testés sans base ; e2e sur une
vraie base) ; simplicité d'exploitation pour un seul porteur (un monolithe plutôt que des microservices) ;
seul le modèle de risque est un service à part, parce qu'il est en Python (ADR-14).

## 5. Écarts avec la v1.0
« Neuf modules » → **20** ; pas de `NotificationsModule` (e-mails et compteurs) ; ajout d'une couche
asynchrone explicite ; la couche données contient aussi le service `ml`.

*Cert_EET — Architecture logique v2.0 · 18/11/2026*
