# Cert_EET — Diagrammes de déploiement, de composants et de packages (v2.0)

> **Version :** 2.0 — 18/11/2026 · remplace les documents maîtres v1.0 de juin 2026
> (`Cert_EET_Diagramme_Deploiement_Description`, `…_Composants_…`, `…_Packages_…`).
> Toutes les sources sont des fichiers PlantUML (`.puml`) rendus en PNG avec PlantUML 1.2025.4 + Graphviz.

## 1. Déploiement

| Vue | Fichier | Ce qu'elle montre | Changement par rapport à la v1.0 |
|---|---|---|---|
| DEP-01 | `deploiement/Cert_EET_DEP01_Deploiement_Reel` | Le serveur réellement en service : pare-feu, nginx, 8 services, volumes et secrets, services externes, modèle de vision côté client | v1.0 = hôte théorique avec worker séparé et API en cluster ; v2.0 = Hetzner CPX32 réel, workers dans l'API, service `ml`, Mailhog local |
| DEP-02 | `deploiement/Cert_EET_DEP02_Environnements_CICD` | Développement, CI (api / web / ml), CD vers GHCR, recette, démonstration | v1.0 = vue en tiers (reprise dans PKG-02) |
| DEP-03 | `deploiement/Cert_EET_DEP03_Zones_Securite` | Zones de confiance et contrôles réellement en place | Ajout du pare-feu, des limites mesurées, des déclencheurs et des liens signés |

## 2. Composants — COMP-01
`composants/Cert_EET_COMP01_Modules_API` : les **20 modules réels** regroupés en cinq familles, le socle
partagé et les adaptateurs. La v1.0 listait 16 modules dont plusieurs n'existent pas sous ce nom
(`UsersModule`, `NotificationsModule`, `LLMAdapterModule`, `QueueAdapterModule`…).

| Contrat / adaptateur réel | Implémentations | Utilisé par |
|---|---|---|
| `FournisseurLlm` | anthropic · compatible-openai · factice · non-configure | assistance-ia (génération, extraction, analyse) |
| `FournisseurEmbeddings` | hachage local (384) | assistance-ia |
| `StockageService` | MinIO (S3) | certificats, ateliers, ressources, assistance-ia, surveillance, rapports |
| `MailService` | SMTP (authentification facultative) | auth, admin, inscriptions, pilotage, certificats… |
| Files BullMQ | certificats · rapports · activations-comptes · ia-indexation · ia-generation · ia-extraction | modules concernés |
| `ClientMlService` | HTTP vers le service `ml` (3 s) | prediction-risque |

## 3. Packages
- **PKG-01** `packages/Cert_EET_PKG01_Arborescence_Depot` : l'arborescence réelle du monorepo
  (`apps/api`, `apps/web`, `ml`, `deploy/hetzner`, `docker/nginx`, `docs`, `engineering-log`, `outils`,
  `.github/workflows`). La v1.0 décrivait un seul `src/` avec 9 modules et un dossier `shared/` (vide en
  réalité).
- **PKG-02** `packages/Cert_EET_PKG02_Couches_Dependances` : les cinq couches et le sens autorisé des
  dépendances.

## 4. Régénérer les images
```bash
java -jar plantuml.jar -tpng -charset UTF-8 10_diagrammes/**/*.puml
```
Les diagrammes de classes se régénèrent depuis le schéma (`classes/`, voir le README du dossier).

*Cert_EET — diagrammes d'architecture v2.0 · 18/11/2026*
