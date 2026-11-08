import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';
import { TentativeBalayageService } from './tentative-balayage.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';
import { TentativeNotationService } from './tentative-notation.service';
import { TentativeSessionService } from './tentative-session.service';

/**
 * Tests unitaires du balayage des tentatives échues (US-QCM-07, D2, D11,
 * D12) : une requête conditionnelle avec délai de grâce, un audit SYSTÈME
 * par tentative clôturée, clé Redis supprimée, minuteur désactivé en test ou
 * par la configuration. La requête elle-même est jouée sur la vraie base par
 * les tests e2e.
 */
describe('TentativeBalayageService', () => {
  const LIMITE = new Date('2026-11-02T10:30:00Z');
  const LIGNES = [
    { id: 't-1', apprenant_id: 'appr-1', qcm_id: 'qcm-1', date_limite: LIMITE },
    { id: 't-2', apprenant_id: 'appr-2', qcm_id: 'qcm-1', date_limite: LIMITE },
  ];

  let service: TentativeBalayageService;
  let dataSource: { query: jest.Mock };
  let auditService: { record: jest.Mock };
  let minuterie: { effacer: jest.Mock };
  let session: { effacerMiroir: jest.Mock };
  let notation: { noterEnAttente: jest.Mock };
  let config: { app: { nodeEnv: string }; minuterie: Record<string, unknown> };

  const creer = async (): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeBalayageService,
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: TentativeMinuterieService, useValue: minuterie },
        { provide: TentativeNotationService, useValue: notation },
        { provide: TentativeSessionService, useValue: session },
        {
          provide: ConfigService,
          useValue: { getOrThrow: (cle: keyof typeof config): unknown => config[cle] },
        },
      ],
    }).compile();
    service = moduleRef.get(TentativeBalayageService);
  };

  beforeEach(async () => {
    // Forme renvoyée par le pilote PostgreSQL de TypeORM pour un UPDATE … RETURNING.
    dataSource = { query: jest.fn().mockResolvedValue([LIGNES, 2]) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    minuterie = { effacer: jest.fn().mockResolvedValue(undefined) };
    session = { effacerMiroir: jest.fn().mockResolvedValue(undefined) };
    notation = { noterEnAttente: jest.fn().mockResolvedValue([]) };
    config = {
      app: { nodeEnv: 'development' },
      minuterie: { balayageActif: true, intervalleSecondes: 60, delaiGraceSecondes: 30 },
    };
    await creer();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('une seule requête conditionnelle : EN_COURS échues depuis plus que la grâce', async () => {
    await expect(service.balayer()).resolves.toEqual(['t-1', 't-2']);
    const [sql, parametres] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE tentatives_qcm/);
    expect(sql).toMatch(/date_fin = date_limite/);
    expect(sql).toMatch(
      /WHERE statut = \$2\s+AND date_limite <= now\(\) - make_interval\(secs => \$3\)/,
    );
    expect(sql).toMatch(/RETURNING/);
    expect(parametres).toEqual([StatutTentative.ABANDONNEE_TIMER, StatutTentative.EN_COURS, 30]);
  });

  it('accepte un délai de grâce explicite (tests)', async () => {
    await service.balayer(0);
    expect(dataSource.query.mock.calls[0][1]).toEqual([
      StatutTentative.ABANDONNEE_TIMER,
      StatutTentative.EN_COURS,
      0,
    ]);
  });

  it('audit SYSTÈME (sans acteur) et clé Redis supprimée pour chaque tentative clôturée', async () => {
    await service.balayer();
    expect(auditService.record).toHaveBeenCalledTimes(2);
    expect(auditService.record).toHaveBeenCalledWith({
      action: 'TENTATIVE_EXPIREE',
      acteur: null,
      cible: 't-1',
      adresseIp: null,
      resultat: 'Succès',
      detailsAvantApres: {
        apprenantId: 'appr-1',
        qcmId: 'qcm-1',
        statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.ABANDONNEE_TIMER },
        dateLimite: LIMITE,
        cause: 'balayage',
      },
    });
    expect(minuterie.effacer.mock.calls).toEqual([['t-1'], ['t-2']]);
    // Miroir du verrou de session supprimé aussi (US-QCM-10).
    expect(session.effacerMiroir.mock.calls).toEqual([
      ['appr-1', 'qcm-1'],
      ['appr-2', 'qcm-1'],
    ]);
    // Puis rattrapage de la notation (US-QCM-08), après les clôtures.
    expect(notation.noterEnAttente).toHaveBeenCalledTimes(1);
    expect(notation.noterEnAttente.mock.invocationCallOrder[0]).toBeGreaterThan(
      minuterie.effacer.mock.invocationCallOrder[1],
    );
  });

  it('rien à clôturer : ni audit ni Redis, mais le rattrapage de la notation passe', async () => {
    dataSource.query.mockResolvedValue([[], 0]);
    await expect(service.balayer()).resolves.toEqual([]);
    expect(auditService.record).not.toHaveBeenCalled();
    expect(minuterie.effacer).not.toHaveBeenCalled();
    expect(notation.noterEnAttente).toHaveBeenCalledTimes(1);
  });

  it('un audit en panne n’empêche pas les suivants', async () => {
    auditService.record.mockRejectedValueOnce(new Error('audit indisponible'));
    await expect(service.balayer()).resolves.toEqual(['t-1', 't-2']);
    expect(auditService.record).toHaveBeenCalledTimes(2);
    expect(minuterie.effacer).toHaveBeenCalledTimes(2);
  });

  describe('minuteur', () => {
    it('tourne toutes les intervalleSecondes hors test', async () => {
      jest.useFakeTimers();
      service.onModuleInit();
      expect(dataSource.query).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(dataSource.query).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(120_000);
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('une erreur de base est journalisée, le minuteur continue', async () => {
      jest.useFakeTimers();
      dataSource.query.mockRejectedValueOnce(new Error('base indisponible'));
      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(60_000);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(dataSource.query).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['NODE_ENV=test', { app: { nodeEnv: 'test' } }],
      [
        'MINUTERIE_BALAYAGE_ACTIF=false',
        { minuterie: { balayageActif: false, intervalleSecondes: 60, delaiGraceSecondes: 30 } },
      ],
    ])('désactivé avec %s', async (_cas, surcharge) => {
      config = { ...config, ...surcharge } as typeof config;
      await creer();
      jest.useFakeTimers();
      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(180_000);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });
});
