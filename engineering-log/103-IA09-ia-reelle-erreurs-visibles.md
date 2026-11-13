# US-IA-09 — IA réelle dès qu'une clé est là, erreurs du fournisseur visibles

## En une phrase
Avec `ANTHROPIC_API_KEY` dans le `.env`, l'application appelle Claude, quoi que dise
`LLM_FOURNISSEUR` ; sans fournisseur configuré, plus aucune réponse d'exemple silencieuse :
l'interface affiche un message clair, et chaque erreur du fournisseur (crédit épuisé, clé
refusée, surcharge…) arrive en français dans la carte de la génération ou de l'import.

## Point de départ
Demande du propriétaire, 13/11/2026, après test : sa clé Claude est dans le `.env` mais les
questions générées ou importées sont des exemples. Cause : `docker-compose.yml` passe
`LLM_FOURNISSEUR: ${LLM_FOURNISSEUR:-factice}` et `.env.example` contient `LLM_FOURNISSEUR=factice` ;
`configuration.ts` retombe sur `factice` pour toute valeur autre que `anthropic` /
`compatible-openai`. La clé était donc ignorée sans le moindre signe à l'écran. De plus, après les
trois tentatives d'une erreur récupérable (limite de débit, surcharge), la carte n'affichait
qu'un message générique, sans la cause. Un crédit épuisé arrivait en anglais (« Requête refusée
par le fournisseur d'IA : Your credit balance is too low… »).

## Décisions (table D, écrite avant de coder)
| # | Point | Options | Décision |
|---|---|---|---|
| D1 | Choix du fournisseur | `LLM_FOURNISSEUR` seul ; la clé prime | **La clé prime** : `ANTHROPIC_API_KEY` non vide ⇒ `anthropic`, sauf `LLM_FOURNISSEUR=compatible-openai` explicite. `factice` n'est retenu que s'il est demandé explicitement **et** qu'aucune clé n'est présente (tests, CI). |
| D2 | Ni clé ni fournisseur | factice par défaut ; refus au démarrage ; fournisseur « non configuré » | Fournisseur **non configuré** : l'api démarre (le reste de la plateforme reste utilisable), mais tout appel à l'IA échoue tout de suite avec « Aucun fournisseur d'IA n'est configuré : ajoutez ANTHROPIC_API_KEY dans le fichier .env, puis redémarrez l'api. » Défaut de `docker-compose.yml` et de `.env.example` : vide. |
| D3 | Signal dans l'interface | — | Nouveau `GET /assistance-ia/etat` (formateur, administrateur) : `{ fournisseur, modele, reel, message }`, sans aucun secret. Les fenêtres « Générer avec l'IA » et « Importer depuis un fichier » affichent une alerte rouge si l'IA n'est pas configurée (bouton de lancement désactivé), une alerte d'information « Mode démonstration » si le fournisseur factice est demandé explicitement. |
| D4 | Messages d'erreur Anthropic | — | Crédit épuisé (`credit balance`, HTTP 400) : « Crédit Anthropic épuisé : rechargez le compte sur console.anthropic.com (Plans & Billing) ou changez de clé. », définitif. Surcharge (HTTP 529 `overloaded_error`) : « Claude est surchargé en ce moment : nouvel essai automatique. », récupérable. Limite de débit : précise « nouvel essai automatique ». Requête trop volumineuse (413) : « Document trop volumineux pour le fournisseur d'IA. », définitif. |
| D5 | Échec après les tentatives | message générique ; cause réelle | Si la dernière erreur est une erreur du fournisseur (`ErreurLlm`), la carte affiche « Génération (ou Extraction) interrompue après plusieurs tentatives (fournisseur d'IA indisponible : *cause*) : relancez-la. » (`motifApresTentatives`, compatible avec le motif attendu par l'e2e US-IA-06). Pendant un nouvel essai d'import, la cause s'affiche en information ; une erreur non issue du fournisseur y devient « Erreur passagère pendant la lecture. » (aucune fuite de détail technique). L'échec d'une génération passe d'un petit texte rouge à une alerte. |
| D6 | Tests | — | `test/setup-env.ts` (setupFiles e2e) fixe `LLM_FOURNISSEUR=factice` sans clé, comme la CI le supposait ; tests unitaires de la résolution (clé ⇒ anthropic, factice explicite, non configuré, compatible-openai), des nouveaux messages et du fournisseur non configuré ; e2e de `GET /assistance-ia/etat` (rôles, champs exacts, pas de clé dans la réponse). |

## Fichiers
- API : `config/configuration.ts` (`resoudreFournisseurLlm`), `config/env.validation.ts` (plus de défaut `factice`),
  `assistance-ia/llm/llm-non-configure.ts` (nouveau), `llm/etat-ia.controller.ts` (nouveau, `GET /assistance-ia/etat`),
  `llm/llm.provider.ts` (journal au démarrage), `llm/llm-anthropic.ts` (messages), `llm/fournisseur-llm.ts`
  (`estErreurLlm`, `motifApresTentatives`), `extraction-questions.service.ts`, `pipeline-rag.service.ts`.
- Tests : `config/resolution-fournisseur-llm.spec.ts`, `llm/llm.spec.ts`, `pipeline-rag.service.spec.ts`,
  `test/setup-env.ts` (setupFiles e2e), `test/etat-ia*.e2e-spec.ts` (3 fichiers, une application par
  configuration), `test/extraction-questions.e2e-spec.ts` (+2), `test/llm-anthropic.e2e-spec.ts` (clé du shell
  sous `ANTHROPIC_API_KEY_ESSAI_REEL`).
- Web : `components/EtatIaAlerte.tsx` (nouveau), `GenerationModal.tsx`, `ImportFichierModal.tsx`,
  `SupportsModule.tsx`, `lib/api.ts`, `globals.css`.
- `docker-compose.yml`, `.env.example`, `docs/GUIDE_DEMO.md`, backlog (v2.3), `CHANGELOG.md`.

## Vérification
- Mutations : 7 / 7 tuées (priorité de la clé, défaut non configuré, erreurs définitives, cause gardée,
  message d'état, rôles).
- Captures 1280 / 390 px des fenêtres « Générer » et « Importer » : IA non configurée (alerte rouge,
  bouton désactivé) et mode démonstration.
