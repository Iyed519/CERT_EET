# Documents du projet Cert_EET — versions

Ce dossier rassemble les documents de gestion du projet (backlog, sprints, diagrammes de séquence),
versionnés par date. **Rien n'est supprimé** : chaque nouvelle version est un nouveau dossier, et les
versions remplacées sont conservées dans un dossier `…_old_…`.

| Dossier | Contenu | Date |
|---|---|---|
| `v2_2026-11-07/` | **Version courante** : jeu complet, à jour de la clôture du Sprint 2 | 07/11/2026 |
| `v1_old_2026-11-07/` | Versions **remplacées** le 07/11/2026 (conservées telles quelles) | 07/11/2026 |

---

## `v2_2026-11-07/` — version courante (clôture du Sprint 2)

| Fichier | Version | Statut au 07/11/2026 |
|---|---|---|
| `1_backlog/Cert_EET_Backlog_Produit.md` | **v1.7** | **Modifié** : révisions v1.4 / v1.5 / v1.6 reportées (US-FORM-04, US-FORM-05, US-FORM-06, US-QCM-12), clôture du Sprint 2 (statuts, PR), US-QCM-09 amendée, totaux 80 stories / 287 pts |
| `2_sprint1/Sprint1_Backlog.md`, `Sprint1_Review.md` | Sprint 1 clôturé | Inchangés (copies de `docs/`) |
| `3_sprint2/Cert_EET_Sprint2_Plan.md` | **v1.1** | **Modifié** : total engagé corrigé (46 pts), extension 18 pts, référence ADR-04 |
| `3_sprint2/Sprint2_Backlog.md` | clôture | **Nouveau** : Sprint Backlog de clôture (copie de `docs/`) |
| `3_sprint2/Sprint2_Review.md` | — | **Nouveau** : revue et rétrospective, version détaillée (copie de `docs/`) |
| `3_sprint2/Cert_EET_Sprint2_Review_court.md` | — | **Nouveau** : revue, version courte |
| `4_diagrammes_sequence/Cert_EET_DS02_Passer_QCM.puml` | **v1.1** | **Modifié** : aligné sur l'implémentation (US-QCM-05 à 09) |
| `4_diagrammes_sequence/Cert_EET_DS09_Acces_Module_Evaluation.puml` | **v1.1** | **Modifié** : « Mon espace » sans écriture, avancement recalculé à la notation |
| `4_diagrammes_sequence/Cert_EET_DS12_Creer_QCM.puml` | **v1.1** | **Modifié** : routes réelles, garde par ressource, statuts, refus 409 |
| `4_diagrammes_sequence/` — DS-01, DS-03 à DS-08, DS-10, DS-11, DS-13 à DS-16 | v1.0 | Inchangés (originaux du 19/06/2026) |
| `5_handoff/Cert_EET_Handoff_US-QCM-09.md` | — | Inchangé : document de passation de la story US-QCM-09 |
| `CHANGELOG.md` | Sprint 2 | **Modifié** : section Sprint 2 (copie de la racine du dépôt) |

## `v1_old_2026-11-07/` — versions remplacées le 07/11/2026

| Fichier | Remplacé par |
|---|---|
| `Cert_EET_Backlog_Produit_v1.3.md` | `v2_2026-11-07/1_backlog/Cert_EET_Backlog_Produit.md` (v1.7) |
| `Cert_EET_Sprint2_Plan_v1.0.md` | `v2_2026-11-07/3_sprint2/Cert_EET_Sprint2_Plan.md` (v1.1) |
| `Cert_EET_Sprint2_Backlog_planifie_2026-10-04.md` | `v2_2026-11-07/3_sprint2/Sprint2_Backlog.md` (clôture) |
| `Cert_EET_Sprint2_Backlog_brouillon_2026-10-03.md` | idem (brouillon antérieur) |
| `diagrammes_sequence_v1.0/` (DS-02, DS-09, DS-12) | `v2_2026-11-07/4_diagrammes_sequence/` (v1.1) |
| `CHANGELOG_fin_sprint1.md` | `v2_2026-11-07/CHANGELOG.md` |

## Documents restés hors de ce dossier

- **Révisions v1.4, v1.5, v1.6** du Backlog Produit et **Plan du Sprint 1** : dans le projet Claude
  (« cert_eet ») ; le contenu des révisions est intégralement reporté dans le Backlog Produit v1.7.
- **Documents fondateurs** (cahier des charges, ADR, cas d'utilisation, diagrammes de classes,
  architecture) : inchangés, dans `Documents/Cert_EET_Projet` et dans le projet Claude.
- **Journaux techniques** : `engineering-log/` à la racine du dépôt.

## Règle pour les prochaines versions

À la prochaine modification : créer `v3_AAAA-MM-JJ/` (jeu complet à jour) et `v2_old_AAAA-MM-JJ/`
(fichiers remplacés), sans rien supprimer, et mettre à jour ce README.

*Cert_EET · PFE ESPRIT 2026 · Iyed Omri.*
