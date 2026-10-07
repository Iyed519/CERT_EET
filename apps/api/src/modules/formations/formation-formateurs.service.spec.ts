import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { FormationFormateursService } from './formation-formateurs.service';
import { FormationsService } from './formations.service';

/**
 * Tests unitaires de FormationFormateursService (US-FORM-03).
 *
 * J'isole les règles de l'affectation : seul un compte FORMATEUR et ACTIF est
 * accepté, une double affectation est refusée (y compris quand c'est la base
 * qui la détecte), l'auteur vient du jeton, et une panne d'email n'annule
 * jamais une affectation enregistrée.
 */
describe('FormationFormateursService', () => {
  let service: FormationFormateursService;

  const mockAffectationRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const mockFormationRepo = { countBy: jest.fn() };
  const mockUserRepo = { findOne: jest.fn() };
  const mockFormationsService = { chargerPourEcriture: jest.fn() };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
  const mockMailService = { sendAffectationFormateurEmail: jest.fn() };

  const contexte = { adresseIp: '127.0.0.1' };
  const DATE = new Date('2026-10-07T10:00:00.000Z');

  const formateur = (surcharge: Partial<User> = {}): User =>
    ({
      id: 'user-1',
      email: 'formateur@cert-eet.local',
      nom: 'Ben Salah',
      prenom: 'Amine',
      role: Role.FORMATEUR,
      statut: StatutCompte.ACTIF,
      motDePasseHash: 'hash-secret',
      ...surcharge,
    }) as User;

  const violationUnicite = (): QueryFailedError =>
    new QueryFailedError('INSERT INTO "formation_formateurs"', [], {
      name: 'error',
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    } as unknown as Error);

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FormationFormateursService,
        { provide: getRepositoryToken(AffectationFormateur), useValue: mockAffectationRepo },
        { provide: getRepositoryToken(Formation), useValue: mockFormationRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: FormationsService, useValue: mockFormationsService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();
    service = moduleRef.get<FormationFormateursService>(FormationFormateursService);

    mockFormationsService.chargerPourEcriture.mockResolvedValue({
      id: 'form-1',
      titre: 'DevOps',
    });
    mockUserRepo.findOne.mockResolvedValue(formateur());
    mockAffectationRepo.findOne.mockResolvedValue(null);
    mockAffectationRepo.create.mockImplementation((a) => a);
    mockAffectationRepo.save.mockImplementation(async (a) => ({
      id: 'aff-1',
      createdAt: DATE,
      ...a,
    }));
    mockAffectationRepo.delete.mockResolvedValue(undefined);
    mockMailService.sendAffectationFormateurEmail.mockResolvedValue(undefined);
    // Le service signale volontairement une panne d'email par un avertissement :
    // je le fais taire pour garder la sortie des tests lisible.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('affecter', () => {
    it('enregistre l’affectation avec l’administrateur du jeton comme auteur', async () => {
      const vue = await service.affecter('admin-1', 'form-1', 'user-1', contexte);

      expect(mockAffectationRepo.save).toHaveBeenCalledWith({
        formationId: 'form-1',
        formateurId: 'user-1',
        affectePar: 'admin-1',
      });
      expect(vue).toEqual({
        id: 'user-1',
        email: 'formateur@cert-eet.local',
        nom: 'Ben Salah',
        prenom: 'Amine',
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
        affecteLe: DATE,
      });
      // La vue ne laisse jamais sortir le hash du mot de passe.
      expect(vue).not.toHaveProperty('motDePasseHash');
    });

    it('prévient le formateur par email et trace FORMATEUR_AFFECTE', async () => {
      await service.affecter('admin-1', 'form-1', 'user-1', contexte);

      expect(mockMailService.sendAffectationFormateurEmail).toHaveBeenCalledWith(
        'formateur@cert-eet.local',
        { prenom: 'Amine', titreFormation: 'DevOps' },
      );
      expect(mockAuditService.record).toHaveBeenCalledTimes(1);
      expect(mockAuditService.record).toHaveBeenCalledWith({
        action: 'FORMATEUR_AFFECTE',
        acteur: 'admin-1',
        cible: 'form-1',
        adresseIp: '127.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: {
          formateurId: 'user-1',
          formateurEmail: 'formateur@cert-eet.local',
          formationTitre: 'DevOps',
          notificationEnvoyee: true,
        },
      });
    });

    it('conserve l’affectation si l’email échoue, et le trace dans l’audit', async () => {
      mockMailService.sendAffectationFormateurEmail.mockRejectedValue(
        new Error('connect ECONNREFUSED'),
      );

      const vue = await service.affecter('admin-1', 'form-1', 'user-1', contexte);

      expect(vue.id).toBe('user-1');
      expect(mockAffectationRepo.save).toHaveBeenCalledTimes(1);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FORMATEUR_AFFECTE',
          detailsAvantApres: expect.objectContaining({ notificationEnvoyee: false }),
        }),
      );
    });

    it('propage le 404 d’une formation inconnue sans rien écrire', async () => {
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new NotFoundException('Formation introuvable.'),
      );

      await expect(service.affecter('admin-1', 'form-x', 'user-1', contexte)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
      expect(mockAffectationRepo.save).not.toHaveBeenCalled();
    });

    it('propage le 409 d’une formation archivée sans rien écrire', async () => {
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );

      await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAffectationRepo.save).not.toHaveBeenCalled();
    });

    it('refuse en 404 un utilisateur inconnu', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.affecter('admin-1', 'form-1', 'user-x', contexte)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAffectationRepo.save).not.toHaveBeenCalled();
    });

    it.each([Role.APPRENANT, Role.ADMINISTRATEUR])(
      'refuse en 400 un utilisateur de rôle %s',
      async (role) => {
        mockUserRepo.findOne.mockResolvedValue(formateur({ role }));

        await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockAffectationRepo.save).not.toHaveBeenCalled();
        expect(mockMailService.sendAffectationFormateurEmail).not.toHaveBeenCalled();
        expect(mockAuditService.record).not.toHaveBeenCalled();
      },
    );

    it.each([StatutCompte.EN_ATTENTE_ACTIVATION, StatutCompte.DESACTIVE, StatutCompte.ANONYMISE])(
      'refuse en 400 un formateur au statut %s',
      async (statut) => {
        mockUserRepo.findOne.mockResolvedValue(formateur({ statut }));

        await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockAffectationRepo.save).not.toHaveBeenCalled();
      },
    );

    it('refuse en 409 un formateur déjà affecté', async () => {
      mockAffectationRepo.findOne.mockResolvedValue({ id: 'aff-0' });

      await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAffectationRepo.save).not.toHaveBeenCalled();
      expect(mockMailService.sendAffectationFormateurEmail).not.toHaveBeenCalled();
    });

    it('traduit en 409 la violation de l’index unique (deux requêtes simultanées)', async () => {
      mockAffectationRepo.save.mockRejectedValue(violationUnicite());

      await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockMailService.sendAffectationFormateurEmail).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('laisse remonter toute autre erreur de base', async () => {
      const panne = new Error('connexion perdue');
      mockAffectationRepo.save.mockRejectedValue(panne);

      await expect(service.affecter('admin-1', 'form-1', 'user-1', contexte)).rejects.toBe(panne);
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('lister', () => {
    it('refuse en 404 une formation inconnue', async () => {
      mockFormationRepo.countBy.mockResolvedValue(0);

      await expect(service.lister('form-x')).rejects.toThrow(NotFoundException);
      expect(mockAffectationRepo.find).not.toHaveBeenCalled();
    });

    it('renvoie les formateurs affectés, du plus ancien au plus récent', async () => {
      const plusTard = new Date('2026-10-08T10:00:00.000Z');
      mockFormationRepo.countBy.mockResolvedValue(1);
      mockAffectationRepo.find.mockResolvedValue([
        { id: 'aff-1', createdAt: DATE, formateur: formateur() },
        {
          id: 'aff-2',
          createdAt: plusTard,
          formateur: formateur({
            id: 'user-2',
            email: 'autre@cert-eet.local',
            role: Role.APPRENANT,
          }),
        },
      ]);

      const vues = await service.lister('form-1');

      expect(mockAffectationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { formationId: 'form-1' }, order: { createdAt: 'ASC' } }),
      );
      expect(vues.map((v) => [v.id, v.role, v.affecteLe])).toEqual([
        ['user-1', Role.FORMATEUR, DATE],
        // Rétrogradé depuis son affectation : la ligne reste, le rôle actuel est visible.
        ['user-2', Role.APPRENANT, plusTard],
      ]);
      expect(vues[0]).not.toHaveProperty('motDePasseHash');
    });
  });

  describe('retirer', () => {
    it('supprime l’affectation et trace FORMATEUR_RETIRE', async () => {
      mockAffectationRepo.findOne.mockResolvedValue({
        id: 'aff-1',
        formateur: { id: 'user-1', email: 'formateur@cert-eet.local' },
      });

      await service.retirer('admin-1', 'form-1', 'user-1', contexte);

      expect(mockAffectationRepo.delete).toHaveBeenCalledWith({ id: 'aff-1' });
      expect(mockAuditService.record).toHaveBeenCalledWith({
        action: 'FORMATEUR_RETIRE',
        acteur: 'admin-1',
        cible: 'form-1',
        adresseIp: '127.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: {
          formateurId: 'user-1',
          formateurEmail: 'formateur@cert-eet.local',
          formationTitre: 'DevOps',
        },
      });
      // Retirer ne dépend ni du rôle ni du statut actuels du compte.
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('refuse en 404 un formateur qui n’est pas affecté', async () => {
      mockAffectationRepo.findOne.mockResolvedValue(null);

      await expect(service.retirer('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockAffectationRepo.delete).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('propage le 409 d’une formation archivée sans rien supprimer', async () => {
      mockFormationsService.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );

      await expect(service.retirer('admin-1', 'form-1', 'user-1', contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAffectationRepo.delete).not.toHaveBeenCalled();
    });
  });
});
