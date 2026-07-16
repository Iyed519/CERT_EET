import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';

/**
 * Module racine (AppModule).
 *
 * Assemble les modules au démarrage (Règle 1 / PKG-02). RedisModule rejoint le
 * socle d'infrastructure (config + base de données) car Redis devient
 * load-bearing dès US-AUTH-03 (denylist des jetons). Les modules métier
 * (users, formations, qcm, ateliers, certificats, assistance-ia,
 * notifications, audit) seront ajoutés ici au fil des sprints.
 */
@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, HealthModule, AuthModule],
})
export class AppModule {}