import {
  construirePrompt,
  validerReponse,
} from '../src/modules/assistance-ia/generations/pipeline.regles';
import { LlmAnthropic } from '../src/modules/assistance-ia/llm/llm-anthropic';

/**
 * Essai FACULTATIF contre la vraie API Anthropic (US-IA-03) : ne tourne que
 * si ANTHROPIC_API_KEY est définie (jamais en CI, jamais de clé committée).
 * Vérifie que le modèle configuré répond par l'outil imposé et que la
 * validation serveur retient des questions conformes.
 */
const cle = process.env.ANTHROPIC_API_KEY;
const decrire = cle ? describe : describe.skip;

decrire('Fournisseur Anthropic réel (essai facultatif) — US-IA-03', () => {
  it('trois questions conformes à partir de deux passages', async () => {
    const llm = new LlmAnthropic(cle as string, process.env.LLM_MODELE || 'claude-sonnet-5-5');
    const brute = await llm.genererQuestions(
      construirePrompt({
        passages: [
          {
            numero: 1,
            texte:
              'Un jeton JWT comporte un en-tête, une charge utile et une signature. La signature ' +
              'RS256 est produite avec la clé privée du serveur et vérifiée avec sa clé publique.',
          },
          {
            numero: 2,
            texte:
              'Le jeton de rafraîchissement est renouvelé à chaque usage : réutiliser un ancien ' +
              'jeton révèle un vol de session et révoque toute la famille de jetons.',
          },
        ],
        nbQuestions: 3,
        types: ['QCU', 'VRAI_FAUX'],
        niveau: 'INTERMEDIAIRE',
        focus: null,
        titreSupport: 'Sécurité des API',
      }),
      { delaiMs: 90_000 },
    );
    const r = validerReponse(brute, {
      types: ['QCU', 'VRAI_FAUX'],
      nbDemandees: 3,
      numerosPassages: new Set([1, 2]),
    });
    expect(r?.valides.length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
