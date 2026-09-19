import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RoleRequestsService } from './role-requests.service';
import { DemandeRole } from '../../database/entities/demande-role.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AdminUsersService } from '../admin/admin-users.service';
import { Role } from '../../database/enums/role.enum';
import { RoleDemande } from '../../database/enums/role-demande.enum';
import { StatutDemande } from '../../database/enums/statut-demande.enum';

/**
 * Tests unitaires de RoleRequestsService (US-ROL-02).
 *
 * Repositories, AuditService et AdminUsersService remplacés par des faux : on
 * isole la logique métier (règles de création, réutilisation du cœur ROL-01 à
 * l'approbation SANS double audit, rejet motivé, idempotence 409).
 */
describe('RoleRequestsService', () => {
  let service: RoleRequestsService;

  const mockDemandeRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockAuditService = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  // Cœur ROL-01 : on vérifie seulement qu'il est appelé avec les bons arguments.
  const mockAdminUsersService = {
    appliquerChangementRole: jest.fn().mockResolvedValue(undefined),
  };

  const apprenant = (): User =>
    ({ id: 'user-2', email: 'jane@cert-eet.local', role: Role.APPRENANT }) as User;

  const demandeEnAttente = (): DemandeRole =>
    ({
      id: 'dem-1',
      userId: 'user-2',
      roleDemande: RoleDemande.FORMATEUR,
      justification: 'TP réseau',
      statut: StatutDemande.EN_ATTENTE,
      motif: null,
      traitePar: null,
      traiteAt: null,
      createdAt: new Date(),
    }) as DemandeRole;

  const contexte = { adresseIp: '127.0.0.1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RoleRequestsService,
        { provide: getRepositoryToken(DemandeRole), useValue: mockDemandeRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AdminUsersService, useValue: mockAdminUsersService },
      ],
    }).compile();
    service = moduleRef.get<RoleRequestsService>(RoleRequestsService);
  });

  describe('creer', () => {
    it('crée une demande EN_ATTENTE quand tout est valide', async () => {
      mockUserRepo.findOne.mockResolvedValue(apprenant());
      mockDemandeRepo.findOne.mockResolvedValue(null); // pas de demande en attente
      mockDemandeRepo.create.mockImplementation((d) => d);
      mockDemandeRepo.save.mockImplementation(async (d) => ({
        ...demandeEnAttente(),
        ...d,
      }));

      const vue = await service.creer('user-2', {
        roleDemande: RoleDemande.FORMATEUR,
        justification: 'TP réseau',
      });

      expect(vue.statut).toBe(StatutDemande.EN_ATTENTE);
      expect(mockDemandeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          roleDemande: RoleDemande.FORMATEUR,
          statut: StatutDemande.EN_ATTENTE,
        }),
      );
    });

    it('rejette (400) si l’utilisateur possède déjà le rôle demandé', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        ...apprenant(),
        role: Role.FORMATEUR,
      });

      await expect(
        service.creer('user-2', {
          roleDemande: RoleDemande.FORMATEUR,
          justification: 'x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDemandeRepo.save).not.toHaveBeenCalled();
    });

    it('rejette (409) si une demande est déjà EN_ATTENTE', async () => {
      mockUserRepo.findOne.mockResolvedValue(apprenant());
      mockDemandeRepo.findOne.mockResolvedValue(demandeEnAttente());

      await expect(
        service.creer('user-2', {
          roleDemande: RoleDemande.ADMINISTRATEUR,
          justification: 'x',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockDemandeRepo.save).not.toHaveBeenCalled();
    });

    it('rejette (404) si l’auteur est introuvable', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.creer('inconnu', {
          roleDemande: RoleDemande.FORMATEUR,
          justification: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('approuver', () => {
    it('réutilise le cœur ROL-01 (un seul ROLE_CHANGE) et passe la demande à APPROUVEE', async () => {
      mockDemandeRepo.findOne.mockResolvedValue(demandeEnAttente());
      mockDemandeRepo.save.mockImplementation(async (d) => d);
      mockUserRepo.find.mockResolvedValue([apprenant()]);

      const vue = await service.approuver('admin-1', 'dem-1', contexte);

      // Cœur ROL-01 appelé avec le rôle système mappé + le contexte.
      expect(
        mockAdminUsersService.appliquerChangementRole,
      ).toHaveBeenCalledWith('admin-1', 'user-2', Role.FORMATEUR, contexte);
      // Pas de second audit côté approbation (le cœur émet déjà ROLE_CHANGE).
      expect(mockAuditService.record).not.toHaveBeenCalled();
      // Demande marquée traitée.
      expect(vue.statut).toBe(StatutDemande.APPROUVEE);
      expect(mockDemandeRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: StatutDemande.APPROUVEE,
          traitePar: 'admin-1',
        }),
      );
    });

    it('mappe ADMINISTRATEUR vers le rôle système correspondant', async () => {
      mockDemandeRepo.findOne.mockResolvedValue({
        ...demandeEnAttente(),
        roleDemande: RoleDemande.ADMINISTRATEUR,
      });
      mockDemandeRepo.save.mockImplementation(async (d) => d);
      mockUserRepo.find.mockResolvedValue([apprenant()]);

      await service.approuver('admin-1', 'dem-1', contexte);

      expect(
        mockAdminUsersService.appliquerChangementRole,
      ).toHaveBeenCalledWith('admin-1', 'user-2', Role.ADMINISTRATEUR, contexte);
    });

    it('rejette (404) si la demande est introuvable', async () => {
      mockDemandeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approuver('admin-1', 'dem-x', contexte),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        mockAdminUsersService.appliquerChangementRole,
      ).not.toHaveBeenCalled();
    });

    it('rejette (409) si la demande est déjà traitée', async () => {
      mockDemandeRepo.findOne.mockResolvedValue({
        ...demandeEnAttente(),
        statut: StatutDemande.APPROUVEE,
      });

      await expect(
        service.approuver('admin-1', 'dem-1', contexte),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        mockAdminUsersService.appliquerChangementRole,
      ).not.toHaveBeenCalled();
    });
  });

  describe('rejeter', () => {
    it('passe la demande à REJETEE et journalise DEMANDE_ROLE_TRAITEE (sans changer de rôle)', async () => {
      mockDemandeRepo.findOne.mockResolvedValue(demandeEnAttente());
      mockDemandeRepo.save.mockImplementation(async (d) => d);
      mockUserRepo.find.mockResolvedValue([apprenant()]);

      const vue = await service.rejeter(
        'admin-1',
        'dem-1',
        'Dossier incomplet',
        contexte,
      );

      expect(vue.statut).toBe(StatutDemande.REJETEE);
      expect(vue.motif).toBe('Dossier incomplet');
      // Aucun changement de rôle sur un rejet.
      expect(
        mockAdminUsersService.appliquerChangementRole,
      ).not.toHaveBeenCalled();
      // Audit de la décision de rejet.
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEMANDE_ROLE_TRAITEE',
          acteur: 'admin-1',
          cible: 'user-2',
          detailsAvantApres: expect.objectContaining({
            decision: StatutDemande.REJETEE,
            motif: 'Dossier incomplet',
          }),
        }),
      );
    });

    it('rejette (409) si la demande est déjà traitée', async () => {
      mockDemandeRepo.findOne.mockResolvedValue({
        ...demandeEnAttente(),
        statut: StatutDemande.REJETEE,
      });

      await expect(
        service.rejeter('admin-1', 'dem-1', 'motif', contexte),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('listerAdmin', () => {
    it('pagine, filtre par statut et joint l’identité des demandeurs', async () => {
      mockDemandeRepo.findAndCount.mockResolvedValue([[demandeEnAttente()], 1]);
      mockUserRepo.find.mockResolvedValue([apprenant()]);

      const page = await service.listerAdmin({
        statut: StatutDemande.EN_ATTENTE,
        page: 1,
        limit: 50,
      });

      expect(page.total).toBe(1);
      expect(page.items[0].demandeur.email).toBe('jane@cert-eet.local');
      // Le filtre statut est bien transmis au repository.
      expect(mockDemandeRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { statut: StatutDemande.EN_ATTENTE },
        }),
      );
    });
  });
});
