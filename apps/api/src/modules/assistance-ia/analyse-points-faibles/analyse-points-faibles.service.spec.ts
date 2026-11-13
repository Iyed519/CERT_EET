import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FournisseurEmbeddings } from '../embeddings/fournisseur-embeddings';
import { ErreurLlm, FournisseurLlm } from '../llm/fournisseur-llm';
import { EntreeAnalyse } from './analyse-points-faibles.regles';
import {
  AnalysePointsFaiblesService,
  DELAI_ANALYSE_MAX_MS,
  DELAI_ANALYSE_SYNCHRONE_MS,
  MESSAGE_ANALYSE_ERREUR_INATTENDUE,
} from './analyse-points-faibles.service';

describe('AnalysePointsFaiblesService (US-IA-10)', () => {
  const REPONSE = {
    synthese: 'Validation à revoir.',
    axes: [{ notion: 'Pipes', constat: 'Confusion.', conseil: 'Relire.', questions: [1] }],
    encouragement: 'Courage.',
  };
  const ENTREE: Omit<EntreeAnalyse, 'passages'> = {
    formation: 'F',
    contexte: 'QCM X',
    avecCorrige: false,
    questions: [
      {
        numero: 1,
        enonce: 'Q1 ?',
        type: 'QCU',
        niveau: null,
        verdict: 'FAUX',
        reponseApprenant: ['A'],
        bonnesReponses: null,
        explication: null,
      },
    ],
    ateliers: [],
  };

  let query: jest.Mock;
  let conservees: unknown[];
  let analyser: jest.Mock;
  let vectoriser: jest.Mock;
  let service: AnalysePointsFaiblesService;

  beforeEach(() => {
    conservees = [];
    query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM analyses_ia_tentatives')) return conservees;
      if (sql.includes('FROM segments_support'))
        return [{ support: 'Cours NestJS', texte: 'Les pipes valident les données.' }];
      return [];
    });
    analyser = jest.fn(async () => REPONSE);
    vectoriser = jest.fn(async () => [[0.1, 0.2]]);
    service = new AnalysePointsFaiblesService(
      { query } as unknown as DataSource,
      { get: () => ({ delaiMs: 90_000 }) } as unknown as ConfigService,
      { modele: 'claude-sonnet-5-5', analyserPointsFaibles: analyser } as unknown as FournisseurLlm,
      { modele: 'h', vectoriser } as unknown as FournisseurEmbeddings,
    );
  });

  it('analyse ancrée sur les passages des supports indexés des modules', async () => {
    const r = await service.analyser(ENTREE, ['m1']);
    expect(r).toEqual({
      statut: 'OK',
      source: 'GENEREE',
      analyse: { ...REPONSE, modele: 'claude-sonnet-5-5' },
    });
    const sql = query.mock.calls.find((c) => String(c[0]).includes('segments_support'));
    expect(sql?.[0]).toContain("s.statut = 'INDEXE'");
    expect(sql?.[1][0]).toEqual(['m1']);
    expect(vectoriser).toHaveBeenCalledWith(['Q1 ?'], 'requete');
    const [prompt, options] = analyser.mock.calls[0];
    expect(prompt.utilisateur).toContain('Support « Cours NestJS »');
    expect(options.delaiMs).toBe(DELAI_ANALYSE_MAX_MS);
  });

  it('sans module : aucun passage cherché', async () => {
    await service.analyser(ENTREE, []);
    expect(vectoriser).not.toHaveBeenCalled();
  });

  it('passages indisponibles : l’analyse se fait quand même', async () => {
    vectoriser.mockRejectedValueOnce(new Error('pgvector absent'));
    const r = await service.analyser(ENTREE, ['m1']);
    expect(r.statut).toBe('OK');
    expect(analyser.mock.calls[0][0].utilisateur).toContain('Aucun support de cours indexé');
  });

  it('erreur récupérable : une seule nouvelle tentative', async () => {
    analyser.mockRejectedValueOnce(new ErreurLlm('Surchargé.', true));
    expect((await service.analyser(ENTREE, [])).statut).toBe('OK');
    expect(analyser).toHaveBeenCalledTimes(2);

    analyser.mockReset();
    analyser.mockRejectedValue(new ErreurLlm('Claude est surchargé.', true));
    expect(await service.analyser(ENTREE, [])).toEqual({
      statut: 'INDISPONIBLE',
      message: 'Claude est surchargé.',
    });
    expect(analyser).toHaveBeenCalledTimes(2);
  });

  it('erreur définitive : pas de nouvelle tentative, message du fournisseur', async () => {
    analyser.mockRejectedValue(new ErreurLlm('Crédit Anthropic épuisé.', false));
    expect(await service.analyser(ENTREE, [])).toEqual({
      statut: 'INDISPONIBLE',
      message: 'Crédit Anthropic épuisé.',
    });
    expect(analyser).toHaveBeenCalledTimes(1);
  });

  it('erreur inattendue : message générique (aucun détail technique)', async () => {
    analyser.mockRejectedValue(new Error('ECONNRESET 10.0.0.3'));
    expect(await service.analyser(ENTREE, [])).toEqual({
      statut: 'INDISPONIBLE',
      message: MESSAGE_ANALYSE_ERREUR_INATTENDUE,
    });
  });

  describe('pourTentative : conservée par tentative et version', () => {
    it('déjà conservée : réutilisée, aucun appel au modèle', async () => {
      conservees = [{ contenu: { ...REPONSE, modele: 'claude-sonnet-5-5' } }];
      const r = await service.pourTentative('t1', ENTREE, ['m1']);
      expect(r).toEqual({
        statut: 'OK',
        source: 'CACHE',
        analyse: { ...REPONSE, modele: 'claude-sonnet-5-5' },
      });
      expect(analyser).not.toHaveBeenCalled();
      expect(query.mock.calls[0][1]).toEqual(['t1', false]);
    });

    it('réussie : conservée (ON CONFLICT DO NOTHING)', async () => {
      await service.pourTentative('t1', ENTREE, []);
      const insert = query.mock.calls.find((c) => String(c[0]).trim().startsWith('INSERT'));
      expect(insert?.[0]).toContain('ON CONFLICT DO NOTHING');
      expect(insert?.[1].slice(0, 3)).toEqual(['t1', false, 'claude-sonnet-5-5']);
    });

    it('synchrone (requête HTTP) : un seul essai de 45 s, même si l’erreur est récupérable', async () => {
      analyser.mockRejectedValue(new ErreurLlm('Claude est surchargé.', true));
      const r = await service.pourTentative('t1', ENTREE, []);
      expect(r).toEqual({ statut: 'INDISPONIBLE', message: 'Claude est surchargé.' });
      expect(analyser).toHaveBeenCalledTimes(1);
      expect(analyser.mock.calls[0][1].delaiMs).toBe(DELAI_ANALYSE_SYNCHRONE_MS);
    });

    it('échec : rien n’est conservé (le prochain téléchargement réessaie)', async () => {
      analyser.mockRejectedValue(new ErreurLlm('Clé refusée.', false));
      const r = await service.pourTentative('t1', ENTREE, []);
      expect(r.statut).toBe('INDISPONIBLE');
      expect(query.mock.calls.some((c) => String(c[0]).trim().startsWith('INSERT'))).toBe(false);
    });
  });
});
