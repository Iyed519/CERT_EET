import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { createHash } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { DataSource, QueryFailedError } from 'typeorm';
import { ModuleFormation } from '../../../database/entities/module-formation.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import { MailService } from '../../../mail/mail.service';
import { StockageService } from '../../../stockage/stockage.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { FOURNISSEUR_EMBEDDINGS } from '../embeddings/fournisseur-embeddings';
import { FileIaService } from '../file-ia.service';
import {
  MESSAGE_ECHEC_TRANSITOIRE,
  MESSAGE_FILE_INDISPONIBLE,
  MESSAGE_STOCKAGE_SUPPORT,
  MESSAGE_SUPPORT_UTILISE,
  FichierSupportTemporaire,
  SupportsService,
} from './supports.service';
import { MESSAGE_SUPPORT_DOUBLON, MESSAGE_NON_REINDEXABLE } from './support.regles';

/**
 * SupportsService (US-IA-01) : base, file, stockage, embeddings, mail et
 * audit simulés ; l'extraction réelle tourne (TXT). La file réelle, pgvector,
 * MinIO et la concurrence sont éprouvés par l'e2e.
 */
describe('SupportsService (US-IA-01)', () => {
  let service: SupportsService;
  const dossier = mkdtempSync(join(tmpdir(), 'supports-spec-'));
  const TEXTE =
    'Le jeton JWT est signé avec une clé privée RS256. La clé publique permet de vérifier la ' +
    'signature sans pouvoir en produire une nouvelle.';
  const fichierTxt = (contenu = TEXTE, nom = 'cours.txt'): FichierSupportTemporaire => {
    const chemin = join(dossier, `${Math.random()}`);
    writeFileSync(chemin, contenu);
    return { originalname: nom, path: chemin, size: Buffer.byteLength(contenu) };
  };

  const mockManager = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    existsBy: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    query: jest.fn(),
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockStockage = { deposer: jest.fn(), supprimer: jest.fn(), lire: jest.fn() };
  const mockFile = { ajouterIndexation: jest.fn(), demarrerWorkerIndexation: jest.fn() };
  const mockEmbeddings = {
    modele: 'test-v1',
    vectoriser: jest.fn(async (textes: string[]) => textes.map(() => [1, 0, 0])),
  };
  const mockMail = { sendSupportIndexationEmail: jest.fn() };
  const mockAudit = { record: jest.fn() };

  const support = (statut = StatutSupport.EN_INDEXATION): Partial<SupportPedagogique> => ({
    id: 's-1',
    moduleId: 'm-1',
    deposePar: 'u-1',
    titre: 'Cours',
    nomOriginal: 'cours.txt',
    extension: 'txt',
    tailleOctets: Buffer.byteLength(TEXTE),
    sha256: 'a'.repeat(64),
    cleStockage: 'supports/m-1/s-1/original.txt',
    statut,
    nbTentatives: 0,
    dateDepot: new Date('2026-11-09T10:00:00Z'),
  });
  const erreurPg = (code: string): QueryFailedError =>
    new QueryFailedError('Q', [], Object.assign(new Error('pg'), { code }));

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SupportsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FormationsService, useValue: mockFormations },
        { provide: StockageService, useValue: mockStockage },
        { provide: FileIaService, useValue: mockFile },
        { provide: FOURNISSEUR_EMBEDDINGS, useValue: mockEmbeddings },
        { provide: MailService, useValue: mockMail },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(SupportsService);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockManager.findOne.mockImplementation(async (entite: unknown) =>
      entite === ModuleFormation ? { id: 'm-1', formationId: 'f-1' } : support(),
    );
    mockManager.findOneOrFail.mockResolvedValue({ id: 'm-1', formationId: 'f-1' });
    mockManager.existsBy.mockResolvedValue(false);
    mockDataSource.query.mockResolvedValue([]);
    mockStockage.deposer.mockResolvedValue(undefined);
    mockFile.ajouterIndexation.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
    mockMail.sendSupportIndexationEmail.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('démarre le worker d’indexation au démarrage', () => {
    service.onApplicationBootstrap();
    expect(mockFile.demarrerWorkerIndexation).toHaveBeenCalledWith({
      indexer: expect.any(Function),
      echecDefinitif: expect.any(Function),
    });
  });

  describe('deposer', () => {
    it('dépose sur MinIO, insère EN_INDEXATION, trace, met en file', async () => {
      const vue = await service.deposer('u-1', 'm-1', fichierTxt(), '  Cours JWT ', {
        adresseIp: '10.0.0.1',
      });
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      const [[objet]] = mockStockage.deposer.mock.calls[0] as [
        Array<{ cle: string; sha256: string }>,
      ];
      expect(objet.cle).toMatch(/^supports\/m-1\/[0-9a-f-]{36}\/original\.txt$/);
      expect(objet.sha256).toBe(createHash('sha256').update(TEXTE).digest('hex'));
      expect(mockManager.existsBy).toHaveBeenCalledWith(SupportPedagogique, {
        moduleId: 'm-1',
        sha256: objet.sha256,
      });
      const [sql, params] = mockDataSource.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("'EN_INDEXATION'");
      expect(params.slice(1, 6)).toEqual(['m-1', 'u-1', 'Cours JWT', 'cours.txt', 'txt']);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_DEPOSE', acteur: 'u-1', adresseIp: '10.0.0.1' }),
      );
      expect(mockFile.ajouterIndexation).toHaveBeenCalledWith(params[0], undefined);
      expect(vue).toEqual(
        expect.objectContaining({ id: 's-1', statut: StatutSupport.EN_INDEXATION }),
      );
      expect(vue).not.toHaveProperty('cleStockage');
    });

    it('404 pour un module inconnu, avant tout contrôle', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(
        service.deposer('u-1', 'm-x', fichierTxt(), undefined, { adresseIp: null }),
      ).rejects.toThrow(NotFoundException);
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('400 sans fichier ou au mauvais format : rien n’est déposé', async () => {
      await expect(
        service.deposer('u-1', 'm-1', null, undefined, { adresseIp: null }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deposer('u-1', 'm-1', fichierTxt('x', 'virus.exe'), undefined, { adresseIp: null }),
      ).rejects.toThrow(BadRequestException);
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('409 si le même fichier est déjà dans le module (contrôle préalable)', async () => {
      mockManager.existsBy.mockResolvedValue(true);
      await expect(
        service.deposer('u-1', 'm-1', fichierTxt(), undefined, { adresseIp: null }),
      ).rejects.toThrow(new ConflictException(MESSAGE_SUPPORT_DOUBLON));
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('503 si le stockage est injoignable : rien n’est inséré', async () => {
      mockStockage.deposer.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.deposer('u-1', 'm-1', fichierTxt(), undefined, { adresseIp: null }),
      ).rejects.toThrow(new ServiceUnavailableException(MESSAGE_STOCKAGE_SUPPORT));
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('dépôt simultané perdant (UNIQUE) -> 409 et objet retiré ; autre erreur relancée', async () => {
      mockDataSource.query.mockRejectedValueOnce(erreurPg('23505'));
      await expect(
        service.deposer('u-1', 'm-1', fichierTxt(), undefined, { adresseIp: null }),
      ).rejects.toThrow(new ConflictException(MESSAGE_SUPPORT_DOUBLON));
      expect(mockStockage.supprimer).toHaveBeenCalledWith([expect.stringMatching(/^supports\//)]);
      expect(mockAudit.record).not.toHaveBeenCalled();

      mockDataSource.query.mockRejectedValueOnce(new Error('panne'));
      await expect(
        service.deposer('u-1', 'm-1', fichierTxt(), undefined, { adresseIp: null }),
      ).rejects.toThrow('panne');
      expect(mockStockage.supprimer).toHaveBeenCalledTimes(2);
    });

    it('file injoignable : le support passe en échec, relançable', async () => {
      mockFile.ajouterIndexation.mockRejectedValue(new Error('Redis'));
      await service.deposer('u-1', 'm-1', fichierTxt(), undefined, { adresseIp: null });
      expect(mockDataSource.query).toHaveBeenLastCalledWith(
        expect.stringContaining("SET statut = 'ECHEC_INDEXATION'"),
        [expect.any(String), MESSAGE_FILE_INDISPONIBLE],
      );
    });
  });

  describe('lecture', () => {
    it('liste les supports du module (404 si le module est inconnu)', async () => {
      mockManager.find.mockResolvedValue([
        { ...support(), deposant: { prenom: 'Sami', nom: 'Ben Ali' } },
      ]);
      const liste = await service.listerDuModule('m-1');
      expect(liste[0].deposePar).toEqual({ id: 'u-1', prenom: 'Sami', nom: 'Ben Ali' });
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.listerDuModule('m-x')).rejects.toThrow(NotFoundException);
    });

    it('fiche avec aperçu des premiers passages (404 si inconnu)', async () => {
      mockDataSource.query.mockResolvedValue([{ ordre: 1, texte: 'Le jeton' }]);
      const fiche = await service.detail('s-1');
      expect(fiche.apercu).toEqual([{ ordre: 1, texte: 'Le jeton' }]);
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.detail('s-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reindexer', () => {
    it('sous verrou, ECHEC -> EN_INDEXATION, nouveau travail suffixé', async () => {
      mockManager.findOne.mockImplementation(async (entite: unknown) =>
        entite === ModuleFormation
          ? { id: 'm-1', formationId: 'f-1' }
          : { ...support(StatutSupport.ECHEC_INDEXATION), nbTentatives: 3 },
      );
      await service.reindexer('u-1', 's-1', { adresseIp: null });
      expect(mockManager.findOne).toHaveBeenCalledWith(
        SupportPedagogique,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockFormations.chargerPourEcriture).toHaveBeenCalledWith('f-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        SupportPedagogique,
        { id: 's-1' },
        { statut: StatutSupport.EN_INDEXATION, derniereErreur: null },
      );
      expect(mockFile.ajouterIndexation).toHaveBeenCalledWith('s-1', 'r3');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_REINDEXATION' }),
      );
    });

    it('409 pour un support qui n’est pas en échec ; 404 inconnu', async () => {
      await expect(service.reindexer('u-1', 's-1', { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_NON_REINDEXABLE),
      );
      expect(mockFile.ajouterIndexation).not.toHaveBeenCalled();
      mockManager.findOne.mockResolvedValue(null);
      await expect(service.reindexer('u-1', 's-x', { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('supprimer', () => {
    it('supprime la ligne sous verrou, puis l’objet, et trace', async () => {
      await service.supprimer('u-1', 's-1', { adresseIp: null });
      expect(mockManager.delete).toHaveBeenCalledWith(SupportPedagogique, { id: 's-1' });
      expect(mockStockage.supprimer).toHaveBeenCalledWith(['supports/m-1/s-1/original.txt']);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_SUPPRIME', cible: 's-1' }),
      );
    });

    it('support utilisé (FK) -> 409 ; autre erreur relancée ; objet conservé', async () => {
      mockManager.delete.mockRejectedValueOnce(erreurPg('23503'));
      await expect(service.supprimer('u-1', 's-1', { adresseIp: null })).rejects.toThrow(
        new ConflictException(MESSAGE_SUPPORT_UTILISE),
      );
      mockManager.delete.mockRejectedValueOnce(new Error('panne'));
      await expect(service.supprimer('u-1', 's-1', { adresseIp: null })).rejects.toThrow('panne');
      expect(mockStockage.supprimer).not.toHaveBeenCalled();
    });
  });

  describe('indexer (worker)', () => {
    const lireTexte = (contenu: string): void => {
      mockStockage.lire.mockResolvedValue({
        flux: Readable.from([Buffer.from(contenu)]),
        taille: null,
      });
    };

    it('ne fait rien si le support n’est plus EN_INDEXATION (idempotent)', async () => {
      mockManager.findOne.mockResolvedValue(support(StatutSupport.INDEXE));
      await service.indexer('s-1');
      expect(mockStockage.lire).not.toHaveBeenCalled();
      mockManager.findOne.mockResolvedValue(null);
      await service.indexer('s-1');
      expect(mockStockage.lire).not.toHaveBeenCalled();
    });

    it('extrait, découpe, vectorise, remplace les segments et passe INDEXE', async () => {
      lireTexte(TEXTE);
      await service.indexer('s-1');
      expect(mockManager.update).toHaveBeenCalledWith(
        SupportPedagogique,
        { id: 's-1' },
        { nbTentatives: 1 },
      );
      expect(mockEmbeddings.vectoriser).toHaveBeenCalledWith([TEXTE], 'passage');
      const requetes = mockManager.query.mock.calls.map((c) => c[0] as string);
      expect(requetes[0]).toContain('DELETE FROM segments_support');
      expect(requetes[1]).toContain('INSERT INTO segments_support');
      expect(mockManager.query.mock.calls[1][1]).toEqual(['s-1', 1, TEXTE, '[1,0,0]']);
      expect(requetes[2]).toContain("SET statut = 'INDEXE'");
      expect(mockManager.query.mock.calls[2][1]).toEqual(['s-1', 1, TEXTE.length, 'test-v1']);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_INDEXE', acteur: null }),
      );
    });

    it('insère les segments par lots de 100', async () => {
      mockManager.findOne.mockResolvedValue({ ...support(), tailleOctets: 20 * 1024 * 1024 });
      lireTexte(
        Array.from({ length: 260 }, (_v, i) => `Paragraphe ${i} : ${'mot '.repeat(400)}`).join(
          '\n\n',
        ),
      );
      await service.indexer('s-1');
      const inserts = mockManager.query.mock.calls.filter((c) =>
        (c[0] as string).startsWith('INSERT INTO segments_support'),
      );
      const nb = (mockEmbeddings.vectoriser.mock.calls[0][0] as string[]).length;
      expect(nb).toBeGreaterThan(200);
      expect(inserts).toHaveLength(Math.ceil(nb / 100));
      expect((inserts[1][1] as unknown[])[1]).toBe(101);
    });

    it('supprimé pendant l’indexation : rien n’est écrit ni tracé', async () => {
      lireTexte(TEXTE);
      mockManager.findOne.mockResolvedValueOnce(support()).mockResolvedValueOnce(null);
      await service.indexer('s-1');
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('statut changé entre-temps (autre traitement) : rien n’est écrit ni tracé', async () => {
      lireTexte(TEXTE);
      mockManager.findOne
        .mockResolvedValueOnce(support())
        .mockResolvedValueOnce(support(StatutSupport.INDEXE));
      await service.indexer('s-1');
      expect(mockManager.query).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('contenu sans texte exploitable -> échec sans reprise (UnrecoverableError)', async () => {
      lireTexte('   \n  .  ');
      await expect(service.indexer('s-1')).rejects.toThrow(UnrecoverableError);
      lireTexte(TEXTE + 'x'.repeat(10));
      mockStockage.lire.mockResolvedValue({
        flux: Readable.from([Buffer.alloc(Buffer.byteLength(TEXTE) + 50, 0x41)]),
        taille: null,
      });
      await expect(service.indexer('s-1')).rejects.toThrow(
        'Le fichier stocké ne correspond pas au dépôt.',
      );
    });

    it('panne passagère (stockage) : relancée telle quelle pour une reprise', async () => {
      mockStockage.lire.mockRejectedValue(new Error('ECONNRESET'));
      await expect(service.indexer('s-1')).rejects.toThrow('ECONNRESET');
      await expect(service.indexer('s-1')).rejects.not.toThrow(UnrecoverableError);
    });
  });

  describe('echecDefinitif', () => {
    it('contenu en cause : motif d’origine, audit, email', async () => {
      mockDataSource.query.mockResolvedValue([[{ id: 's-1' }], 1]);
      mockManager.findOne.mockResolvedValue({
        ...support(),
        module: { formationId: 'f-1', formation: { titre: 'Back-end' } },
      });
      await service.echecDefinitif('s-1', new UnrecoverableError('PDF illisible ou endommagé.'));
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET statut = 'ECHEC_INDEXATION'"),
        ['s-1', 'PDF illisible ou endommagé.'],
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_ECHEC_INDEXATION', resultat: 'Échec' }),
      );
      expect(mockMail.sendSupportIndexationEmail).toHaveBeenCalled();
    });

    it('panne passagère : motif générique (pas de détail technique au formateur)', async () => {
      mockDataSource.query.mockResolvedValue([[{ id: 's-1' }], 1]);
      await service.echecDefinitif('s-1', new Error('connect ECONNREFUSED 10.0.0.3:9000'));
      expect(mockDataSource.query).toHaveBeenCalledWith(expect.any(String), [
        's-1',
        MESSAGE_ECHEC_TRANSITOIRE,
      ]);
    });

    it('support supprimé ou déjà traité : rien n’est tracé ; email en échec sans effet', async () => {
      mockDataSource.query.mockResolvedValue([[], 0]);
      await service.echecDefinitif('s-1', new Error('x'));
      expect(mockAudit.record).not.toHaveBeenCalled();

      mockDataSource.query.mockResolvedValue([[{ id: 's-1' }], 1]);
      mockManager.findOne.mockRejectedValue(new Error('base'));
      await expect(service.echecDefinitif('s-1', new Error('x'))).resolves.toBeUndefined();
    });
  });
});
