import { ErreurLlm, FournisseurLlm } from './fournisseur-llm';

export const MODELE_NON_CONFIGURE = 'non-configure';

export const MESSAGE_IA_NON_CONFIGUREE =
  'Aucun fournisseur d’IA n’est configuré : ajoutez ANTHROPIC_API_KEY dans le fichier .env, puis redémarrez l’api.';

/**
 * US-IA-09 — Ni clé ni fournisseur : tout appel échoue TOUT DE SUITE (erreur
 * définitive) avec un message clair, affiché dans la carte de la génération ou
 * de l'import. Jamais de réponse d'exemple silencieuse.
 */
export class LlmNonConfigure implements FournisseurLlm {
  readonly modele = MODELE_NON_CONFIGURE;

  async genererQuestions(): Promise<unknown> {
    throw new ErreurLlm(MESSAGE_IA_NON_CONFIGUREE, false);
  }

  async extraireQuestions(): Promise<unknown> {
    throw new ErreurLlm(MESSAGE_IA_NON_CONFIGUREE, false);
  }

  async analyserPointsFaibles(): Promise<unknown> {
    throw new ErreurLlm(MESSAGE_IA_NON_CONFIGUREE, false);
  }
}
