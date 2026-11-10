import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { TentativeQcm } from '../../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { TentativeCorrectionService } from '../tentative-correction.service';
import { TentativeTirageService } from '../tentative-tirage.service';
import { HistoriqueTentativesService } from './historique-tentatives.service';

describe('HistoriqueTentativesService (US-QCM-11)', () => {
  const ligne = (statut: string): Record<string, unknown> => ({
    id: 't-1',
    qcmId: 'qcm-1',
    statut,
    score: 80,
    estReussie: true,
    numero: 2,
    apprenant: { id: 'a-1', prenom: 'A', nom: 'B', email: 'a@x' },
  });
  let query: jest.Mock;
  let find: jest.Mock;
  let findOne: jest.Mock;
  let etat: jest.Mock;
  let lireCorrection: jest.Mock;
  let presenter: jest.Mock;
  let service: HistoriqueTentativesService;

  beforeEach(() => {
    query = jest.fn();
    find = jest.fn().mockResolvedValue([]);
    findOne = jest.fn();
    etat = jest.fn().mockResolvedValue({ disponible: false, raison: 'correction_differee' });
    lireCorrection = jest.fn().mockResolvedValue([{ id: 'q1', options: [] }]);
    presenter = jest.fn().mockResolvedValue([{ id: 'q1', enonce: 'E', options: [] }]);
    service = new HistoriqueTentativesService(
      { query, manager: { find } } as unknown as DataSource,
      { findOne } as unknown as Repository<TentativeQcm>,
      { etat, lireCorrection } as unknown as TentativeCorrectionService,
      { presenter } as unknown as TentativeTirageService,
    );
  });

  it('mesTentatives : filtrées par l’apprenant (et le QCM), sans bloc apprenant', async () => {
    query.mockResolvedValue([ligne('NOTEE')]);
    const r = await service.mesTentatives('a-1', 'qcm-1');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('t.apprenant_id = $1 AND ($2::uuid IS NULL OR t.qcm_id = $2)');
    expect(sql).toContain('PARTITION BY t.apprenant_id, t.qcm_id');
    expect(sql).toMatch(/\(t\.apprenant_id, t\.qcm_id\) IN/);
    expect(sql).toContain('ORDER BY h."dateDebut" DESC');
    expect(params).toEqual(['a-1', 'qcm-1']);
    expect(r[0]).not.toHaveProperty('apprenant');
    expect(r[0].score).toBe(80);
  });

  it('score et réussite masqués tant que la tentative n’est pas NOTEE', async () => {
    query.mockResolvedValue([ligne('SOUMISE')]);
    const [l] = await service.mesTentatives('a-1');
    expect(l.score).toBeNull();
    expect(l.estReussie).toBeNull();
    expect(query.mock.calls[0][1]).toEqual(['a-1', null]);
  });

  it('monDetail : tentative d’un autre -> 404', async () => {
    query.mockResolvedValue([]);
    await expect(service.monDetail('a-1', 't-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0][1]).toEqual(['t-x', 'a-1']);
  });

  it('monDetail : questions vues et choix, jamais le corrigé ; état du corrigé', async () => {
    query
      .mockResolvedValueOnce([ligne('NOTEE')])
      .mockResolvedValueOnce([{ maintenant: new Date() }]);
    findOne.mockResolvedValue({
      id: 't-1',
      statut: StatutTentative.NOTEE,
      planTirage: [{ questionId: 'q1', optionIds: ['o2', 'o1'] }],
      qcm: { configuration: { affichageResultats: 'DIFFERE' } },
    });
    find.mockResolvedValue([
      { questionId: 'q1', optionsSelectionnees: [{ optionId: 'o1' }, { optionId: 'o2' }] },
    ]);
    const d = await service.monDetail('a-1', 't-1');
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1', apprenantId: 'a-1' } }),
    );
    expect(d.reponses).toEqual({ q1: ['o2', 'o1'] });
    expect(d.questions).toEqual([{ id: 'q1', enonce: 'E', options: [] }]);
    expect(d.correction).toEqual({ disponible: false, raison: 'correction_differee' });
    expect(lireCorrection).not.toHaveBeenCalled();
    expect(d).not.toHaveProperty('apprenant');
  });

  it('monDetail : tentative EN_COURS -> aucun contenu', async () => {
    query
      .mockResolvedValueOnce([ligne('EN_COURS')])
      .mockResolvedValueOnce([{ maintenant: new Date() }]);
    findOne.mockResolvedValue({
      id: 't-1',
      statut: StatutTentative.EN_COURS,
      planTirage: [{ questionId: 'q1', optionIds: ['o1'] }],
      qcm: { configuration: {} },
    });
    const d = await service.monDetail('a-1', 't-1');
    expect(d.questions).toEqual([]);
    expect(d.reponses).toEqual({});
    expect(presenter).not.toHaveBeenCalled();
  });

  it('tentativesDuQcm et detailFormateur : filtrées par le QCM ; corrigé complet', async () => {
    query.mockResolvedValue([ligne('NOTEE')]);
    await service.tentativesDuQcm('qcm-1', 'a-1');
    expect(query.mock.calls[0][0]).toContain(
      't.qcm_id = $1 AND ($2::uuid IS NULL OR t.apprenant_id = $2)',
    );
    expect(query.mock.calls[0][1]).toEqual(['qcm-1', 'a-1']);

    findOne.mockResolvedValue({ id: 't-1', planTirage: [{ questionId: 'q1', optionIds: [] }] });
    const d = await service.detailFormateur('qcm-1', 't-1');
    expect(query.mock.calls[1][1]).toEqual(['t-1', 'qcm-1']);
    expect(lireCorrection).toHaveBeenCalledWith(expect.anything(), 't-1', [
      { questionId: 'q1', optionIds: [] },
    ]);
    expect(d.questions).toEqual([{ id: 'q1', options: [] }]);
    expect(d.apprenant).toEqual({ id: 'a-1', prenom: 'A', nom: 'B', email: 'a@x' });
  });

  it('detailFormateur : tentative d’un autre QCM -> 404', async () => {
    query.mockResolvedValue([]);
    await expect(service.detailFormateur('qcm-1', 't-9')).rejects.toBeInstanceOf(NotFoundException);
    expect(lireCorrection).not.toHaveBeenCalled();
  });
});
