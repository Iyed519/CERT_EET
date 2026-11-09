import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { NatureRessource } from '../../database/enums/nature-ressource.enum';
import { Role } from '../../database/enums/role.enum';
import { RedisService } from '../../redis/redis.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { AutorisationRessourceService } from '../formations/autorisation/autorisation-ressource.service';
import { FormationsService } from '../formations/formations.service';
import { EspaceFormationService } from '../inscriptions/espace-formation.service';
import {
  FichierRessourceTemporaire,
  FichiersRessourcesService,
  MESSAGE_STOCKAGE_RESSOURCE,
  PlageInsatisfaisable,
  PREFIXE_JETON,
} from './fichiers-ressources.service';

/**
 * FichiersRessourcesService (US-FORM-06) : base, stockage, Redis, accès et
 * audit simulés. MinIO, les vrais jetons et les plages HTTP sont éprouvés par
 * l'e2e.
 */
describe('FichiersRessourcesService (US-FORM-06)', () => {
  let service: FichiersRessourcesService;
  const dossier = mkdtempSync(join(tmpdir(), 'ressources-spec-'));
  const PDF = Buffer.from('%PDF-1.7\nCours\n%%EOF');
  const fichier = (contenu = PDF, nom = 'Cours JWT.pdf'): FichierRessourceTemporaire => {
    const chemin = join(dossier, `${Math.random()}`);
    writeFileSync(chemin, contenu);
    return { originalname: nom, path: chemin, size: contenu.length };
  };

  const mockManager = { findOne: jest.fn(), findOneOrFail: jest.fn(), query: jest.fn() };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockFormations = { chargerPourEcriture: jest.fn() };
  const mockStockage = { deposer: jest.fn(), supprimer: jest.fn(), lirePlage: jest.fn() };
  const mockRedis = { set: jest.fn(), get: jest.fn() };
  const mockAutorisation = { estAffecte: jest.fn() };
  const mockEspace = { exigerAccesContenu: jest.fn() };
  const mockConfig = { getOrThrow: jest.fn().mockReturnValue({ tailleMaxMo: 1 }) };
  const mockAudit = { record: jest.fn() };
  const ctx = { adresseIp: null, methode: 'POST', route: '/api/ressources/r-1/lien' };

  const enregistre = (): Partial<RessourceModule> => ({
    id: 'r-1',
    moduleId: 'm-1',
    ordre: 3,
    nature: NatureRessource.FICHIER,
    titre: 'Cours JWT',
    nomOriginal: 'Cours JWT.pdf',
    extension: 'pdf',
    typeMime: 'application/pdf',
    tailleOctets: 1000,
    cleStockage: 'ressources/m-1/r-1/fichier.pdf',
    lecture: 'PDF',
    module: { id: 'm-1', formationId: 'f-1' } as ModuleFormation,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FichiersRessourcesService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FormationsService, useValue: mockFormations },
        { provide: StockageService, useValue: mockStockage },
        { provide: RedisService, useValue: mockRedis },
        { provide: AutorisationRessourceService, useValue: mockAutorisation },
        { provide: EspaceFormationService, useValue: mockEspace },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(FichiersRessourcesService);
    mockManager.findOne.mockImplementation(async (entite: unknown) =>
      entite === ModuleFormation ? { id: 'm-1', formationId: 'f-1' } : enregistre(),
    );
    mockManager.findOneOrFail.mockResolvedValue(enregistre());
    mockManager.query.mockResolvedValue([{ nb: 2, max: 2 }]);
    mockStockage.deposer.mockResolvedValue(undefined);
    mockAudit.record.mockResolvedValue(undefined);
  });

  describe('deposer', () => {
    it('contrôle, dépose sur MinIO, insère sous le verrou du module, trace', async () => {
      const vue = await service.deposer('u-1', 'm-1', fichier(), {}, { adresseIp: null });
      const [[objet]] = mockStockage.deposer.mock.calls[0] as [
        Array<{ cle: string; typeContenu: string; sha256: string }>,
      ];
      expect(objet.cle).toMatch(/^ressources\/m-1\/[0-9a-f-]{36}\/fichier\.pdf$/);
      expect(objet.typeContenu).toBe('application/pdf');
      expect(objet.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));
      expect(mockManager.findOne).toHaveBeenCalledWith(
        ModuleFormation,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      const insertion = mockManager.query.mock.calls[1] as [string, unknown[]];
      expect(insertion[0]).toContain("'FICHIER'");
      expect(insertion[1].slice(1, 9)).toEqual([
        'm-1',
        3,
        'Cours JWT',
        null,
        'Cours JWT.pdf',
        'pdf',
        'application/pdf',
        PDF.length,
      ]);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESSOURCE_AJOUTEE' }),
      );
      expect(vue.fichier).toEqual({
        nomOriginal: 'Cours JWT.pdf',
        extension: 'pdf',
        tailleOctets: 1000,
        lecture: 'PDF',
      });
      expect(vue).not.toHaveProperty('cleStockage');
    });

    it('413 au-delà de la taille configurée, avant tout dépôt', async () => {
      await expect(
        service.deposer(
          'u-1',
          'm-1',
          fichier(Buffer.alloc(1024 * 1024 + 1, 0x41), 'gros.bin'),
          {},
          {
            adresseIp: null,
          },
        ),
      ).rejects.toThrow(PayloadTooLargeException);
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('503 si le stockage est injoignable ; rien n’est inséré', async () => {
      mockStockage.deposer.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.deposer('u-1', 'm-1', fichier(), {}, { adresseIp: null }),
      ).rejects.toThrow(new ServiceUnavailableException(MESSAGE_STOCKAGE_RESSOURCE));
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('module plein (409) : l’objet déposé est retiré', async () => {
      mockManager.query.mockResolvedValueOnce([{ nb: 50, max: 50 }]);
      await expect(
        service.deposer('u-1', 'm-1', fichier(), {}, { adresseIp: null }),
      ).rejects.toThrow(ConflictException);
      expect(mockStockage.supprimer).toHaveBeenCalledWith([expect.stringMatching(/^ressources\//)]);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('404 module inconnu', async () => {
      mockManager.findOne.mockResolvedValue(null);
      await expect(
        service.deposer('u-1', 'm-x', fichier(), {}, { adresseIp: null }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('lienLecture', () => {
    it('administrateur : jeton aléatoire de 256 bits, 10 minutes dans Redis', async () => {
      const lien = await service.lienLecture({ id: 'a-1', role: Role.ADMINISTRATEUR }, 'r-1', ctx);
      expect(lien.url).toMatch(/^\/api\/ressources\/fichiers\/[A-Za-z0-9_-]{43}$/);
      expect(lien.expireDansSecondes).toBe(600);
      const jeton = lien.url.split('/').pop();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `${PREFIXE_JETON}${jeton}`,
        JSON.stringify({ ressourceId: 'r-1', utilisateurId: 'a-1' }),
        600,
      );
    });

    it('formateur affecté : oui ; non affecté : 403 tracé, pas de jeton', async () => {
      mockAutorisation.estAffecte.mockResolvedValueOnce(true);
      await service.lienLecture({ id: 'f-1', role: Role.FORMATEUR }, 'r-1', ctx);
      mockAutorisation.estAffecte.mockResolvedValueOnce(false);
      await expect(
        service.lienLecture({ id: 'f-2', role: Role.FORMATEUR }, 'r-1', ctx),
      ).rejects.toThrow(ForbiddenException);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCES_RESSOURCE_REFUSE', acteur: 'f-2' }),
      );
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('apprenant : contrôle d’inscription de « Mon espace » (refus propagé)', async () => {
      await service.lienLecture({ id: 'p-1', role: Role.APPRENANT }, 'r-1', ctx);
      expect(mockEspace.exigerAccesContenu).toHaveBeenCalledWith('p-1', 'f-1', ctx);
      mockEspace.exigerAccesContenu.mockRejectedValueOnce(new ForbiddenException('non inscrit'));
      await expect(
        service.lienLecture({ id: 'p-2', role: Role.APPRENANT }, 'r-1', ctx),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('404 ressource inconnue ou lien (pas un fichier)', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(
        service.lienLecture({ id: 'a-1', role: Role.ADMINISTRATEUR }, 'r-x', ctx),
      ).rejects.toThrow(NotFoundException);
      mockManager.findOne.mockResolvedValueOnce({ ...enregistre(), nature: NatureRessource.LIEN });
      await expect(
        service.lienLecture({ id: 'a-1', role: Role.ADMINISTRATEUR }, 'r-1', ctx),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('servir', () => {
    const JETON = 'a'.repeat(43);
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ ressourceId: 'r-1', utilisateurId: 'u-1' }));
      mockStockage.lirePlage.mockResolvedValue({
        flux: Readable.from([Buffer.from('x')]),
        taille: 1,
      });
    });

    it('fichier entier : 200, inline et vrai type pour un PDF, nosniff', async () => {
      const servi = await service.servir(JETON, undefined);
      expect(servi.statut).toBe(200);
      expect(mockStockage.lirePlage).toHaveBeenCalledWith('ressources/m-1/r-1/fichier.pdf', null);
      expect(servi.entetes).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Length': '1000',
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        }),
      );
      expect(servi.entetes['Content-Disposition']).toMatch(/^inline;/);
    });

    it('plage : 206 et Content-Range ; hors fichier : 416', async () => {
      const servi = await service.servir(JETON, 'bytes=100-199');
      expect(servi.statut).toBe(206);
      expect(servi.entetes['Content-Range']).toBe('bytes 100-199/1000');
      expect(servi.entetes['Content-Length']).toBe('100');
      await expect(service.servir(JETON, 'bytes=5000-')).rejects.toThrow(PlageInsatisfaisable);
    });

    it('format non lisible : téléchargement en octet-stream', async () => {
      mockManager.findOne.mockResolvedValue({
        ...enregistre(),
        nomOriginal: 'page.html',
        typeMime: 'application/octet-stream',
        lecture: null,
      });
      const servi = await service.servir(JETON, undefined);
      expect(servi.entetes['Content-Type']).toBe('application/octet-stream');
      expect(servi.entetes['Content-Disposition']).toMatch(/^attachment;/);
    });

    it('404 uniforme : jeton mal formé (sans lecture Redis), inconnu, ou ressource supprimée', async () => {
      await expect(service.servir('court', undefined)).rejects.toThrow(NotFoundException);
      expect(mockRedis.get).not.toHaveBeenCalled();
      mockRedis.get.mockResolvedValueOnce(null);
      await expect(service.servir(JETON, undefined)).rejects.toThrow(NotFoundException);
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.servir(JETON, undefined)).rejects.toThrow(NotFoundException);
    });

    it('stockage injoignable : 503', async () => {
      mockStockage.lirePlage.mockRejectedValue(new Error('S3'));
      await expect(service.servir(JETON, undefined)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
