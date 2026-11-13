import configuration, { resoudreFournisseurLlm } from './configuration';
import { etatIa, MESSAGE_IA_DEMONSTRATION } from '../modules/assistance-ia/llm/etat-ia.controller';
import { MESSAGE_IA_NON_CONFIGUREE } from '../modules/assistance-ia/llm/llm-non-configure';

const CLE = 'sk-ant-test-0123456789abcdef';

describe('US-IA-09 — résolution du fournisseur d’IA', () => {
  it.each<[string | undefined, string | undefined, string]>([
    ['anthropic', CLE, 'anthropic'],
    [undefined, CLE, 'anthropic'],
    ['', CLE, 'anthropic'],
    ['factice', CLE, 'anthropic'],
    ['compatible-openai', CLE, 'compatible-openai'],
    ['compatible-openai', undefined, 'compatible-openai'],
    ['factice', undefined, 'factice'],
    ['factice', '   ', 'factice'],
    [undefined, undefined, 'non-configure'],
    ['', '', 'non-configure'],
  ])('LLM_FOURNISSEUR=%p, clé=%p -> %s', (demande, cle, attendu) => {
    expect(resoudreFournisseurLlm(demande, cle)).toBe(attendu);
  });

  describe('configuration()', () => {
    const avant = { ...process.env };
    afterEach(() => {
      process.env = { ...avant };
    });
    it('clé présente et factice dans le .env : Claude, modèle par défaut', () => {
      process.env.LLM_FOURNISSEUR = 'factice';
      process.env.ANTHROPIC_API_KEY = CLE;
      delete process.env.LLM_MODELE;
      const { llm } = configuration();
      expect(llm.fournisseur).toBe('anthropic');
      expect(llm.modele).toBe('claude-sonnet-5-5');
    });
    it('ni clé ni fournisseur : non configuré', () => {
      delete process.env.LLM_FOURNISSEUR;
      delete process.env.ANTHROPIC_API_KEY;
      expect(configuration().llm.fournisseur).toBe('non-configure');
    });
  });

  describe('etatIa', () => {
    const base = { cleAnthropic: CLE, urlCompatible: undefined, cle: undefined, delaiMs: 1000, promptMaxCaracteres: 2000 };
    it('Claude branché : réel, sans message, sans clé', () => {
      const etat = etatIa({ ...base, fournisseur: 'anthropic', modele: 'claude-sonnet-5-5' });
      expect(etat).toEqual({ fournisseur: 'anthropic', modele: 'claude-sonnet-5-5', reel: true, message: null });
      expect(JSON.stringify(etat)).not.toContain('sk-ant');
    });
    it('factice : démonstration', () => {
      expect(etatIa({ ...base, fournisseur: 'factice', modele: 'factice-v1' })).toEqual({
        fournisseur: 'factice',
        modele: 'factice',
        reel: false,
        message: MESSAGE_IA_DEMONSTRATION,
      });
    });
    it('non configuré : message de configuration', () => {
      expect(etatIa({ ...base, fournisseur: 'non-configure', modele: 'factice-v1' }).message).toBe(
        MESSAGE_IA_NON_CONFIGUREE,
      );
    });
  });
});
