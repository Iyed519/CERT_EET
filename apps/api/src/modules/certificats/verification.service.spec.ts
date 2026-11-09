import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { VerificationService } from './verification.service';

/** VerificationService (US-CERT-04) : base, stockage et audit simulés. */
describe('VerificationService (US-CERT-04)', () => {
  let service: VerificationService;
  const ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
  const PDF = Buffer.from('%PDF-1.7 certificat');
  const SHA = createHash('sha256').update(PDF).digest('hex');
  const DATE = new Date('2026-11-09T10:00:00Z');
  const findOne = jest.fn();
  const lire = jest.fn();
  const record = jest.fn();

  const REVOCATION = new Date('2026-11-09T12:00:00Z');
  const certificat = (statut = StatutCertificat.ACTIF): Record<string, unknown> => ({
    id: ID,
    statut,
    apprenant: { prenom: 'Inès', nom: 'Gharbi', email: 'ines@prive.tn', id: 'app-secret' },
    formation: { titre: 'Back-end' },
    organismeEmetteur: 'ESPRIT Entreprise',
    mention: 'Bien',
    scoreFinal: 72,
    dateEmission: DATE,
    dateGeneration: DATE,
    cleStockage: `certificats/${ID}.pdf`,
    empreinteSha256: SHA,
    dateRevocation: statut === StatutCertificat.REVOQUE ? REVOCATION : null,
    motifRevocation: statut === StatutCertificat.REVOQUE ? 'FRAUDE' : null,
    descriptionRevocation: statut === StatutCertificat.REVOQUE ? 'Détail interne confidentiel' : null,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: DataSource, useValue: { manager: { findOne } } },
        { provide: StockageService, useValue: { lire } },
        { provide: AuditService, useValue: { record } },
      ],
    }).compile();
    service = moduleRef.get(VerificationService);
    record.mockResolvedValue(undefined);
    lire.mockImplementation(async () => ({ flux: Readable.from([PDF]), taille: PDF.length }));
  });

  afterEach(() => jest.restoreAllMocks());

  it('valide : intégrité recalculée, données minimales, vérification tracée', async () => {
    findOne.mockResolvedValue(certificat());
    const v = await service.verifier(ID, { adresseIp: '1.2.3.4' });
    expect(v).toEqual({
      certificatId: ID,
      verdict: 'VALIDE',
      integrite: 'VERIFIEE',
      titulaire: 'Inès Gharbi',
      formation: 'Back-end',
      organismeEmetteur: 'ESPRIT Entreprise',
      mention: 'Bien',
      scoreFinal: 72,
      dateEmission: DATE,
      empreinteSha256: SHA,
      dateRevocation: null,
    });
    expect(JSON.stringify(v)).not.toMatch(/ines@prive|app-secret|certificats\//);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICAT_VERIFIE',
        acteur: null,
        cible: ID,
        adresseIp: '1.2.3.4',
        resultat: 'Succès',
        detailsAvantApres: { verdict: 'VALIDE', integrite: 'VERIFIEE' },
      }),
    );
  });

  it('PDF altéré : INTEGRITE_COMPROMISE, tracé en échec', async () => {
    findOne.mockResolvedValue(certificat());
    lire.mockResolvedValue({ flux: Readable.from([Buffer.from('%PDF falsifié')]), taille: 1 });
    const v = await service.verifier(ID, { adresseIp: null });
    expect(v).toMatchObject({ verdict: 'INTEGRITE_COMPROMISE', integrite: 'COMPROMISE' });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ resultat: 'Échec' }));
  });

  it('stockage injoignable : verdict du statut, intégrité NON_VERIFIABLE', async () => {
    findOne.mockResolvedValue(certificat());
    lire.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const v = await service.verifier(ID, { adresseIp: null });
    expect(v).toMatchObject({ verdict: 'VALIDE', integrite: 'NON_VERIFIABLE' });
  });

  it('révoqué : REVOQUE avec sa date ; ni motif ni description publiés (US-CERT-06)', async () => {
    findOne.mockResolvedValue(certificat(StatutCertificat.REVOQUE));
    const v = await service.verifier(ID, { adresseIp: null });
    expect(v).toMatchObject({ verdict: 'REVOQUE', dateRevocation: REVOCATION });
    expect(JSON.stringify(v)).not.toMatch(/FRAUDE|confidentiel/);
  });

  it.each([
    ['inconnu', ID, null],
    ['mal formé (pas de lecture en base)', 'pas-un-uuid', null],
    ['en préparation', ID, certificat(StatutCertificat.EN_GENERATION)],
  ])('%s -> la même 404, rien de tracé', async (_cas, id, ligne) => {
    findOne.mockResolvedValue(ligne);
    await expect(service.verifier(id, { adresseIp: null })).rejects.toThrow(
      new NotFoundException('Aucun certificat ne correspond à ce lien.'),
    );
    expect(record).not.toHaveBeenCalled();
    if (id === 'pas-un-uuid') expect(findOne).not.toHaveBeenCalled();
  });

  describe('pdfPublic', () => {
    it('valide et intègre : le contenu et le nom de fichier', async () => {
      findOne.mockResolvedValue(certificat());
      await expect(service.pdfPublic(ID)).resolves.toEqual({
        contenu: PDF,
        nomFichier: 'certificat-back-end.pdf',
      });
    });

    it('révoqué, altéré ou illisible -> 404', async () => {
      findOne.mockResolvedValue(certificat(StatutCertificat.REVOQUE));
      await expect(service.pdfPublic(ID)).rejects.toThrow(NotFoundException);
      findOne.mockResolvedValue(certificat());
      lire.mockResolvedValueOnce({ flux: Readable.from([Buffer.from('autre')]), taille: 5 });
      await expect(service.pdfPublic(ID)).rejects.toThrow(NotFoundException);
      lire.mockRejectedValueOnce(new Error('S3'));
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(service.pdfPublic(ID)).rejects.toThrow(NotFoundException);
    });
  });
});
