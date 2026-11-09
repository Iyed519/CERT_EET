# US-IA-01 — Déposer et indexer un support pédagogique

## En une phrase
Un formateur affecté (ou un administrateur) dépose un support de cours (PDF,
PPTX, DOCX, TXT ou MD, 20 Mo au plus) dans un module ; l'API répond tout de
suite (202, EN_INDEXATION) et un worker BullMQ extrait le texte, le découpe
en passages d'environ 512 tokens avec chevauchement, les vectorise et les
range dans pgvector, puis passe le support à INDEXE et prévient le déposant
par email — ou à ECHEC_INDEXATION avec un motif clair, relançable.

## Découpage
- **Base.** Migration `1787200000000-AddSupportsPedagogiques` : extension
  `vector` ; type `supports_pedagogiques_statut_enum` (EN_INDEXATION, INDEXE,
  ECHEC_INDEXATION) ; table `supports_pedagogiques` (FK module et déposant
  RESTRICT, UNIQUE module × SHA-256, clé de stockage unique, CHECK sur
  l'extension, la taille, le titre, l'empreinte, les compteurs, et
  « INDEXE ⇔ passages + caractères + modèle + date ») ; table
  `segments_support` (ordre, texte, `embedding vector(384)`, UNIQUE support ×
  ordre, CASCADE) avec un index HNSW en distance cosinus.
- **API.** Module `assistance-ia` : `SupportsController`, `SupportsService`,
  `FileIaService` (file `ia-indexation`, worker dans le processus de l'api),
  règles pures (`support.regles.ts`, `decoupage.regles.ts`), extraction
  (`extraction/` : lecteur ZIP borné pour PPTX/DOCX, PDF dans un processus
  enfant, TXT/MD UTF-8 ou Windows-1252), embeddings derrière l'interface
  `FournisseurEmbeddings` (`embeddings/`). Garde `@FormateurDeLaFormation`
  étendu aux supports (`{ supportId }`). `MailService.sendSupportIndexationEmail`.
  Variables `IA_WORKER`, `IA_TENTATIVES`, `IA_BACKOFF_MS`,
  `EMBEDDINGS_FOURNISSEUR`. Dépendance `pdf-parse@2.4.5` (exacte).
- **Web.** Page « Ma formation » : sous chaque module, bloc « Supports pour
  l'IA » (`components/SupportsModule.tsx`) — liste avec l'état, taille,
  nombre de passages, motif d'échec ; dépôt dans une modale ; « Relancer »
  pour un échec ; « Supprimer » avec confirmation ; rafraîchissement
  automatique toutes les 3 s tant qu'une indexation est en cours.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/modules/:moduleId/supports` (multipart `fichier`, `titre?`) | FORMATEUR affecté, ADMINISTRATEUR | 202 support EN_INDEXATION ; 400 fichier ; 403 ; 404 module ; 409 doublon ou formation archivée ; 503 stockage |
| GET | `/api/modules/:moduleId/supports` | idem | 200 liste (plus récents d'abord) ; 403 ; 404 |
| GET | `/api/supports/:supportId` | idem | 200 fiche + aperçu des 3 premiers passages ; 403 ; 404 |
| POST | `/api/supports/:supportId/reindexer` | idem | 202 ; 403 ; 404 ; 409 pas en échec / formation archivée |
| DELETE | `/api/supports/:supportId` | idem | 204 ; 403 ; 404 ; 409 formation archivée ou support utilisé par une génération |

## Flux
1. **Dépôt** : module (404) et formation non archivée (409) ; fichier contrôlé
   (extension, taille, signature `%PDF-` / `PK`, pas d'octet nul dans un
   texte) -> 400, rien n'est enregistré ; SHA-256 en flux ; doublon dans le
   module -> 409 ; envoi sur MinIO (`supports/<module>/<support>/original.<ext>`,
   503 si injoignable) ; INSERT EN_INDEXATION (si l'INSERT échoue, l'objet
   est retiré ; perdant d'une course sur l'UNIQUE -> 409) ; audit
   `SUPPORT_DEPOSE` ; travail en file ; 202.
2. **Worker** : sous verrou, le support doit être EN_INDEXATION (sinon rien) ;
   tentative comptée ; lecture de l'objet (taille bornée), extraction,
   normalisation (césures, espaces), contrôle « texte exploitable » (50
   caractères utiles), découpage, vectorisation ; puis une transaction sous
   verrou : segments remplacés par lots de 100, statut INDEXE avec le
   nombre de passages, de caractères, le modèle et l'heure de PostgreSQL.
   Audit `SUPPORT_INDEXE`, email (au mieux).
3. **Échecs** : contenu illisible (`ErreurExtraction` -> `UnrecoverableError`)
   = échec immédiat, sans reprise, motif d'origine en français ; panne
   passagère = reprise BullMQ (exponentielle) ; dernier échec ->
   ECHEC_INDEXATION, audit `SUPPORT_ECHEC_INDEXATION`, email. Une panne ne
   montre jamais de détail technique au formateur (motif générique, détail
   dans l'audit).
4. **Relance** (sous verrou, ECHEC seulement) et **suppression** (sous
   verrou, ligne + segments, puis objet ; permise pendant l'indexation : le
   worker reprend le verrou avant d'écrire et ne trouve plus rien).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Routes | Sous le module (`/modules/:moduleId/supports`), comme les ateliers — DS-06 : `/formations/:id/supports` avec `moduleId` dans le corps. |
| D2 | Embeddings | Interface `FournisseurEmbeddings` + fabrique (`EMBEDDINGS_FOURNISSEUR`). Le modèle neuronal recommandé (multilingual-e5-small via transformers.js) **n'a pas pu être vérifié** : dépôt de modèles injoignable depuis l'espace de travail et moteur ONNX natif non pris en charge par l'image `node:20-alpine` (musl). Repli prévu par le handoff : fournisseur **`hachage`** (embeddings lexicaux par hachage de caractéristiques, 384 dimensions, calcul local, déterministe, sans clé ni réseau). Le modèle est enregistré sur chaque support (`modele_embeddings`) : changer de fournisseur = réindexer, jamais de mélange. La dimension 384 est celle d'e5-small : le schéma ne changera pas. |
| D3 | Formats | PDF (pdf-parse 2 / pdf.js), TXT, MD, **et PPTX / DOCX** grâce à un lecteur ZIP interne, sans dépendance, borné (entrées, décompression par entrée et totale, ZIP64 et chiffrement refusés). |
| D4 | PDF | Extraction dans un **processus Node enfant** éphémère (60 s, 256 Mo de tas) : un PDF hostile ne bloque pas l'api ; et pdf.js charge son worker par un import ES dynamique que Jest ne sait pas faire. |
| D5 | Statuts | EN_INDEXATION / INDEXE / **ECHEC_INDEXATION** (ajouté : le Backlog veut un échec propre, « jamais Indexé », et le formateur informé) + relance et suppression. |
| D6 | Découpage | En caractères : 2 000 (≈ 512 tokens) avec 200 de chevauchement (≈ 50 tokens) ; coupe entre paragraphes, sinon en fin de phrase, sinon sur une espace. 2 000 passages au plus par support. |
| D7 | Doublon | Un même fichier (SHA-256) une seule fois par module : 409 (contrôle + UNIQUE en base). |
| D8 | Notification | Email au déposant (succès ou échec) ; pas de table de notifications ; l'écran se met à jour par interrogation périodique (SSE = US-IA-07, hors périmètre). |
| D9 | Stockage | Même bucket que les livrables et les certificats, préfixe `supports/` ; jamais le nom d'origine dans la clé ; la clé n'est jamais renvoyée. |
| D10 | File | BullMQ `ia-indexation`, worker dans le processus de l'api (`IA_WORKER`), un travail à la fois, 3 tentatives par défaut ; identifiant de travail = support (+ `-rN` pour une relance) ; file injoignable au dépôt -> ECHEC_INDEXATION relançable. |

## Fichiers
- `apps/api/src/database/migrations/1787200000000-AddSupportsPedagogiques.ts`, `database/entities/support-pedagogique.entity.ts`, `database/enums/statut-support.enum.ts`
- `apps/api/src/modules/assistance-ia/` : `assistance-ia.module.ts`, `file-ia.service.ts`, `supports/{supports.controller,supports.service,support.regles,decoupage.regles,depot-support}.ts`, `embeddings/{fournisseur-embeddings,embeddings-hachage,embeddings.provider}.ts`, `extraction/{erreur-extraction,extraction-texte,extraction-pdf,lecteur-zip}.ts` (+ specs)
- `apps/api/src/modules/formations/autorisation/*` (ressource `support`), `formations.module.ts`, `app.module.ts`, `config/{configuration,env.validation}.ts`, `mail/mail.service.ts` (+ spec)
- `apps/api/test/supports.e2e-spec.ts` (marqueur `E2E-IASUPPORT`), `test/outils/fichiers-office.ts`
- `apps/web/src/components/SupportsModule.tsx`, `app/formateur/formations/[id]/page.tsx`, `lib/{api,format}.ts`, `app/globals.css`
- `.env.example`, `apps/api/package.json` / `package-lock.json`

## Incidents
- pdf-parse sous Jest : « dynamic import callback invoked without
  --experimental-vm-modules ». Résolu par le processus enfant (D4), qui
  apporte aussi l'isolement.
- Le dépôt de modèles Hugging Face est injoignable depuis l'espace de
  travail : le modèle neuronal n'a pas pu être vérifié (D2).
- Prettier a reformaté des lignes de `mail.service.ts` qui ne sont pas les
  miennes : restaurées, seule la nouvelle méthode reste.
- La modale de dépôt est rendue dans le bloc des supports : la règle CSS de
  retrait de l'alerte s'y appliquait ; limitée à l'enfant direct.
- **Défaut trouvé par les mutations** : le poids amorti `1 + ln(tf)` devient
  négatif pour les poids fractionnaires des trigrammes (0,25 -> -0,39) et
  inversait le signe du hachage. Remplacé par `ln(1 + tf)`, toujours positif,
  et épinglé par un test de valeur de référence.

## Vérification
- API : lint 0, `tsc`, unitaires **65 suites / 906 tests**, migration
  run + revert + run (extension, types, tables et index retirés puis remis),
  e2e **36 suites / 487 tests** (en série), dont la nouvelle suite
  `E2E-IASUPPORT` (18 tests : TXT, PDF, PPTX, DOCX indexés ; refus 400 / 403 /
  404 / 409 ; échecs d'indexation et relances ; panne passagère et pannes
  répétées ; suppression ; garanties en base ; deux tests de concurrence
  forcée).
- Mutations tuées (21) : en unitaire, relance hors échec, signature,
  octet nul, contrôle de statut avant et après l'extraction, conversion en
  échec sans reprise, motif générique d'une panne, retrait de l'objet après un
  INSERT perdu, taille lue bornée, plafond de décompression par entrée, calage
  du chevauchement sur un mot, choix du point de coupe, signe du hachage,
  poids amorti, paires de mots, mots vides, formation archivée, contrôle
  préalable du doublon ; en e2e, ressource `support` du garde
  d'autorisation et verrou de ligne de la relance ; en base, le CHECK
  « INDEXE ⇔ passages ». Un mutant équivalent : `includes(256)` au lieu de
  `includes(0)` (Buffer ramène l'entier modulo 256).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : bloc vide ; format
  refusé dans la modale ; dépôt -> « Indexation… » puis « Indexé » (4
  passages) sans recharger ; PDF illisible -> « Échec » avec le motif et
  « Relancer » ; doublon -> message 409 dans la modale ; confirmation de
  suppression. Emails « Support indexé » / « Indexation impossible » reçus.
  Pas de défilement horizontal.
- Non vérifiable ici : MinIO lui-même (serveur S3 compatible en local, MinIO
  en CI) et l'image de production (construite par la CI sur `main`).

## CI
Voir la PR.

## Suites
- US-IA-02 : lancer une génération à partir d'un support INDEXE.
- Brancher un fournisseur d'embeddings neuronal (même dimension) quand le
  téléchargement du modèle et l'image de production le permettront ; il
  suffira de réindexer.
- Aligner DS-06 partie 1 : routes sous le module, statut ECHEC_INDEXATION,
  relance et suppression, notification par email, formats MD / DOCX ajoutés.
