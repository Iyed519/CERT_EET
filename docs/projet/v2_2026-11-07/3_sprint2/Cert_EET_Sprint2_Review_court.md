# Cert_EET — Sprint 2 · Revue de Sprint (Sprint Review) et rétrospective

> **Projet :** Cert_EET — PFE ESPRIT · Iyed Omri · ESPRIT Entreprise
> **Sprint :** 2 — « Formations, inscriptions & moteur de QCM anti-fraude »
> **Statut :** **CLÔTURÉ** — committed 12/12 (46 pts) + stretch 1/7 (2 pts) ; 16 pts d'extension reportés au Sprint 3.
> **Réalisé :** 05/10 → 07/11/2026 (PR #23 → #38) · planifié 22/05 → 04/06/2026 (Gantt).
> **Objet :** support de revue de sprint — bilan, démonstration, rétrospective. Version détaillée et pédagogique : `docs/Sprint2_Review.md` (dépôt).

---

## 1. Sprint Goal — verdict

> **Objectif :** un administrateur crée et configure une formation et y affecte un formateur ; un apprenant
> s'inscrit et accède aux modules ; un formateur crée et publie un QCM sur ses formations affectées ; un
> apprenant passe ce QCM dans des conditions anti-fraude réelles — temps géré côté serveur, questions/options
> randomisées, bonnes réponses jamais envoyées au client, score calculé et figé côté serveur.

**Atteint.** Chaque maillon est livré, couvert par une suite e2e et démontrable ; en extension, US-QCM-09
(corrigé selon le mode immédiat / différé, sans fuite des réponses).

---

## 2. Bilan chiffré

| Indicateur | Valeur |
|---|---|
| Stories livrées | **13** (12 committed + 1 stretch) + enabler modèle de données |
| Points | **46** committed (« ~51 » du Plan = erreur d'addition) + **2** stretch = **48** (Sprint 1 : 69) |
| Pull requests mergées | #23 → #38 (16, dont l'annulation #28 et la reprise #29) |
| Tests API | **741** (468 unitaires / 36 suites + 273 e2e / 21 suites) ; 110 à la fin du Sprint 1 |
| Migrations | 3 (modèle de données ×2, trigger d'immuabilité des tentatives notées) |
| Journaux techniques | `engineering-log/` 21 → 34 |
| Durée réelle | ≈ 5 semaines (nominale : 2) |

---

## 3. Ce qui est livré (par domaine)

**Socle (#23).** 12 tables du cœur métier ; garanties portées par le schéma (unicités, clés étrangères,
bonne réponse jamais chargée par défaut).

**Formations & autorisation (E2 / E1).** Création et configuration d'une formation + modules (US-FORM-01),
affectation des formateurs (US-FORM-03), **autorisation par ressource** `@FormateurDeLaFormation` — 403 +
audit hors périmètre (US-AUTH-16, ADR-11).

**Inscriptions (E2).** Auto-inscription sans dépassement de capacité (transaction + verrou, US-INSC-01) ;
« Mon espace » : modules, QCM publiés, avancement (US-INSC-04).

**Moteur de QCM anti-fraude (E3).** Contenu (QCU / QCM / Vrai-Faux, figé à la 1re tentative, US-QCM-01) ;
paramètres anti-fraude (US-QCM-03) ; publication revérifiée sous verrou (US-QCM-04) ; démarrage contrôlé par
l'horloge de la base, refus 409 motivés (US-QCM-05) ; tirage cryptographique figé + non-fuite prouvée
(US-QCM-06) ; échéance PostgreSQL, sauvegarde des réponses, balayage 60 s (US-QCM-07) ; notation serveur
pondérée, NOTEE immuable par trigger, avancement recalculé (US-QCM-08) ; corrigé selon le mode (US-QCM-09).

---

## 4. Script de démonstration (ordre conseillé)

1. **Admin** : créer une formation + 2 modules, **affecter** un formateur.
2. **Autorisation par ressource** : un formateur **non affecté** ouvre la formation → **403** ; trace
   `ACCES_RESSOURCE_REFUSE` dans l'audit.
3. **Apprenant** : catalogue → inscription → « Mon espace ».
4. **Formateur** : QCM de 4 questions avec explications ; paramètres (randomisation, 10 min, 1 tentative,
   **immédiat**, seuil 60 %) ; **publier**. Webcam / copier-coller : « Bientôt actif » (non appliqués).
5. **Apprenant** : « Commencer » → questions mélangées, compte à rebours serveur ; **inspecteur réseau** :
   aucune bonne réponse ; rechargement : même ordre, réponses restaurées.
6. **Soumettre** → score serveur, Réussi / Échoué → **« Voir le corrigé »**.
7. QCM **différé** : score seul, corrigé « disponible le {fermeture} ».
8. **Temps écoulé** : tentative close et notée par le serveur.
9. (Optionnel) `UPDATE` SQL sur une tentative NOTEE → refusé par le trigger.
10. « Mon espace » : progression et badges ; **Swagger** (`/api/docs`) ; **CI verte** (Actions).

---

## 5. Qualité — Definition of Done respectée

Critères d'acceptation · tests unit + e2e (cas d'erreur) · RBAC + autorisation par ressource · validation
serveur · audit · Swagger · **CI verte** avant squash-merge · front vérifié dans un navigateur (1280 / 390 px,
`tsc`, `next lint`) · journal. Protections prouvées : non-fuite sur trafic réel, concurrence forcée, mutation.

**Écarts assumés avec les documents** (décidés avant de coder) : 409 pour les refus de démarrage et liés au
temps ; routes REST (`POST /qcm/:qcmId/tentatives`, `PUT …/reponses/:questionId`, `POST …/soumettre`,
`GET …/correction`) ; échéance décidée par PostgreSQL, Redis en miroir ; état final NOTEE ; audit
`TENTATIVE_NOTEE` ; avancement recalculé à la notation ; corrigé immédiat après la dernière tentative.
Reportés dans Backlog Produit v1.7, DS-02 v1.1, DS-09 v1.1, DS-12 v1.1.

---

## 6. Incidents

Annulation d'US-INSC-01 par le bouton « Revert » (#27 → #28 → #29) · titres de fusion par défaut (#29, #30,
#38) · test à retardement (dates fixes vs horloge réelle) · tests de concurrence qui ne prouvaient rien
(corrigés : chevauchement forcé + mutation) · CSS non recompilé sous Windows · Prettier sur le web ·
`tsc` pendant la régénération de `.next` · base de référence faussée · réseau absent à la création d'une
branche · poste en veille pendant les e2e.

---

## 7. Rétrospective

**À garder :** documents d'abord + tableau D avant de coder ; une étape à la fois ; tests qui prouvent ;
règles pures séparées ; vérification dans un vrai navigateur.
**À arrêter :** laisser GitHub décider (Revert, titre par défaut) ; outils globaux sur des fichiers qui ne
les suivent pas ; dates fixes face à l'horloge réelle ; vérifier pendant une régénération.
**À essayer (Sprint 3) :**

| # | Action | Mesure |
|---|---|---|
| 1 | Liste de contrôle de fusion en fin de PR | 0 titre par défaut sur `main` |
| 2 | Front en CI (`tsc` + `next lint`) + `WATCHPACK_POLLING` + délai e2e 30 s (1re PR `chore`) | Job vert sur chaque PR |
| 3 | Re-planifier au Sprint 3 Planning (durée fixée, engagement calé sur 48 pts / ≈ 5 semaines) | Sprint 3 clos à la date prévue |
| 4 | Rotation des secrets avant tout partage du dépôt | Aucun secret valide accessible à un tiers |

---

## 8. Risques / dette

- **Calendrier :** ≈ 5 semaines pour 2 prévues ; fin de projet du Backlog (24/10/2026) **dépassée**, E4, E5,
  E6, E8 restantes → nouvelle date et priorisation **avec l'encadrant** au Sprint 3 Planning.
- **Secrets sur la branche `docs`** (commit `9cd3913` : `.env`, `secrets/jwt_*.pem`, ancienne clé TLS) :
  traitement en fin de projet (décision Iyed — PR vers `docs` + rotation, sans réécriture) ; rotation
  recommandée avant tout partage.
- **Front hors CI** ; environnement Windows (`WATCHPACK_POLLING`) ; délai e2e global.
- **Paramètres enregistrés sans effet :** webcam (US-QCM-12), copier-coller.

---

## 9. Et après (Sprint 3)

En tête, dans l'ordre : US-FORM-04 (3) · US-FORM-05 (3) · US-FORM-02 (2) · US-INSC-02 (3) · US-INSC-03 (2) ·
US-QCM-02 (3). Puis E3 avancée : US-QCM-10 (sessions multiples), US-QCM-11 (historique, réutilise le corrigé).
Première PR : `chore` front en CI. Plus loin : E4 + MinIO (Sprint 4), E5, E6 — à re-planifier.

---

*Revue de Sprint · Cert_EET — Sprint 2 · Iyed Omri, PFE ESPRIT · ESPRIT Entreprise.*
