import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TracabiliteGenerationsService } from './tracabilite-generations.service';

describe('TracabiliteGenerationsService (US-IA-05)', () => {
  let query: jest.Mock;
  let service: TracabiliteGenerationsService;
  const ligne = {
    id: 'g-1',
    statut: 'TERMINEE',
    decompte: [{ statut: 'ACCEPTEE', n: 2 }],
  };

  beforeEach(() => {
    query = jest.fn();
    service = new TracabiliteGenerationsService({ query } as unknown as DataSource);
  });

  it('lister : filtres paramétrés, plus récentes d’abord, page et décompte', async () => {
    query.mockResolvedValueOnce([{ total: 41 }]).mockResolvedValueOnce([ligne]);
    const r = await service.lister({
      formateurId: 'f-1',
      formationId: 'fo-1',
      statut: 'ECHEC',
      du: '2005-03-01T00:00:00Z',
      au: '2005-03-31T00:00:00Z',
      page: 3,
      limite: 20,
    });
    const [sqlTotal, params] = query.mock.calls[0];
    expect(sqlTotal).toContain('g.formateur_id = $1');
    expect(sqlTotal).toContain('m.formation_id = $2');
    expect(sqlTotal).toContain('g.statut::text = $3');
    expect(sqlTotal).toContain('g.date_lancement >= $4');
    expect(sqlTotal).toContain('g.date_lancement <= $5');
    expect(params).toEqual([
      'f-1',
      'fo-1',
      'ECHEC',
      '2005-03-01T00:00:00Z',
      '2005-03-31T00:00:00Z',
    ]);
    const [sqlPage, paramsPage] = query.mock.calls[1];
    expect(sqlPage).toContain('ORDER BY g.date_lancement DESC, g.id DESC');
    expect(paramsPage.slice(5)).toEqual([20, 40]);
    expect(r).toMatchObject({ total: 41, page: 3, limite: 20 });
    expect(r.generations[0].decisions).toEqual({
      proposees: 0,
      acceptees: 2,
      modifiees: 0,
      rejetees: 0,
    });
    expect(r.generations[0]).not.toHaveProperty('decompte');
  });

  it('lister : sans filtre, page 1 de 20', async () => {
    query.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await service.lister({});
    expect(query.mock.calls[0][1]).toEqual([null, null, null, null, null]);
    expect(query.mock.calls[1][1].slice(5)).toEqual([20, 0]);
  });

  it('lister : période inversée -> 400 avant toute requête', async () => {
    await expect(
      service.lister({ du: '2005-04-01T00:00:00Z', au: '2005-03-01T00:00:00Z' }),
    ).rejects.toThrow('La date de début doit précéder la date de fin.');
    expect(query).not.toHaveBeenCalled();
  });

  it('detail : 404 si inconnue', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.detail('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('detail : suggestions par ordre, historique filtré sur la génération et ses suggestions', async () => {
    query
      .mockResolvedValueOnce([ligne])
      .mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }])
      .mockResolvedValueOnce([{ action: 'SUGGESTION_ACCEPTEE' }]);
    const d = await service.detail('g-1');
    expect(query.mock.calls[1][0]).toContain('ORDER BY sg.ordre');
    const [sqlHisto, paramsHisto] = query.mock.calls[2];
    expect(sqlHisto).toContain('a.action = ANY($2)');
    expect(sqlHisto).toContain('ORDER BY a.horodatage, a.id');
    expect(paramsHisto[0]).toBe('g-1');
    expect(paramsHisto[1]).toEqual(
      expect.arrayContaining(['GENERATION_IA_LANCEE', 'SUGGESTION_REJETEE']),
    );
    expect(paramsHisto[2]).toEqual(['s-1', 's-2']);
    expect(d.suggestions).toHaveLength(2);
    expect(d.historique).toEqual([{ action: 'SUGGESTION_ACCEPTEE' }]);
  });
});
