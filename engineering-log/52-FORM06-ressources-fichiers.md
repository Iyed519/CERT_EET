# US-FORM-06 — Ressources de module : fichiers

## En une phrase
Un formateur affecté dépose dans un module un fichier de n'importe quel type
(sous la taille maximale) ; l'apprenant inscrit regarde les vidéos MP4 /
WebM et écoute l'audio dans la plateforme, voit les images, ouvre les PDF
dans un onglet et télécharge les autres fichiers — toujours au travers d'un
lien signé de 10 minutes, jamais d'une adresse permanente.

## Découpage
- **Base.** Migration `1787500000000-AddFichiersRessources` : colonnes
  `nom_original`, `extension`, `type_mime`, `taille_octets`, `sha256`,
  `cle_stockage` (unique), `lecture` (VIDEO / AUDIO / PDF / IMAGE / null) ;
  `CHK_ressources_lien` (US-FORM-05) remplacé par `CHK_ressources_nature`
  (un lien n'a aucune colonne de fichier, un fichier n'a ni adresse ni
  plateforme), `CHK_ressources_video` élargi, `CHK_ressources_fichier`
  (extension, taille 1 octet – 1 Gio, SHA-256, mode de lecture).
- **API.** `fichier-ressource.regles.ts` (types lisibles et leurs signatures,
  taille, plages d'octets, Content-Disposition), `FichiersRessourcesService`
  (dépôt, lien signé, lecture), `FichiersRessourcesController` (lien +
  route publique du jeton), `depot-ressource.ts` (multer, filtre d'erreurs),
  `StockageService.lirePlage` (GetObject avec Range), variable
  `RESSOURCES_TAILLE_MAX_MO` (500 par défaut, 1 024 au plus).
- **Web.** `RessourcesCours.tsx` : « + Fichier » (modale), icône par genre
  (vidéo, audio, document, image, fichier, lien), action par genre
  (« Regarder », « Écouter », « Voir » dans la carte ; « Ouvrir ↗ » pour un
  PDF ; « Télécharger » pour le reste) ; lecteur `<video>` / `<audio>` /
  `<img>` alimenté par le lien signé ; mise en page téléphone homogène
  (l'action passe toujours sous le texte).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/modules/:moduleId/ressources/fichiers` (multipart `fichier`, `titre?`, `description?`) | FORMATEUR affecté, ADMINISTRATEUR | 201 ; 400 ; 403 ; 404 ; 409 archivée / module plein ; 413 trop gros ; 503 stockage |
| POST | `/api/ressources/:ressourceId/lien` | ADMINISTRATEUR ; FORMATEUR affecté ; APPRENANT inscrit (EN_COURS, TERMINEE) | 200 `{ url, expireDansSecondes: 600 }` ; 403 tracé ; 404 inconnue ou lien |
| GET | `/api/ressources/fichiers/:jeton` | public (jeton) | 200 ; 206 (Range) ; 404 jeton invalide / expiré / ressource supprimée ; 416 ; 503 |

## Flux
1. **Dépôt** : module (404), formation non archivée (409), fichier : présent,
   non vide (400), sous la taille configurée (413), contenu conforme à
   l'extension pour un format lisible (400) ; nom relu en UTF-8 ; SHA-256 en
   flux ; envoi sur MinIO (`ressources/<module>/<ressource>/fichier.<ext>`,
   503) ; puis, sous le verrou du module : place (409), rang suivant, INSERT ;
   un échec retire l'objet. Audit `RESSOURCE_AJOUTEE`.
2. **Lien** : contrôle d'accès selon le rôle (refus tracés) ; jeton aléatoire
   de 256 bits dans Redis (`ressource:lien:<jeton>`, 10 min).
3. **Lecture** : jeton au bon format et présent dans Redis, ressource toujours
   là (404 uniforme sinon) ; plage d'octets (206 + `Content-Range`, 416 hors
   du fichier) ; format lisible -> `inline` et son vrai type, sinon
   `attachment` en `application/octet-stream` ; `nosniff`, `no-referrer`,
   `Cache-Control: private` ; flux MinIO relayé, interrompu si le navigateur
   ferme la connexion.
4. **Retrait** : ligne supprimée sous le verrou du module, puis objet MinIO
   (au mieux) ; un lien déjà distribué ne sert plus (404).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Lien signé | Jeton aléatoire dans Redis (10 min) plutôt qu'URL pré-signée MinIO : MinIO n'est pas exposé (réseau Docker privé) et l'accès est revérifié par l'API à chaque lien. Le jeton remplace l'en-tête d'authentification qu'un `<video>` ou un onglet ne peut pas envoyer. |
| D2 | Types lisibles | PDF, PNG, JPEG, GIF, WebP, MP4 / M4V, WebM, OGV, MP3, M4A, OGG / OGA, WAV — avec contrôle de signature. Tout le reste (y compris HTML, SVG, exécutables) : téléchargement en octet-stream ; rien n'est jamais interprété par le navigateur. |
| D3 | Tous les types | Acceptés (décision du 11/10) ; pas d'antivirus (ClamAV « à arbitrer ») : reporté, les fichiers ne sont jamais exécutés côté serveur ni affichés s'ils ne sont pas sûrs. |
| D4 | Taille | `RESSOURCES_TAILLE_MAX_MO` (500 Mo par défaut) -> 413 ; plafond absolu 1 Gio (multer, CHECK, nginx `client_max_body_size 1024m`, sans mise en tampon). |
| D5 | Modification | Titre et description seulement ; remplacer le fichier = le retirer puis en déposer un autre (400 sur `url`). |
| D6 | Réutilisation par l'IA | Reportée : un PDF déposé en ressource n'est pas encore proposé comme source à l'assistance IA (US-IA-01 garde son propre dépôt). |
| D7 | Correctif | Les noms de fichiers accentués des supports IA (US-IA-01) arrivaient décodés en latin1 (« RÃ©sumÃ© ») : même correctif que les livrables, test e2e ajouté. |

## Fichiers
- `apps/api/src/database/migrations/1787500000000-AddFichiersRessources.ts`, `database/entities/ressource-module.entity.ts`
- `apps/api/src/modules/ressources/{fichier-ressource.regles,fichiers-ressources.service,fichiers-ressources.controller,depot-ressource}.ts` (+ specs), `ressources.{service,controller,module}.ts`, `ressource.regles.ts`
- `apps/api/src/stockage/stockage.service.ts`, `config/{configuration,env.validation}.ts`, `modules/assistance-ia/supports/supports.service.ts`
- `apps/api/test/ressources-fichiers.e2e-spec.ts` (marqueur `E2E-RESSFICH`), `test/supports.e2e-spec.ts`
- `apps/web/src/components/RessourcesCours.tsx`, `lib/api.ts`, `app/globals.css` ; `.env.example`

## Incidents
- Noms accentués mal décodés par multer (voir D7) : trouvé par l'e2e.
- À 390 px, l'action passait tantôt à côté, tantôt sous le titre selon sa
  longueur : elle passe désormais toujours sous le texte.

## Vérification
- API : lint 0, `tsc`, unitaires **71 suites / 1 023 tests**, migration
  run + revert + run, e2e **39 suites / 547 tests** (en série), dont
  `E2E-RESSFICH` (14 tests : dépôt PDF / vidéo / exécutable, refus 400 / 403 /
  404 / 409 / 413 sans trace en base ni dans le bucket, lien signé par rôle,
  lecture sans jeton d'accès, en-têtes, 206 et 416, lien expiré, « Mon
  espace », modification, retrait, garanties en base, concurrence forcée de
  deux dépôts). La suite US-FORM-05 suit le nouveau champ `fichier` et la
  contrainte renommée.
- Mutations tuées (11) : signature des formats lisibles, taille maximale,
  `inline` réservé aux formats lisibles, `nosniff`, accès du formateur et de
  l'apprenant au lien, retrait de l'objet après un INSERT refusé, retrait de
  l'objet à la suppression, correctif UTF-8 des supports IA ; deux mutants
  équivalents : le type `octet-stream` déjà enregistré pour un format non
  lisible, et la borne `début ≥ taille` déjà couverte par `fin < début`.
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px (Chromium) : dépôt
  WebM, MP3, PDF, PNG, PY ; refus « contenu non conforme » dans la modale ;
  côté apprenant, la vidéo **se lit réellement** dans la page par le lien
  signé (lecture à 1,2 s, 640 px de large, durée 4 s, à 1 280 et 390 px),
  image affichée, actions homogènes sur téléphone. Pas de défilement
  horizontal.

## CI
Voir la PR.

## Suites
- Proposer un PDF / PPTX déposé en ressource comme source de l'assistance IA
  (sans second dépôt).
- Antivirus des fichiers déposés (ClamAV) à arbitrer.
- Aligner le Backlog v1.8 : US-FORM-05 et 06 réalisées au Sprint 3 ; 413
  pour la taille, lien signé de 10 min par jeton, types lisibles.
