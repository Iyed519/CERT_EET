import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CertificatsService } from './certificats.service';
import { EligibiliteService } from './eligibilite.service';

/** EligibiliteService (US-ATEL-09) : base, certificats et audit simulés. */
describe('EligibiliteService (US-ATEL-09)', () => {
  let service: EligibiliteService;
  const query = jest.fn();
  const mockCertificats = { demanderEmission: jest.fn() };
  const mockAudit = { record: jest.fn() };

  /** Réponses SQL selon la requête. */
  const etat = (e: {
    formation?: unknown;
    inscription?: unknown;
    qcms?: unknown[];
    ateliers?: unknown[];
    inscrits?: unknown[];
  }): void => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM formations')) return e.formation === undefined ? [] : [e.formation];
      if (sql.includes('SELECT statut FROM inscriptions'))
        return e.inscription ? [e.inscription] : [];
      if (sql.includes('FROM qcm q')) return e.qcms ?? [];
      if (sql.includes('FROM ateliers a')) return e.ateliers ?? [];
      if (sql.includes('SELECT apprenant_id FROM inscriptions')) return e.inscrits ?? [];
      return [];
    });
  };
  const eligible = {
    formation: { id: 'f-1', statut: 'OUVERTE', note_min_certification: '60' },
    inscription: { statut: 'EN_COURS' },
    qcms: [{ id: 'q1', titre: 'QCM', score: '80', reussie: true }],
    ateliers: [{ id: 'a1', titre: 'Atelier', score: '70' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EligibiliteService,
        { provide: DataSource, useValue: { query } },
        { provide: CertificatsService, useValue: mockCertificats },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(EligibiliteService);
    mockAudit.record.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('formation inconnue -> 404', async () => {
    etat({});
    await expect(service.evaluer('app-1', 'f-x')).rejects.toThrow(NotFoundException);
  });

  it('lit les QCM PUBLIÉS et les ateliers non brouillons de la formation, pour CET apprenant', async () => {
    etat(eligible);
    const v = await service.evaluer('app-1', 'f-1');
    expect(v).toMatchObject({ eligible: true, scoreFinal: 75 });
    const sqlQcm = query.mock.calls.find(([sql]) => (sql as string).includes('FROM qcm q'));
    expect(sqlQcm?.[0]).toContain("q.statut = 'PUBLIE'");
    expect(sqlQcm?.[1]).toEqual(['f-1', 'app-1']);
    const sqlAtelier = query.mock.calls.find(([sql]) =>
      (sql as string).includes('FROM ateliers a'),
    );
    expect(sqlAtelier?.[0]).toContain("a.statut <> 'BROUILLON'");
    expect(sqlAtelier?.[0]).toContain("c.statut = 'TERMINEE'");
  });

  it('éligible : demande l’émission avec le score final, trace CERTIFICATION_DECLENCHEE', async () => {
    etat(eligible);
    mockCertificats.demanderEmission.mockResolvedValue({ certificatId: 'c-1', cree: true });
    const r = await service.evaluerEtDeclencher('app-1', 'f-1', 'CORRECTION_FINALISEE');
    expect(mockCertificats.demanderEmission).toHaveBeenCalledWith('app-1', 'f-1', 75);
    expect(r).toMatchObject({ certificatId: 'c-1', declenche: true });
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATION_DECLENCHEE',
        cible: 'c-1',
        detailsAvantApres: expect.objectContaining({
          origine: 'CORRECTION_FINALISEE',
          scoreFinal: 75,
        }),
      }),
    );
  });

  it('déjà demandé : pas de second audit', async () => {
    etat(eligible);
    mockCertificats.demanderEmission.mockResolvedValue({ certificatId: 'c-1', cree: false });
    const r = await service.evaluerEtDeclencher('app-1', 'f-1', 'TENTATIVE_NOTEE');
    expect(r.declenche).toBe(false);
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('non éligible : aucune demande', async () => {
    etat({ ...eligible, ateliers: [{ id: 'a1', titre: 'Atelier', score: '59' }] });
    const r = await service.evaluerEtDeclencher('app-1', 'f-1', 'TENTATIVE_NOTEE');
    expect(r).toMatchObject({ eligible: false, certificatId: null, declenche: false });
    expect(mockCertificats.demanderEmission).not.toHaveBeenCalled();
  });

  it('declencherSansEchec : une erreur est journalisée, jamais renvoyée', async () => {
    query.mockRejectedValue(new Error('base indisponible'));
    const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      service.declencherSansEchec('app-1', 'f-1', 'TENTATIVE_NOTEE'),
    ).resolves.toBeUndefined();
    expect(erreur).toHaveBeenCalledWith(expect.stringContaining('base indisponible'));
  });

  it('evaluerFormation : chaque inscrit actif, bilan tracé ; 404 formation inconnue', async () => {
    etat({ ...eligible, inscrits: [{ apprenant_id: 'app-1' }, { apprenant_id: 'app-2' }] });
    mockCertificats.demanderEmission
      .mockResolvedValueOnce({ certificatId: 'c-1', cree: true })
      .mockResolvedValueOnce({ certificatId: 'c-2', cree: false });
    await expect(service.evaluerFormation('adm', 'f-1', { adresseIp: null })).resolves.toEqual({
      evalues: 2,
      eligibles: 2,
      declenches: 1,
    });
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATION_FORMATION_EVALUEE',
        acteur: 'adm',
        cible: 'f-1',
      }),
    );
    etat({});
    await expect(service.evaluerFormation('adm', 'f-x', { adresseIp: null })).rejects.toThrow(
      NotFoundException,
    );
  });
});
