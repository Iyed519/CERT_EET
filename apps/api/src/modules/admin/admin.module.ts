import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { ImportComptesController } from './import-comptes/import-comptes.controller';
import { ImportComptesService } from './import-comptes/import-comptes.service';
import { AnonymisationController } from './anonymisation/anonymisation.controller';
import { AnonymisationService } from './anonymisation/anonymisation.service';

/**
 * Module d'administration (US-ROL-01).
 *
 * - TypeOrmModule.forFeature([User]) : le service met à jour le rôle / le
 *   statut. L'écriture d'audit ne passe plus par un repository local mais par
 *   AuditService (AuditModule @Global, US-AUTH-12) — d'où le retrait d'AuditLog.
 * - AuthModule importé pour injecter AuthService.invalidateUserSessions
 *   (hook ADR-08-R1). AuthModule exporte AuthService.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AdminUsersController, ImportComptesController, AnonymisationController],
  providers: [AdminUsersService, ImportComptesService, AnonymisationService],
  // Exporté pour US-ROL-02 : le module role-requests réutilise le cœur du
  // changement de rôle (appliquerChangementRole) sans le réimplémenter.
  exports: [AdminUsersService],
})
export class AdminModule {}
