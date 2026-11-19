# Cert_EET — Cas d'utilisation (v3.0, état réalisé)

> **Version :** 3.0 — 18/11/2026 · Iyed Omri · PFE ESPRIT 2026
> **Base :** descriptions détaillées v2.0 (`UC_Apprenant_Description`, `UC_Formateur_Description`,
> `UC_Administrateur_Description`, `UC_VisiteurPublic_Description`, juin 2026), **conservées** : elles
> décrivent le besoin. Ce document dit, cas par cas, **ce qui a été réalisé**, par quelle route, et avec
> quel écart. **Figures :** `10_diagrammes/cas_utilisation/UC-01` à `UC-04`.
> **Légende :** ✅ réalisé · ⚠️ réalisé avec écart · ❌ non réalisé · ➕ ajouté après la v2.0.

## 1. Visiteur public

| Cas | État | Routes principales | Stories / écart |
|---|:-:|---|---|
| Consulter le catalogue | ✅ | `GET /api/formations`, `GET /api/formations/:id` | US-INSC-01 |
| Créer un compte | ✅ | `POST /api/auth/register`, `POST /api/auth/verify-email`, OAuth Google / GitHub | US-CPT-05, US-AUTH-14 |
| Vérifier un certificat | ✅ | `GET /api/verification/:id` (+ `/pdf`) | US-CERT-04/05 ; verdicts VALIDE, RÉVOQUÉ (lien vers le réémis), EXPIRÉ ; intégrité recalculée |
| ➕ Réinitialiser son mot de passe | ✅ | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | US-AUTH-06 |
| ➕ Activer un compte importé | ✅ | `POST /api/auth/activate` | US-CPT-02 |

## 2. Apprenant

| Cas (v2.0) | État | Routes principales | Stories / écart |
|---|:-:|---|---|
| S'authentifier (MFA) | ✅ | `/api/auth/login`, `/mfa/verify`, `/refresh`, `/logout` | US-AUTH-01 → 04 ; session restaurée au F5 (US-AUTH-17) |
| Gérer son profil — compléter | ✅ | `PATCH /api/auth/profile`, `/api/referentiel/*` | US-AUTH-15 |
| Gérer son profil — modifier nom / prénom | ❌ | — | **US-AUTH-07 non réalisée** |
| Gérer sa sécurité | ⚠️ | `/api/auth/mfa/setup|enable|disable`, `/change-password` | désactivation MFA par code seul (US-AUTH-10 demandait aussi le mot de passe) |
| S'inscrire / se désinscrire | ✅ | `POST /api/formations/:id/inscriptions`, `GET|POST …/desinscription` | US-INSC-01, US-INSC-03 (inscription SUSPENDUE) |
| Accéder aux modules | ✅ | `GET /api/formations/:id/mon-espace`, `/api/modules/:id/ressources` | US-INSC-04, US-FORM-05/06 |
| Passer un QCM | ✅ | `POST /api/qcm/:id/tentatives`, `PUT …/reponses/:q`, `POST …/soumettre` | US-QCM-05 → 10 ; consentement si surveillé (US-QCM-12/15) |
| Consulter résultats et historique | ✅ | `GET /api/tentatives/:id/correction`, `/api/mes-tentatives` | US-QCM-09, US-QCM-11 |
| ➕ Télécharger le rapport PDF + analyse IA | ✅ | `GET /api/tentatives/:id/rapport.pdf` | US-QCM-13, US-IA-10 |
| Déposer / remplacer un livrable | ✅ | `POST|PUT /api/ateliers/:id/livrable` | US-ATEL-04/05 |
| Consulter le feedback | ✅ | `GET /api/mes-ateliers/:id` | US-ATEL-08 |
| Télécharger ses certificats | ✅ | `GET /api/mes-certificats` (+ `/pdf`) | US-CERT-03 |
| ➕ Demander un rôle | ✅ | `POST /api/role-requests` | US-ROL-02 |
| Dialoguer avec un chatbot | ❌ | — | épopée E7 de-scopée (pivot F4) |

## 3. Formateur

| Cas (v2.0) | État | Routes principales | Stories / écart |
|---|:-:|---|---|
| UC1 Créer un QCM | ⚠️ | `/api/modules/:id/qcm`, `/api/qcm/:id/questions` | import GIFT / JSON non réalisé ; remplacé par l'import IA (CSV, XLSX, DOCX, PDF, image — US-IA-08) et la banque (US-QCM-02) |
| UC2 Configurer l'anti-fraude | ✅ | `PUT /api/qcm/:id/configuration`, `PATCH …/publier` | US-QCM-03/04 ; proctoring : détection IA (US-QCM-15/16) au lieu de photos aléatoires |
| UC3 Créer un atelier | ✅ | `/api/modules/:id/ateliers`, `PATCH /api/ateliers/:id/publier` | US-ATEL-01/03 ; ateliers collaboratifs / à étapes : hors PFE (prévu en v2.0) |
| UC4 Définir une grille | ✅ | `/api/ateliers/:id/grille/*`, `/api/grilles/modeles` | US-ATEL-02 |
| UC5 Corriger un livrable | ⚠️ | `PATCH /api/livrables/:id/ouvrir`, `PUT …/correction/criteres/:c` | annotation de PDF et anti-plagiat non réalisés |
| UC6 Rédiger un feedback | ⚠️ | `POST /api/livrables/:id/correction/finaliser` | commentaire général + commentaires par critère ; pas de fichiers annotés |
| UC7 Suivre la progression | ✅ | `/api/formateur/formations/:id/suivi`, `…/apprenants/:id` | US-SUIVI-01, US-DASH-03 |
| UC8 Alertes de décrochage | ⚠️ | `/api/formateur/alertes/*` | 4 critères sur 5 (« baisse du temps passé » non mesurée) ; suggestion d'action fixe, pas rédigée par le LLM |
| UC9 Exporter un rapport | ✅ | `POST /api/formateur/formations/:id/rapports` | US-RPT-01 (+ analyse IA dans le rapport individuel) |
| UC10 Générer des questions par IA | ✅ | `/api/modules/:id/generations`, `/api/suggestions/:id/*` | US-IA-01 → 07, 09 |
| UC11 Gérer les supports | ✅ | `/api/modules/:id/supports`, `…/reindexer` | US-IA-01 |
| ➕ Importer des questions d'un fichier | ✅ | `/api/qcm/:id/extractions`, `/api/questions-extraites/:id/*` | US-IA-08 |
| ➕ Examiner les alertes de surveillance | ✅ | `/api/surveillance/alertes/*` | US-QCM-15 → 17 |
| ➕ Consulter le risque des apprenants | ✅ | `/api/formateur/risque/formations`, `…/formations/:id/risque` | ADR-14 |
| ➕ Demander / proposer une formation | ✅ | `/api/formateur/demandes-affectation`, `/api/formateur/propositions-formation` | US-FORM-07/08 |
| ➕ Gérer le contenu de ses formations | ✅ | `/api/formateur/formations/:id/contenu`, `…/modules` | US-FORM-04 |

## 4. Administrateur

| Cas | État | Routes principales | Stories / écart |
|---|:-:|---|---|
| Gérer les comptes et les rôles | ✅ | `/api/admin/users`, `…/:id/role`, `…/:id` | US-ROL-01, US-CPT-03 ; création unitaire retirée (ADR-13) |
| ➕ Importer des comptes | ✅ | `POST /api/admin/users/import` | US-CPT-02 |
| ➕ Anonymiser un compte | ✅ | `POST /api/admin/users/:id/anonymiser` | US-CPT-04 |
| Traiter les demandes | ✅ | `/api/admin/role-requests`, demandes d'affectation, propositions | US-ROL-02, US-FORM-07/08 |
| Gérer les formations | ✅ | `/api/admin/formations/*` | US-FORM-01/02/03 |
| Gérer les inscriptions | ✅ | `/api/admin/formations/:id/inscriptions`, `/api/admin/inscriptions/:id/*` | US-INSC-02 |
| Superviser / révoquer / réémettre les certificats | ✅ | `/api/admin/certificats/*` | US-CERT-02/06/08/09, US-DASH-02 |
| Tableau de bord | ✅ | `GET /api/admin/tableau-de-bord` | US-DASH-01, US-UX-06 |
| Rapports institutionnels | ✅ | `POST /api/admin/rapports` | US-RPT-02 |
| Traçabilité IA | ✅ | `/api/admin/generations-ia` | US-IA-05 |
| Journal d'audit | ✅ | `/api/admin/audit-logs` (+ `/export`) | US-AUDIT-01, US-AUTH-12 |

## 5. Acteur « Système » (tâches planifiées)
Balayages dans le processus de l'API : alertes de décrochage, expiration des certificats (horaire),
reprise des certificats bloqués (15 min), clôture des tentatives échues, purge de la surveillance (30 jours),
prédiction du risque (quotidienne). Files BullMQ : certificats, rapports, activations, indexation,
génération, extraction.

*Cert_EET — Cas d'utilisation v3.0 · 18/11/2026*
