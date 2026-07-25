# Cert_EET — Architecture

Deux documents nommés, simples et conformes aux standards des plateformes web
réelles.

## Architecture logique — 3 couches (3-tiers)

1. **Couche Présentation** — Frontend Next.js
2. **Couche Métier (Application)** — API NestJS (logique, 9 modules)
3. **Couche Données** — PostgreSQL + Redis + MinIO

C'est le modèle 3-tiers classique : chaque couche a une responsabilité unique
et ne communique qu'avec la couche adjacente.

## Architecture physique — déploiement conteneurisé

Client → Reverse proxy (Nginx) → API NestJS → bases (PostgreSQL/Redis/MinIO),
+ Worker (tâches lourdes) + services externes (LLM/SMTP), le tout dans Docker
Compose.

## Contenu

```
Cert_EET_Architecture/
├── Cert_EET_Architecture_Logique.docx    ← document + diagramme
├── Cert_EET_Architecture_Physique.docx   ← document + diagramme
├── Logique/    → .png + .dot du diagramme logique
└── Physique/   → .png + .dot du diagramme physique
```

---
Iyed Omri — PFE ESPRIT 2026
