# Cert_EET — Diagrammes d'activite (AC-01 a AC-04)

Quatre workflows metier de la plateforme Cert_EET, modelises en diagrammes
d'activite UML 2.5. Routage orthogonal strict, couloirs (swimlanes), code
couleur des noeuds, barres de fork/join, qualite livrable.

## Les 4 diagrammes

| #     | Workflow                                   | Couloirs                                          | Sources DS          | CdC            |
|-------|--------------------------------------------|---------------------------------------------------|---------------------|----------------|
| AC-01 | Cycle complet de certification             | Apprenant · Systeme · Formateur                   | DS-02/03/04/08      | F1·F2·F3       |
| AC-02 | Generation PDF asynchrone du certificat    | Thread web · Bull/Redis · Worker · Stockage/Notif | DS-04               | F3 · ADR-04    |
| AC-03 | Correction d'un atelier                    | Apprenant · Systeme · Formateur                   | DS-03 (+ DS-04)     | F2·F3          |
| AC-04 | Generation de questions QCM par IA / RAG   | Formateur · Systeme · Worker IA · LLM externe     | DS-06               | F4 · ADR-04/05 |

## Structure

```
Cert_EET_Diagrammes_Activite/
├── Cert_EET_Diagrammes_Activite_Description.docx   ← document maitre + matrice de coherence
├── README.md
├── AC01_Cycle_Certification/       → .puml + .png + .dot
├── AC02_Generation_PDF_Async/      → .puml + .png + .dot
├── AC03_Correction_Atelier/        → .puml + .png + .dot
└── AC04_Generation_QCM_IA/         → .puml + .png + .dot
```

Chaque sous-dossier contient le meme diagramme sous trois formes : source
PlantUML (`.puml`), source Graphviz (`.dot`), et image (`.png`).

## Code couleur des noeuds

| Couleur | Signification        |
|---------|----------------------|
| Vert    | Action               |
| Bleu    | Asynchrone / worker  |
| Jaune   | Decision (losange)   |
| Rouge   | Erreur / rejet       |

Noeud initial = cercle noir plein · Noeud final = cercle cercle · Barres
noires = synchronisation fork/join.

## Reproduction des images

**Graphviz (rendu de reference)**
```bash
dot -Tpng -Gdpi=160 AC02_Generation_PDF_Async/Cert_EET_AC02_Generation_PDF_Async.dot -o sortie.png
```

**PlantUML** (necessite Java + plantuml.jar ; ou extension VS Code / StarUML)
```bash
java -jar plantuml.jar AC02_Generation_PDF_Async/Cert_EET_AC02_Generation_PDF_Async.puml
```

> Les PNG fournis ont ete rendus via Graphviz (controle precis du routage
> orthogonal). Les `.puml` (avec `skinparam linetype ortho`) sont fournis pour
> integration dans une chaine outillee PlantUML.

---
Iyed Omri — PFE ESPRIT 2026 — Version 1.0 — Juin 2026
