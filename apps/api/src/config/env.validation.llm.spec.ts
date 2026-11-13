import { envValidationSchema } from './env.validation';

/**
 * Variables du fournisseur de LLM (US-IA-03) : `anthropic` sans clé refuse le
 * démarrage ; `factice` par défaut, sans clé.
 */
describe('envValidationSchema — LLM (US-IA-03)', () => {
  const valider = (
    env: Record<string, string>,
  ): { erreur?: string; valeur: Record<string, unknown> } => {
    const { error, value } = envValidationSchema.validate(env, {
      allowUnknown: true,
      abortEarly: false,
    });
    const erreurLlm = error?.details.find((d) => /LLM|ANTHROPIC/.test(String(d.path[0])));
    return { erreur: erreurLlm?.message, valeur: value as Record<string, unknown> };
  };

  it('par défaut : aucun fournisseur imposé (US-IA-09), délai et taille de prompt par défaut', () => {
    const { erreur, valeur } = valider({});
    expect(erreur).toBeUndefined();
    expect(valeur.LLM_FOURNISSEUR).toBeUndefined();
    expect(valider({ LLM_FOURNISSEUR: '' }).erreur).toBeUndefined();
    expect(valeur).toMatchObject({
      LLM_DELAI_MS: 90000,
      LLM_PROMPT_MAX_CARACTERES: 24000,
    });
  });

  it.each([
    ['clé absente', {}],
    ['clé vide', { ANTHROPIC_API_KEY: '' }],
  ])('anthropic avec %s : démarrage refusé', (_cas, env) => {
    expect(valider({ LLM_FOURNISSEUR: 'anthropic', ...env }).erreur).toBe(
      'ANTHROPIC_API_KEY est obligatoire avec LLM_FOURNISSEUR=anthropic.',
    );
  });

  it('anthropic avec une clé trop courte : refusé ; avec une clé : accepté', () => {
    expect(
      valider({ LLM_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'court' }).erreur,
    ).toBeDefined();
    expect(
      valider({ LLM_FOURNISSEUR: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test-0123456789abcdef' })
        .erreur,
    ).toBeUndefined();
  });

  it('fournisseur inconnu, délai hors bornes : refusés', () => {
    expect(valider({ LLM_FOURNISSEUR: 'openai' }).erreur).toBeDefined();
    expect(valider({ LLM_DELAI_MS: '10' }).erreur).toBeDefined();
  });

  it('US-IA-06 — compatible-openai : LLM_URL obligatoire (http/https), clé facultative', () => {
    expect(valider({ LLM_FOURNISSEUR: 'compatible-openai' }).erreur).toBe(
      'LLM_URL est obligatoire avec LLM_FOURNISSEUR=compatible-openai.',
    );
    expect(
      valider({ LLM_FOURNISSEUR: 'compatible-openai', LLM_URL: 'ftp://x.tn/v1' }).erreur,
    ).toBeDefined();
    expect(
      valider({ LLM_FOURNISSEUR: 'compatible-openai', LLM_URL: 'http://localhost:8000/v1' }).erreur,
    ).toBeUndefined();
    expect(
      valider({
        LLM_FOURNISSEUR: 'compatible-openai',
        LLM_URL: 'https://api.mistral.ai/v1',
        LLM_CLE: 'cle-de-test',
      }).erreur,
    ).toBeUndefined();
  });
});
