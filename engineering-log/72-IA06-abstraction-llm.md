# US-IA-06 — Couche d'abstraction LLM

## En une phrase
Changer de fournisseur de modèle de langage ne demande plus qu'une variable
de configuration : à côté de Claude (Anthropic) et du fournisseur factice,
un adaptateur « compatible OpenAI » parle à tout service `/chat/completions`
avec appel d'outil — OpenAI, Mistral, ou un modèle hébergé en Tunisie
derrière vLLM / Ollama (souveraineté des données) — sans toucher au pipeline.

## Point de départ
Backlog E6, US-IA-06 (Should, 3 pts, stretch) : « changer de fournisseur
(variable de configuration) sans modifier aucun module métier » ; « fournisseur
indisponible -> politique de reprise et formateur informé en cas d'échec
persistant ». Existant (US-IA-03) : interface `FournisseurLlm`, fabrique
`llmProvider` (`anthropic` | `factice`), `ErreurLlm` récupérable ou non,
reprises BullMQ, échec définitif tracé et email au formateur.

## Découpage
- **Aucune migration.**
- `llm/llm-compatible-openai.ts` : adaptateur sans dépendance (`fetch`),
  outil `proposer_questions` imposé (`tool_choice`), lecture de l'argument de
  l'appel, traduction des erreurs HTTP / réseau / délai en `ErreurLlm`.
- `llm/llm.provider.ts` : branche `compatible-openai` (seul fichier qui connaît
  les adaptateurs).
- Configuration : `LLM_FOURNISSEUR=compatible-openai`, `LLM_URL` (obligatoire,
  http/https), `LLM_CLE` (facultative, `.env` local seulement) ;
  `.env.example` (valeurs vides).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Interface | Inchangée : `genererQuestions(prompt, { delaiMs })` renvoie le JSON brut, validé ensuite par le pipeline (aucune confiance accordée au modèle). |
| D2 | JSON strict | Même principe qu'avec Anthropic : outil imposé dont le schéma décrit exactement la sortie. Pas de réponse en texte libre. |
| D3 | Erreurs | 401 / 403 / 404 / 400 : non récupérables (échec immédiat, pas de reprise) ; 408, 429, 5xx, réseau, délai : récupérables (reprise BullMQ). Messages en français, jamais la clé. |
| D4 | Clé facultative | Un modèle local n'en a pas besoin : sans `LLM_CLE`, aucun en-tête `Authorization`. |
| D5 | Garde d'architecture | Test unitaire : aucun fichier hors de `llm/` n'importe un adaptateur. |
| D6 | Dépendances | Aucune (le `fetch` de Node suffit). |

## Fichiers
- `apps/api/src/modules/assistance-ia/llm/llm-compatible-openai.ts` (+ spec), `llm.provider.ts`
- `apps/api/src/config/configuration.ts`, `env.validation.ts` (+ spec LLM) ; `.env.example`
- `apps/api/test/llm-compatible-openai.e2e-spec.ts` (marqueur `E2E-LLMOAI`)

## Incidents
- `toMatchObject` sur une erreur ignore `message` (propriété non énumérable) :
  assertions réécrites avec `rejects.toThrow(/…/)`.
- Sous Jest, l'erreur d'`AbortSignal.timeout` (DOMException) n'est pas
  `instanceof Error` : le délai est reconnu par son nom.
- e2e : le message d'échec définitif est celui du pipeline (« interrompue
  après plusieurs tentatives… »), pas celui de l'adaptateur ; une seule
  génération en cours par module (deux lancements simultanés -> 202 et 409).

## Vérification
- API : lint 0 erreur / 0 avertissement, `tsc`, unitaires **102 suites / 1 361 tests** (+ 16 :
  requête, en-têtes, outil imposé ; 8 statuts HTTP ; délai et réseau ; réponse
  sans outil ou illisible ; extraction de l'argument ; fabrique ; garde
  d'architecture ; validation de la configuration), aucune migration, e2e
  complet en série **59 suites / 755 tests** (+ 1 ignoré), dont `E2E-LLMOAI` (5 tests sur le VRAI pipeline
  contre un serveur HTTP local : adaptateur choisi par la configuration ;
  génération TERMINEE avec le modèle enregistré et la requête conforme ; 503 ->
  2 tentatives puis ECHEC tracé, formateur prévenu ; 401 -> échec sans reprise ;
  deux lancements simultanés -> un seul accepté).
- Mutations : **8 / 8 tuées** — outil non imposé, clé jamais transmise, clé
  refusée réessayée, 5xx sans reprise, fabrique ignorant l'adaptateur, outil non
  vérifié, JSON illisible accepté, délai pris pour une panne réseau (deux
  mutants réécrits : ils ne compilaient pas).
- Web : aucun changement.

## CI
Voir la PR.

## Suites
- US-CERT-07 : expiration automatique des certificats.
