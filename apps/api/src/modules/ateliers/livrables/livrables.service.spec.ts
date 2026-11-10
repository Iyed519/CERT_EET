import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource, QueryFailedError } from 'typeorm';
import { Atelier } from '../../../database/entities/atelier.entity';
import { FichierLivrable } from '../../../database/entities/fichier-livrable.entity';
import { Livrable } from '../../../database/entities/livrable.entity';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';
import { StatutInscription } from '../../../database/enums/statut-inscription.enum';
import { MailService } from '../../../mail/mail.service';
import { StockageService } from '../../../stockage/stockage.service';
import { AuditService } from '../../audit/audit.service';
import { EspaceFormationService } from '../../inscriptions/espace-formation.service';
import { AteliersService } from '../ateliers.service';
import {
  MESSAGE_AUCUN_LIVRABLE,
  MESSAGE_DEJA_SOUMIS,
  MESSAGE_DEPOT_CLOS,
  MESSAGE_REMPLACEMENT_CLOS,
  MESSAGE_REMPLACEMENT_CONCURRENT,
  MESSAGE_REMPLACEMENT_EN_CORRECTION,
} from './livrable.regles';
import { FichierTemporaire, LivrablesService, nomOriginal } from './livrables.service';

/**
 * LivrablesService (US-ATEL-04) : dépôts, stockage, mail et audit simulés ;
 * VRAIS fichiers temporaires (SHA-256 et signature lus sur le disque).
 * L'horloge de PostgreSQL est simulée : dates FIXES.
 */
describe('LivrablesService (US-ATEL-04)', () => {
  let service: LivrablesService;
  let dossier: string;

  const MAINTENANT = new Date('2026-11-08T10:00:00.000Z');
  const contexte = {
    adresseIp: '127.0.0.1',
    methode: 'POST',
    route: '/api/ateliers/at-1/livrable',
  };
  const CONTENU_PDF = Buffer.from('%PDF-1.7\nun rapport\n');
  const SHA_PDF = createHash('sha256').update(CONTENU_PDF).digest('hex');

  const atelier = (surcharge: Partial<Atelier> = {}): Atelier =>
    ({
      id: 'at-1',
      titre: 'Projet API',
      statut: StatutAtelier.PUBLIE,
      dateLimite: new Date('2026-11-20T23:59:00Z'),
      toleranceRetardHeures: 24,
      typesLivrables: ['pdf', 'zip'],
      tailleMaxMo: 5,
      nbMaxFichiers: 2,
      module: {
        id: 'mod-1',
        formationId: 'formation-1',
        formation: { id: 'formation-1', titre: 'Back-end' },
      },
      ...surcharge,
    }) as Atelier;

  const mockManager = {
    insert: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockAtelierRepo = { findOne: jest.fn() };
  const mockLivrableRepo = { existsBy: jest.fn(), findOne: jest.fn() };
  const mockAteliersService = { maintenant: jest.fn() };
  const mockEspace = { exigerAccesContenu: jest.fn() };
  const mockStockage = { deposer: jest.fn(), supprimer: jest.fn() };
  const mockMail = { sendLivrableSoumisEmail: jest.fn() };
  const mockAudit = { record: jest.fn().mockResolvedValue(undefined) };

  const ecrire = (nom: string, contenu: Buffer): FichierTemporaire => {
    const chemin = join(dossier, `${Math.random()}`);
    writeFileSync(chemin, contenu);
    return { originalname: nom, path: chemin, size: contenu.length };
  };

  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'livrables-spec-'));
  });
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LivrablesService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(Atelier), useValue: mockAtelierRepo },
        { provide: getRepositoryToken(Livrable), useValue: mockLivrableRepo },
        { provide: AteliersService, useValue: mockAteliersService },
        { provide: EspaceFormationService, useValue: mockEspace },
        { provide: StockageService, useValue: mockStockage },
        { provide: MailService, useValue: mockMail },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = moduleRef.get(LivrablesService);

    mockAtelierRepo.findOne.mockResolvedValue(atelier());
    mockEspace.exigerAccesContenu.mockResolvedValue({ statut: StatutInscription.EN_COURS });
    mockAteliersService.maintenant.mockResolvedValue(MAINTENANT);
    mockLivrableRepo.existsBy.mockResolvedValue(false);
    mockLivrableRepo.findOne.mockResolvedValue({
      id: 'liv-1',
      atelierId: 'at-1',
      version: 1,
      statut: 'SOUMIS',
      dateSoumission: MAINTENANT,
      enRetard: false,
      hashTracabilite: SHA_PDF,
      commentaire: null,
      liens: [],
      fichiers: [],
    });
    mockStockage.deposer.mockResolvedValue(undefined);
    mockManager.insert.mockResolvedValue(undefined);
    mockManager.findOne.mockResolvedValue({ id: 'appr-1', prenom: 'Youssef', nom: 'Trabelsi' });
    mockManager.find.mockResolvedValue([
      { formateurId: 'f-1', formateur: { email: 'f1@cert-eet.tn', prenom: 'Amel' } },
      { formateurId: 'f-2', formateur: { email: 'f2@cert-eet.tn', prenom: null } },
    ]);
  });

  it('dépose, enregistre version 1 SOUMIS avec le SHA-256 du contenu, trace et notifie', async () => {
    const f = ecrire('Rapport final.pdf', CONTENU_PDF);
    await service.soumettre('appr-1', 'at-1', [f], { commentaire: '  Merci ' }, contexte);

    const [[objets]] = mockStockage.deposer.mock.calls;
    expect(objets).toHaveLength(1);
    expect(objets[0]).toMatchObject({
      chemin: f.path,
      taille: CONTENU_PDF.length,
      typeContenu: 'application/pdf',
      sha256: SHA_PDF,
    });
    expect(objets[0].cle).toMatch(
      /^livrables\/appr-1\/at-1\/[0-9a-f-]{36}\/v1\/1-Rapport_final\.pdf$/,
    );

    const livrable = mockManager.insert.mock.calls.find((c) => c[0] === Livrable)?.[1];
    expect(livrable).toMatchObject({
      atelierId: 'at-1',
      apprenantId: 'appr-1',
      version: 1,
      statut: 'SOUMIS',
      dateSoumission: MAINTENANT,
      enRetard: false,
      hashTracabilite: SHA_PDF,
      commentaire: 'Merci',
      liens: [],
    });
    const fichiers = mockManager.insert.mock.calls.find((c) => c[0] === FichierLivrable)?.[1];
    expect(fichiers).toEqual([
      expect.objectContaining({
        livrableId: livrable.id,
        ordre: 1,
        nomOriginal: 'Rapport final.pdf',
        extension: 'pdf',
        sha256: SHA_PDF,
        cleStockage: objets[0].cle,
      }),
    ]);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LIVRABLE_SOUMIS',
        acteur: 'appr-1',
        cible: livrable.id,
        detailsAvantApres: expect.objectContaining({ hashTracabilite: SHA_PDF, enRetard: false }),
      }),
    );
    expect(mockMail.sendLivrableSoumisEmail).toHaveBeenCalledTimes(2);
    expect(mockMail.sendLivrableSoumisEmail).toHaveBeenCalledWith(
      'f1@cert-eet.tn',
      expect.objectContaining({ nomApprenant: 'Youssef Trabelsi', titreAtelier: 'Projet API' }),
    );
    expect(mockStockage.supprimer).not.toHaveBeenCalled();
  });

  it('marque en retard un dépôt pendant la tolérance (heure de PostgreSQL)', async () => {
    mockAteliersService.maintenant.mockResolvedValue(new Date('2026-11-21T10:00:00Z'));
    await service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte);
    expect(mockManager.insert.mock.calls.find((c) => c[0] === Livrable)?.[1].enRetard).toBe(true);
  });

  it('409 après la tolérance : rien n’est déposé ni enregistré', async () => {
    mockAteliersService.maintenant.mockResolvedValue(new Date('2026-11-22T00:00:00Z'));
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toThrow(new ConflictException(MESSAGE_DEPOT_CLOS));
    expect(mockStockage.deposer).not.toHaveBeenCalled();
    expect(mockManager.insert).not.toHaveBeenCalled();
  });

  it('US-FORM-02 : 409 si la formation est archivée, rien n’est déposé', async () => {
    mockAtelierRepo.findOne.mockResolvedValue(
      atelier({
        module: {
          id: 'mod-1',
          formationId: 'formation-1',
          formation: { id: 'formation-1', titre: 'Back-end', statut: 'ARCHIVEE' },
        },
      } as unknown as Partial<Atelier>),
    );
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toThrow(
      new ConflictException('Cette formation est archivée : son parcours est figé.'),
    );
    expect(mockStockage.deposer).not.toHaveBeenCalled();
  });

  it('409 si un livrable existe déjà (le remplacement est US-ATEL-05)', async () => {
    mockLivrableRepo.existsBy.mockResolvedValue(true);
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toThrow(new ConflictException(MESSAGE_DEJA_SOUMIS));
    expect(mockStockage.deposer).not.toHaveBeenCalled();
  });

  it('400 pour un fichier renommé : rien n’est déposé', async () => {
    const faux = ecrire('faux.pdf', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]));
    await expect(service.soumettre('appr-1', 'at-1', [faux], {}, contexte)).rejects.toThrow(
      'Le contenu de « faux.pdf » ne correspond pas à un fichier .pdf.',
    );
    expect(mockStockage.deposer).not.toHaveBeenCalled();
  });

  it('dépôt concurrent perdant (23505) : 409, et ses objets sont supprimés', async () => {
    const erreur = new QueryFailedError('INSERT', [], new Error('duplicate'));
    (erreur as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
    mockManager.insert.mockRejectedValueOnce(erreur);

    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toThrow(new ConflictException(MESSAGE_DEJA_SOUMIS));
    const cle = mockStockage.deposer.mock.calls[0][0][0].cle;
    expect(mockStockage.supprimer).toHaveBeenCalledWith([cle]);
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('autre erreur en base : relancée, objets supprimés', async () => {
    mockManager.insert.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toThrow('base indisponible');
    expect(mockStockage.supprimer).toHaveBeenCalledTimes(1);
  });

  it('503 si le stockage est injoignable : rien n’est enregistré', async () => {
    mockStockage.deposer.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockManager.insert).not.toHaveBeenCalled();
  });

  it('un échec d’email ne remet pas le dépôt en cause', async () => {
    mockMail.sendLivrableSoumisEmail.mockRejectedValue(new Error('SMTP indisponible'));
    await expect(
      service.soumettre('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
    ).resolves.toMatchObject({ id: 'liv-1' });
    expect(mockAudit.record).toHaveBeenCalledTimes(1);
  });

  it('404 pour un atelier non publié ; 403 pour une formation terminée', async () => {
    mockAtelierRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.soumettre('appr-1', 'at-1', [], {}, contexte)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockAtelierRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'at-1', statut: StatutAtelier.PUBLIE } }),
    );

    mockEspace.exigerAccesContenu.mockResolvedValueOnce({ statut: StatutInscription.TERMINEE });
    await expect(service.soumettre('appr-1', 'at-1', [], {}, contexte)).rejects.toThrow(
      new ForbiddenException(
        'Votre formation est terminée : vous ne pouvez plus déposer de livrable.',
      ),
    );
  });

  it('nomOriginal : relit en UTF-8 un nom reçu en latin1, garde un nom déjà correct', () => {
    expect(nomOriginal(Buffer.from('résumé.pdf', 'utf8').toString('latin1'))).toBe('résumé.pdf');
    expect(nomOriginal('rapport.pdf')).toBe('rapport.pdf');
    expect(nomOriginal('café.pdf')).toBe('café.pdf');
  });
  // ===================================================================
  //  US-ATEL-05 — Remplacer son livrable
  // ===================================================================
  describe('remplacer (US-ATEL-05)', () => {
    const verrou = { statut: 'SOUMIS', version: 1 };
    const manager = mockManager as typeof mockManager & {
      query: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };

    beforeEach(() => {
      manager.query = jest.fn(async (sql: string): Promise<unknown> => {
        if (sql.includes('FOR UPDATE')) return [verrou];
        if (sql.includes('fichiers_livrables')) return [{ cle: 'ancienne/1-a.pdf' }];
        return [];
      });
      manager.delete = jest.fn();
      manager.update = jest.fn();
      verrou.statut = 'SOUMIS';
      verrou.version = 1;
    });

    it('version + 1, hash recalculé, fichiers remplacés ; anciens objets retirés APRÈS ; audit', async () => {
      const f = ecrire('v2.pdf', CONTENU_PDF);
      await service.remplacer('appr-1', 'at-1', [f], { commentaire: ' v2 ' }, contexte);

      const [[objets]] = mockStockage.deposer.mock.calls;
      expect(objets[0].cle).toMatch(
        /^livrables\/appr-1\/at-1\/liv-1\/v2-[0-9a-f-]{36}\/1-v2\.pdf$/,
      );
      expect(manager.query.mock.calls[0][0]).toMatch(/FROM livrables WHERE id = \$1 FOR UPDATE/);
      expect(manager.delete).toHaveBeenCalledWith(FichierLivrable, { livrableId: 'liv-1' });
      expect(manager.update).toHaveBeenCalledWith(
        Livrable,
        { id: 'liv-1' },
        expect.objectContaining({
          version: 2,
          hashTracabilite: expect.stringMatching(/^[0-9a-f]{64}$/),
          commentaire: 'v2',
          dateSoumission: MAINTENANT,
          enRetard: false,
        }),
      );
      expect(manager.insert).toHaveBeenCalledWith(FichierLivrable, [
        expect.objectContaining({ livrableId: 'liv-1', ordre: 1, sha256: SHA_PDF }),
      ]);
      expect(mockStockage.supprimer).toHaveBeenCalledTimes(1);
      expect(mockStockage.supprimer).toHaveBeenCalledWith(['ancienne/1-a.pdf']);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LIVRABLE_REMPLACE',
          cible: 'liv-1',
          detailsAvantApres: expect.objectContaining({
            avant: { version: 1, hashTracabilite: SHA_PDF },
            apres: expect.objectContaining({ version: 2 }),
          }),
        }),
      );
    });

    it('aucun livrable -> 404, rien n’est envoyé', async () => {
      mockLivrableRepo.findOne.mockResolvedValue(null);
      await expect(
        service.remplacer('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
      ).rejects.toThrow(new NotFoundException(MESSAGE_AUCUN_LIVRABLE));
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('date limite atteinte -> 409 (la tolérance ne vaut pas pour un remplacement)', async () => {
      mockAteliersService.maintenant.mockResolvedValue(new Date('2026-11-20T23:59:00Z'));
      await expect(
        service.remplacer('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
      ).rejects.toThrow(new ConflictException(MESSAGE_REMPLACEMENT_CLOS));
      expect(mockStockage.deposer).not.toHaveBeenCalled();
    });

    it('passé EN_CORRECTION pendant l’envoi -> 409 sous le verrou, nouveaux objets supprimés', async () => {
      verrou.statut = 'EN_CORRECTION';
      await expect(
        service.remplacer('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
      ).rejects.toThrow(new ConflictException(MESSAGE_REMPLACEMENT_EN_CORRECTION));
      const [[objets]] = mockStockage.deposer.mock.calls;
      expect(mockStockage.supprimer).toHaveBeenCalledWith([objets[0].cle]);
      expect(manager.update).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('version changée entre-temps (remplacement simultané) -> 409, anciens objets gardés', async () => {
      verrou.version = 2;
      await expect(
        service.remplacer('appr-1', 'at-1', [ecrire('a.pdf', CONTENU_PDF)], {}, contexte),
      ).rejects.toThrow(new ConflictException(MESSAGE_REMPLACEMENT_CONCURRENT));
      expect(mockStockage.supprimer).not.toHaveBeenCalledWith(['ancienne/1-a.pdf']);
      expect(manager.delete).not.toHaveBeenCalled();
    });
  });
});
