import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReferentielModule } from './modules/referentiel/referentiel.module';
/**
 * Module racine (AppModule).
 *
 * Assemble les modules au démarrage (Règle 1 / PKG-02). RedisModule et
 * MailModule forment, avec config + base de données, le socle d'infrastructure :
 * Redis porte la denylist des jetons (US-AUTH-03), Mail l'envoi des emails de
 * vérification (US-CPT-05). Les modules métier (users, formations, qcm,
 * ateliers, certificats, assistance-ia, notifications, audit) seront ajoutés
 * ici au fil des sprints.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    MailModule,
    HealthModule,
    AuthModule,
    ReferentielModule,
  ],
})
export class AppModule {}
