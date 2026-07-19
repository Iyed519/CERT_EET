# Cert_EET — Documentation du projet

> **Projet :** Cert_EET — Plateforme de Certification et de Micro-Certification Digitale
> **Cadre :** PFE Ingénierie Logicielle — ESPRIT · Iyed Omri · Commanditaire : ESPRIT Entreprise
> **État :** Sprint 1 en cours de clôture (9/11 stories terminées) — documentation consolidée en juillet 2026.

Ce dossier regroupe l'ensemble des documents de pilotage, d'exigences, de décision et de conception du
projet, organisés par nature. Les documents marqués **[à jour — juil. 2026]** intègrent les décisions
prises pendant le Sprint 1 ; le détail des changements est consigné dans `CHANGELOG.md`.

---

## Organisation du dossier

| Dossier | Contenu | Rôle |
|---|---|---|
| `01-Cadrage/` | Cahier des Charges v4 (.docx + .md) · Étude de l'existant v2 (.docx + .md) · Benchmark Phase 1 (.docx + .md) · Standards e-learning · Gantt (.html) | Le **pourquoi** du projet : besoin, marché, planning. |
| `02-Exigences/` | **Backlog Produit v1.1** (.docx + .md) [à jour — juil. 2026] · `archive/` (v1.0 d'origine) | Le **quoi** : épopées, user stories, critères Gherkin, traçabilité F/NF. |
| `03-Decisions-ADR/` | **ADR v2.2** (.docx + .md) [à jour — juil. 2026] · `archive/` (v2.1 d'origine) | Le **comment technique** : 11 décisions d'architecture argumentées (dont ADR-08-R1 et ADR-11). |
| `04-Conception/` | Diagrammes et dossiers de conception | La **structure** du système. |
| — `04a-Architecture/` | Architecture logique & physique, composants, déploiement, packages | Vues d'ensemble. |
| — `04b-Modele-de-donnees/` | **Diagramme de classes (.puml + descriptions)** [à jour — juil. 2026] | Modèle du domaine. |
| — `04c-Cas-d-utilisation/` | Diagrammes UC (.puml) + descriptions par acteur | Périmètre fonctionnel par rôle. |
| — `04d-Sequences/` | **Scénarios DS-01 → DS-16** [DS-01 à jour — juil. 2026] + sources .puml | Dynamique des parcours critiques. |
| — `04e-Dynamique/` | Diagrammes d'activité et d'états-transitions | Cycles de vie (comptes, certificats…). |
| `05-Sprints/Sprint-1/` | **Plan de Sprint 1** + **Sprint Backlog** [à jour — juil. 2026] | Le **quand** : engagement, tâches, statuts réels. |
| `06-Notes-Techniques/` | Notes auth/sécurité, Redis & Bull, synchrone/asynchrone · **Glossaire** [à jour — juil. 2026] | Vulgarisation et référence des choix techniques. |

## Ordre de lecture conseillé (jury / relecteur)

1. `01-Cadrage/Cert_EET_CahierDesCharges_v4.md` — le besoin et les exigences F/NF.
2. `03-Decisions-ADR/Cert_EET_ADR_v2_2.md` — les 11 décisions d'architecture (la révision ADR-08-R1 et
   l'ADR-11 montrent l'évolution du projet en cours de réalisation).
3. `02-Exigences/Cert_EET_Backlog_Produit.md` — les stories et leur traçabilité.
4. `04-Conception/` — le modèle (classes, séquences, UC).
5. `05-Sprints/Sprint-1/` — l'exécution réelle du Sprint 1.

## Convention de formats

Chaque document est conservé **dans son format d'origine**. Lorsqu'un document existe en deux formats
(.docx Word et .md Markdown), **les deux versions sont maintenues et portent exactement les mêmes mises
à jour** ; le .docx est la version de présentation (jury), le .md la version de travail. Les versions
antérieures aux mises à jour de juillet 2026 sont conservées telles quelles dans les sous-dossiers
`archive/`. Après ouverture d'un .docx mis à jour dans Word, rafraîchir la table des matières
(Ctrl+A puis F9) pour y faire apparaître les nouvelles sections.

## Compléments hors de ce dossier

- **Code source & journaux d'ingénierie** : dépôt Git `CERT_EET` (monorepo `apps/api` + `apps/web`) ;
  chaque story livrée y possède une note détaillée dans `engineering-log/` (décisions, pièges, vérifications).
- **Rendus PNG des diagrammes** : à régénérer depuis les sources `.puml` après toute modification
  (voir `CHANGELOG.md`, section « Reste à faire »).

---

*Cert_EET · Dossier documentaire consolidé · juillet 2026 · Iyed Omri, PFE ESPRIT.*
