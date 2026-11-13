import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EtatIaController } from '../src/modules/assistance-ia/llm/etat-ia.controller';
import { FOURNISSEUR_LLM } from '../src/modules/assistance-ia/llm/fournisseur-llm';
import { LlmAnthropic } from '../src/modules/assistance-ia/llm/llm-anthropic';

/**
 * US-IA-09 — Une clé Anthropic dans le .env PRIME, même si LLM_FOURNISSEUR vaut
 * encore « factice » (ancien .env.example) : Claude est appelé. Aucun appel
 * réseau ici : on vérifie l'adaptateur choisi et l'état, qui ne renvoie jamais
 * la clé.
 */
describe('La clé Anthropic prime (e2e) — US-IA-09', () => {
  const CLE = 'sk-ant-e2e-cleprime-0123456789abcdef';
  let moduleRef: TestingModule;
  const avant = { ...process.env };

  beforeAll(async () => {
    process.env.LLM_FOURNISSEUR = 'factice';
    process.env.ANTHROPIC_API_KEY = CLE;
    process.env.LLM_MODELE = '';
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  }, 60_000);

  afterAll(async () => {
    await moduleRef.close();
    process.env.LLM_FOURNISSEUR = avant.LLM_FOURNISSEUR;
    process.env.ANTHROPIC_API_KEY = avant.ANTHROPIC_API_KEY;
    if (avant.LLM_MODELE === undefined) delete process.env.LLM_MODELE;
    else process.env.LLM_MODELE = avant.LLM_MODELE;
  });

  it('LLM_FOURNISSEUR=factice + clé : Claude (modèle par défaut)', () => {
    const llm = moduleRef.get<LlmAnthropic>(FOURNISSEUR_LLM);
    expect(llm).toBeInstanceOf(LlmAnthropic);
    expect(llm.modele).toBe('claude-sonnet-5-5');
  });

  it('état : réel, sans message, sans clé', () => {
    const etat = moduleRef.get(EtatIaController).lire();
    expect(etat).toEqual({
      fournisseur: 'anthropic',
      modele: 'claude-sonnet-5-5',
      reel: true,
      message: null,
    });
    expect(JSON.stringify(etat)).not.toContain('sk-ant');
  });
});
