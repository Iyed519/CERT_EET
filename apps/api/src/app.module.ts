import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { StockageModule } from './stockage/stockage.module';
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
import { AteliersModule } from './modules/ateliers/ateliers.module';
import { CertificatsModule } from './modules/certificats/certificats.module';
import { AssistanceIaModule } from './modules/assistance-ia/assistance-ia.module';
import { RessourcesModule } from './modules/ressources/ressources.module';
import { PilotageModule } from './modules/pilotage/pilotage.module';
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
 * TentativesModule (US-QCM-05) leur passage par l'apprenant, AteliersModule
 * (US-ATEL-01, Sprint 3) les ateliers pratiques. StockageModule (@Global,
 * US-ATEL-04) dépose les livrables sur MinIO / S3 (ADR-07). CertificatsModule
 * (US-CERT-01) émet les certificats en asynchrone (BullMQ, ADR-04).
 * AssistanceIaModule (US-IA-01, Sprint 3 bloc B) indexe les supports
 * pédagogiques pour la génération de questions par IA (RAG, ADR-05).
 * RessourcesModule (US-FORM-05) : liens et vidéos de cours des modules.
 * PilotageModule (US-DASH-01, Sprint 4) : tableaux de bord agrégés.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    MailModule,
    StockageModule,
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
    AteliersModule,
    CertificatsModule,
    AssistanceIaModule,
    RessourcesModule,
    PilotageModule,
  ],
})
export class AppModule {}
