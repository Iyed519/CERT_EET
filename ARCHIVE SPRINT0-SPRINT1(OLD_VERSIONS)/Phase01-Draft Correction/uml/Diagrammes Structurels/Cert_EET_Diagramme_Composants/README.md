# Cert_EET — Diagramme de composants

Architecture modulaire NestJS de la plateforme Cert_EET : 16 modules + 3
services externes, avec leurs interfaces fournies/requises. Routage orthogonal
strict, composants stereotypes UML 2.5, qualite livrable.

## La vue

| #       | Diagramme                        | Ce qu'il montre                                              |
|---------|----------------------------------|-------------------------------------------------------------|
| COMP-01 | Architecture des modules NestJS  | Modules, interfaces fournies/requises, adaptateurs swappables |

## Structure

```
Cert_EET_Diagramme_Composants/
├── Cert_EET_Diagramme_Composants_Description.docx   ← doc maitre + matrices
├── README.md
└── COMP01_Architecture_Modules/   → .puml + .png + .dot
```

## Code couleur des composants

| Couleur | Signification              |
|---------|----------------------------|
| Vert    | Module metier (F1-F7)      |
| Rouge   | Securite (AuthModule)      |
| Bleu    | Adaptateur d'infrastructure|
| Gris    | Module transverse          |
| Orange  | Service externe            |

Notation : composant `«module»` · interface fournie = lollipop (cercle plein) ·
interface requise = dependance pointillee.

## Les composants

**Modules metier (F1-F7)** : AuthModule, UsersModule, FormationsModule,
QCMModule, AteliersModule, CertificatsModule, AssistanceIAModule,
NotificationsModule, AuditModule.

**Adaptateurs d'infrastructure (ports swappables)** : LLMAdapterModule
(ILLMProvider), StorageAdapterModule (IStorageProvider), EmailAdapterModule
(IEmailProvider), QueueAdapterModule (IQueueProvider).

**Modules transverses** : ConfigModule, DatabaseModule, LoggerModule.

**Services externes** : API LLM (GPT-4o/Claude/Mistral), SMTP, MFA/TOTP.

## Interfaces cles

| Interface fournie         | Fournie par           | Requise par                                  |
|---------------------------|-----------------------|----------------------------------------------|
| ILLMProvider              | LLMAdapterModule      | AssistanceIAModule                           |
| IStorageProvider          | StorageAdapterModule  | Certificats, Ateliers, AssistanceIA          |
| IQueueProvider            | QueueAdapterModule    | Certificats, AssistanceIA, QCM               |
| IEmailProvider            | EmailAdapterModule    | Notifications                                |
| JwtAuthGuard + RolesGuard | AuthModule            | TOUS les modules metier                      |
| SSE channel               | NotificationsModule   | AssistanceIA, Ateliers                       |
| AuditInterceptor          | AuditModule           | Actions critiques                            |

> Le principe d'inversion de dependance : les modules metier dependent des
> interfaces (abstractions), jamais des implementations concretes. Changer de
> fournisseur LLM, de stockage ou de file ne touche aucun module metier.

## Reproduction des images

**Graphviz (rendu de reference)**
```bash
dot -Tpng -Gdpi=160 COMP01_Architecture_Modules/Cert_EET_COMP01_Architecture_Modules.dot -o sortie.png
```

**PlantUML** (Java + plantuml.jar, ou extension VS Code / StarUML)
```bash
java -jar plantuml.jar COMP01_Architecture_Modules/Cert_EET_COMP01_Architecture_Modules.puml
```

> Les PNG fournis sont rendus via Graphviz. La source `.puml` utilise la syntaxe
> composants native PlantUML (component / interface / lollipop, componentStyle
> uml2) ; la topologie sera identique, la mise en page differente.

---
Iyed Omri — PFE ESPRIT 2026 — Version 1.0 — Juin 2026
