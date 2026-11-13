import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EtatIaController } from '../src/modules/assistance-ia/llm/etat-ia.controller';
import { FOURNISSEUR_LLM, FournisseurLlm } from '../src/modules/assistance-ia/llm/fournisseur-llm';
import {
  LlmNonConfigure,
  MESSAGE_IA_NON_CONFIGUREE,
} from '../src/modules/assistance-ia/llm/llm-non-configure';

/**
 * US-IA-09 — Ni clé ni fournisseur : l'application démarre, mais tout appel à
 * l'IA est refusé tout de suite avec le message de configuration, et l'état le
 * dit. Jamais de réponse d'exemple silencieuse. (Une application par
 * configuration : la configuration est lue à la compilation du module.)
 */
describe('IA non configurée (e2e) — US-IA-09', () => {
  let moduleRef: TestingModule;
  const avant = { ...process.env };

  beforeAll(async () => {
    process.env.LLM_FOURNISSEUR = '';
    process.env.ANTHROPIC_API_KEY = '';
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  }, 60_000);

  afterAll(async () => {
    await moduleRef.close();
    process.env.LLM_FOURNISSEUR = avant.LLM_FOURNISSEUR;
    process.env.ANTHROPIC_API_KEY = avant.ANTHROPIC_API_KEY;
  });

  it('fournisseur non configuré : génération et extraction refusées, définitivement', async () => {
    const llm = moduleRef.get<FournisseurLlm>(FOURNISSEUR_LLM);
    expect(llm).toBeInstanceOf(LlmNonConfigure);
    await expect(llm.genererQuestions({} as never, { delaiMs: 1000 })).rejects.toMatchObject({
      message: MESSAGE_IA_NON_CONFIGUREE,
      recuperable: false,
    });
    await expect(llm.extraireQuestions({} as never, { delaiMs: 1000 })).rejects.toMatchObject({
      message: MESSAGE_IA_NON_CONFIGUREE,
      recuperable: false,
    });
  });

  it('l’état le dit, avec le message à afficher', () => {
    expect(moduleRef.get(EtatIaController).lire()).toEqual({
      fournisseur: 'non-configure',
      modele: 'non-configure',
      reel: false,
      message: MESSAGE_IA_NON_CONFIGUREE,
    });
  });
});
