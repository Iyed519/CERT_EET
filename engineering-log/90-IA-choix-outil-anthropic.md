# Correctif IA — génération refusée par Claude (choix d'outil forcé)

## En une phrase
Avec la vraie clé Anthropic, toute génération de questions échouait
(« Requête refusée par le fournisseur d’IA. ») : le modèle
`claude-sonnet-5-5` refuse un `tool_choice` forcé ; l'appel laisse désormais
le choix d'outil en `auto` et l'erreur affiche le motif donné par l'API.

## Diagnostic
- Clé, crédit et modèle valides : `GET /v1/models` et un `POST /v1/messages`
  simple répondent 200.
- La même requête que l'application (outil `proposer_questions`, schéma
  `SCHEMA_QUESTIONS`, `tool_choice` forcé) répond **400** :
  `tool_choice: type "tool" and "any" are not supported for this model.`
- Les tests ne pouvaient pas le voir : ils simulent le SDK (fournisseur
  `factice` en e2e).

## Décisions
| # | Point | Décision |
|---|---|---|
| D1 | Choix d'outil | `tool_choice: { type: 'auto' }`. Le prompt impose déjà l'outil (consigne 6 de `pipeline.regles.ts`) et une réponse sans appel d'outil reste une erreur récupérable, réessayée par BullMQ. Le schéma est inchangé. |
| D2 | Motif | Pour un 400, le message de l'API (jamais la clé) est recopié, tronqué à 200 caractères : visible dans l'écran « Supports pour l'IA » et le journal de la génération. Sans motif exploitable : message générique. |
| D3 | Compatible OpenAI | Inchangé : `tool_choice` « function » reste admis par ces serveurs. |

## Fichiers
- `apps/api/src/modules/assistance-ia/llm/llm-anthropic.ts`
- `apps/api/src/modules/assistance-ia/llm/llm.spec.ts`

## Vérification
- Api : lint 0 avertissement, `tsc`, unitaires **117 suites / 1 470 tests**.
- Mutations manuelles 8/8 tuées (choix forcé rétabli, troncature, motif non
  textuel, motif vide, repli générique).
- E2e non concernés (fournisseur `factice`).
- Recette : relancer une génération sur le support « cours-nestjs » avec la
  vraie clé.
