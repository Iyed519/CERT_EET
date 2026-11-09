# US-IA-02 — Lancer une génération de questions paramétrée

## En une phrase
Depuis un support INDEXE d'un module, un formateur affecté (ou un
administrateur) règle le nombre de questions (1–20), les types (QCU, QCM,
Vrai/Faux), le niveau et un thème facultatif ; l'API crée une génération
EN_COURS, met le travail dans la file `ia-generation` et répond 202 — le
pipeline RAG qui la traite est US-IA-03.

## Découpage
- **Base.** Migration `1787300000000-AddGenerationsIa` : type
  `generations_ia_statut_enum` (EN_COURS, TERMINEE, ECHEC) ; table
  `generations_ia` (FK RESTRICT vers le module, le support et le formateur ;
  CHECK : nombre 1–20, types non vides, sans doublon, dans QCU / QCM /
  VRAI_FAUX, niveau dans la liste fermée, thème null ou non vide, compteurs,
  suggestions ≤ demandées, TERMINEE ⇒ fin + compteurs, ECHEC ⇒ fin + motif,
  EN_COURS ⇒ pas de fin) ; **index unique partiel** (formateur) WHERE
  EN_COURS.
- **API.** `GenerationsController`, `GenerationsService`, règles pures
  `generation.regles.ts`, `LancerGenerationDto` ; `FileIaService` : file
  `ia-generation` (`ajouterGeneration`, identifiant de travail = génération).
  Garde `@FormateurDeLaFormation` étendu aux générations (`{ generationId }`).
  Variable `IA_GENERATIONS_PAR_HEURE` (10 par défaut).
- **Web.** Bouton « Générer » sur chaque support indexé
  (`components/GenerationModal.tsx` : nombre, types à cocher, niveau, thème) ;
  liste « Générations de questions » (5 dernières, état, paramètres, motif
  d'échec) sous les supports, rafraîchie tant qu'une génération est en cours.

## Endpoints
| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| POST | `/api/modules/:moduleId/generations` `{ supportId, nbQuestions, types, niveau, focusThematique? }` | FORMATEUR affecté, ADMINISTRATEUR | 202 génération EN_COURS ; 400 paramètres ; 403 ; 404 module / support hors module ; 409 aucun support indexé (invitation), support non indexé, formation archivée, génération déjà en cours ; 429 plafond horaire |
| GET | `/api/modules/:moduleId/generations` | idem | 200 (50 au plus, plus récentes d'abord) ; 403 ; 404 |
| GET | `/api/generations/:generationId` | idem | 200 ; 403 ; 404 |

## Flux
1. Module (404), formation non archivée (409), paramètres (DTO, 400).
2. Transaction : support verrouillé **en partage** (FOR SHARE) — il ne peut
   être ni supprimé ni modifié pendant le lancement ; il doit appartenir au
   module (404) et être INDEXE (409 ; si le module n'a aucun support indexé,
   le message invite à en indexer un d'abord) ; génération déjà en cours pour
   ce formateur -> 409 ; plafond horaire (Redis, fenêtre fixe d'une heure ;
   injoignable = pas de blocage, journalisé) -> 429 ; INSERT EN_COURS à
   l'heure de PostgreSQL. Deux lancements simultanés : l'index unique partiel
   départage (23505 -> 409).
3. Audit `GENERATION_IA_LANCEE` (paramètres) ; travail en file (file
   injoignable -> ECHEC avec motif) ; 202 avec la fiche.

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Route | `POST /modules/:moduleId/generations` avec `supportId` dans le corps (DS-06 : `/formations/:id/generations`), cohérent avec les supports. |
| D2 | Prérequis manquant | 409 (refus d'état, convention du projet) avec un message qui invite à déposer et indexer un support. |
| D3 | Paramètres | Nombre 1–20 (plafond de coût, D9 du handoff) ; types QCU, QCM, VRAI_FAUX (ceux que l'éditeur de QCM corrige déjà ; REPONSE_COURTE et ASSOCIATION exclus) ; niveaux DEBUTANT / INTERMEDIAIRE / AVANCE (mêmes valeurs que les questions) ; thème ≤ 200. Bornes dans le DTO **et** en base. |
| D4 | Coût | Une génération EN_COURS au plus par formateur (index unique partiel) + plafond horaire par formateur (`IA_GENERATIONS_PAR_HEURE`, 429). Taille du prompt et délai d'appel : US-IA-03. |
| D5 | Statuts | EN_COURS / TERMINEE / ECHEC (DS-06 : EnCours / Terminée ; ECHEC ajouté pour un échec définitif). |
| D6 | Modèle | Colonne `modele_llm` remplie par le pipeline (US-IA-03), pas au lancement (DS-06 : `modeleUtilise` au lancement). |
| D7 | Worker | La file existe dès cette story ; son worker (pipeline RAG) arrive avec US-IA-03. Entre les deux fusions, une génération lancée reste EN_COURS. |
| D8 | Visibilité | Tout formateur affecté à la formation voit les générations du module (travail d'équipe) ; chacune affiche son auteur. |

## Fichiers
- `apps/api/src/database/migrations/1787300000000-AddGenerationsIa.ts`, `database/entities/generation-ia.entity.ts`, `database/enums/statut-generation.enum.ts`
- `apps/api/src/modules/assistance-ia/generations/{generations.controller,generations.service,generation.regles,generations.dto}.ts` (+ specs), `file-ia.service.ts`, `assistance-ia.module.ts`
- `apps/api/src/modules/formations/autorisation/*` (ressource `generation`), `formations.module.ts`, `config/{configuration,env.validation}.ts`
- `apps/api/test/generations.e2e-spec.ts` (marqueur `E2E-IAGEN`)
- `apps/web/src/components/{GenerationModal,SupportsModule}.tsx`, `lib/{api,format}.ts`, `app/globals.css` ; `.env.example`

## Incidents
- PostgreSQL refuse une sous-requête dans un CHECK (« types sans
  doublon ») : remplacée par `array_positions` (une occurrence au plus de
  chaque type).
- Le verrou de partage du support n'était prouvé que par un test unitaire :
  ajout d'un test de concurrence forcée « lancement + suppression du même
  support » (sans le verrou, l'INSERT bute sur la clé étrangère -> 500).

## Vérification
- API : lint 0, `tsc`, unitaires **67 suites / 923 tests**, migration
  revert + run, e2e **37 suites / 512 tests** (en série), dont la suite
  `E2E-IAGEN` (25 tests : nominal avec travail présent dans la file, refus
  400 / 403 / 404 / 409 / 429, garanties en base, deux tests de concurrence
  forcée).
- Mutations tuées (14) : en unitaire, support d'un autre module, statut
  INDEXE exigé, message d'invitation, borne du plafond, verrou de partage
  (option), contrôle « déjà en cours », formation archivée, Redis injoignable
  = ouvert ; en e2e, conversion 23505 -> 409, ressource `generation` du
  garde, identifiant de travail, verrou de partage (course lancement /
  suppression).
- Web : `tsc`, `next lint`. Navigateur 1280 / 390 px : modale (bouton
  inactif sans type), lancement -> « En cours… » avec nombre, types, niveau
  et thème ; deuxième lancement -> message 409 dans la modale. Pas de
  défilement horizontal.

## CI
Voir la PR.

## Suites
- US-IA-03 : worker de la file `ia-generation` (pipeline RAG, fournisseur
  LLM, validation, suggestions PROPOSEE).
- Aligner DS-06 partie 2 : route sous le module, 409 pour le prérequis,
  statut ECHEC, modèle enregistré par le pipeline, limites de coût.
