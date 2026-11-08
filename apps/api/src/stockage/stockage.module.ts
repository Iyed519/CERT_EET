import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StockageConfig } from '../config/configuration';
import { S3_CLIENT } from './stockage.constants';
import { StockageService } from './stockage.service';

/**
 * Stockage objet S3 / MinIO (US-ATEL-04, ADR-07). @Global, comme Redis et le
 * mail : un client S3 unique pour toute l'application.
 *
 * - `forcePathStyle` : MinIO sert les buckets sous le chemin
 *   (http://minio:9000/<bucket>/<clé>), pas en sous-domaine DNS.
 * - Les identifiants viennent de la configuration validée (Joi, fail-fast).
 * - Le bucket est créé par StockageService au démarrage s'il manque : aucun
 *   conteneur d'initialisation à ajouter.
 */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): S3Client => {
        const { endpoint, region, accessKey, secretKey } =
          configService.getOrThrow<StockageConfig>('stockage');
        return new S3Client({
          endpoint,
          region,
          forcePathStyle: true,
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        });
      },
    },
    StockageService,
  ],
  exports: [StockageService],
})
export class StockageModule {}
