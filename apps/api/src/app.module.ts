import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './modules/health/health.module';

/**
 * Module racine (AppModule).
 *
 * Assemble les modules au démarrage (Règle 1 / PKG-02). Pour l'instant : le
 * socle de configuration + le module health. Les modules métier (auth, users,
 * formations, qcm, ateliers, certificats, assistance-ia, notifications, audit)
 * seront ajoutés ici au fil des sprints, sous src/modules/.
 */
@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
