import {
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { Certificat } from '../../database/entities/certificat.entity';
import { Formation } from '../../database/entities/formation.entity';
import { User } from '../../database/entities/user.entity';
import { MotifRevocation } from '../../database/enums/motif-revocation.enum';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { MailService } from '../../mail/mail.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { genererPdfCertificat } from './certificat-pdf';
import { CertificatsService } from './certificats.service';
import { FileCertificatsService } from './file-certificats.service';

jest.mock('./certificat-pdf', () => ({ genererPdfCertificat: jest.fn() }));

/**
 * CertificatsService (US-CERT-01) : base, file, stockage, mail et audit
 * simulés ; le PDF aussi. La file réelle, le worker et la concurrence sont
 * éprouvés par l'e2e (vrais Redis, PostgreSQL et S3).
 */
describe('CertificatsService (US-CERT-01)', () => {
  let service: CertificatsService;
  const PDF = Buffer.from('%PDF-1.7 certificat');
  const SHA = createHash('sha256').update(PDF).digest('hex');
  const DATE = new Date('2026-11-09T10:00:00Z');

  const mockManager = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    query: jest.fn(),
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockFile = { ajouter: jest.fn(), demarrerWorker: jest.fn() };
  const mockStockage = { deposerTampon: jest.fn(), supprimer: jest.fn(), lire: jest.fn() };
  const mockMail = { sendCertificatEmisEmail: jest.fn(), sendCertificatRevoqueEmail: jest.fn() };
  const mockAudit = { record: jest.fn() };
  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue({ appBaseUrl: 'http://localhost:3001' }),
  };

  const enAttente = (): Partial<Certificat> => ({
    id: 'cert-1',
    apprenantId: 'app-1',
    formationId: 'f-1',
    statut: StatutCertificat.EN_ATTENTE_GENERATION,
    scoreFinal: 71.5,
    mention: 'Bien',
    organismeEmetteur: 'ESPRIT Entreprise',
    dateEmission: DATE,
    nbTentatives: 0,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CertificatsService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FileCertificatsService, useValue: mockFile },
        { provide: StockageService, useValue: mockStockage },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(CertificatsService);
    mockAudit.record.mockResolvedValue(undefined);
    mockFile.ajouter.mockResolvedValue(undefined);
    (genererPdfCertificat as jest.Mock).mockResolvedValue(PDF);
    mockStockage.deposerTampon.mockResolvedValue(undefined);
    mockMail.sendCertificatEmisEmail.mockResolvedValue(undefined);
    mockManager.findOneOrFail.mockImplementation(async (entite: unknown) =>
      entite === User
        ? { id: 'app-1', prenom: 'Inès', nom: 'Gharbi', email: 'ines@x.tn' }
        : entite === Formation
          ? { id: 'f-1', titre: 'Back-end' }
          : { id: 'cert-existant' },
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('démarre le worker au démarrage de l’application', () => {
    service.onApplicationBootstrap();
    expect(mockFile.demarrerWorker).toHaveBeenCalledWith({
      generer: expect.any(Function),
      echecDefinitif: expect.any(Function),
    });
  });

  describe('demanderEmission', () => {
    it('crée la ligne (mention calculée), trace, ajoute UN travail', async () => {
      mockManager.query.mockResolvedValue([{ id: 'cert-1' }]);
      await expect(service.demanderEmission('app-1', 'f-1', 71.456)).resolves.toEqual({
        certificatId: 'cert-1',
        cree: true,
      });
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'ON CONFLICT ON CONSTRAINT "UQ_certificats_apprenant_formation" DO NOTHING',
        ),
        ['app-1', 'f-1', 71.46, 'Bien', 'ESPRIT Entreprise'],
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICAT_DEMANDE', cible: 'cert-1' }),
      );
      expect(mockFile.ajouter).toHaveBeenCalledWith('cert-1');
    });

    it('déjà demandé : renvoie l’existant, sans travail ni audit', async () => {
      mockManager.query.mockResolvedValue([]);
      await expect(service.demanderEmission('app-1', 'f-1', 80)).resolves.toEqual({
        certificatId: 'cert-existant',
        cree: false,
      });
      expect(mockFile.ajouter).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('generer (worker)', () => {
    it('EN_ATTENTE -> EN_GENERATION -> ACTIF : PDF, SHA-256, dépôt, audit, email', async () => {
      mockManager.findOne.mockResolvedValue(enAttente());
      await service.generer('cert-1');

      expect(mockManager.findOne).toHaveBeenCalledWith(Certificat, {
        where: { id: 'cert-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockManager.update).toHaveBeenCalledWith(
        Certificat,
        { id: 'cert-1' },
        { statut: StatutCertificat.EN_GENERATION, nbTentatives: 1 },
      );
      expect(genererPdfCertificat).toHaveBeenCalledWith({
        certificatId: 'cert-1',
        nomApprenant: 'Inès Gharbi',
        titreFormation: 'Back-end',
        scoreFinal: 71.5,
        mention: 'Bien',
        dateEmission: DATE,
        organismeEmetteur: 'ESPRIT Entreprise',
        urlVerification: 'http://localhost:3001/verifier/cert-1',
      });
      expect(mockStockage.deposerTampon).toHaveBeenCalledWith(
        'certificats/cert-1.pdf',
        PDF,
        'application/pdf',
        SHA,
      );
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET statut = 'ACTIF'"),
        ['cert-1', 'certificats/cert-1.pdf', SHA],
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICAT_EMIS',
          detailsAvantApres: expect.objectContaining({ empreinteSha256: SHA }),
        }),
      );
      expect(mockMail.sendCertificatEmisEmail).toHaveBeenCalledWith('ines@x.tn', {
        prenom: 'Inès',
        titreFormation: 'Back-end',
        urlVerification: 'http://localhost:3001/verifier/cert-1',
      });
    });

    it.each([
      [null],
      [{ ...enAttente(), statut: StatutCertificat.ACTIF }],
      [{ ...enAttente(), statut: StatutCertificat.EN_GENERATION }],
    ])('rien à faire (inconnu, actif ou déjà pris) : idempotent', async (ligne) => {
      mockManager.findOne.mockResolvedValue(ligne);
      await service.generer('cert-1');
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(genererPdfCertificat).not.toHaveBeenCalled();
    });

    it('échec après dépôt : objet retiré, ligne remise en attente, erreur relancée', async () => {
      mockManager.findOne.mockResolvedValue(enAttente());
      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SET statut = 'ACTIF'")) throw new Error('base indisponible');
        return [];
      });
      await expect(service.generer('cert-1')).rejects.toThrow('base indisponible');
      expect(mockStockage.supprimer).toHaveBeenCalledWith(['certificats/cert-1.pdf']);
      expect(mockDataSource.query).toHaveBeenLastCalledWith(
        expect.stringContaining("SET statut = 'EN_ATTENTE_GENERATION'"),
        ['cert-1', 'base indisponible'],
      );
      expect(mockMail.sendCertificatEmisEmail).not.toHaveBeenCalled();
    });

    it('échec du stockage : rien à retirer, ligne remise en attente', async () => {
      mockManager.findOne.mockResolvedValue(enAttente());
      mockDataSource.query.mockResolvedValue([]);
      mockStockage.deposerTampon.mockRejectedValue(new Error('S3 injoignable'));
      await expect(service.generer('cert-1')).rejects.toThrow('S3 injoignable');
      expect(mockStockage.supprimer).not.toHaveBeenCalled();
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("'EN_ATTENTE_GENERATION'"),
        ['cert-1', 'S3 injoignable'],
      );
    });

    it('échec de l’email : journalisé, le certificat reste émis', async () => {
      mockManager.findOne.mockResolvedValue(enAttente());
      mockDataSource.query.mockResolvedValue([]);
      mockMail.sendCertificatEmisEmail.mockRejectedValue(new Error('SMTP'));
      const erreur = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(service.generer('cert-1')).resolves.toBeUndefined();
      expect(erreur).toHaveBeenCalledWith(expect.stringContaining('SMTP'));
      expect(mockStockage.supprimer).not.toHaveBeenCalled();
    });
  });

  it('échec définitif : audit CERTIFICAT_ECHEC', async () => {
    await service.echecDefinitif('cert-1', new Error('trois fois'));
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICAT_ECHEC',
        cible: 'cert-1',
        resultat: 'Échec',
        detailsAvantApres: { erreur: 'trois fois' },
      }),
    );
  });

  describe('relancer', () => {
    it('404 inconnu ; 409 actif ; sinon remis en attente, nouveau travail', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.relancer('adm', 'cert-1', { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
      mockManager.findOne.mockResolvedValueOnce({ ...enAttente(), statut: StatutCertificat.ACTIF });
      await expect(service.relancer('adm', 'cert-1', { adresseIp: null })).rejects.toThrow(
        ConflictException,
      );
      expect(mockFile.ajouter).not.toHaveBeenCalled();

      mockManager.findOne.mockResolvedValueOnce({
        ...enAttente(),
        statut: StatutCertificat.EN_GENERATION,
        nbTentatives: 3,
      });
      mockManager.find.mockResolvedValue([
        { ...enAttente(), apprenant: { email: 'i@x.tn' }, formation: { titre: 'B' } },
      ]);
      const vue = await service.relancer('adm', 'cert-1', { adresseIp: '1.2.3.4' });
      expect(mockManager.update).toHaveBeenCalledWith(
        Certificat,
        { id: 'cert-1' },
        { statut: StatutCertificat.EN_ATTENTE_GENERATION },
      );
      expect(mockFile.ajouter).toHaveBeenCalledWith('cert-1', 4);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICAT_RELANCE', acteur: 'adm' }),
      );
      expect(vue.id).toBe('cert-1');
    });
  });

  describe('mes certificats (US-CERT-03)', () => {
    const actif = {
      ...enAttente(),
      statut: StatutCertificat.ACTIF,
      cleStockage: 'certificats/cert-1.pdf',
      empreinteSha256: SHA,
      dateGeneration: DATE,
      formation: { titre: 'Back-end NestJS' },
    };

    it('liste : empreinte et lien public seulement une fois émis ; jamais la clé', async () => {
      mockManager.find.mockResolvedValue([
        actif,
        { ...enAttente(), id: 'cert-2', formation: { titre: 'DevOps' }, empreinteSha256: null },
      ]);
      const liste = await service.mesCertificats('app-1');
      expect(mockManager.find).toHaveBeenCalledWith(
        Certificat,
        expect.objectContaining({ where: { apprenantId: 'app-1' } }),
      );
      expect(liste[0]).toEqual({
        id: 'cert-1',
        formation: { id: 'f-1', titre: 'Back-end NestJS' },
        statut: StatutCertificat.ACTIF,
        scoreFinal: 71.5,
        mention: 'Bien',
        organismeEmetteur: 'ESPRIT Entreprise',
        dateEmission: DATE,
        dateGeneration: DATE,
        empreinteSha256: SHA,
        urlVerification: 'http://localhost:3001/verifier/cert-1',
        revocation: null,
      });
      expect(liste[1]).toMatchObject({ empreinteSha256: null, urlVerification: null });
      expect(JSON.stringify(liste)).not.toContain('certificats/');
    });

    it('PDF : seulement le mien (404 sinon), ACTIF, relayé et tracé', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);
      await expect(service.monPdf('app-x', 'cert-1', { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockManager.findOne).toHaveBeenCalledWith(Certificat, {
        where: { id: 'cert-1', apprenantId: 'app-x' },
        relations: { formation: true },
      });

      mockManager.findOne.mockResolvedValueOnce({
        ...actif,
        statut: StatutCertificat.EN_GENERATION,
      });
      await expect(service.monPdf('app-1', 'cert-1', { adresseIp: null })).rejects.toThrow(
        ConflictException,
      );
      expect(mockStockage.lire).not.toHaveBeenCalled();

      const flux = Readable.from(['%PDF']);
      mockManager.findOne.mockResolvedValueOnce(actif);
      mockStockage.lire.mockResolvedValue({ flux, taille: 4 });
      await expect(service.monPdf('app-1', 'cert-1', { adresseIp: '1.2.3.4' })).resolves.toEqual({
        flux,
        nomFichier: 'certificat-back-end-nestjs.pdf',
        taille: 4,
      });
      expect(mockStockage.lire).toHaveBeenCalledWith('certificats/cert-1.pdf');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICAT_TELECHARGE',
          acteur: 'app-1',
          cible: 'cert-1',
        }),
      );
    });

    it('PDF : stockage injoignable -> 503, pas d’audit', async () => {
      mockManager.findOne.mockResolvedValueOnce(actif);
      mockStockage.lire.mockRejectedValue(new Error('ECONNREFUSED'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(service.monPdf('app-1', 'cert-1', { adresseIp: null })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('revoquer (US-CERT-06)', () => {
    const DTO = {
      motif: MotifRevocation.FRAUDE,
      description: 'Usurpation d’identité constatée.',
      confirmationIrreversible: true,
      motDePasseAdmin: 'Secret123!',
    };
    const REVOCATION = new Date('2026-11-09T12:00:00Z');
    let hash: string;

    beforeAll(async () => {
      hash = await bcrypt.hash('Secret123!', 4);
    });

    const preparer = (statut: StatutCertificat | null): void => {
      mockManager.findOne.mockImplementation(async (entite: unknown) => {
        if (entite === User) return { id: 'adm', motDePasseHash: hash, prenom: 'Inès', email: 'ines@x.tn' };
        if (entite === Formation) return { id: 'f-1', titre: 'Back-end' };
        return statut === null ? null : { ...enAttente(), statut };
      });
      mockManager.query.mockResolvedValue([{ maintenant: REVOCATION }]);
      mockManager.find.mockResolvedValue([
        {
          ...enAttente(),
          statut: StatutCertificat.REVOQUE,
          dateRevocation: REVOCATION,
          motifRevocation: MotifRevocation.FRAUDE,
          descriptionRevocation: DTO.description,
          revoquePar: 'adm',
          apprenant: { email: 'ines@x.tn' },
          formation: { titre: 'Back-end' },
        },
      ]);
    };

    it('mot de passe faux : 401, audit d’échec, aucune transaction', async () => {
      preparer(StatutCertificat.ACTIF);
      await expect(
        service.revoquer('adm', 'cert-1', { ...DTO, motDePasseAdmin: 'faux' }, { adresseIp: '1.2.3.4' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICAT_REVOCATION_REFUSEE', resultat: 'Échec' }),
      );
    });

    it('compte sans mot de passe local : 401 (hash factice)', async () => {
      preparer(StatutCertificat.ACTIF);
      mockManager.findOne.mockImplementationOnce(async () => ({ id: 'adm', motDePasseHash: null }));
      await expect(service.revoquer('adm', 'cert-1', DTO, { adresseIp: null })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('404 inconnu ; 409 déjà révoqué ou en préparation ; rien d’écrit', async () => {
      preparer(null);
      await expect(service.revoquer('adm', 'cert-1', DTO, { adresseIp: null })).rejects.toThrow(
        NotFoundException,
      );
      preparer(StatutCertificat.REVOQUE);
      await expect(service.revoquer('adm', 'cert-1', DTO, { adresseIp: null })).rejects.toThrow(
        'déjà révoqué',
      );
      preparer(StatutCertificat.EN_GENERATION);
      await expect(service.revoquer('adm', 'cert-1', DTO, { adresseIp: null })).rejects.toThrow(
        ConflictException,
      );
      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockMail.sendCertificatRevoqueEmail).not.toHaveBeenCalled();
    });

    it('ACTIF -> REVOQUE sous verrou, heure de PostgreSQL, audit, email (catégorie seulement)', async () => {
      preparer(StatutCertificat.ACTIF);
      const vue = await service.revoquer('adm', 'cert-1', DTO, { adresseIp: '1.2.3.4' });
      expect(mockManager.findOne).toHaveBeenCalledWith(Certificat, {
        where: { id: 'cert-1' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockManager.update).toHaveBeenCalledWith(
        Certificat,
        { id: 'cert-1' },
        {
          statut: StatutCertificat.REVOQUE,
          dateRevocation: REVOCATION,
          motifRevocation: MotifRevocation.FRAUDE,
          descriptionRevocation: DTO.description,
          revoquePar: 'adm',
        },
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICAT_REVOQUE',
          acteur: 'adm',
          cible: 'cert-1',
          adresseIp: '1.2.3.4',
          resultat: 'Succès',
        }),
      );
      expect(mockMail.sendCertificatRevoqueEmail).toHaveBeenCalledWith('ines@x.tn', {
        prenom: 'Inès',
        titreFormation: 'Back-end',
        motif: 'Fraude avérée',
        dateRevocation: REVOCATION,
      });
      expect(vue.revocation).toEqual({
        date: REVOCATION,
        motif: MotifRevocation.FRAUDE,
        description: DTO.description,
        revoquePar: 'adm',
      });
    });

    it('échec de l’email : journalisé, la révocation reste acquise', async () => {
      preparer(StatutCertificat.ACTIF);
      mockMail.sendCertificatRevoqueEmail.mockRejectedValueOnce(new Error('SMTP'));
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(
        service.revoquer('adm', 'cert-1', DTO, { adresseIp: null }),
      ).resolves.toMatchObject({ statut: StatutCertificat.REVOQUE });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('révocation non envoyé'));
    });
  });
});
