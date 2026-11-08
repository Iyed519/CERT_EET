# US-ATEL-04 — Soumettre un livrable

## En une phrase
Sur la fiche d'un atelier publié, l'apprenant inscrit dépose ses fichiers
(plus un commentaire et des liens) : le serveur contrôle extension, contenu
réel, taille et nombre contre l'atelier, juge le délai à la réception sur
l'horloge de PostgreSQL, calcule le SHA-256 de chaque fichier et le hash de
traçabilité, envoie les fichiers sur MinIO, enregistre le livrable (version 1,
SOUMIS, en retard ou non) et prévient les formateurs par email.

## Découpage
- **A — Infrastructure (ADR-07).** Service `minio` dans `docker-compose.yml`
  (image `bitnamilegacy/minio:2025.4.22` figée, volume `miniodata`, sonde
  HTTP `/minio/health/live`, réseau privé ;
  l'api en dépend), redémarrage en recette, MinIO lancé dans la CI (même
  image, même sonde), `client_max_body_size 1024m` sur `/api/` dans nginx,
  variables dans `.env.example`. Module global `StockageModule` (client S3
  `@aws-sdk/client-s3`, version figée de plus de deux semaines) ; le bucket est
  créé au démarrage s'il manque.
- **B — Données.** Migration `1786600000000-AddLivrables` : `livrables` et
  `fichiers_livrables` (DS-03), CHECK sur toutes les bornes.
- **C — API.** Règles pures `livrable.regles.ts`, `LivrablesService`,
  `LivrablesController` (multipart), intercepteur de nettoyage des fichiers
  temporaires, filtre qui traduit les refus de multer, email aux formateurs.
- **D — Web.** Formulaire de dépôt et panneau « Mon livrable » sur
  `/mes-ateliers/[atelierId]` ; statut du livrable dans « Mon espace ».

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/ateliers/:atelierId/livrable` (multipart : `fichiers`, `commentaire`, `liens`) | APPRENANT | 201 · 400 fichier / lien / commentaire · 401 · 403 non inscrit (tracé), suspendu, formation terminée, autre rôle · 404 inconnu ou brouillon · 409 délai dépassé, déjà soumis · 503 stockage indisponible |
| GET | `/api/mes-ateliers/:atelierId` | APPRENANT | + `monLivrable` (ou null) |
| GET | `/api/formations/:formationId/mon-espace` | APPRENANT | + `ateliers[].statutMonLivrable` |

## Flux
1. multer écrit les fichiers sur disque (nom aléatoire, dossier temporaire,
   plafonds absolus : 100 Mo par fichier, 11 fichiers, champs bornés).
2. Atelier PUBLIÉ (404) → inscription (403, règle de « Mon espace » ;
   TERMINEE refusée) → `now()` PostgreSQL : à l'heure / en retard / 409 →
   déjà soumis ? 409.
3. Règles : nombre, nom, extension (liste de l'atelier), fichier non vide,
   taille, **signature** (pdf, zip, docx/pptx/xlsx, png, jpg) ; commentaire ;
   liens http(s).
4. SHA-256 de chaque fichier en flux ; hash de traçabilité.
5. Envoi des objets sur MinIO (`livrables/{apprenant}/{atelier}/{livrable}/v1/{n}-{nom}`,
   SHA-256 en métadonnée), PUIS transaction : `livrables` + `fichiers_livrables`.
   Échec en base → objets supprimés ; 23505 (dépôt simultané perdant) → 409.
6. Audit `LIVRABLE_SOUMIS`, email « Nouveau livrable » à chaque formateur
   affecté (au mieux), réponse 201 avec le livrable.
7. L'intercepteur supprime les fichiers temporaires, quelle que soit l'issue.

## Décisions
- **D1 — Délai dépassé : 409** (Backlog et DS-03 : 403) — refus de temps,
  comme la fenêtre d'un QCM.
- **D2 — Tolérance :** dépôt accepté et marqué `enRetard`.
- **D3 — Format : 400** avec un message précis ; l'extension seule ne suffit
  pas, la signature des formats binaires est vérifiée (un `.zip` renommé en
  `.pdf` est refusé). Le type MIME envoyé par le navigateur n'est pas utilisé.
- **D4 — Tables de DS-03** (`livrables`, `fichiers_livrables`) ; un livrable
  par (atelier, apprenant), UNIQUE. `hashTracabilite` = SHA-256 du fichier
  seul, sinon SHA-256 de la liste TRIÉE des SHA-256 (indépendant de l'ordre).
- **D5 — Commentaire (≤ 2 000) et liens (≤ 5, http/https)** facultatifs ; au
  moins un fichier (les types d'un atelier sont des extensions).
- **D6 — Pas de remplacement** (US-ATEL-05, *Should*, hors bloc A) : un second
  dépôt → 409 ; l'interface prévient que le dépôt est définitif.
- **D7 — Notification par email** aux formateurs affectés (Mailhog en dev) ;
  pas de table `notifications` (DS-03) — pas de notifications in-app.
- **D8 — Délai jugé à la réception** (`now()` avant l'envoi sur MinIO) ;
  `dateSoumission` = cette heure.
- **D9 — Stockage injoignable :** l'api démarre quand même (journalisé), le
  bucket est revérifié au premier dépôt ; un dépôt échoue alors en 503.
- **D10 — Fichiers sur disque, pas en mémoire** (jusqu'à 10 × 100 Mo), envoyés
  en flux ; nginx accepte 1 Go sur `/api/` sans mise en tampon.
- Le contrôle « déjà soumis » avant l'envoi évite un envoi inutile ; la vraie
  protection est la contrainte UNIQUE + suppression des objets du perdant.

## Fichiers
- Infra : `docker-compose.yml`, `docker-compose.recette.yml`,
  `docker/nginx/nginx.conf`, `.env.example`, `.github/workflows/ci.yml`,
  `apps/api/package.json` (+ lock).
- API : `src/stockage/` (module, service, constantes), `src/config/`
  (configuration, validation), `database/` (entités `livrable`,
  `fichier-livrable`, enum `statut-livrable`, migration), `modules/ateliers/livrables/`
  (règles, DTO, service, contrôleur, `depot-fichiers.ts`),
  `ateliers-apprenant.service.ts`, `ateliers.module.ts`,
  `inscriptions/espace-formation.service.ts`, `inscriptions.module.ts`,
  `mail/mail.service.ts` (`sendLivrableSoumisEmail`).
- Tests : `livrable.regles.spec.ts`, `livrables.service.spec.ts`,
  `stockage.service.spec.ts`, specs mises à jour, `test/livrables.e2e-spec.ts`
  (marqueur `E2E-LIVRABLE`).
- Web : `components/DepotLivrable.tsx`, `components/MonLivrable.tsx`,
  `app/mes-ateliers/[atelierId]/page.tsx`,
  `app/mes-inscriptions/[formationId]/page.tsx`, `lib/api.ts`, `lib/format.ts`,
  `app/globals.css`.

## Incidents
- **Image MinIO introuvable en CI** (« pull access denied for minio/minio ») :
  MinIO ne publie plus d'images (Docker Hub et quay.io). Une étape de sonde
  temporaire en CI a listé les images encore disponibles : build Bitnami
  archivée `bitnamilegacy/minio:2025.4.22` (même version de MinIO, figée,
  `curl` et `mc` présents) ou Chainguard (seulement `latest`, non figeable).
  Retenu : Bitnami archivée — à surveiller, elle ne reçoit plus de mises à
  jour (piste : construire l'image depuis les sources de MinIO).
- Prettier a reformaté des lignes que je n'avais pas écrites dans trois
  fichiers de config / mail : remises à l'identique.
- Un test unitaire laissait un flux de fichier s'ouvrir après la suppression
  du dossier temporaire (ENOENT, processus Jest arrêté) : dossier conservé.
- Playwright n'envoie pas un fichier dont le CHEMIN est accentué : le parcours
  navigateur utilise des fichiers en mémoire (nom accentué conservé de bout en
  bout ; l'e2e envoie aussi « Rapport résumé.pdf »).
- Accord : « 1 fichier … seront envoyés » corrigé (« sera envoyé »).

## Vérification
- API : lint et `tsc` propres ; unitaires **47 suites / 661 tests** ; migration
  `run` + `revert` + `run` ; e2e en série **26 suites / 373 tests** (+1 suite,
  +16 tests), contre un serveur S3 compatible local (moto) — MinIO n'est pas
  téléchargeable dans mon espace de travail ; la CI l'exécute contre un vrai
  MinIO.
- Mutations (11, toutes tuées) : traduction 23505, suppression des objets du
  perdant, signature, délai, tolérance, formation terminée, liste de
  l'atelier, taille de l'atelier, inscription, atelier publié, nettoyage des
  fichiers temporaires.
- Web : `tsc --noEmit` et `next lint` propres. Navigateur (Chromium, 1280 et
  390 px, captures relues, pas de défilement horizontal) : bouton inactif sans
  fichier ; refus client d'une extension ; refus serveur d'un `.pdf` qui est
  un zip (message dans la modale) ; dépôt de 3 fichiers + commentaire + lien ;
  panneau « Mon livrable » (SHA-256 identique à `sha256sum`) ; dépôt en
  tolérance marqué en retard ; « Livrable soumis » dans « Mon espace » ; email
  « Nouveau livrable » reçu par le formateur (serveur SMTP local).
- Non vérifié localement : le conteneur MinIO lui-même (image, sonde
  HTTP) — vérifié par la CI, qui lance la même image.

## CI
Étape « Start MinIO » ajoutée avant l'installation ; verte sur la PR, puis sur
`main` après la fusion.

## Suites
- US-ATEL-06 : file de correction côté formateur, ouverture EN_CORRECTION
  (verrou pour l'apprenant), téléchargement des fichiers depuis MinIO.
- US-ATEL-05 (remplacement) : hors bloc A.
- Documents à aligner : Backlog / DS-03 (409 au lieu de 403 pour le délai ;
  notification par email, pas de table `notifications`).
