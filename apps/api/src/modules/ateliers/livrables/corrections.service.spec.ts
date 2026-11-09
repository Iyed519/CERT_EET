import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { Correction } from '../../../database/entities/correction.entity';
import { Critere } from '../../../database/entities/critere.entity';
import { FichierLivrable } from '../../../database/entities/fichier-livrable.entity';
import { Livrable } from '../../../database/entities/livrable.entity';
import { NoteCritere } from '../../../database/entities/note-critere.entity';
import { StatutCorrection } from '../../../database/enums/statut-correction.enum';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';
import { User } from '../../../database/entities/user.entity';
import { MailService } from '../../../mail/mail.service';
import { StockageService } from '../../../stockage/stockage.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { AteliersService } from '../ateliers.service';
import { GrillesService } from '../grille/grilles.service';
import { MESSAGE_DEJA_EN_CORRECTION, MESSAGE_PAS_OUVERT } from './correction.regles';
import {
  CorrectionsService,
  MESSAGE_CRITERE_INTROUVABLE,
  MESSAGE_FICHIER_INTROUVABLE,
  MESSAGE_LIVRABLE_INTROUVABLE,
} from './corrections.service';

/**
 * CorrectionsService (US-ATEL-06) : base, stockage, grille et audit simulés ;
 * horloge de PostgreSQL FIXE. Les verrous et la concurrence sont prouvés par
 * l'e2e (vraie base).
 */
describe('CorrectionsService (US-ATEL-06)', () => {
  let service: CorrectionsService;

  const MAINTENANT = new Date('2026-11-09T09:00:00.000Z');
  const contexte = { adresseIp: '127.0.0.1' };
  const NIVEAUX = [
    { id: 'n1', ordre: 1, libelle: 'Insuffisant', pointsMinPct: 0, pointsMaxPct: 25 },
    { id: 'n2', ordre: 2, libelle: 'Acceptable', pointsMinPct: 25, pointsMaxPct: 50 },
    { id: 'n3', ordre: 3, libelle: 'Bon', pointsMinPct: 50, pointsMaxPct: 75 },
    { id: 'n4', ordre: 4, libelle: 'Excellent', pointsMinPct: 75, pointsMaxPct: 100 },
  ];
  const CRITERES = [
    {
      id: 'c1',
      ordre: 1,
      intitule: 'Fonctionnement',
      ponderation: 60,
      description: null,
      niveaux: NIVEAUX,
    },
    { id: 'c2', ordre: 2, intitule: 'Tests', ponderation: 40, description: null, niveaux: NIVEAUX },
  ];

  const livrable = (statut = StatutLivrable.SOUMIS): Livrable =>
    ({ id: 'liv-1', atelierId: 'at-1', apprenantId: 'app-1', statut }) as Livrable;

  const mockManager = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    query: jest.fn(),
    count: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockAteliers = { maintenant: jest.fn() };
  const mockGrilles = { criteresDeLAtelier: jest.fn() };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockStockage = { lire: jest.fn() };
  const mockMail = { sendCorrectionFinaliseeEmail: jest.fn() };
  const mockAudit = { record: jest.fn() };

  /** findOne selon l'entité demandée. */
  const reponses = new Map<unknown, unknown>();
  const repondre = (entite: unknown, valeur: unknown): void => {
    reponses.set(entite, valeur);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    reponses.clear();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CorrectionsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: AteliersService, useValue: mockAteliers },
        { provide: GrillesService, useValue: mockGrilles },
        { provide: FormationsService, useValue: mockFormations },
        { provide: StockageService, useValue: mockStockage },
        { provide: MailService, useValue: mockMail },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(CorrectionsService);

    mockManager.findOne.mockImplementation(async (entite: unknown) => reponses.get(entite) ?? null);
    mockManager.query.mockImplementation(async (sql: string) =>
      sql.includes('formation_id') ? [{ formation_id: 'formation-1' }] : [],
    );
    mockAteliers.maintenant.mockResolvedValue(MAINTENANT);
    mockGrilles.criteresDeLAtelier.mockResolvedValue(CRITERES);
    mockFormations.chargerPourEcriture.mockResolvedValue({ id: 'formation-1' });
    mockAudit.record.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  // ===================================================================
  describe('ouvrir', () => {
    beforeEach(() => {
      repondre(Livrable, livrable());
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'liv-1' } as never);
    });

    it('SOUMIS -> EN_CORRECTION sous verrou, crée la correction, trace', async () => {
      await expect(service.ouvrir('form-1', 'liv-1', contexte)).resolves.toEqual({ id: 'liv-1' });

      expect(mockManager.findOne).toHaveBeenCalledWith(Livrable, {
        where: { id: 'liv-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('formation-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        Livrable,
        { id: 'liv-1' },
        { statut: StatutLivrable.EN_CORRECTION },
      );
      expect(mockManager.insert).toHaveBeenCalledWith(Correction, {
        livrableId: 'liv-1',
        correcteurId: 'form-1',
        statut: StatutCorrection.EN_COURS,
        dateOuverture: MAINTENANT,
      });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CORRECTION_OUVERTE',
          acteur: 'form-1',
          cible: 'liv-1',
          resultat: 'Succès',
          detailsAvantApres: {
            atelierId: 'at-1',
            avant: { statut: 'SOUMIS' },
            apres: { statut: 'EN_CORRECTION' },
          },
        }),
      );
    });

    it('livrable inconnu -> 404, rien écrit', async () => {
      reponses.clear();
      await expect(service.ouvrir('form-1', 'liv-1', contexte)).rejects.toThrow(
        new NotFoundException(MESSAGE_LIVRABLE_INTROUVABLE),
      );
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('déjà en correction -> 409, rien écrit ni tracé', async () => {
      repondre(Livrable, livrable(StatutLivrable.EN_CORRECTION));
      await expect(service.ouvrir('form-1', 'liv-1', contexte)).rejects.toThrow(
        new ConflictException(MESSAGE_DEJA_EN_CORRECTION),
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockManager.insert).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('formation archivée -> 409, rien écrit', async () => {
      mockFormations.chargerPourEcriture.mockRejectedValue(
        new ConflictException('Une formation archivée ne peut plus être modifiée.'),
      );
      await expect(service.ouvrir('form-1', 'liv-1', contexte)).rejects.toThrow(ConflictException);
      expect(mockManager.update).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe('noterCritere', () => {
    const dto = { niveau: 3, pointsPct: 62.5, commentaire: '  Bonne couverture.  ' };
    const enregistree = {
      id: 'note-1',
      pointsPct: 62.5,
      commentaire: 'Bonne couverture.',
      updatedAt: MAINTENANT,
    };

    beforeEach(() => {
      repondre(Livrable, livrable(StatutLivrable.EN_CORRECTION));
      repondre(Critere, { id: 'c1', ponderation: 60, niveaux: NIVEAUX });
      mockManager.findOneOrFail.mockImplementation(async (entite: unknown) =>
        entite === Correction ? { id: 'cor-1' } : enregistree,
      );
      mockManager.count.mockResolvedValue(2);
      mockManager.query.mockImplementation(async (sql: string) =>
        sql.includes('formation_id')
          ? [{ formation_id: 'formation-1' }]
          : [{ points: '62.5', ponderation: 60 }],
      );
    });

    it('première note : insertion, score recalculé, audit avant null', async () => {
      const vue = await service.noterCritere('form-1', 'liv-1', 'c1', dto, contexte);

      expect(mockManager.insert).toHaveBeenCalledWith(NoteCritere, {
        correctionId: 'cor-1',
        critereId: 'c1',
        niveauId: 'n3',
        pointsPct: 62.5,
        commentaire: 'Bonne couverture.',
      });
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(Critere, {
        where: { id: 'c1', grille: { atelierId: 'at-1' } },
        relations: { niveaux: true },
      });
      expect(vue).toEqual({
        note: {
          critereId: 'c1',
          niveau: 3,
          libelleNiveau: 'Bon',
          pointsPct: 62.5,
          contribution: 37.5,
          commentaire: 'Bonne couverture.',
          updatedAt: MAINTENANT,
        },
        scoreActuel: 37.5,
        avancement: { notes: 1, total: 2, complete: false },
      });
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'NOTE_CRITERE_ENREGISTREE',
          cible: 'liv-1',
          detailsAvantApres: expect.objectContaining({
            critereId: 'c1',
            avant: null,
            apres: { niveau: 3, pointsPct: 62.5, commentaire: 'Bonne couverture.' },
            scoreActuel: 37.5,
          }),
        }),
      );
    });

    it('renote : mise à jour de la même ligne, audit avec l’avant', async () => {
      repondre(NoteCritere, {
        id: 'note-1',
        pointsPct: 40,
        commentaire: null,
        niveau: { ordre: 2 },
      });
      await service.noterCritere('form-1', 'liv-1', 'c1', dto, contexte);
      expect(mockManager.update).toHaveBeenCalledWith(
        NoteCritere,
        { id: 'note-1' },
        { niveauId: 'n3', pointsPct: 62.5, commentaire: 'Bonne couverture.' },
      );
      expect(mockManager.insert).not.toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detailsAvantApres: expect.objectContaining({
            avant: { niveau: 2, pointsPct: 40, commentaire: null },
          }),
        }),
      );
    });

    it('correction pas ouverte (SOUMIS) -> 409, rien écrit', async () => {
      repondre(Livrable, livrable(StatutLivrable.SOUMIS));
      await expect(service.noterCritere('form-1', 'liv-1', 'c1', dto, contexte)).rejects.toThrow(
        new ConflictException(MESSAGE_PAS_OUVERT),
      );
      expect(mockManager.insert).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('critère étranger à la grille -> 404', async () => {
      reponses.delete(Critere);
      await expect(service.noterCritere('form-1', 'liv-1', 'cx', dto, contexte)).rejects.toThrow(
        new NotFoundException(MESSAGE_CRITERE_INTROUVABLE),
      );
      expect(mockManager.insert).not.toHaveBeenCalled();
    });

    it('points hors de la plage du niveau -> 400, rien écrit', async () => {
      await expect(
        service.noterCritere('form-1', 'liv-1', 'c1', { niveau: 3, pointsPct: 80 }, contexte),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.insert).not.toHaveBeenCalled();
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('formation archivée -> 409', async () => {
      mockFormations.chargerPourEcriture.mockRejectedValue(new ConflictException('archivée'));
      await expect(service.noterCritere('form-1', 'liv-1', 'c1', dto, contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockManager.insert).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe('telechargerFichier', () => {
    const fichier = {
      livrableId: 'liv-1',
      ordre: 1,
      nomOriginal: 'résumé.pdf',
      tailleOctets: 12,
      sha256: 'a'.repeat(64),
      cleStockage: 'livrables/app-1/at-1/liv-1/v1/1-resume.pdf',
    };

    it('relaie le flux et trace le téléchargement', async () => {
      repondre(FichierLivrable, fichier);
      const flux = Readable.from(['%PDF']);
      mockStockage.lire.mockResolvedValue({ flux, taille: 12 });

      await expect(service.telechargerFichier('form-1', 'liv-1', 1, contexte)).resolves.toEqual({
        flux,
        nomOriginal: 'résumé.pdf',
        taille: 12,
      });
      expect(mockStockage.lire).toHaveBeenCalledWith(fichier.cleStockage);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LIVRABLE_FICHIER_TELECHARGE',
          detailsAvantApres: { ordre: 1, nomOriginal: 'résumé.pdf', sha256: fichier.sha256 },
        }),
      );
    });

    it('fichier inconnu -> 404', async () => {
      await expect(service.telechargerFichier('form-1', 'liv-1', 3, contexte)).rejects.toThrow(
        new NotFoundException(MESSAGE_FICHIER_INTROUVABLE),
      );
      expect(mockStockage.lire).not.toHaveBeenCalled();
    });

    it('stockage injoignable -> 503, pas d’audit de succès', async () => {
      repondre(FichierLivrable, fichier);
      mockStockage.lire.mockRejectedValue(new Error('ECONNREFUSED'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(service.telechargerFichier('form-1', 'liv-1', 1, contexte)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  describe('listerDeLAtelier et detail', () => {
    const ligne = (id: string, statut: StatutLivrable): unknown => ({
      id,
      apprenantId: `app-${id}`,
      apprenant: { prenom: 'Sami', nom: 'Ben Ali', email: 's@x.tn', motDePasseHash: 'secret' },
      version: 1,
      statut,
      dateSoumission: MAINTENANT,
      enRetard: false,
      fichiers: [{}, {}],
    });

    it('aucun livrable -> liste vide, sans lire la grille', async () => {
      mockManager.find.mockResolvedValue([]);
      await expect(service.listerDeLAtelier('at-1')).resolves.toEqual([]);
      expect(mockGrilles.criteresDeLAtelier).not.toHaveBeenCalled();
    });

    it('avancement null tant que la correction n’est pas ouverte ; filtre de statut', async () => {
      mockManager.find.mockResolvedValue([
        ligne('l1', StatutLivrable.SOUMIS),
        ligne('l2', StatutLivrable.EN_CORRECTION),
      ]);
      mockManager.query.mockResolvedValue([{ livrable_id: 'l2', notes: 1 }]);

      const liste = await service.listerDeLAtelier('at-1', StatutLivrable.SOUMIS);
      expect(mockManager.find).toHaveBeenCalledWith(
        Livrable,
        expect.objectContaining({ where: { atelierId: 'at-1', statut: StatutLivrable.SOUMIS } }),
      );
      expect(liste[0]).toEqual({
        id: 'l1',
        apprenant: { id: 'app-l1', prenom: 'Sami', nom: 'Ben Ali', email: 's@x.tn' },
        version: 1,
        statut: StatutLivrable.SOUMIS,
        dateSoumission: MAINTENANT,
        enRetard: false,
        nbFichiers: 2,
        avancement: null,
        scoreFinal: null,
      });
      expect(liste[1].avancement).toEqual({ notes: 1, total: 2, complete: false });
    });

    it('detail : livrable inconnu -> 404', async () => {
      await expect(service.detail('liv-x')).rejects.toThrow(NotFoundException);
    });

    it('detail : notes dans l’ordre de la grille, score pondéré, jamais la clé de stockage', async () => {
      repondre(Livrable, {
        ...(ligne('liv-1', StatutLivrable.EN_CORRECTION) as object),
        atelierId: 'at-1',
        hashTracabilite: 'b'.repeat(64),
        commentaire: null,
        liens: [],
        fichiers: [
          {
            ordre: 1,
            nomOriginal: 'r.pdf',
            extension: 'pdf',
            tailleOctets: 4,
            sha256: 'c'.repeat(64),
            cleStockage: 'secret/cle',
          },
        ],
        atelier: {
          id: 'at-1',
          titre: 'Projet',
          module: { formationId: 'formation-1', formation: { titre: 'Back-end' } },
        },
      });
      repondre(Correction, {
        id: 'cor-1',
        statut: StatutCorrection.EN_COURS,
        dateOuverture: MAINTENANT,
        correcteurId: 'form-1',
        correcteur: { prenom: 'Amel', nom: 'Trabelsi', email: 'a@x.tn' },
        notes: [
          {
            critereId: 'c2',
            niveau: { ordre: 4, libelle: 'Excellent' },
            pointsPct: 100,
            commentaire: null,
            updatedAt: MAINTENANT,
          },
          {
            critereId: 'c1',
            niveau: { ordre: 3, libelle: 'Bon' },
            pointsPct: 50,
            commentaire: 'ok',
            updatedAt: MAINTENANT,
          },
        ],
      });

      const vue = await service.detail('liv-1');
      expect(JSON.stringify(vue)).not.toContain('secret');
      expect(vue.atelier).toEqual({
        id: 'at-1',
        titre: 'Projet',
        formationId: 'formation-1',
        formationTitre: 'Back-end',
      });
      expect(vue.correction?.notes.map((n) => n.critereId)).toEqual(['c1', 'c2']);
      expect(vue.correction?.notes[0].contribution).toBe(30);
      expect(vue.correction?.scoreActuel).toBe(70);
      expect(vue.correction?.avancement).toEqual({ notes: 2, total: 2, complete: true });
      expect(vue.correction?.correcteur).toEqual({ id: 'form-1', prenom: 'Amel', nom: 'Trabelsi' });
    });

    it('detail : correction pas encore ouverte -> null', async () => {
      repondre(Livrable, {
        ...(ligne('liv-1', StatutLivrable.SOUMIS) as object),
        atelier: {
          id: 'at-1',
          titre: 'P',
          module: { formationId: 'f', formation: { titre: 'F' } },
        },
      });
      const vue = await service.detail('liv-1');
      expect(vue.correction).toBeNull();
      expect(vue.criteres).toHaveLength(2);
    });
  });

  // ===================================================================
  describe('finaliser (US-ATEL-07)', () => {
    const dto = { commentaireGeneral: '  Bon travail, soignez les tests.  ' };
    const grille = (nb: number, total: number): Array<{ nb: number; total: number }> => [
      { nb, total },
    ];
    const notes = [
      { points: 50, ponderation: 60 },
      { points: 100, ponderation: 40 },
    ];

    beforeEach(() => {
      repondre(Livrable, livrable(StatutLivrable.EN_CORRECTION));
      mockManager.findOneOrFail.mockImplementation(async (entite: unknown) => {
        if (entite === Correction) return { id: 'cor-1' };
        if (entite === User) return { id: 'app-1', prenom: 'Sami', email: 's@x.tn' };
        return {
          id: 'liv-1',
          atelier: { titre: 'Projet', module: { formation: { titre: 'Back-end' } } },
        };
      });
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('formation_id')) return [{ formation_id: 'formation-1' }];
        if (sql.includes('sum(c.ponderation)')) return grille(2, 100);
        return notes;
      });
      mockMail.sendCorrectionFinaliseeEmail.mockResolvedValue(undefined);
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'liv-1' } as never);
    });

    it('fige le score, TERMINEE + NOTE, trace, prévient l’apprenant', async () => {
      await expect(service.finaliser('form-1', 'liv-1', dto, contexte)).resolves.toEqual({
        id: 'liv-1',
      });
      expect(mockManager.update).toHaveBeenCalledWith(
        Correction,
        { id: 'cor-1' },
        {
          statut: StatutCorrection.TERMINEE,
          scoreTotal: 70,
          commentaireGeneral: 'Bon travail, soignez les tests.',
          dateFinalisation: MAINTENANT,
        },
      );
      expect(mockManager.update).toHaveBeenCalledWith(
        Livrable,
        { id: 'liv-1' },
        { statut: StatutLivrable.NOTE },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CORRECTION_FINALISEE',
          cible: 'liv-1',
          detailsAvantApres: expect.objectContaining({ score: 70, nbCriteres: 2 }),
        }),
      );
      expect(mockMail.sendCorrectionFinaliseeEmail).toHaveBeenCalledWith('s@x.tn', {
        prenom: 'Sami',
        titreAtelier: 'Projet',
        titreFormation: 'Back-end',
        atelierId: 'at-1',
        score: 70,
      });
    });

    it('correction incomplète -> 400, rien écrit ni envoyé', async () => {
      mockManager.query.mockImplementation(async (sql: string) => {
        if (sql.includes('formation_id')) return [{ formation_id: 'formation-1' }];
        if (sql.includes('sum(c.ponderation)')) return grille(3, 100);
        return notes;
      });
      await expect(service.finaliser('form-1', 'liv-1', dto, contexte)).rejects.toThrow(
        'Correction incomplète : 1 critère sur 3 n’est pas noté.',
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockMail.sendCorrectionFinaliseeEmail).not.toHaveBeenCalled();
    });

    it('commentaire général vide -> 400', async () => {
      await expect(
        service.finaliser('form-1', 'liv-1', { commentaireGeneral: '   ' }, contexte),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.update).not.toHaveBeenCalled();
    });

    it('déjà finalisée (NOTE) -> 409, rien écrit', async () => {
      repondre(Livrable, livrable(StatutLivrable.NOTE));
      await expect(service.finaliser('form-1', 'liv-1', dto, contexte)).rejects.toThrow(
        ConflictException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('échec de l’email : journalisé, la finalisation reste acquise', async () => {
      mockMail.sendCorrectionFinaliseeEmail.mockRejectedValue(new Error('ECONNREFUSED'));
      const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(service.finaliser('form-1', 'liv-1', dto, contexte)).resolves.toEqual({
        id: 'liv-1',
      });
      expect(erreur).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
    });
  });
});
