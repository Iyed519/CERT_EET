import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Correction } from '../../database/entities/correction.entity';
import { StatutCorrection } from '../../database/enums/statut-correction.enum';
import { StatutLivrable } from '../../database/enums/statut-livrable.enum';
import { AuditService } from '../audit/audit.service';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { EspaceFormationService } from '../inscriptions/espace-formation.service';
import { AteliersApprenantService } from './ateliers-apprenant.service';
import { AteliersService } from './ateliers.service';
import { GrillesService } from './grille/grilles.service';
import { LivrablesService } from './livrables/livrables.service';

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
  const mockLivrablesService = { monLivrable: jest.fn() };
  const mockDataSource = { manager: { findOne: jest.fn() }, query: jest.fn() };
  const mockAudit = { record: jest.fn().mockResolvedValue(undefined) };

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
        { provide: LivrablesService, useValue: mockLivrablesService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(AteliersApprenantService);

    mockAtelierRepo.findOne.mockResolvedValue(atelierPublie);
    mockAteliersService.maintenant.mockResolvedValue(MAINTENANT);
    mockGrillesService.criteresDeLAtelier.mockResolvedValue(criteres);
    mockEspaceService.exigerAccesContenu.mockResolvedValue({ id: 'insc-1' });
    mockLivrablesService.monLivrable.mockResolvedValue(null);
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
      monLivrable: null,
    });
    expect(mockLivrablesService.monLivrable).toHaveBeenCalledWith('appr-1', 'at-1');
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

  describe('feedback (US-ATEL-08)', () => {
    const livrable = (statut: StatutLivrable): Record<string, unknown> => ({
      id: 'liv-1',
      atelierId: 'at-1',
      statut,
    });
    const DATE = new Date('2026-11-09T09:00:00Z');
    const correction = {
      id: 'cor-1',
      statut: StatutCorrection.TERMINEE,
      scoreTotal: 70,
      commentaireGeneral: 'Bon travail.',
      dateFinalisation: DATE,
      correcteur: { prenom: 'Amel', nom: 'Trabelsi', email: 'secret@x.tn' },
      notes: [
        {
          critereId: 'c2',
          niveau: { ordre: 4, libelle: 'Excellent' },
          pointsPct: 100,
          commentaire: null,
        },
        {
          critereId: 'c1',
          niveau: { ordre: 3, libelle: 'Bon' },
          pointsPct: 50,
          commentaire: 'Pagination.',
        },
      ],
    };

    it('EN_CORRECTION : statut seul, aucune note partielle, rien n’est lu ni écrit', async () => {
      mockLivrablesService.monLivrable.mockResolvedValue(livrable(StatutLivrable.EN_CORRECTION));
      const fiche = await service.fiche('appr-1', 'at-1', contexte);
      expect(fiche.monLivrable).toEqual({
        ...livrable(StatutLivrable.EN_CORRECTION),
        feedback: null,
      });
      expect(mockDataSource.manager.findOne).not.toHaveBeenCalled();
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('NOTE : score, détail dans l’ordre de la grille, commentaire ; 1re consultation tracée', async () => {
      mockLivrablesService.monLivrable.mockResolvedValue(livrable(StatutLivrable.NOTE));
      mockDataSource.manager.findOne.mockResolvedValue(correction);
      mockDataSource.query.mockResolvedValue([{ livrable_id: 'liv-1' }]);

      const fiche = await service.fiche('appr-1', 'at-1', contexte);
      expect(mockDataSource.manager.findOne).toHaveBeenCalledWith(Correction, {
        where: { livrableId: 'liv-1', statut: StatutCorrection.TERMINEE },
        relations: { correcteur: true, notes: { niveau: true } },
      });
      expect(fiche.monLivrable?.feedback).toEqual({
        scoreFinal: 70,
        commentaireGeneral: 'Bon travail.',
        dateFinalisation: DATE,
        correcteur: { prenom: 'Amel', nom: 'Trabelsi' },
        criteres: [
          {
            critereId: 'c1',
            ordre: 1,
            intitule: 'Fonctionnement',
            ponderation: 60,
            niveau: 3,
            libelleNiveau: 'Bon',
            pointsPct: 50,
            contribution: 30,
            commentaire: 'Pagination.',
          },
          {
            critereId: 'c2',
            ordre: 2,
            intitule: 'Tests',
            ponderation: 40,
            niveau: 4,
            libelleNiveau: 'Excellent',
            pointsPct: 100,
            contribution: 40,
            commentaire: null,
          },
        ],
      });
      expect(JSON.stringify(fiche)).not.toContain('secret');
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (livrable_id) DO NOTHING'),
        ['liv-1'],
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'FEEDBACK_CONSULTE',
          acteur: 'appr-1',
          cible: 'liv-1',
          detailsAvantApres: { atelierId: 'at-1', scoreFinal: 70 },
        }),
      );
    });

    it('NOTE déjà consulté : feedback renvoyé, pas de nouvel audit', async () => {
      mockLivrablesService.monLivrable.mockResolvedValue(livrable(StatutLivrable.NOTE));
      mockDataSource.manager.findOne.mockResolvedValue(correction);
      mockDataSource.query.mockResolvedValue([]);
      const fiche = await service.fiche('appr-1', 'at-1', contexte);
      expect(fiche.monLivrable?.feedback?.scoreFinal).toBe(70);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('NOTE sans correction finalisée lisible : feedback null, rien n’est écrit', async () => {
      mockLivrablesService.monLivrable.mockResolvedValue(livrable(StatutLivrable.NOTE));
      mockDataSource.manager.findOne.mockResolvedValue(null);
      const fiche = await service.fiche('appr-1', 'at-1', contexte);
      expect(fiche.monLivrable?.feedback).toBeNull();
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });
});
