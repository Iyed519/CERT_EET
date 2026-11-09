import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { Question } from '../../database/entities/question.entity';
import { Reponse } from '../../database/entities/reponse.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { EligibiliteService } from '../certificats/eligibilite.service';
import { AuditService } from '../audit/audit.service';
import { TentativeNotationService } from './tentative-notation.service';

/**
 * Tests unitaires de la notation (US-QCM-08) : verrou de la ligne, seules les
 * tentatives SOUMISE / ABANDONNEE_TIMER sont notées (jamais de renotation),
 * correction écrite sur chaque réponse AVANT le passage NOTEE, seuil lu au
 * moment de la notation, taux d'avancement sous verrou de l'inscription,
 * audit après COMMIT, rattrapage. Le SQL réel est joué par les tests e2e.
 */
describe('TentativeNotationService', () => {
  const PLAN = [
    { questionId: 'q1', optionIds: ['a', 'b'] },
    { questionId: 'q2', optionIds: ['c', 'd'] },
  ];

  let service: TentativeNotationService;
  let tentative: Partial<TentativeQcm> | null;
  let configuration: { scoreMinValidation: number } | null;
  let manager: { findOne: jest.Mock; find: jest.Mock; query: jest.Mock; update: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock; query: jest.Mock };
  let repository: { find: jest.Mock };
  let auditService: { record: jest.Mock };
  let eligibilite: { declencherSansEchec: jest.Mock };

  beforeEach(async () => {
    tentative = {
      id: 't-1',
      apprenantId: 'appr-1',
      qcmId: 'qcm-1',
      statut: StatutTentative.SOUMISE,
      planTirage: PLAN,
    };
    configuration = { scoreMinValidation: 50 };
    manager = {
      findOne: jest.fn((entite: unknown) =>
        Promise.resolve(entite === TentativeQcm ? tentative : configuration),
      ),
      find: jest.fn((entite: unknown) =>
        Promise.resolve(
          entite === Question
            ? [
                { id: 'q1', ponderation: 1 },
                { id: 'q2', ponderation: 3 },
              ]
            : // Réponses : q1 juste (a), q2 fausse (d).
              [
                { id: 'r1', questionId: 'q1', optionsSelectionnees: [{ optionId: 'a' }] },
                { id: 'r2', questionId: 'q2', optionsSelectionnees: [{ optionId: 'd' }] },
              ],
        ),
      ),
      query: jest.fn((sql: string) => {
        if (sql.includes('FROM options')) {
          return Promise.resolve([
            { id: 'a', questionId: 'q1' },
            { id: 'c', questionId: 'q2' },
          ]);
        }
        if (sql.includes('FOR UPDATE OF i')) {
          return Promise.resolve([{ id: 'insc-1', formationId: 'form-1' }]);
        }
        if (sql.includes('COUNT(*)')) return Promise.resolve([{ publies: 2, reussis: 0 }]);
        return Promise.resolve([]);
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    repository = { find: jest.fn().mockResolvedValue([]) };
    dataSource = {
      transaction: jest.fn((travail: (m: typeof manager) => Promise<unknown>) => travail(manager)),
      getRepository: jest.fn().mockReturnValue(repository),
      query: jest.fn().mockResolvedValue([{ formation_id: 'form-1' }]),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    eligibilite = { declencherSansEchec: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeNotationService,
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: EligibiliteService, useValue: eligibilite },
      ],
    }).compile();
    service = moduleRef.get(TentativeNotationService);
  });

  it('verrouille la tentative et ne lit JAMAIS est_correcte autrement qu’en requête explicite', async () => {
    await service.noter('t-1', 'appr-1');
    expect(manager.findOne).toHaveBeenCalledWith(TentativeQcm, {
      where: { id: 't-1' },
      lock: { mode: 'pessimistic_write' },
    });
    const [sql, parametres] = manager.query.mock.calls.find(([q]) => q.includes('FROM options'));
    expect(sql).toMatch(/est_correcte = true/);
    expect(parametres).toEqual([['q1', 'q2']]);
  });

  it('note : réponses corrigées, puis NOTEE avec score et réussite, puis avancement', async () => {
    const resultat = await service.noter('t-1', 'appr-1');

    // 1 point sur 4 -> 25 %, seuil 50 -> échoué.
    expect(resultat).toEqual({
      tentativeId: 't-1',
      score: 25,
      estReussie: false,
      nbQuestions: 2,
      nbCorrectes: 1,
    });
    expect(manager.update.mock.calls).toEqual([
      [Reponse, { id: 'r1' }, { estCorrecte: true, pointsObtenus: 1 }],
      [Reponse, { id: 'r2' }, { estCorrecte: false, pointsObtenus: 0 }],
      [
        TentativeQcm,
        { id: 't-1' },
        { statut: StatutTentative.NOTEE, score: 25, estReussie: false },
      ],
    ]);
    // Seuil lu au moment de la notation.
    expect(manager.findOne).toHaveBeenCalledWith(ConfigurationAntiFraude, {
      where: { qcmId: 'qcm-1' },
      select: { id: true, scoreMinValidation: true },
    });
    // Avancement : inscription verrouillée, puis 0 réussi sur 2 publiés.
    const sqls = manager.query.mock.calls.map(([q]) => q as string);
    expect(sqls.findIndex((q) => q.includes('FOR UPDATE OF i'))).toBeLessThan(
      sqls.findIndex((q) => q.includes('COUNT(*)')),
    );
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE inscriptions SET taux_avancement = $2 WHERE id = $1',
      ['insc-1', 0],
    );
  });

  it('réussite dès que le score atteint le seuil', async () => {
    configuration = { scoreMinValidation: 25 };
    await expect(service.noter('t-1', 'appr-1')).resolves.toMatchObject({ estReussie: true });
  });

  it('audit TENTATIVE_NOTEE après la transaction, acteur transmis', async () => {
    await service.noter('t-1', null);
    expect(auditService.record).toHaveBeenCalledWith({
      action: 'TENTATIVE_NOTEE',
      acteur: null,
      cible: 't-1',
      adresseIp: null,
      resultat: 'Succès',
      detailsAvantApres: {
        apprenantId: 'appr-1',
        qcmId: 'qcm-1',
        statut: { avant: StatutTentative.SOUMISE, apres: StatutTentative.NOTEE },
        score: 25,
        estReussie: false,
        scoreMinValidation: 50,
        nbQuestions: 2,
        nbCorrectes: 1,
        tauxAvancement: 0,
      },
    });
    expect(auditService.record.mock.invocationCallOrder[0]).toBeGreaterThan(
      dataSource.transaction.mock.invocationCallOrder[0],
    );
  });

  it('note aussi une tentative ABANDONNEE_TIMER (réponses partielles, ET-02)', async () => {
    tentative = { ...tentative, statut: StatutTentative.ABANDONNEE_TIMER };
    await expect(service.noter('t-1', 'appr-1')).resolves.not.toBeNull();
  });

  it.each([StatutTentative.NOTEE, StatutTentative.EN_COURS])(
    'ne note jamais une tentative %s : null, rien d’écrit, aucun audit',
    async (statut) => {
      tentative = { ...tentative, statut };
      await expect(service.noter('t-1', 'appr-1')).resolves.toBeNull();
      expect(manager.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    },
  );

  it('tentative inconnue : null', async () => {
    tentative = null;
    await expect(service.noter('t-1', 'appr-1')).resolves.toBeNull();
  });

  it('sans inscription à la formation : notée quand même, avancement null', async () => {
    manager.query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('FROM options') ? [{ id: 'a', questionId: 'q1' }] : []),
    );
    await service.noter('t-1', 'appr-1');
    expect(auditService.record.mock.calls[0][0].detailsAvantApres.tauxAvancement).toBeNull();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE inscriptions'),
      expect.anything(),
    );
  });

  it('un audit en panne n’annule pas la note', async () => {
    auditService.record.mockRejectedValue(new Error('audit indisponible'));
    await expect(service.noter('t-1', 'appr-1')).resolves.toMatchObject({ score: 25 });
  });

  it('noterSansEchec : une erreur de base est journalisée, null', async () => {
    dataSource.transaction.mockRejectedValue(new Error('base indisponible'));
    await expect(service.noterSansEchec('t-1', 'appr-1')).resolves.toBeNull();
  });

  it('rattrapage : note les tentatives en attente, par lot, sans acteur', async () => {
    repository.find.mockResolvedValue([{ id: 't-1' }, { id: 't-2' }]);
    const notees = await service.noterEnAttente(10);
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true }, take: 10 }),
    );
    expect(notees).toEqual(['t-1', 't-2']);
    expect(auditService.record.mock.calls.map(([e]) => e.acteur)).toEqual([null, null]);
  });

  describe('éligibilité à la certification (US-ATEL-09)', () => {
    it('tentative réussie : évalue l’éligibilité de l’apprenant pour sa formation', async () => {
      configuration = { scoreMinValidation: 20 };
      const resultat = await service.noter('t-1', 'appr-1');
      expect(resultat?.estReussie).toBe(true);
      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('JOIN qcm q'), ['t-1']);
      expect(eligibilite.declencherSansEchec).toHaveBeenCalledWith(
        'appr-1',
        'form-1',
        'TENTATIVE_NOTEE',
      );
    });

    it('tentative échouée : aucune évaluation', async () => {
      configuration = { scoreMinValidation: 90 };
      const resultat = await service.noter('t-1', 'appr-1');
      expect(resultat?.estReussie).toBe(false);
      expect(eligibilite.declencherSansEchec).not.toHaveBeenCalled();
    });
  });
});
