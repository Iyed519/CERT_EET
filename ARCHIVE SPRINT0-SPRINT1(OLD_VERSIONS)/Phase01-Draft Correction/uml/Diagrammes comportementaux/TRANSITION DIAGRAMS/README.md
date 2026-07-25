# Cert_EET — Diagrammes d'etats-transitions (UML 2.5)

**Auteur :** Iyed Omri — PFE ESPRIT 2026
**Stack :** NestJS · Next.js · PostgreSQL/TypeORM · Redis · Bull

## Contenu du livrable

```
Cert_EET_Diagrammes_Etats_Transitions/
├── Cert_EET_Diagrammes_Etats_Transitions_Description.docx   ← document maitre (les 5 diagrammes)
├── README.md
├── 01_Certificat/
│   ├── Cert_EET_ET_Certificat.puml      (source PlantUML)
│   ├── Cert_EET_ET_Certificat.png       (image rendue)
│   └── Cert_EET_ET_Certificat.dot       (source Graphviz)
├── 02_TentativeQCM/
├── 03_Livrable/
├── 04_CompteUtilisateur/
└── 05_SuggestionQuestionIA/
```

Chaque sous-dossier contient le **code source** (PlantUML + Graphviz) et l'**image** du diagramme.

## Les 5 cycles de vie

| # | Objet | Enumeration | Etats |
|---|-------|-------------|-------|
| ET-01 | Certificat | `StatutCertificat` | EN_ATTENTE_GENERATION · EN_GENERATION · ACTIF · REVOQUE · EXPIRE |
| ET-02 | TentativeQCM | `StatutTentative` | EN_COURS · SOUMISE · ABANDONNEE_TIMER · NOTEE |
| ET-03 | Livrable | `StatutLivrable` | BROUILLON · SOUMIS · EN_CORRECTION · NOTE |
| ET-04 | CompteUtilisateur | `StatutCompte` | EN_ATTENTE_ACTIVATION · ACTIF · DESACTIVE · ANONYMISE |
| ET-05 | SuggestionQuestionIA | `StatutSuggestion` | PROPOSEE · ACCEPTEE · MODIFIEE · REJETEE |

## Rendu des images

Les PNG sont fournis. Pour re-generer depuis la source :

**Via PlantUML** (necessite Java + plantuml.jar)
```bash
java -jar plantuml.jar 01_Certificat/Cert_EET_ET_Certificat.puml
```

**Via Graphviz**
```bash
dot -Tpng -Gdpi=160 01_Certificat/Cert_EET_ET_Certificat.dot -o sortie.png
```

> Note : les deux sources decrivent le meme diagramme. Le PlantUML est fourni pour
> l'integration dans une chaine outillee PlantUML (StarUML, extension VS Code) ;
> le PNG fourni a ete rendu via Graphviz pour un controle precis de la mise en page.
