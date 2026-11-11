# Cert_EET — Sprint 5 · Sprint Backlog (version de clôture)

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 5 — « Comptes et sécurité soldés : mots de passe, durcissement, import, RGPD, surveillance »
> **Planifié et réalisé le :** 11/11/2026 · **Équipe :** 1 porteur de projet, avec un agent de
> développement (Claude) qui exécute la procédure par story, sans intervention pendant le sprint
> **Prérequis :** Sprint 4 clôturé (PR #79 → #89) — suivi, tableaux de bord, reporting, interface commune.
> **Statut :** ✅ **CLÔTURÉ** — 6 / 6 stories, 23 pts (PR #90 → #95). Revue : `docs/Sprint5_Review.md`.

---

## 0. À quoi sert ce document

Le **Sprint Backlog** combine le **Sprint Goal** (pourquoi, §1), les **stories sélectionnées** (quoi, §2)
et le **plan de réalisation** (comment, §3). Cette version est celle de **clôture** : chaque ligne porte sa
PR et son journal. Le bilan, la démonstration et la rétrospective sont dans la Revue de Sprint.

> **Lexique :** *Story* = fonctionnalité vue par l'utilisateur · *Points* = complexité (pas des heures) ·
> *DoD* = Definition of Done.

---

## 1. Sprint Goal (le « pourquoi »)

> **Solder toutes les stories restantes du backlog : la gestion des mots de passe (changer, oublier), le
> durcissement de la plateforme (TLS, en-têtes, limites), l'administration des comptes (import CSV,
> anonymisation RGPD) et la surveillance webcam des QCM, dans une conception prudente et respectueuse
> des données personnelles.**

*En clair :* après ce sprint, un utilisateur gère seul son mot de passe ; la plateforme résiste aux abus
courants (force brute, corps géants, contenu malveillant en cadre) et chiffre ses échanges ;
l'administrateur enrôle une promotion d'un fichier et efface un compte sur demande sans perdre les preuves
de certification ; le formateur peut, s'il le choisit, faire surveiller un QCM par webcam, avec le
consentement de l'apprenant.

**Pourquoi maintenant.** Ces stories avaient été repoussées « en fin de projet » par le porteur (Sprint 4,
§2.3). Les épopées fonctionnelles sont livrées : il reste les fondations de sécurité promises par le
cahier des charges (F7, NF3, NF4) et l'ultime paramètre anti-fraude encore marqué « Bientôt actif ».

---

## 2. Stories sélectionnées (le « quoi »)

| # | Story | Épop. | Points | MoSCoW | PR | Journal | Statut |
|---|-------|-------|:-----:|:------:|:--:|:------:|:------:|
| 1 | US-AUTH-08 — Changer son mot de passe | E1 | 3 | Must | #90 | 77 | ✅ |
| 2 | US-AUTH-06 — Mot de passe oublié | E1 | 3 | Must | #91 | 78 | ✅ |
| 3 | US-AUTH-13 — TLS et durcissement des endpoints sensibles | E1 | 3 | Must | #92 | 79 | ✅ |
| 4 | US-CPT-02 — Import CSV de comptes | E2 | 3 | Should | #93 | 80 | ✅ |
| 5 | US-CPT-04 — Anonymisation RGPD d'un compte | E2 | 3 | Should | #94 | 81 | ✅ |
| 6 | US-QCM-12 — Surveillance webcam par captures *(révision v1.6)* | E3 | 8 | Could | #95 | 82 | ✅ |
| | **Total** | | **23 pts** | | | | **6 / 6** |

**Hors sprint (décision du porteur) :** la rotation des secrets exposés sur la branche `docs` est une
action d'exploitation sur une branche que l'équipe ne modifie pas ; elle reste à faire par le porteur
(Revue, §9).

---

## 3. Plan de réalisation (le « comment »)

### 3.1 Ordre et justification

```
US-AUTH-08 → US-AUTH-06 → US-AUTH-13        (mots de passe, puis protections communes)
  → US-CPT-02 → US-CPT-04                   (comptes : créer en masse, puis effacer)
    → US-QCM-12                             (la plus grosse, la plus sensible, en dernier)
```

- **Changer avant d'oublier** : US-AUTH-08 pose la politique de mot de passe partagée, la révocation de
  toutes les sessions (base et Redis) et le gabarit d'email, réutilisés tels quels par US-AUTH-06.
- **Mot de passe oublié avant le durcissement** : US-AUTH-06 crée la limitation de débit générique, que
  US-AUTH-13 étend à la connexion, au refresh, à l'inscription et à la vérification d'email.
- **Import avant anonymisation** : l'import (US-CPT-02) réutilise la primitive de lien email d'US-AUTH-06
  pour l'activation ; l'anonymisation (US-CPT-04) doit savoir effacer tout ce qui précède.
- **Surveillance en dernier** : elle touche au démarrage des tentatives, au stockage, aux droits et au
  RGPD ; elle profite des briques précédentes (limites, anonymisation, liens signés).

### 3.2 Points d'attention (tranchés à l'étape 0, tableaux D des journaux)

| Story | Points d'attention et décision |
|---|---|
| US-AUTH-08 | Mot de passe actuel faux = 401 « métier » distinct d'une session expirée (code stable) ; ligne verrouillée (`FOR UPDATE`) contre deux changements simultanés ; marqueur d'invalidation en millisecondes (un jeton de la même seconde était encore accepté). |
| US-AUTH-06 | Anti-énumération (réponse identique) ; jeton à usage unique, 30 min, **empreinte seule en base** ; quota silencieux par adresse et 429 par IP ; page sans Referer. |
| US-AUTH-13 | Chemins de certificat de remplacement seulement ; profil TLS « intermediate » ; deux couches de limites (nginx et API) ; limites réglables (salle de cours derrière une seule IP) ; tests qui prouvent 429, 413, en-têtes et CORS. |
| US-CPT-02 | Validation complète avant toute création ; tout ou rien (une transaction, verrou consultatif) ; activation asynchrone (BullMQ) sans jeton dans Redis. |
| US-CPT-04 | Irréversible, double confirmation ; certificats toujours vérifiables mais titulaire masqué et PDF public coupé ; dernier administrateur actif protégé (verrous en ordre stable) ; journal conservé. |
| US-QCM-12 | Opt-in par QCM, consentement strict, données minimales (une image toutes les 2 min), accès restreint et journalisé, liens signés, purge à 30 jours ; préalables humains (encadrant, RGPD / INPDP) documentés, interrupteur de plateforme. |

### 3.3 Procédure par story (inchangée)

Étape 0 (branche depuis `main` à jour, tableau D) → étape 1 (migration run / revert / run, règles pures,
service, contrôleur, DTO, audit, écrans dans le style commun, unitaires, e2e avec un marqueur unique et la
concurrence forcée) → étape 2 (8 à 17 mutants, tous tués ; e2e complet en série, unitaires, lint sans
avertissement, `tsc` ; web `tsc`, `next lint`, `next build` ; navigateur 1280 / 390 px) → étape 3 (journal
`engineering-log/77+`, PR en français, CI verte sur le commit de tête, fusion squash épinglée, CI verte
sur `main` : API, Web et les deux images).

---

## 4. Definition of Done

Inchangée depuis le Sprint 3 (Revue du Sprint 3, §6) : critères d'acceptation, tests unitaires + e2e,
concurrence forcée, mutations, RBAC + autorisation par ressource, validation serveur, audit, Swagger, CI
verte sur la PR et sur `main` (API, Web, images), navigateur desktop et mobile, journal.

---

## 5. Risques & dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| Limites de débit trop strictes en présentiel (toute la salle derrière une IP) | Connexions refusées pendant un cours | Valeurs larges par défaut, réglables par variable (`LIMITE_<NOM>`), documentées |
| Images du visage (webcam) | Donnée personnelle sensible (RGPD, loi 2004-63) | Opt-in, consentement, minimisation, accès restreint, purge ; interrupteur `SURVEILLANCE_WEBCAM` tant que la décision n'est pas prise |
| Anonymisation incomplète | Donnée personnelle résiduelle | Liste explicite des données effacées ; résidus (audit antérieur, rapports générés, PDF privé) documentés pour décision |
| Énumération des comptes par « mot de passe oublié » | Fuite d'information | Réponse identique, envoi d'email non bloquant, quota silencieux |
| Vrais certificats TLS absents du dépôt | Déploiement incomplet | Procédure et script de vérification (`docker/nginx/verifier-durcissement.sh`) |

---

## 6. Démonstration prévue (Sprint Review)

Voir la Revue de Sprint, §5 (script pas à pas).

---

*Sprint Backlog · Cert_EET — Sprint 5 · clôturé · 6 stories, 23 pts · Iyed Omri, PFE ESPRIT.*
