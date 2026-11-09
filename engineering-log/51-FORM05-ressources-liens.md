# US-FORM-05 — Ressources de module : liens et vidéos

## En une phrase
Un formateur affecté (ou un administrateur) ajoute aux modules de sa
formation des liens titrés — vidéos YouTube ou Vimeo, pages web, dépôts — les
modifie, les réordonne ou les retire ; l'apprenant inscrit les retrouve dans
« Mon espace », au-dessus des évaluations du module, et regarde les vidéos
**dans la plateforme** (lecteur intégré, sans cookie de suivi).

## Origine
Demande du 09/11/2026 (« un support peut-il être une vidéo ou un lien
YouTube, visible des apprenants ? ») : les supports d'US-IA-01 ne servent
qu'à l'IA et doivent contenir du texte. La réponse est la décision produit
du 11/10/2026 (révision v1.5 du Backlog, `Cert_EET_Revision_v1.5_Ressources_Module.md`) :
US-FORM-05 (liens) puis US-FORM-06 (fichiers). Réalisées avant US-IA-03.

## Découpage
- **Base.** Migration `1787400000000-AddRessourcesModule` : type
  `ressources_module_nature_enum` (LIEN ; FICHIER réservé à US-FORM-06) ;
  table `ressources_module` (FK module CASCADE, FK auteur RESTRICT, UNIQUE
  module × ordre ; CHECK : ordre ≥ 1, titre et description non vides,
  adresse `http(s)://`, plateforme YOUTUBE / VIMEO / WEB, identifiant vidéo
  au bon format pour une vidéo et absent pour une page web, début ≥ 0).
- **API.** Module `ressources` : `RessourcesController`, `RessourcesService`,
  règles pures `ressource.regles.ts` (analyse d'adresse), DTO. Garde
  `@FormateurDeLaFormation` étendu (`{ ressourceId }`). « Mon espace »
  (`EspaceFormationService`) renvoie `modules[].ressources`.
- **Web.** `components/RessourcesCours.tsx` : côté formateur, bloc
  « Ressources du cours » au-dessus de « Supports pour l'IA » (ajout avec
  détection immédiate « Vidéo YouTube : elle sera lue dans la plateforme »,
  aperçu, ↑ ↓, modifier, retirer) ; côté apprenant, section « Ressources du
  cours » (icône lecture rouge pour une vidéo, maillons pour un lien, bouton
  « Regarder » qui ouvre un lecteur 16:9 dans la carte, « Ouvrir ↗ » dans un
  nouvel onglet pour un lien).

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/modules/:moduleId/ressources` | FORMATEUR affecté, ADMINISTRATEUR | 200 ; 403 ; 404 |
| POST | `/api/modules/:moduleId/ressources/liens` `{ titre, url, description? }` | idem | 201 ; 400 ; 403 ; 404 ; 409 formation archivée ou 50 ressources |
| PUT | `/api/modules/:moduleId/ressources/ordre` `{ ids }` | idem | 200 liste ; 400 liste incomplète / étrangère ; 403 ; 404 ; 409 |
| PATCH | `/api/ressources/:ressourceId` `{ titre?, url?, description? }` | idem | 200 ; 400 ; 403 ; 404 ; 409 |
| DELETE | `/api/ressources/:ressourceId` | idem | 204 ; 403 ; 404 ; 409 |
| GET | `/api/formations/:formationId/mon-espace` (existant) | APPRENANT inscrit (EN_COURS, TERMINEE) | `modules[].ressources` ajouté |

## Flux
1. **Analyse de l'adresse** (pure) : `http(s)` seulement, nom d'hôte avec un
   point, pas d'identifiant ni de mot de passe, 2 048 caractères au plus une
   fois normalisée (400 sinon). YouTube (`watch?v=`, `youtu.be/`, `shorts/`,
   `live/`, `embed/`, domaine sans cookie) et Vimeo (`vimeo.com/…/ID`,
   `player.vimeo.com/video/ID`) reconnus avec leur identifiant et le moment de
   départ (`t=90`, `t=1m30s`, `start=`, `#t=`) ; une vidéo sans identifiant
   valide -> 400 ; tout autre lien est une page web.
2. **Écriture** sous le verrou de la ligne du MODULE (ajout, ordre,
   suppression) ou de la ressource (modification) ; formation archivée -> 409 ;
   rang = maximum + 1 calculé sous ce verrou ; réordonnancement en deux passes
   (décalage puis rangs définitifs : jamais de doublon transitoire sur
   l'UNIQUE). Audit `RESSOURCE_AJOUTEE`, `RESSOURCE_MODIFIEE`,
   `RESSOURCES_REORDONNEES`, `RESSOURCE_SUPPRIMEE`.
3. **Apprenant** : contrôle d'accès existant (`exigerAccesContenu` : non
   inscrit / suspendu -> 403 tracé), ressources lues par module dans l'ordre.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Lecteur intégré | Construit côté navigateur À PARTIR DE L'IDENTIFIANT (jamais de l'adresse saisie) : `youtube-nocookie.com/embed/ID` et `player.vimeo.com/video/ID?dnt=1` ; aucune page arbitraire n'est affichée dans l'application. Chargé seulement au clic « Regarder » (vie privée, performance). |
| D2 | Autres liens | Nouvel onglet, `rel="noopener noreferrer"` ; le domaine est affiché pour que l'apprenant sache où il va. |
| D3 | Tables | Une table `ressources_module` pour les deux natures (LIEN maintenant, FICHIER avec US-FORM-06 : la valeur d'énumération existe déjà, la contrainte la refuse tant que ses colonnes n'existent pas). |
| D4 | Modification | `PATCH` ajouté (titre, adresse, description) — le Backlog ne cite qu'ajout, ordre et retrait ; c'est l'usage attendu d'un éditeur. |
| D5 | Ordre | `PUT …/ordre` avec la liste complète (400 sinon) ; boutons ↑ ↓ dans l'interface. |
| D6 | Borne | 50 ressources au plus par module (409) ; titre ≤ 200, description ≤ 500, adresse ≤ 2 048 (DTO et CHECK). |
| D7 | Suppression d'un module | CASCADE : une ressource est une partie du module. |
| D8 | Statut 409 | Formation archivée et module plein : refus d'état (convention du projet). |

## Fichiers
- `apps/api/src/database/migrations/1787400000000-AddRessourcesModule.ts`, `database/entities/ressource-module.entity.ts`, `database/enums/nature-ressource.enum.ts`
- `apps/api/src/modules/ressources/{ressources.module,ressources.controller,ressources.service,ressource.regles,ressources.dto}.ts` (+ specs)
- `apps/api/src/modules/inscriptions/{espace-formation.service,inscriptions.module}.ts` (+ spec), `modules/formations/autorisation/*`, `formations.module.ts`, `app.module.ts`
- `apps/api/test/ressources.e2e-spec.ts` (marqueur `E2E-RESSLIEN`)
- `apps/web/src/components/RessourcesCours.tsx`, `app/formateur/formations/[id]/page.tsx`, `app/mes-inscriptions/[formationId]/page.tsx`, `lib/api.ts`, `app/globals.css`

## Incidents
- À 390 px, une règle existante (`.espace-qcm .btn-sm { margin-left: auto }`)
  écartait les boutons du formateur : neutralisée dans les lignes de
  ressources.
- L'espace de travail ne joint ni YouTube ni Vimeo : le lecteur apparaît
  (bon cadre, bonne adresse `youtube-nocookie` / `player.vimeo.com`) mais la
  vidéo elle-même ne peut être vérifiée que sur le poste.

## Vérification
- API : lint 0, `tsc`, unitaires **69 suites / 969 tests**, migration
  run + revert + run, e2e **38 suites / 532 tests** (en série) dont `E2E-RESSLIEN` (20 tests :
  ajout YouTube / Vimeo / web, modification, ordre, retrait, « Mon espace »
  EN_COURS et TERMINEE, refus 400 / 403 / 404 / 409, garanties en base,
  concurrence forcée de deux ajouts).
- Mutations tuées (11) : protocole, identifiants, identifiant YouTube, borne
  de 50, longueur d'adresse, décalage du réordonnancement (e2e), verrou du
  module (e2e : sans lui, deux ajouts simultanés -> 500), formation archivée,
  ressource du garde (e2e), regroupement par module dans « Mon espace ». Un
  mutant équivalent : le contrôle des doublons dans l'ordre (une liste de même
  longueur avec un doublon oublie forcément une ressource, déjà refusé).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : bloc formateur vide,
  modale avec détection de la vidéo, erreur « Lien vidéo incomplet », liste
  réordonnée ; côté apprenant, section « Ressources du cours », lecteur
  ouvert dans la carte. Pas de défilement horizontal.

## CI
Voir la PR.

## Suites
- US-FORM-06 : fichiers (vidéo MP4 / WebM lue dans la plateforme, PDF /
  images / audio affichés, autres formats téléchargés ; un PDF partagé pourra
  servir de source à l'IA sans second dépôt).
- Aligner le Backlog v1.8 : US-FORM-05 réalisée au Sprint 3 (révision v1.5),
  modification d'une ressource ajoutée, borne de 50.
