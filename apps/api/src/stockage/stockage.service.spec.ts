import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { S3_CLIENT } from './stockage.constants';
import { ObjetADeposer, StockageService } from './stockage.service';

/** StockageService (US-ATEL-04) avec un client S3 simulé. */
describe('StockageService (US-ATEL-04)', () => {
  let service: StockageService;
  let dossier: string;
  let chemin: string;
  const send = jest.fn();
  const objet = (cle: string): ObjetADeposer => ({
    cle,
    chemin,
    taille: 4,
    typeContenu: 'application/pdf',
    sha256: 'a'.repeat(64),
  });
  const introuvable = Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });

  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'stockage-spec-'));
    chemin = join(dossier, 'f');
    writeFileSync(chemin, '%PDF');
  });
  // Pas de suppression du dossier : le client simulé ne lit pas les flux de
  // fichiers, qui s'ouvrent après coup — un fichier déjà supprimé ferait
  // échouer le processus (ENOENT). Quelques octets dans le dossier temporaire.

  beforeEach(async () => {
    send.mockReset();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StockageService,
        { provide: S3_CLIENT, useValue: { send } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => ({ bucketLivrables: 'livrables' }) },
        },
      ],
    }).compile();
    service = moduleRef.get(StockageService);
  });

  it('crée le bucket s’il manque (404), une seule fois par processus', async () => {
    send.mockRejectedValueOnce(introuvable).mockResolvedValue({});
    await service.assurerBucket();
    await service.assurerBucket();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
    expect(send.mock.calls[1][0].input).toEqual({ Bucket: 'livrables' });
  });

  it('au démarrage, un stockage injoignable n’empêche pas l’API de démarrer', async () => {
    send.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    // Nouvel essai au premier dépôt : l'erreur remonte alors à l'appelant.
    await expect(service.deposer([objet('k1')])).rejects.toThrow('ECONNREFUSED');
  });

  it('dépose chaque objet avec sa taille, son type et son SHA-256 en métadonnée', async () => {
    send.mockResolvedValue({});
    await service.deposer([objet('k1')]);
    const put = send.mock.calls.find((c) => c[0] instanceof PutObjectCommand)?.[0];
    expect(put.input).toMatchObject({
      Bucket: 'livrables',
      Key: 'k1',
      ContentLength: 4,
      ContentType: 'application/pdf',
      Metadata: { sha256: 'a'.repeat(64) },
    });
  });

  it('en cas d’échec au 2e objet, supprime le 1er puis relance l’erreur', async () => {
    send
      .mockResolvedValueOnce({}) // HeadBucket
      .mockResolvedValueOnce({}) // Put k1
      .mockRejectedValueOnce(new Error('panne')) // Put k2
      .mockResolvedValueOnce({}); // Delete
    await expect(service.deposer([objet('k1'), objet('k2')])).rejects.toThrow('panne');
    const suppression = send.mock.calls.find((c) => c[0] instanceof DeleteObjectsCommand)?.[0];
    expect(suppression.input.Delete.Objects).toEqual([{ Key: 'k1' }]);
  });

  it('supprimer : rien à faire sans clé ; une erreur est journalisée, pas relancée', async () => {
    await service.supprimer([]);
    expect(send).not.toHaveBeenCalled();
    send.mockRejectedValue(new Error('panne'));
    await expect(service.supprimer(['k1'])).resolves.toBeUndefined();
  });

  describe('lire (US-ATEL-06)', () => {
    it('renvoie le flux et la taille de l’objet', async () => {
      const flux = Readable.from(['%PDF']);
      send.mockResolvedValue({ Body: flux, ContentLength: 4 });
      await expect(service.lire('livrables/a/b')).resolves.toEqual({ flux, taille: 4 });
      const commande = send.mock.calls[0][0] as GetObjectCommand;
      expect(commande).toBeInstanceOf(GetObjectCommand);
      expect(commande.input).toEqual({ Bucket: 'livrables', Key: 'livrables/a/b' });
    });

    it('taille inconnue -> null', async () => {
      send.mockResolvedValue({ Body: Readable.from(['x']) });
      await expect(service.lire('k')).resolves.toMatchObject({ taille: null });
    });

    it('contenu qui n’est pas un flux -> erreur', async () => {
      send.mockResolvedValue({ Body: undefined });
      await expect(service.lire('k')).rejects.toThrow('contenu illisible');
    });

    it('relance l’erreur du stockage', async () => {
      send.mockRejectedValue(new Error('NoSuchKey'));
      await expect(service.lire('k')).rejects.toThrow('NoSuchKey');
    });
  });

  describe('deposerTampon (US-CERT-01)', () => {
    it('dépose le contenu en mémoire avec sa taille, son type et son SHA-256', async () => {
      send.mockResolvedValue({});
      const contenu = Buffer.from('%PDF-1.7');
      await service.deposerTampon('certificats/c1.pdf', contenu, 'application/pdf', 'f'.repeat(64));
      const commande = send.mock.calls[1][0] as PutObjectCommand;
      expect(commande).toBeInstanceOf(PutObjectCommand);
      expect(commande.input).toEqual({
        Bucket: 'livrables',
        Key: 'certificats/c1.pdf',
        Body: contenu,
        ContentLength: 8,
        ContentType: 'application/pdf',
        Metadata: { sha256: 'f'.repeat(64) },
      });
    });

    it('relance l’erreur du stockage', async () => {
      send.mockResolvedValueOnce({}).mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.deposerTampon('k', Buffer.from('x'), 'application/pdf', 'a'.repeat(64)),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});
