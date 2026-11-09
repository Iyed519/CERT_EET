# Cert_EET — Sprint 3 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri · ESPRIT Entreprise
> **Sprint :** 3 — « Parcours certifiant complet : ateliers, certificat vérifiable, assistance IA »
> **Statut :** **CLÔTURÉ** — bloc A 14/14 (54 pts) + bloc B (IA) 4/4 (24 pts) + 2 ajoutées (8 pts) = 86 pts.
> **Réalisé :** 08/11 → 09/11/2026 (PR #40 → #65), avec un agent de développement (Claude).
> **Objet :** support de revue de sprint — bilan, démonstration, rétrospective. Version détaillée et pédagogique : `docs/Sprint3_Review.md` (dépôt).

---

## 1. Sprint Goal — verdict

> **Objectif :** compléter le parcours certifiant — QCM anti-fraude terminé, ateliers pratiques évalués par
> le formateur, certificat vérifiable avec QR — puis l'IA du formateur si le temps le permet.

**Atteint, extension comprise.** Chaque maillon est livré, couvert par une suite e2e et démontrable ; en plus,
les ressources du cours (liens, vidéos, fichiers) demandées en cours de sprint.

---

## 2. Bilan chiffré

| Indicateur | Valeur |
|---|---|
| Stories livrées | **20** (14 committed + 4 stretch + 2 ajoutées) |
| Points | **54** committed + **24** stretch + **8** ajoutés = **86** (Sprint 2 : 48 ; Sprint 1 : 69) |
| Pull requests mergées | #40 → #65 (26 : 21 de stories, 5 de maintenance) |
| Tests API | **1 720** (1 128 unitaires / 77 suites + 592 e2e / 41 suites) ; 741 à la fin du Sprint 2 |
| Mutations | > 130 mutants tués (chaque protection prouvée) |
| Migrations | 16 (11 → 27) |
| Journaux techniques | `engineering-log/` 35 → 54 |
| Durée réelle | 2 jours (agent de développement, procédure fixée par le porteur) |

---

## 3. Ce qui est livré (par domaine)

**QCM (E3).** Sessions multiples bloquées : une tentative ne sert que depuis la connexion qui l'a ouverte
(409 ailleurs, tracé ; levé à la déconnexion ou à l'échéance) — US-QCM-10.

**Ateliers (E4).** Atelier en brouillon sous un module (US-ATEL-01) ; grille pondérée à 100 %, 4 niveaux,
modèles réutilisables (US-ATEL-02) ; publication qui fige atelier et grille (US-ATEL-03) ; dépôt contrôlé
(contenu réel, taille, délai jugé par PostgreSQL), SHA-256, MinIO, email (US-ATEL-04) ; correction critère
par critère sous verrou, score en direct (US-ATEL-06) ; feedback immuable en base, email (US-ATEL-07) ;
consultation et badge « Nouveau feedback » (US-ATEL-08).

**Certification (E5).** Éligibilité après chaque note, demande unique (US-ATEL-09) ; émission en arrière-plan
(BullMQ) : PDF + QR + SHA-256, ACTIF immuable, reprises et relance admin (US-CERT-01) ; « Mes certificats »
(US-CERT-03) ; vérification publique sans compte, empreinte recalculée, comparaison de PDF dans le
navigateur (US-CERT-04) ; 20 req / min / IP, données minimales, jamais indexée (US-CERT-05) ; révocation
à double confirmation, irréversible en base, sans motif public (US-CERT-06).

**Assistance IA (E6).** Dépôt et indexation d'un support dans pgvector (US-IA-01) ; génération paramétrée,
202, plafonds (US-IA-02) ; pipeline RAG : 8 passages du support ciblé, Claude derrière une interface, JSON
imposé, validation serveur (US-IA-03) ; révision humaine : accepter / modifier / rejeter, origine IA dans
le QCM, décision unique garantie en base (US-IA-04).

**Ressources du cours (E2).** Liens et vidéos YouTube / Vimeo intégrées (US-FORM-05) ; fichiers lus par lien
signé de 10 minutes (US-FORM-06).

---

## 4. Script de démonstration (ordre conseillé)

1. **Sessions multiples** : même apprenant, deux navigateurs → refus sur le second.
2. **Atelier** : créer, grille 40 / 35 / 25 % (refus au-delà de 100 %), valider, publier.
3. **Livrable** : dépôt PDF ; refus d'un `.zip` renommé ; email au formateur.
4. **Correction** : niveau + points + commentaire par critère, envoyer ; email à l'apprenant.
5. **Feedback** : badge « Nouveau feedback », détail par critère.
6. **Certificat** : « Mes certificats » → PDF avec QR et empreinte.
7. **Vérification** (navigation privée) : « Valide » ; PDF identique / différent.
8. **Révocation** (admin) : mot de passe faux puis juste → « Révoqué le … » sur la page publique.
9. **Ressources** : vidéo YouTube et MP4 lues dans la page.
10. **IA** : support indexé → 5 questions générées → accepter, modifier, rejeter → pastilles « IA ».
11. **Swagger et CI** : nouvelles routes ; CI verte (API, Web, images).

---

## 5. Qualité — Definition of Done respectée

Critères d'acceptation · tests unitaires + e2e (erreurs comprises) · **concurrence forcée** pour chaque
course · **mutation** pour chaque protection · RBAC + autorisation par ressource · validation serveur · audit ·
Swagger · **CI verte sur le commit de tête et fusion épinglée** · **CI verte sur `main`** (API, Web, images) ·
navigateur 1280 / 390 px · journal.

**Écarts assumés** (tracés avant de coder, reportés dans DS-02, 03, 04, 05, 06, 07, 09, 13 et le Backlog
v1.8) : 409 pour les refus d'état / de temps (et non 403 / 400) ; routes sous le module ou la ressource ;
BullMQ et workers dans l'API ; empreinte dans `certificats` ; audit au lieu de tables dédiées ; email au lieu
de notifications in-app ; pas de banque de questions séparée ; embeddings lexicaux locaux ; Claude au lieu de
GPT-4o.

---

## 6. Incidents

Accès GitHub absent au premier jour · image MinIO disparue (Bitnami archivée figée) · tests de concurrence
instables (suites en série, verrou de ligne, `pg_blocking_pids`) · mutant compilé par l'e2e · comparaisons
exactes cassées par un champ ajouté · noms accentués mal décodés · Windows-1252 sous Node 20 · modèle
d'embeddings neuronal non vérifiable.

---

## 7. Rétrospective

**Suivi Sprint 2 :** liste de contrôle de fusion ✅ · front en CI, `WATCHPACK_POLLING`, délai e2e ✅ ·
re-planification avec l'encadrant ⚠ · rotation des secrets ⏸ (fin de projet).

**À garder :** procédure écrite par story · documents d'abord · preuve plutôt que confiance · interfaces +
fournisseurs factices · navigateur desktop et mobile.

**À arrêter :** supposer qu'une image existe · comparaisons exactes fragiles · mutations pendant l'e2e ·
reportées sans décision.

**À essayer au Sprint 4 :** parcours complet cliqué sur le poste · essai réel du modèle de langage ·
re-planification avec l'encadrant · trier les stories reportées.

---

## 8. Risques / dette

Date de fin dépassée (24/10/2026) · secrets de la branche `docs` à faire tourner avant partage · image MinIO
archivée · LLM externe (coût, souveraineté) · embeddings lexicaux · pas d'antivirus · ateliers absents du
taux d'avancement · webcam et copier-coller « Bientôt actif » · vidéos YouTube / Vimeo et appel réel au LLM à
vérifier sur le poste.

*Revue de Sprint 3 (version courte) · Cert_EET · Iyed Omri, PFE ESPRIT.*
