# Cert_EET — Diagramme de packages

Organisation du code source NestJS de la plateforme Cert_EET, sous deux vues
complementaires. Routage orthogonal strict, packages en notation UML onglet,
qualite livrable.

## Les 2 vues

| #      | Vue                              | Ce qu'elle montre                                          |
|--------|----------------------------------|------------------------------------------------------------|
| PKG-01 | Carte des dossiers (src/)        | Arborescence reelle du depot (documentation)               |
| PKG-02 | Vue en couches & regles dep.     | 4 couches + direction autorisee des dependances            |

## Structure

```
Cert_EET_Diagramme_Packages/
├── Cert_EET_Diagramme_Packages_Description.docx   ← doc maitre + matrice + regles
├── README.md
├── PKG01_Carte_Dossiers/   → .puml + .png + .dot
└── PKG02_Vue_Couches/      → .puml + .png + .dot
```

## Arborescence src/ (PKG-01)

```
src/
├── modules/        → auth, users, formations, qcm, ateliers,
│                     certificats, assistance-ia, notifications, audit
│                     (chaque module : module.ts, controller, service,
│                      dto/, guards/, strategies/)
├── shared/         → dto/, entities/, interfaces/, enums/
├── common/         → filters/, interceptors/, pipes/, decorators/
├── config/         → configuration.ts
└── main.ts         (bootstrap — AppModule)
```

## Les 4 couches et leurs regles (PKG-02)

```
1 · Application      main.ts (assemble les modules)
        ↓ importe
2 · Modules metier   auth, users, ... (independants entre eux)
        ↓ importe
3 · Transverse       shared + common
        ↓ importe
4 · Configuration    config (socle, ne depend de rien)
```

**Regles de dependance (descendantes uniquement) :**
1. `main.ts` importe les modules ; aucun module n'importe `main.ts`.
2. Les modules metier importent `shared`/`common`, JAMAIS l'inverse
   (evite le couplage circulaire).
3. Tout depend de `config` ; `config` ne depend de rien.
4. Les modules metier sont independants entre eux : leurs interactions
   passent par les interfaces (cf. COMP-01), pas par des imports croises.

> PKG-02 illustre une dependance interdite (fleche rouge barree :
> `shared → module`) pour rendre la regle 2 visuellement incontestable.

## Code couleur

| Couleur | Signification          |
|---------|------------------------|
| Vert    | Module metier          |
| Bleu    | Configuration          |
| Gris    | Transverse (shared/common) |
| Jaune   | Application (main.ts)  |
| Rouge   | Regle violee (contre-exemple) |

## Reproduction des images

**Graphviz (rendu de reference)**
```bash
dot -Tpng -Gdpi=160 PKG02_Vue_Couches/Cert_EET_PKG02_Vue_Couches.dot -o sortie.png
```

**PlantUML** (Java + plantuml.jar, ou extension VS Code / StarUML)
```bash
java -jar plantuml.jar PKG02_Vue_Couches/Cert_EET_PKG02_Vue_Couches.puml
```

> Les PNG fournis sont rendus via Graphviz. Les `.puml` utilisent la syntaxe
> package native PlantUML ; topologie identique, mise en page differente.

---
Iyed Omri — PFE ESPRIT 2026 — Version 1.0 — Juin 2026
