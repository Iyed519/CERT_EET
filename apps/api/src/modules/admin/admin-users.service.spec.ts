import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminUsersService } from './admin-users.service';
import { AuthService } from '../auth/auth.service';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';

/**
 * Tests unitaires d'AdminUsersService (US-ROL-01).
 *
 * Repositories et AuthService remplacés par des faux : on isole la logique
 * métier du changement de rôle (step-up mot de passe, anti-lockout, audit,
 * invalidation de sessions). bcrypt reste RÉEL pour tester la vraie
 * vérification du mot de passe.
 */
describe('AdminUsersService', () => {
  let service: AdminUsersService;

  const MOT_DE_PASSE_ADMIN = 'MotDePasseAdmin123!';
  let hashAdmin: string;

  const mockUserRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };
  const mockAuditLogRepository = {
    create: jest.fn((x) => x),
    save: jest.fn(),
  };
  // Hook livré en ADR-08-R1 : on vérifie seulement qu'il est appelé.
  const mockAuthService = {
    invalidateUserSessions: jest.fn(),
  };

  const admin = (): User =>
    ({
      id: 'admin-1',
      email: 'admin@cert-eet.local',
      nom: 'Root',
      prenom: 'Admin',
      motDePasseHash: hashAdmin,
      role: Role.ADMINISTRATEUR,
      statut: StatutCompte.ACTIF,
    }) as User;

  const apprenant = (): User =>
    ({
      id: 'user-2',
      email: 'apprenant@cert-eet.local',
      nom: 'Doe',
      prenom: 'Jane',
      motDePasseHash: 'peu-importe',
      role: Role.APPRENANT,
      statut: StatutCompte.ACTIF,
    }) as User;

  const contexte = { adresseIp: '127.0.0.1' };

  beforeAll(async () => {
    hashAdmin = await bcrypt.hash(MOT_DE_PASSE_ADMIN, 4);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = moduleRef.get<AdminUsersService>(AdminUsersService);
  });

  describe('listUsers', () => {
    it('retourne les utilisateurs sans exposer le hash du mot de passe', async () => {
      const liste = [apprenant()];
      mockUserRepository.find.mockResolvedValue(liste);

      const resultat = await service.listUsers();

      expect(resultat).toBe(liste);
      // La sélection explicite des colonnes protège le hash (ADR-08).
      const args = mockUserRepository.find.mock.calls[0][0];
      expect(args.select).toMatchObject({ email: true, role: true });
      expect(args.select).not.toHaveProperty('motDePasseHash');
    });
  });

  describe('changeRole', () => {
    it('change le rôle, invalide les sessions et journalise en cas de succès', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce(admin()) // 1) l'admin (step-up)
        .mockResolvedValueOnce(apprenant()); // 2) la cible
      mockUserRepository.save.mockImplementation(async (u) => u);

      const resultat = await service.changeRole(
        'admin-1',
        'user-2',
        { nouveauRole: Role.FORMATEUR, motDePasseAdmin: MOT_DE_PASSE_ADMIN },
        contexte,
      );

      // Rôle mis à jour + renvoyé.
      expect(resultat.role).toBe(Role.FORMATEUR);
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-2', role: Role.FORMATEUR }),
      );
      // Sessions de la cible invalidées (ADR-08-R1).
      expect(mockAuthService.invalidateUserSessions).toHaveBeenCalledWith(
        'user-2',
      );
      // Audit ROLE_CHANGE en succès, avec ancien -> nouveau rôle.
      expect(mockAuditLogRepository.save).toHaveBeenCalledTimes(1);
      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_CHANGE',
          userId: 'admin-1',
          cible: 'user-2',
          resultat: 'Succès',
          detailsAvantApres: expect.objectContaining({
            ancienRole: Role.APPRENANT,
            nouveauRole: Role.FORMATEUR,
          }),
        }),
      );
    });

    it('rejette (401) et journalise un échec si le mot de passe admin est faux', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(admin());

      await expect(
        service.changeRole(
          'admin-1',
          'user-2',
          { nouveauRole: Role.FORMATEUR, motDePasseAdmin: 'MAUVAIS' },
          contexte,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Aucune mutation ni invalidation ; l'échec est tracé.
      expect(mockUserRepository.save).not.toHaveBeenCalled();
      expect(mockAuthService.invalidateUserSessions).not.toHaveBeenCalled();
      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CHANGE', resultat: 'Échec' }),
      );
    });

    it('rejette (404) si la cible est introuvable', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce(admin())
        .mockResolvedValueOnce(null);

      await expect(
        service.changeRole(
          'admin-1',
          'inconnu',
          { nouveauRole: Role.FORMATEUR, motDePasseAdmin: MOT_DE_PASSE_ADMIN },
          contexte,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('rejette (400) si la cible possède déjà le rôle demandé', async () => {
      const cible = apprenant();
      mockUserRepository.findOne
        .mockResolvedValueOnce(admin())
        .mockResolvedValueOnce(cible);

      await expect(
        service.changeRole(
          'admin-1',
          'user-2',
          { nouveauRole: Role.APPRENANT, motDePasseAdmin: MOT_DE_PASSE_ADMIN },
          contexte,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockAuthService.invalidateUserSessions).not.toHaveBeenCalled();
    });

    it('rejette (403) la rétrogradation du DERNIER administrateur actif', async () => {
      const cibleAdmin = { ...admin(), id: 'admin-1' } as User;
      mockUserRepository.findOne
        .mockResolvedValueOnce(admin())
        .mockResolvedValueOnce(cibleAdmin);
      mockUserRepository.count.mockResolvedValue(1); // il n'en reste qu'un

      await expect(
        service.changeRole(
          'admin-1',
          'admin-1',
          { nouveauRole: Role.APPRENANT, motDePasseAdmin: MOT_DE_PASSE_ADMIN },
          contexte,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('autorise la rétrogradation d’un admin s’il reste d’autres admins actifs', async () => {
      const cibleAdmin = { ...admin(), id: 'admin-2' } as User;
      mockUserRepository.findOne
        .mockResolvedValueOnce(admin())
        .mockResolvedValueOnce(cibleAdmin);
      mockUserRepository.count.mockResolvedValue(2); // un autre admin subsiste
      mockUserRepository.save.mockImplementation(async (u) => u);

      const resultat = await service.changeRole(
        'admin-1',
        'admin-2',
        { nouveauRole: Role.APPRENANT, motDePasseAdmin: MOT_DE_PASSE_ADMIN },
        contexte,
      );

      expect(resultat.role).toBe(Role.APPRENANT);
      expect(mockAuthService.invalidateUserSessions).toHaveBeenCalledWith(
        'admin-2',
      );
    });
  });
});
