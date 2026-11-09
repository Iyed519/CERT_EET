import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { StockageConfig } from '../config/configuration';
import { S3_CLIENT } from './stockage.constants';

/** Un objet à déposer : fichier temporaire sur disque, taille connue. */
export interface ObjetADeposer {
  cle: string;
  chemin: string;
  taille: number;
  typeContenu: string;
  /** SHA-256 hexadécimal, conservé en métadonnée de l'objet (traçabilité). */
  sha256: string;
}

/** Un objet lu dans le bucket : son contenu en flux et sa taille. */
export interface ObjetLu {
  flux: Readable;
  taille: number | null;
}

/**
 * Dépôt, lecture et suppression d'objets dans le bucket des livrables (US-ATEL-04).
 *
 * - Les fichiers sont envoyés EN FLUX depuis le disque (jamais chargés en
 *   mémoire) avec leur taille exacte.
 * - Le bucket est vérifié (et créé s'il manque) au démarrage. Si le stockage
 *   est injoignable à ce moment-là, l'API démarre quand même (le reste de la
 *   plateforme n'en dépend pas) : la vérification est refaite au premier dépôt.
 * - `supprimer` sert au nettoyage quand l'enregistrement en base échoue après
 *   l'envoi : jamais d'objet orphelin connu.
 */
@Injectable()
export class StockageService implements OnModuleInit {
  private readonly logger = new Logger(StockageService.name);
  private bucketPret = false;

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client,
    private readonly configService: ConfigService,
  ) {}

  get bucket(): string {
    return this.configService.getOrThrow<StockageConfig>('stockage').bucketLivrables;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.assurerBucket();
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(
        `Stockage injoignable au démarrage (bucket ${this.bucket}) : ${detail}. Nouvel essai au premier dépôt.`,
      );
    }
  }

  /** Vérifie que le bucket existe, le crée sinon (une seule fois par processus). */
  async assurerBucket(): Promise<void> {
    if (this.bucketPret) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (erreur) {
      const statut = (erreur as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (statut !== 404) throw erreur;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ${this.bucket} créé.`);
    }
    this.bucketPret = true;
  }

  /** Dépose les objets un par un ; en cas d'échec, retire ceux déjà déposés. */
  async deposer(objets: ObjetADeposer[]): Promise<void> {
    await this.assurerBucket();
    const deposes: string[] = [];
    try {
      for (const objet of objets) {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: objet.cle,
            Body: createReadStream(objet.chemin),
            ContentLength: objet.taille,
            ContentType: objet.typeContenu,
            Metadata: { sha256: objet.sha256 },
          }),
        );
        deposes.push(objet.cle);
      }
    } catch (erreur) {
      await this.supprimer(deposes);
      throw erreur;
    }
  }

  /**
   * Lit un objet EN FLUX (US-ATEL-06 : le formateur télécharge un fichier du
   * livrable). Le contenu n'est jamais chargé en mémoire : l'API le relaie au
   * navigateur au fil de l'eau. Une erreur (objet absent, stockage
   * injoignable) est relancée : l'appelant décide de la réponse.
   */
  async lire(cle: string): Promise<ObjetLu> {
    const reponse = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: cle }));
    if (!(reponse.Body instanceof Readable)) {
      throw new Error(`Objet ${cle} : contenu illisible.`);
    }
    return { flux: reponse.Body, taille: reponse.ContentLength ?? null };
  }

  /** Supprime des objets (au mieux : une erreur est journalisée, pas relancée). */
  async supprimer(cles: string[]): Promise<void> {
    if (cles.length === 0) return;
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: cles.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Suppression d'objets impossible (${cles.join(', ')}) : ${detail}`);
    }
  }
}
