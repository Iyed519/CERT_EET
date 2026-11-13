/**
 * US-IA-09 — Environnement des tests e2e : jamais d'appel à un vrai modèle.
 * Le fournisseur factice est demandé EXPLICITEMENT (il n'est plus le défaut)
 * et la clé Anthropic est vidée, pour qu'un `.env` local contenant une vraie
 * clé ne soit ni lu ni facturé pendant les tests. Relancé avant chaque fichier.
 */
process.env.LLM_FOURNISSEUR = process.env.LLM_FOURNISSEUR || 'factice';
// L'essai facultatif contre le vrai Claude (llm-anthropic.e2e-spec.ts) garde la clé
// exportée dans le shell, sous un autre nom, hors de portée de l'application testée.
if (process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY_ESSAI_REEL = process.env.ANTHROPIC_API_KEY;
}
process.env.ANTHROPIC_API_KEY = '';
