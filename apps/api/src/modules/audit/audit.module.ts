import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

/**
 * AuditModule (US-AUTH-12) — socle de traçabilité (NF3).
 *
 * @Global : AuditService devient injectable partout SANS réimporter le module
 * (auth, admin et les futures épopées écrivent tous via ce service unique).
 * - forFeature([AuditLog]) : le repository d'audit est porté ici (le writer est
 *   centralisé).
 * - AuditController : GET /admin/audit-logs (consultation, DS-16).
 * - AuditInterceptor est enregistré globalement (APP_INTERCEPTOR) mais n'agit
 *   que sur les routes annotées @Audit -> aucun double-log.
 * - exports : AuditService + TypeOrmModule (le repo AuditLog reste résoluble
 *   ailleurs, ex. teardown e2e).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService, TypeOrmModule],
})
export class AuditModule {}
