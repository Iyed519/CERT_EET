import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { EspaceFormationService } from '../inscriptions/espace-formation.service';
import { AteliersApprenantService } from './ateliers-apprenant.service';
import { AteliersService } from './ateliers.service';
import { GrillesService } from './grille/grilles.service';

/**
 * AteliersApprenantService (US-ATEL-03) : fiche d'un atelier publié pour un
 * apprenant inscrit. Dépôts et services simulés ; horloge PostgreSQL FIXE.
 */
describe('AteliersApprenantService (US-ATEL-03)', () => {
  let service: AteliersApprenantService;

  const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');
  const contexte = { adresseIp: '127.0.0.1', methode: 'GET', route: '/api/mes-ateliers/at-1' };

  const mockAtelierRepo = { findOne: jest.fn(), manager: {} };
  const mockAteliersService = { maintenant: jest.fn() };
  const mockGrillesService = { criteresDeLAtelier: jest.fn() };
  const mockEspaceService = { exigerAccesContenu: jest.fn() };

  const atelierPublie = {
    id: 'at-1',
    moduleId: 'mod-1',
    formateurId: 'form-1',
    titre: 'Projet API',
    enonce: 'Implémentez une API REST.',
    competencesVisees: 'NestJS',
    dateLimite: new Date('2026-11-20T23:59:00Z'),
    typesLivrables: ['zip'],
    tailleMaxMo: 20,
    nbMaxFichiers: 2,
    toleranceRetardHeures: 24,
    statut: StatutAtelier.PUBLIE,
    createdAt: MAINTENANT,
    updatedAt: MAINTENANT,
    module: {
      id: 'mod-1',
      titre: 'API REST',
      formationId: 'formation-1',
      formation: { id: 'formation-1', titre: 'Back-end' },
    },
  };

  const criteres = [
    {
      id: 'c1',
      ordre: 1,
      intitule: 'Fonctionnement',
      ponderation: 60,
      description: null,
      niveaux: [],
    },
    { id: 'c2', ordre: 2, intitule: 'Tests', ponderation: 40, description: null, niveaux: [] },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AteliersApprenantService,
        { provide: getRepositoryToken(Atelier), useValue: mockAtelierRepo },
        { provide: AteliersService, useValue: mockAteliersService },
        { provide: GrillesService, useValue: mockGrillesService },
        { provide: EspaceFormationService, useValue: mockEspaceService },
      ],
    }).compile();
    service = moduleRef.get(AteliersApprenantService);

    mockAtelierRepo.findOne.mockResolvedValue(atelierPublie);
    mockAteliersService.maintenant.mockResolvedValue(MAINTENANT);
    mockGrillesService.criteresDeLAtelier.mockResolvedValue(criteres);
    mockEspaceService.exigerAccesContenu.mockResolvedValue({ id: 'insc-1' });
  });

  it('renvoie la fiche en liste blanche, la grille et l’état du dépôt', async () => {
    const fiche = await service.fiche('appr-1', 'at-1', contexte);

    expect(mockAtelierRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'at-1', statut: StatutAtelier.PUBLIE } }),
    );
    expect(mockEspaceService.exigerAccesContenu).toHaveBeenCalledWith(
      'appr-1',
      'formation-1',
      contexte,
    );
    expect(fiche).toEqual({
      id: 'at-1',
      formationId: 'formation-1',
      formationTitre: 'Back-end',
      moduleId: 'mod-1',
      moduleTitre: 'API REST',
      titre: 'Projet API',
      enonce: 'Implémentez une API REST.',
      competencesVisees: 'NestJS',
      dateLimite: atelierPublie.dateLimite,
      toleranceRetardHeures: 24,
      typesLivrables: ['zip'],
      tailleMaxMo: 20,
      nbMaxFichiers: 2,
      etatDepot: 'OUVERT',
      grille: { totalPonderations: 100, criteres },
    });
    expect(fiche).not.toHaveProperty('formateurId');
    expect(fiche).not.toHaveProperty('statut');
  });

  it('état du dépôt à l’heure de PostgreSQL : EN_RETARD pendant la tolérance', async () => {
    mockAteliersService.maintenant.mockResolvedValue(new Date('2026-11-21T10:00:00Z'));
    expect((await service.fiche('appr-1', 'at-1', contexte)).etatDepot).toBe('EN_RETARD');
  });

  it('404 pour un atelier inconnu ou non publié, sans contrôle d’inscription ni grille', async () => {
    mockAtelierRepo.findOne.mockResolvedValue(null);
    await expect(service.fiche('appr-1', 'at-1', contexte)).rejects.toThrow(
      new NotFoundException('Atelier introuvable.'),
    );
    expect(mockEspaceService.exigerAccesContenu).not.toHaveBeenCalled();
    expect(mockGrillesService.criteresDeLAtelier).not.toHaveBeenCalled();
  });

  it('403 si l’apprenant n’a pas accès à la formation : la grille n’est pas lue', async () => {
    mockEspaceService.exigerAccesContenu.mockRejectedValue(
      new ForbiddenException('Vous n’êtes pas inscrit à cette formation.'),
    );
    await expect(service.fiche('appr-1', 'at-1', contexte)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockGrillesService.criteresDeLAtelier).not.toHaveBeenCalled();
  });
});
