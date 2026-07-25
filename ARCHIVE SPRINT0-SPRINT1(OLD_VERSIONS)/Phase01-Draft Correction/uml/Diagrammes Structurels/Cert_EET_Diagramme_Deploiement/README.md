# Cert_EET — Diagramme de deploiement

Infrastructure physique de la plateforme Cert_EET, sous trois vues
complementaires. Routage orthogonal strict, noeuds stereotypes UML 2.5,
chemins de communication etiquetes par protocole, qualite livrable.

## Les 3 vues

| #      | Vue                                  | Ce qu'elle montre                                              |
|--------|--------------------------------------|---------------------------------------------------------------|
| DEP-01 | Architecture de deploiement globale  | Infrastructure physique reelle (vue de reference jury)        |
| DEP-02 | Vue logique en tiers                 | Lecture conceptuelle en 5 couches                             |
| DEP-03 | Zoom securite & flux de donnees      | Zones de confiance, chiffrement, auth, audit (NF2/NF3/F7)     |

## Structure

```
Cert_EET_Diagramme_Deploiement/
├── Cert_EET_Diagramme_Deploiement_Description.docx   ← doc maitre + matrices de tracabilite
├── README.md
├── DEP01_Architecture_Globale/      → .puml + .png + .dot
├── DEP02_Vue_Logique_Tiers/         → .puml + .png + .dot
└── DEP03_Securite_FluxDonnees/      → .puml + .png + .dot
```

## Code couleur des noeuds

| Couleur | Signification                  |
|---------|--------------------------------|
| Vert    | Couche donnees persistante     |
| Bleu    | Execution / worker asynchrone  |
| Orange  | Service externe                |
| Rouge   | Point sensible securite (TLS)  |
| Gris    | Client / poste utilisateur     |

Stereotypes : `«device»` · `«execution environment»` · `«container»` ·
`«external»` · `«artifact»` · `«trust boundary»`.

## Topologie (DEP-01)

- **Clients** : navigateur (SPA), smartphone (scan QR de verification)
- **Hote Docker Compose** (ADR-07, auto-hebergeable — NF4) :
  - Reverse Proxy Nginx (terminaison TLS)
  - Frontend Next.js (SSR/SSG)
  - API NestJS en cluster (REST + SSE, RBAC — NF5)
  - Worker Bull (PDF/SHA-256/QR, indexation RAG, emails)
  - PostgreSQL + pgvector + pgcrypto
  - Redis (cache, blacklist JWT, file Bull AOF)
  - MinIO (S3 : PDF certificats + livrables)
- **Services externes** : API LLM swappable (GPT-4o/Claude/Mistral), SMTP, MFA/TOTP

Protocoles : HTTPS/TLS 1.3 cote client, SSE pour les notifications temps reel
(WebSocket en evolution future — ADR-03), PostgreSQL/Redis chiffres, S3 API.

## Reproduction des images

**Graphviz (rendu de reference)**
```bash
dot -Tpng -Gdpi=160 DEP01_Architecture_Globale/Cert_EET_DEP01_Architecture_Globale.dot -o sortie.png
```

**PlantUML** (Java + plantuml.jar, ou extension VS Code / StarUML)
```bash
java -jar plantuml.jar DEP01_Architecture_Globale/Cert_EET_DEP01_Architecture_Globale.puml
```

> Les PNG fournis sont rendus via Graphviz (controle precis du routage
> orthogonal). Les `.puml` (syntaxe deploiement, `skinparam linetype ortho`)
> sont fournis pour integration dans une chaine outillee PlantUML.

---
Iyed Omri — PFE ESPRIT 2026 — Version 1.0 — Juin 2026
