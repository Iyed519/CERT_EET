import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../database/enums/role.enum';
import { AuditService } from '../../audit/audit.service';
import { AccessTokenPayload } from '../../auth/auth.types';
import { AutorisationRessourceService } from './autorisation-ressource.service';
import { SourceFormation } from './formateur-de-la-formation.constants';
import { FormateurDeLaFormationGuard } from './formateur-de-la-formation.guard';

/**
 * Tests unitaires du garde d'autorisation par ressource (US-AUTH-16).
 *
 * Les trois profils de la story — formateur affecté, formateur non affecté,
 * administrateur — et les trois chemins vers la formation (formation, module,
 * QCM). Les routes QCM n'existent pas encore : c'est ici que le chemin
 * « QCM -> module -> formation » est vérifié.
 */
describe('FormateurDeLaFormationGuard', () => {
  const FORMATION = '3f1c0f0e-9a51-4c5e-8f0a-2d0f6f3b7a11';
  const MODULE = '8b7a2c44-1d3e-4b9a-a6c2-5e4d3c2b1a00';
  const QCM = '5d2e9b1c-7a4f-4e3d-9c8b-1a2b3c4d5e6f';

  const mockReflector = { getAllAndOverride: jest.fn() };
  const mockAutorisation = { formationDe: jest.fn(), estAffecte: jest.fn() };
  const mockAudit = { record: jest.fn() };
  let guard: FormateurDeLaFormationGuard;

  const utilisateur = (role: Role): AccessTokenPayload => ({
    sub: 'user-1',
    email: 'u@cert-eet.local',
    role,
    jti: 'jti',
    iat: 0,
    exp: 0,
  });

  /** Contexte HTTP minimal : la requête porte l'utilisateur et les paramètres. */
  const contexte = (
    user: AccessTokenPayload | undefined,
    params: Record<string, string>,
  ): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params,
          ip: '127.0.0.1',
          method: 'GET',
          originalUrl: `/api/formateur/formations/${params.formationId ?? ''}`,
        }),
      }),
    }) as unknown as ExecutionContext;

  const source = (s: SourceFormation): void => {
    mockReflector.getAllAndOverride.mockReturnValue(s);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new FormateurDeLaFormationGuard(
      mockReflector as unknown as Reflector,
      mockAutorisation as unknown as AutorisationRessourceService,
      mockAudit as unknown as AuditService,
    );
    source({ formationId: 'formationId' });
    mockAutorisation.formationDe.mockResolvedValue(FORMATION);
    mockAutorisation.estAffecte.mockResolvedValue(true);
    mockAudit.record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('laisse passer un formateur affecté', async () => {
    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: FORMATION })),
    ).resolves.toBe(true);
    expect(mockAutorisation.formationDe).toHaveBeenCalledWith('formation', FORMATION);
    expect(mockAutorisation.estAffecte).toHaveBeenCalledWith(FORMATION, 'user-1');
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('refuse en 403 un formateur non affecté et trace ACCES_RESSOURCE_REFUSE', async () => {
    mockAutorisation.estAffecte.mockResolvedValue(false);

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: FORMATION })),
    ).rejects.toThrow(ForbiddenException);

    expect(mockAudit.record).toHaveBeenCalledWith({
      action: 'ACCES_RESSOURCE_REFUSE',
      acteur: 'user-1',
      cible: FORMATION,
      adresseIp: '127.0.0.1',
      resultat: 'Échec',
      detailsAvantApres: {
        ressource: 'formation',
        ressourceId: FORMATION,
        methode: 'GET',
        route: `/api/formateur/formations/${FORMATION}`,
      },
    });
  });

  it('refuse quand même en 403 si l’écriture d’audit échoue', async () => {
    mockAutorisation.estAffecte.mockResolvedValue(false);
    mockAudit.record.mockRejectedValue(new Error('db down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: FORMATION })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('laisse passer un administrateur sans lire la base (accès global)', async () => {
    await expect(
      guard.canActivate(contexte(utilisateur(Role.ADMINISTRATEUR), { formationId: FORMATION })),
    ).resolves.toBe(true);
    expect(mockAutorisation.formationDe).not.toHaveBeenCalled();
    expect(mockAutorisation.estAffecte).not.toHaveBeenCalled();
  });

  it('refuse en 403 un apprenant, même s’il avait gardé une affectation', async () => {
    await expect(
      guard.canActivate(contexte(utilisateur(Role.APPRENANT), { formationId: FORMATION })),
    ).rejects.toThrow(ForbiddenException);
    expect(mockAutorisation.estAffecte).not.toHaveBeenCalled();
  });

  it('refuse en 401 une requête sans utilisateur', async () => {
    await expect(
      guard.canActivate(contexte(undefined, { formationId: FORMATION })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuse en 400 un identifiant mal formé, avant toute requête en base', async () => {
    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: 'pas-un-uuid' })),
    ).rejects.toThrow(BadRequestException);
    expect(mockAutorisation.formationDe).not.toHaveBeenCalled();
  });

  it('refuse en 404 une formation inconnue, sans audit', async () => {
    mockAutorisation.formationDe.mockResolvedValue(null);

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: FORMATION })),
    ).rejects.toThrow(new NotFoundException('Formation introuvable.'));
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('remonte d’un module à sa formation', async () => {
    source({ moduleId: 'moduleId' });

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { moduleId: MODULE })),
    ).resolves.toBe(true);
    expect(mockAutorisation.formationDe).toHaveBeenCalledWith('module', MODULE);
    expect(mockAutorisation.estAffecte).toHaveBeenCalledWith(FORMATION, 'user-1');
  });

  it('remonte d’un QCM à sa formation, et refuse un QCM d’une autre formation', async () => {
    source({ qcmId: 'qcmId' });
    mockAutorisation.estAffecte.mockResolvedValue(false);

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { qcmId: QCM })),
    ).rejects.toThrow(ForbiddenException);
    expect(mockAutorisation.formationDe).toHaveBeenCalledWith('qcm', QCM);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        cible: FORMATION,
        detailsAvantApres: expect.objectContaining({ ressource: 'qcm', ressourceId: QCM }),
      }),
    );
  });

  it.each([
    ['module', { moduleId: 'moduleId' }, { moduleId: MODULE }, 'Module introuvable.'],
    ['QCM', { qcmId: 'qcmId' }, { qcmId: QCM }, 'QCM introuvable.'],
    ['atelier', { atelierId: 'atelierId' }, { atelierId: QCM }, 'Atelier introuvable.'],
    ['livrable', { livrableId: 'livrableId' }, { livrableId: QCM }, 'Livrable introuvable.'],
    ['support', { supportId: 'supportId' }, { supportId: QCM }, 'Support introuvable.'],
    [
      'génération',
      { generationId: 'generationId' },
      { generationId: QCM },
      'Génération introuvable.',
    ],
    ['ressource', { ressourceId: 'ressourceId' }, { ressourceId: QCM }, 'Ressource introuvable.'],
  ])(
    'refuse en 404 un %s inconnu',
    async (_libelle, s: SourceFormation, params: Record<string, string>, message) => {
      source(s);
      mockAutorisation.formationDe.mockResolvedValue(null);

      await expect(
        guard.canActivate(contexte(utilisateur(Role.FORMATEUR), params)),
      ).rejects.toThrow(new NotFoundException(message));
    },
  );

  it('remonte d’un livrable à sa formation (US-ATEL-06)', async () => {
    source({ livrableId: 'livrableId' });
    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { livrableId: QCM })),
    ).resolves.toBe(true);
    expect(mockAutorisation.formationDe).toHaveBeenCalledWith('livrable', QCM);
    expect(mockAutorisation.estAffecte).toHaveBeenCalledWith(FORMATION, 'user-1');
  });

  it('remonte d’un support pédagogique à sa formation (US-IA-01)', async () => {
    source({ supportId: 'supportId' });
    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { supportId: QCM })),
    ).resolves.toBe(true);
    expect(mockAutorisation.formationDe).toHaveBeenCalledWith('support', QCM);
    expect(mockAutorisation.estAffecte).toHaveBeenCalledWith(FORMATION, 'user-1');
  });

  it('signale une route où le garde est posé sans décorateur', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(contexte(utilisateur(Role.FORMATEUR), { formationId: FORMATION })),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
