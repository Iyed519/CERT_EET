# Cert_EET — Sprint 4 · Clôture, revue et rétrospective

> **Projet :** Cert_EET — PFE ESPRIT 2026 · Iyed Omri
> **Sprint :** 4 — « Suivi, tableaux de bord et reporting ; stories reportées soldées »
> **Statut :** ✅ **CLÔTURÉ** — engagement ferme **15 / 15** (47 pts) + extension **6 / 6** (16 pts) =
> **21 stories, 63 points**, PR **#68 → #88**, réalisé le **10/11/2026** avec un agent de développement
> (Claude) qui exécute la procédure par story ; une PR d'interface sans story (#89).
> **Pourquoi ce document maintenant :** la version planifiée (`docs/Sprint4_Backlog.md`) n'avait pas été
> clôturée, et le `CHANGELOG.md` n'avait pas de section Sprint 4. Ce document est rédigé le 18/11/2026
> à partir de l'historique Git, des journaux `engineering-log/55` à `76` et de la passation
> `claude/Cert_EET_Handoff_Sprint4.md`. Rien n'est inventé : les éléments non retrouvés sont signalés.

---

## 1. Sprint Goal et verdict

> **Donner à chaque rôle la visibilité dont il a besoin — suivi pédagogique et alertes de décrochage pour
> le formateur, tableau de bord global, supervision des certificats, rapports et journal d'audit pour
> l'administrateur — et solder les stories reportées depuis le Sprint 2.**

**Verdict : ✅ atteint, extension comprise.**

## 2. Stories livrées

### 2.1 Engagement ferme — 15 / 15, 47 pts

| # | Story | Épop. | Pts | PR | Journal |
|---|---|---|:-:|:-:|:-:|
| 1 | US-AUDIT-01 — Journal d'audit (filtres, lecture seule, export CSV) | E8 | 3 | #68 | 55 |
| 2 | US-DASH-02 — Supervision des certificats | E8 | 3 | #69 | 56 |
| 3 | US-DASH-01 — Tableau de bord global (administrateur) | E8 | 5 | #70 | 57 |
| 4 | US-SUIVI-01 — Suivi pédagogique du formateur | E8 | 5 | #71 | 58 |
| 5 | US-SUIVI-02 — Alertes de décrochage automatiques | E8 | 5 | #72 | 59 |
| 6 | US-SUIVI-03 — Traiter une alerte | E8 | 2 | #73 | 60 |
| 7 | US-RPT-01 — Rapport de session (CSV / PDF, asynchrone) | E8 | 3 | #74 | 61 |
| 8 | US-RPT-02 — Rapports institutionnels | E8 | 3 | #75 | 62 |
| 9 | US-FORM-02 — Clôturer / archiver une formation | E2 | 2 | #76 | 63 |
| 10 | US-INSC-02 — Gérer les inscriptions (dont import CSV) | E2 | 3 | #77 | 64 |
| 11 | US-INSC-03 — Se désinscrire | E2 | 2 | #78 | 65 |
| 12 | US-FORM-04 — Contenu pédagogique géré par le formateur | E2 | 3 | #79 | 66 |
| 13 | US-QCM-02 — Importer des questions depuis sa banque | E3 | 3 | #80 | 67 |
| 14 | US-QCM-11 — Historique des tentatives | E3 | 3 | #81 | 68 |
| 15 | US-ATEL-05 — Remplacer son livrable | E4 | 2 | #82 | 69 |

### 2.2 Extension — 6 / 6, 16 pts

| # | Story | Épop. | Pts | PR | Journal |
|---|---|---|:-:|:-:|:-:|
| 16 | US-IA-05 — Traçabilité des générations IA | E6 | 3 | #83 | 70 |
| 17 | US-CERT-02 — Échecs de génération : alerte et reprise | E5 | 3 | #84 | 71 |
| 18 | US-IA-06 — Couche d'abstraction LLM (adaptateur compatible OpenAI) | E6 | 3 | #85 | 72 |
| 19 | US-CERT-07 — Expiration automatique | E5 | 2 | #86 | 73 |
| 20 | US-CERT-08 — Réémission après révocation pour erreur | E5 | 2 | #87 | 74 |
| 21 | US-IA-07 — Suivi en temps réel (SSE) | E6 | 3 | #88 | 75 |

Hors story : **#89** — en-tête commun, accueil par rôle, catalogue en cartes (journal 76).

## 3. Bilan chiffré

| Indicateur | Valeur | Source |
|---|---|---|
| Stories / points | **21 / 63** | tableaux ci-dessus |
| PR fusionnées | #68 → #89 (22, dont 1 d'interface) | historique Git |
| Migrations | **27 → 35** | passation Sprint 4 (dernière : `1788500000000`) |
| Tests en fin de sprint | **1 372** unitaires (104 suites), **768** e2e (62 suites) | Revue du Sprint 5, colonne « avant » |
| Journaux techniques | `engineering-log/55` → `76` | dépôt |

> **Correction.** La présentation de soutenance du 12/11 et celle du 16/11 indiquaient « Sprint 4 :
> 27 pts · 10 stories » et un total de « 70 stories, 279 points » pour les six sprints. Les bons chiffres
> sont **21 stories, 63 points** pour le Sprint 4 et **81 stories, 315 points** pour les six sprints.

## 4. Ce qui a été construit (en bref)

- **Lire la plateforme** : journal d'audit filtrable et exportable, tableau de bord global, supervision des
  certificats (consultations publiques, fiche, échecs).
- **Suivre les apprenants** : suivi pédagogique par formation, alertes de décrochage sur quatre critères
  factuels (inactivité > 7 j, deux échecs de QCM, livrable en retard de 48 h, note en chute), traitement
  et réouverture tracés.
- **Exporter** : rapports de session et institutionnels en CSV ou PDF, produits par une file BullMQ,
  téléchargeables par le seul demandeur.
- **Fermer les trous du parcours** : clôture / archivage d'une formation, gestion des inscriptions par
  l'administrateur, désinscription (inscription SUSPENDUE, jamais supprimée), contenu géré par le
  formateur, banque de questions, historique des tentatives, remplacement d'un livrable.
- **Fiabiliser l'IA et la certification** : registre des générations IA, adaptateur « compatible
  OpenAI » (modèle local possible), suivi en direct par SSE, échec définitif alerté et reprise
  automatique, expiration et réémission des certificats.

## 5. Rétrospective (reconstituée)

- **Ce qui a marché :** l'ordre « lire avant d'écrire » ; les agrégats des tableaux de bord réutilisés par
  les rapports ; la procédure par story (table D, tests e2e avec concurrence forcée, mutations).
- **Ce qui a coûté :** les e2e qui comparent la liste exacte des champs d'une réponse publique ; les
  services locaux arrêtés après une pause du conteneur ; la pile de démonstration qui consomme les mêmes
  files Redis que les e2e (passation Sprint 4, « Pièges appris »).
- **Non retrouvé :** aucune revue écrite par le porteur pour ce sprint ; aucune mesure de mutants agrégée.

*Cert_EET — Sprint 4 · clôture rédigée le 18/11/2026 · Iyed Omri*
