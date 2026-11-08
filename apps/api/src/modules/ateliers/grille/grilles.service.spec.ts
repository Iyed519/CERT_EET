import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryFailedError } from 'typeorm';
import { Atelier } from '../../../database/entities/atelier.entity';
import { Critere } from '../../../database/entities/critere.entity';
import { Grille } from '../../../database/entities/grille.entity';
import { NiveauPerformance } from '../../../database/entities/niveau-performance.entity';
import { Role } from '../../../database/enums/role.enum';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';
import { AuditService } from '../../audit/audit.service';
import { AteliersService } from '../ateliers.service';
import { GrillesService } from './grilles.service';
import { normaliserNiveaux } from './grille.regles';

/**
 * GrillesService (US-ATEL-02) avec un gestionnaire de transaction simulé.
 * L'état « en base » (atelier, grille, critères, modèle) est tenu dans des
 * variables que les simulacres renvoient selon l'entité demandée.
 */
describe('GrillesService (US-ATEL-02)', () => {
  let service: GrillesService;

  const contexte = { adresseIp: '127.0.0.1' };
  const formateur = { sub: 'form-1', role: Role.FORMATEUR };
  const autre = { sub: 'form-2', role: Role.FORMATEUR };
  const admin = { sub: 'admin-1', role: Role.ADMINISTRATEUR };
  const DATE = new Date('2026-11-08T10:00:00.000Z');

  const niveauxParDefaut = (critereId: string): NiveauPerformance[] =>
    normaliserNiveaux(undefined).map(
      (n) => ({ ...n, id: `${critereId}-n${n.ordre}`, critereId }) as NiveauPerformance,
    );

  const critere = (
    id: string,
    ordre: number,
    ponderation: number,
    intitule = `Critère ${id}`,
  ): Critere =>
    ({
      id,
      grilleId: 'g-1',
      ordre,
      intitule,
      ponderation,
      description: null,
      niveaux: niveauxParDefaut(id),
    }) as Critere;

  let statutAtelier: StatutAtelier;
  let grille: Grille | null;
  let criteres: Critere[];
  let modele: Grille | null;

  const mockManager = {
    query: jest.fn(),
    findOne: jest.fn(async (entite: unknown, options: { where: Record<string, unknown> }) => {
      if (entite === Atelier) return { id: 'at-1', statut: statutAtelier };
      if (entite === Grille) {
        if (options.where.estModele)
          return modele && modele.id === options.where.id ? modele : null;
        return grille;
      }
      return null;
    }),
    find: jest.fn(async (entite: unknown, options: { where: Record<string, unknown> }) => {
      if (entite === Critere) {
        return options.where.grilleId === modele?.id
          ? [critere('m1', 1, 100, 'Modèle unique')]
          : criteres;
      }
      if (entite === Grille)
        return modele ? [{ ...modele, criteres: [critere('m1', 1, 100)] }] : [];
      return [];
    }),
    create: jest.fn((_entite: unknown, valeurs: Record<string, unknown>) => ({ ...valeurs })),
    save: jest.fn(async (valeurs: Record<string, unknown>) => ({
      id: valeurs.estModele ? 'modele-neuf' : valeurs.grilleId ? 'crit-neuf' : 'g-1',
      createdAt: DATE,
      updatedAt: DATE,
      ...valeurs,
    })),
    update: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockAteliersService = {
    verrouiller: jest.fn(async () => ({ id: 'at-1', statut: statutAtelier })),
  };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    statutAtelier = StatutAtelier.BROUILLON;
    grille = { id: 'g-1', atelierId: 'at-1', validee: false, updatedAt: DATE } as Grille;
    criteres = [critere('c1', 1, 40), critere('c2', 2, 30)];
    modele = null;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GrillesService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: AteliersService, useValue: mockAteliersService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = moduleRef.get(GrillesService);
  });

  const actions = (): string[] => mockAuditService.record.mock.calls.map((c) => c[0].action);

  describe('lire', () => {
    it('renvoie la grille avec son total et « modifiable » selon le statut', async () => {
      const vue = await service.lire('at-1');
      expect(vue).toMatchObject({
        id: 'g-1',
        totalPonderations: 70,
        modifiable: true,
        validee: false,
      });
      expect(vue.criteres[0].niveaux.map((n) => n.libelle)).toEqual([
        'Insuffisant',
        'Acceptable',
        'Bon',
        'Excellent',
      ]);
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('sans grille : vide, id null, et RIEN n’est écrit', async () => {
      grille = null;
      criteres = [];
      const vue = await service.lire('at-1');
      expect(vue).toMatchObject({ id: null, totalPonderations: 0, criteres: [] });
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('404 pour un atelier inconnu', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.lire('inconnu')).rejects.toThrow(NotFoundException);
    });
  });

  describe('ajouterCritere', () => {
    it('ajoute au rang suivant (total 100 %), écrit 4 niveaux, trace APRÈS la transaction', async () => {
      await service.ajouterCritere(
        formateur,
        'at-1',
        { intitule: '  Documentation ', ponderation: 30 },
        contexte,
      );
      expect(mockAteliersService.verrouiller).toHaveBeenCalledWith(mockManager, 'at-1');
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          grilleId: 'g-1',
          ordre: 3,
          intitule: 'Documentation',
          ponderation: 30,
        }),
      );
      expect(mockManager.insert.mock.calls[0][1]).toHaveLength(4);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GRILLE_CRITERE_AJOUTE',
          cible: 'at-1',
          detailsAvantApres: expect.objectContaining({ totalPonderations: 100, invalidee: false }),
        }),
      );
    });

    it('400 au-delà de 100 % : rien n’est écrit ni tracé', async () => {
      await expect(
        service.ajouterCritere(formateur, 'at-1', { intitule: 'Tests', ponderation: 31 }, contexte),
      ).rejects.toThrow(
        'Total des pondérations : 101 % (au-delà de 100 %). Réduisez une pondération.',
      );
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('400 pour un intitulé de moins de 3 caractères après rognage', async () => {
      await expect(
        service.ajouterCritere(formateur, 'at-1', { intitule: '  ab  ', ponderation: 5 }, contexte),
      ).rejects.toThrow(BadRequestException);
    });

    it('crée la grille au premier critère', async () => {
      grille = null;
      criteres = [];
      await service.ajouterCritere(
        formateur,
        'at-1',
        { intitule: 'Fonctionnement', ponderation: 40 },
        contexte,
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ atelierId: 'at-1', formateurId: 'form-1', estModele: false }),
      );
    });

    it('une grille validée redevient non validée (et la trace le dit)', async () => {
      grille = { ...grille, validee: true } as Grille;
      await service.ajouterCritere(
        formateur,
        'at-1',
        { intitule: 'Tests', ponderation: 10 },
        contexte,
      );
      expect(mockManager.update).toHaveBeenCalledWith(Grille, { id: 'g-1' }, { validee: false });
      expect(mockAuditService.record.mock.calls[0][0].detailsAvantApres.invalidee).toBe(true);
    });

    it('409 si l’atelier n’est plus en brouillon', async () => {
      statutAtelier = StatutAtelier.PUBLIE;
      await expect(
        service.ajouterCritere(formateur, 'at-1', { intitule: 'Tests', ponderation: 10 }, contexte),
      ).rejects.toThrow(ConflictException);
      expect(mockManager.save).not.toHaveBeenCalled();
    });
  });

  describe('modifierCritere', () => {
    it('trace avant/après et vérifie le plafond avec la NOUVELLE pondération', async () => {
      await service.modifierCritere(formateur, 'at-1', 'c2', { ponderation: 60 }, contexte);
      expect(mockManager.update).toHaveBeenCalledWith(Critere, { id: 'c2' }, { ponderation: 60 });
      expect(mockAuditService.record.mock.calls[0][0].detailsAvantApres).toMatchObject({
        avant: { ponderation: 30 },
        apres: { ponderation: 60 },
        totalPonderations: 100,
      });
    });

    it('400 si la nouvelle pondération fait dépasser 100 %', async () => {
      await expect(
        service.modifierCritere(formateur, 'at-1', 'c2', { ponderation: 61 }, contexte),
      ).rejects.toThrow(/101 %/);
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('sans changement réel : aucune écriture, aucune trace, validation conservée', async () => {
      grille = { ...grille, validee: true } as Grille;
      await service.modifierCritere(
        formateur,
        'at-1',
        'c1',
        { intitule: 'Critère c1', ponderation: 40, niveaux: normaliserNiveaux(undefined) },
        contexte,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('remplace les niveaux quand les plages changent', async () => {
      const niveaux = [
        { pointsMinPct: 0, pointsMaxPct: 40 },
        { pointsMinPct: 40, pointsMaxPct: 60 },
        { pointsMinPct: 60, pointsMaxPct: 80 },
        { pointsMinPct: 80, pointsMaxPct: 100 },
      ];
      await service.modifierCritere(formateur, 'at-1', 'c1', { niveaux }, contexte);
      expect(mockManager.delete).toHaveBeenCalledWith(NiveauPerformance, { critereId: 'c1' });
      expect(mockManager.insert.mock.calls[0][1][0]).toMatchObject({
        pointsMaxPct: 40,
        critereId: 'c1',
      });
    });

    it.each([
      ['corps vide', {}, 'Aucune modification fournie.'],
      ['intitulé vidé', { intitule: null }, 'Le champ intitule ne peut pas être vidé.'],
      ['pondération vidée', { ponderation: null }, 'Le champ ponderation ne peut pas être vidé.'],
    ])('400 : %s', async (_libelle, dto, message) => {
      await expect(
        service.modifierCritere(formateur, 'at-1', 'c1', dto as never, contexte),
      ).rejects.toThrow(new BadRequestException(message));
    });

    it('404 pour un critère qui n’est pas dans cette grille', async () => {
      await expect(
        service.modifierCritere(formateur, 'at-1', 'ailleurs', { ponderation: 5 }, contexte),
      ).rejects.toThrow('Critère introuvable dans cette grille.');
    });
  });

  describe('supprimerCritere et reordonner', () => {
    it('supprime puis resserre les rangs des suivants', async () => {
      criteres = [critere('c1', 1, 40), critere('c2', 2, 30), critere('c3', 3, 10)];
      await service.supprimerCritere(formateur, 'at-1', 'c1', contexte);
      expect(mockManager.delete).toHaveBeenCalledWith(Critere, { id: 'c1' });
      expect(mockManager.update).toHaveBeenCalledWith(Critere, { id: 'c2' }, { ordre: 1 });
      expect(mockManager.update).toHaveBeenCalledWith(Critere, { id: 'c3' }, { ordre: 2 });
      expect(actions()).toEqual(['GRILLE_CRITERE_SUPPRIME']);
    });

    it('réordonne sans retirer la validation', async () => {
      grille = { ...grille, validee: true } as Grille;
      await service.reordonner(formateur, 'at-1', { critereIds: ['c2', 'c1'] }, contexte);
      expect(mockManager.update).toHaveBeenCalledWith(Critere, { id: 'c2' }, { ordre: 1 });
      expect(mockManager.update).not.toHaveBeenCalledWith(
        Grille,
        expect.anything(),
        expect.anything(),
      );
      expect(actions()).toEqual(['GRILLE_CRITERES_REORDONNES']);
    });

    it('même ordre : rien n’est écrit ; liste incomplète : 400', async () => {
      await service.reordonner(formateur, 'at-1', { critereIds: ['c1', 'c2'] }, contexte);
      expect(mockManager.update).not.toHaveBeenCalled();
      await expect(
        service.reordonner(formateur, 'at-1', { critereIds: ['c1'] }, contexte),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('valider', () => {
    it('400 à 70 % (message de DS-13)', async () => {
      await expect(service.valider(formateur, 'at-1', contexte)).rejects.toThrow(
        'Total des pondérations = 70 % (doit être 100 %).',
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('200 à 100 % : validee = true, tracé GRILLE_VALIDEE', async () => {
      criteres = [critere('c1', 1, 70), critere('c2', 2, 30)];
      await service.valider(formateur, 'at-1', contexte);
      expect(mockManager.update).toHaveBeenCalledWith(Grille, { id: 'g-1' }, { validee: true });
      expect(actions()).toEqual(['GRILLE_VALIDEE']);
    });

    it('déjà validée : ni écriture ni nouvelle trace', async () => {
      criteres = [critere('c1', 1, 100)];
      grille = { ...grille, validee: true } as Grille;
      await service.valider(formateur, 'at-1', contexte);
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });
  });

  describe('modèles', () => {
    const modeleDe = (formateurId: string): Grille =>
      ({
        id: 'mod-1',
        estModele: true,
        nomModele: 'Projet API',
        formateurId,
        createdAt: DATE,
      }) as Grille;

    it('enregistre une copie profonde de la grille complète', async () => {
      criteres = [critere('c1', 1, 60), critere('c2', 2, 40)];
      mockManager.query.mockResolvedValueOnce([{ pris: false }]);
      const vue = await service.enregistrerModele(
        formateur,
        'at-1',
        { nomModele: ' Projet  API ' },
        contexte,
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          estModele: true,
          atelierId: null,
          nomModele: 'Projet API',
          validee: false,
        }),
      );
      expect(mockManager.insert).toHaveBeenCalledTimes(2);
      expect(vue).toMatchObject({
        id: 'modele-neuf',
        nbCriteres: 2,
        totalPonderations: 100,
        estAMoi: true,
      });
      expect(actions()).toEqual(['GRILLE_MODELE_ENREGISTRE']);
    });

    it('400 pour une grille incomplète, 409 pour un nom déjà pris', async () => {
      await expect(
        service.enregistrerModele(formateur, 'at-1', { nomModele: 'Projet API' }, contexte),
      ).rejects.toThrow(/= 70 %/);
      criteres = [critere('c1', 1, 100)];
      mockManager.query.mockResolvedValueOnce([{ pris: true }]);
      await expect(
        service.enregistrerModele(formateur, 'at-1', { nomModele: 'Projet API' }, contexte),
      ).rejects.toThrow(new ConflictException('Vous avez déjà un modèle nommé « Projet API ».'));
    });

    it('409 aussi quand l’index unique tranche une course', async () => {
      criteres = [critere('c1', 1, 100)];
      mockManager.query.mockResolvedValueOnce([{ pris: false }]);
      const doublon = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505' }),
      );
      mockDataSource.transaction.mockRejectedValueOnce(doublon);
      await expect(
        service.enregistrerModele(formateur, 'at-1', { nomModele: 'Projet API' }, contexte),
      ).rejects.toThrow(ConflictException);
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('copie un modèle : remplace les critères, grille NON validée', async () => {
      modele = modeleDe('form-1');
      grille = { ...grille, validee: true } as Grille;
      await service.copierModele(formateur, 'at-1', { modeleId: 'mod-1' }, contexte);
      expect(mockManager.delete).toHaveBeenCalledWith(Critere, { grilleId: 'g-1' });
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ grilleId: 'g-1', intitule: 'Modèle unique', ponderation: 100 }),
      );
      expect(mockManager.update).toHaveBeenCalledWith(Grille, { id: 'g-1' }, { validee: false });
      expect(mockAuditService.record.mock.calls[0][0]).toMatchObject({
        action: 'GRILLE_MODELE_COPIE',
        detailsAvantApres: expect.objectContaining({ modeleId: 'mod-1', criteresRemplaces: 2 }),
      });
    });

    it('404 pour le modèle d’un autre formateur ; l’administrateur y accède', async () => {
      modele = modeleDe('form-1');
      await expect(
        service.copierModele(autre, 'at-1', { modeleId: 'mod-1' }, contexte),
      ).rejects.toThrow('Modèle introuvable.');
      await expect(service.supprimerModele(autre, 'mod-1', contexte)).rejects.toThrow(
        NotFoundException,
      );
      await service.supprimerModele(admin, 'mod-1', contexte);
      expect(mockManager.delete).toHaveBeenCalledWith(Grille, { id: 'mod-1' });
      expect(actions()).toEqual(['GRILLE_MODELE_SUPPRIME']);
    });

    it('liste : le formateur filtre sur lui-même, l’administrateur voit tout', async () => {
      modele = modeleDe('form-1');
      await service.listerModeles(formateur);
      expect(mockManager.find.mock.calls[0][1].where).toEqual({
        estModele: true,
        formateurId: 'form-1',
      });
      const vues = await service.listerModeles(admin);
      expect(mockManager.find.mock.calls[1][1].where).toEqual({ estModele: true });
      expect(vues[0]).toMatchObject({ nomModele: 'Projet API', estAMoi: false, nbCriteres: 1 });
    });
  });
});
