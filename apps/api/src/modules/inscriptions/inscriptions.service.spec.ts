import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Not, QueryFailedError } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { User } from '../../database/entities/user.entity';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { InscriptionsService } from './inscriptions.service';

/**
 * Tests unitaires d'InscriptionsService (US-INSC-01).
 *
 * La transaction est simulée : `dataSource.transaction(cb)` appelle `cb` avec
 * un faux EntityManager. Je vérifie l'ordre des contrôles (aucune écriture
 * avant la fin), le verrou demandé sur la formation, le 409 tiré de l'index
 * unique, l'email au mieux et l'audit.
 */
describe('InscriptionsService', () => {
  let service: InscriptionsService;

  const mockManager = {
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockDataSource = {
    transaction: jest.fn((cb: (m: typeof mockManager) => unknown) => cb(mockManager)),
  };
  const mockInscriptionRepo = { find: jest.fn() };
  const mockUserRepo = { findOne: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
  const mockMailService = { sendBienvenueInscriptionEmail: jest.fn() };

  const contexte = { adresseIp: '127.0.0.1' };

  const formation = (surcharge: Partial<Formation> = {}): Formation =>
    ({
      id: 'form-1',
      titre: 'DevOps',
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      dateDebut: '2026-11-02',
      dateFin: '2026-12-18',
      ...surcharge,
    }) as Formation;

  /** Le 1er findOne lit la formation, le 2e cherche une inscription existante. */
  const preparer = (f: Formation | null, existante: Partial<Inscription> | null = null): void => {
    mockManager.findOne.mockImplementation(async (entite: unknown) =>
      entite === Formation ? f : existante,
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InscriptionsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(Inscription), useValue: mockInscriptionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();
    service = moduleRef.get<InscriptionsService>(InscriptionsService);

    preparer(formation());
    mockManager.count.mockResolvedValue(5);
    mockManager.create.mockImplementation((_entite: unknown, valeurs: object) => valeurs);
    mockManager.save.mockImplementation(async (valeurs: object) => ({
      id: 'insc-1',
      dateInscription: new Date('2026-10-10T10:00:00Z'),
      tauxAvancement: 0,
      ...valeurs,
    }));
    mockUserRepo.findOne.mockResolvedValue({
      id: 'appr-1',
      email: 'apprenant@cert-eet.local',
      prenom: 'Sarra',
    });
    mockMailService.sendBienvenueInscriptionEmail.mockResolvedValue(undefined);
  });

  describe('inscrire', () => {
    it('crée l’inscription EN_COURS avec la date de fin pour échéance', async () => {
      const vue = await service.inscrire('appr-1', 'form-1', contexte);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          apprenantId: 'appr-1',
          formationId: 'form-1',
          statut: StatutInscription.EN_COURS,
          dateEcheance: '2026-12-18',
        }),
      );
      expect(vue).toMatchObject({
        id: 'insc-1',
        statut: StatutInscription.EN_COURS,
        dateEcheance: '2026-12-18',
        formation: { id: 'form-1', titre: 'DevOps' },
      });
    });

    it('lit la formation avec un verrou et ne compte que les inscriptions non suspendues', async () => {
      await service.inscrire('appr-1', 'form-1', contexte);

      expect(mockManager.findOne).toHaveBeenCalledWith(
        Formation,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockManager.count).toHaveBeenCalledWith(Inscription, {
        where: { formationId: 'form-1', statut: Not(StatutInscription.SUSPENDUE) },
      });
    });

    it('journalise INSCRIPTION_CREEE (acteur = apprenant, cible = formation)', async () => {
      await service.inscrire('appr-1', 'form-1', contexte);

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSCRIPTION_CREEE',
          acteur: 'appr-1',
          cible: 'form-1',
          adresseIp: '127.0.0.1',
          resultat: 'Succès',
          detailsAvantApres: expect.objectContaining({
            inscriptionId: 'insc-1',
            placesRestantes: 14,
            notificationEnvoyee: true,
          }),
        }),
      );
    });

    it('envoie l’email de bienvenue avec le titre et les dates', async () => {
      await service.inscrire('appr-1', 'form-1', contexte);

      expect(mockMailService.sendBienvenueInscriptionEmail).toHaveBeenCalledWith(
        'apprenant@cert-eet.local',
        {
          prenom: 'Sarra',
          titreFormation: 'DevOps',
          dateDebut: '2026-11-02',
          dateFin: '2026-12-18',
        },
      );
    });

    it('un échec d’email ne fait pas échouer l’inscription (tracé dans l’audit)', async () => {
      mockMailService.sendBienvenueInscriptionEmail.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.inscrire('appr-1', 'form-1', contexte)).resolves.toBeDefined();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detailsAvantApres: expect.objectContaining({ notificationEnvoyee: false }),
        }),
      );
    });

    it('accepte la dernière place', async () => {
      mockManager.count.mockResolvedValue(19);

      await expect(service.inscrire('appr-1', 'form-1', contexte)).resolves.toBeDefined();
    });

    it.each([
      ['inconnue', null],
      ['fermée', formation({ statut: StatutFormation.FERMEE })],
      ['archivée', formation({ statut: StatutFormation.ARCHIVEE })],
    ])('404 si la formation est %s, sans rien écrire', async (_cas, f) => {
      preparer(f);

      await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('409 « Formation complète » quand la capacité est atteinte', async () => {
      mockManager.count.mockResolvedValue(20);

      await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toThrow(
        new ConflictException('Formation complète : il ne reste aucune place.'),
      );
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockMailService.sendBienvenueInscriptionEmail).not.toHaveBeenCalled();
    });

    it.each([StatutInscription.EN_COURS, StatutInscription.TERMINEE])(
      '409 « déjà inscrit » si une inscription %s existe',
      async (statut) => {
        preparer(formation(), { statut });

        await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toThrow(
          new ConflictException('Vous êtes déjà inscrit à cette formation.'),
        );
        expect(mockManager.save).not.toHaveBeenCalled();
      },
    );

    it('409 qui renvoie vers un administrateur si l’inscription est suspendue', async () => {
      preparer(formation(), { statut: StatutInscription.SUSPENDUE });

      await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toThrow(
        /suspendue : contactez un administrateur/,
      );
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('traduit une violation de l’index unique (requêtes simultanées) en 409', async () => {
      mockManager.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('duplicate'), { code: '23505' }),
        ),
      );

      await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toThrow(
        new ConflictException('Vous êtes déjà inscrit à cette formation.'),
      );
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('laisse remonter les autres erreurs de base', async () => {
      mockManager.save.mockRejectedValue(new Error('connexion perdue'));

      await expect(service.inscrire('appr-1', 'form-1', contexte)).rejects.toThrow(
        'connexion perdue',
      );
    });
  });

  describe('mesInscriptions', () => {
    it('ne lit que les inscriptions de l’apprenant, la plus récente d’abord', async () => {
      mockInscriptionRepo.find.mockResolvedValue([
        {
          id: 'insc-1',
          statut: StatutInscription.SUSPENDUE,
          dateInscription: new Date('2026-10-10T10:00:00Z'),
          dateEcheance: null,
          tauxAvancement: 0,
          formation: formation(),
        },
      ]);

      const liste = await service.mesInscriptions('appr-1');

      expect(mockInscriptionRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { apprenantId: 'appr-1' },
          order: { dateInscription: 'DESC' },
        }),
      );
      expect(liste).toEqual([
        expect.objectContaining({
          id: 'insc-1',
          statut: StatutInscription.SUSPENDUE,
          formation: {
            id: 'form-1',
            titre: 'DevOps',
            statut: StatutFormation.OUVERTE,
            dateDebut: '2026-11-02',
            dateFin: '2026-12-18',
          },
        }),
      ]);
    });
  });
});
