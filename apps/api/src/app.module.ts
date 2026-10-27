import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ReferentielModule } from './modules/referentiel/referentiel.module';
import { AdminModule } from './modules/admin/admin.module';
import { RoleRequestsModule } from './modules/role-requests/role-requests.module';
import { FormationsModule } from './modules/formations/formations.module';
import { InscriptionsModule } from './modules/inscriptions/inscriptions.module';
import { QcmModule } from './modules/qcm/qcm.module';
import { TentativesModule } from './modules/tentatives/tentatives.module';
/**
 * Module racine (AppModule).
 *
 * Assemble les modules au démarrage (Règle 1 / PKG-02). RedisModule et
 * MailModule forment, avec config + base de données, le socle d'infrastructure :
 * Redis porte la denylist des jetons (US-AUTH-03), Mail l'envoi des emails de
 * vérification (US-CPT-05). AuditModule (@Global, US-AUTH-12) porte la
 * traçabilité (NF3) et expose AuditService à tous les modules — il est déclaré
 * avant les modules métier pour être disponible partout. Les autres modules
 * métier (users, qcm, ateliers, certificats, assistance-ia, notifications) seront
 * ajoutés ici au fil des sprints. FormationsModule (US-FORM-01) ouvre le
 * cœur métier du Sprint 2 ; InscriptionsModule (US-INSC-01) y ajoute
 * l'inscription des apprenants, QcmModule (US-QCM-01) les évaluations,
 * TentativesModule (US-QCM-05) leur passage par l'apprenant.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    MailModule,
    AuditModule,
    HealthModule,
    AuthModule,
    ReferentielModule,
    AdminModule,
    RoleRequestsModule,
    FormationsModule,
    InscriptionsModule,
    QcmModule,
    TentativesModule,
  ],
})
export class AppModule {}
