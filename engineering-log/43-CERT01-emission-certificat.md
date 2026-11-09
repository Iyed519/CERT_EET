# US-CERT-01 — Émission asynchrone d'un certificat

## En une phrase
Une demande d'émission (appelée par l'éligibilité, US-ATEL-09) crée UNE ligne
`certificats` par apprenant et formation, ajoute un travail à une file BullMQ
sur le Redis existant et rend la main ; le worker génère le PDF (PDFKit, QR
code vers la vérification publique), calcule son SHA-256, le dépose sur
MinIO, passe le certificat ACTIF (immuable), trace et prévient l'apprenant ;
les échecs sont repris trois fois puis laissés en attente d'une relance par
l'administrateur.

## Découpage
- **A — Dépendances.** `bullmq@6.4.2`, `pdfkit@0.20.2`, `@types/pdfkit@0.17.7`
  (dev), versions exactes publiées depuis plus de deux semaines ; `qrcode`
  déjà présent (MFA). Aucune nouvelle image Docker, aucun nouveau service.
- **B — Données.** Migration `1787000000000-AddCertificats` : `certificats`
  (UNIQUE apprenant × formation, FK RESTRICT, score 0–100, mention en liste
  fermée, empreinte hexadécimale, CHECK « ACTIF ⇒ clé + empreinte + date »),
  déclencheur d'immuabilité (ACTIF : rien ne change, sauf le passage à
  REVOQUE pour US-CERT-06).
- **C — API.** `CertificatsModule` : règles pures (`certificat.regles.ts`),
  `certificat-pdf.ts`, `FileCertificatsService` (file + worker),
  `CertificatsService`, routes administrateur `GET /admin/certificats`,
  `POST /admin/certificats/:id/relancer`. `StockageService.deposerTampon`,
  `MailService.sendCertificatEmisEmail`, configuration `CERTIFICATS_*`.
- **D — Web.** Onglet « Certificats » de l'administration : statut, score,
  mention, empreinte, tentatives, dernière erreur, « Relancer »,
  rafraîchissement automatique pendant une génération.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/admin/certificats?statut=` | admin | 200 · 400 · 401 · 403 |
| POST | `/api/admin/certificats/:id/relancer` | admin | 200 · 400 · 401 · 403 · 404 · 409 |

## Flux
1. `demanderEmission` : `INSERT … ON CONFLICT ON CONSTRAINT
   UQ_certificats_apprenant_formation DO NOTHING RETURNING id` ; seule la
   demande qui crée la ligne trace `CERTIFICAT_DEMANDE` et ajoute le travail
   (identifiant de travail = identifiant du certificat). Hors transaction de
   l'appelant : le worker voit toujours la ligne.
2. Worker (un travail à la fois) : verrou de la ligne ; seul
   EN_ATTENTE_GENERATION passe à EN_GENERATION (sinon rien : idempotent).
3. PDF en mémoire -> SHA-256 -> `certificats/{id}.pdf` -> ACTIF (clé,
   empreinte, date de génération à l'heure de PostgreSQL) -> audit
   `CERTIFICAT_EMIS` -> email (au mieux).
4. Erreur : objet retiré s'il a été déposé, ligne remise en attente avec la
   dernière erreur, erreur relancée -> BullMQ réessaie (délai exponentiel).
   Après la dernière tentative : `CERTIFICAT_ECHEC`. L'administrateur relance
   (`CERTIFICAT_RELANCE`) un certificat en attente ou bloqué en génération.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Bull (ADR-04) | BullMQ, successeur maintenu de Bull, même principe (Redis). |
| D2 | Worker | Dans le processus de l'api (un travail à la fois), coupable par `CERTIFICATS_WORKER=off` : pas de nouveau service compose ni d'image ; l'HTTP n'attend jamais le PDF (ADR-04 respecté). Un processus séparé reste possible. |
| D3 | Empreinte | Calculée sur le PDF FINAL et stockée dans `certificats` (pas de table `empreintes_sha256`) ; le PDF ne peut pas contenir sa propre empreinte : il porte l'identifiant et le QR, la page publique (US-CERT-04) publiera l'empreinte. **Écart à reporter dans DS-04.** |
| D4 | Identifiant public | UUID v4 du certificat (122 bits aléatoires) dans le QR et l'URL `/verifier/{id}` : aucune donnée personnelle. |
| D5 | Échec définitif | Ligne laissée EN_ATTENTE_GENERATION (DS-04 « reset pour réessai manuel ») + relance administrateur ; alerte = audit + liste (pas de table `notifications`). |
| D6 | Mentions | Très bien ≥ 80, Bien ≥ 70, Assez bien ≥ 60, Passable sinon. |
| D7 | Stockage | Même bucket que les livrables, préfixe `certificats/`. |
| D8 | Immuabilité | Déclencheur en base ; seule la transition ACTIF -> REVOQUE est permise (US-CERT-06). |

## Fichiers
- `apps/api/package.json`, `package-lock.json`, `.env.example`
- `apps/api/src/database/migrations/1787000000000-AddCertificats.ts`, `entities/certificat.entity.ts`, `enums/statut-certificat.enum.ts`
- `apps/api/src/modules/certificats/*` (+ specs), `app.module.ts`, `config/*`, `stockage/stockage.service.ts`, `mail/mail.service.ts` (+ specs)
- `apps/api/test/certificats.e2e-spec.ts` (marqueur `E2E-CERT01`)
- `apps/web/src/app/admin/certificats/page.tsx`, `app/admin/layout.tsx`, `lib/api.ts`, `lib/format.ts`, `globals.css`

## Incidents
- Une passe de mutation interrompue (processus tué) a laissé un mutant en
  place : fichier restauré depuis sa sauvegarde et vérifié avant de
  continuer.
- Le puits SMTP local s'était arrêté ; l'email est couvert par le test
  unitaire et l'espion de l'e2e.

## Vérification
- API : lint 0, `tsc`, unitaires **53 suites / 765 tests**, migration revert
  + run, e2e **30 suites / 431 tests** (en série ; vrais Redis, PostgreSQL et
  S3 local ; MinIO en CI).
- PDF ouvert et regardé (rendu PNG) : texte accentué, QR, identifiant.
- Mutations tuées : ON CONFLICT, remise en attente après échec, signalement
  de l'échec définitif, état vérifié à la relance, déclencheur
  d'immuabilité ; en unitaire : idempotence du worker, verrou, retrait de
  l'objet. Mutant équivalent écarté : identifiant de travail (doublé par ON
  CONFLICT).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : liste, relance ->
  « Émis » avec empreinte, refus 409 affiché ; pas de défilement horizontal.

## CI
Voir la PR : CI verte exigée sur la PR puis sur `main` (les deux images
reconstruites avec les nouvelles dépendances).

## Suites
- US-ATEL-09 : éligibilité (QCM + ateliers ≥ seuil) -> `demanderEmission`.
- US-CERT-03 : « Mes certificats » et téléchargement.
