import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemandeRole } from '../../database/entities/demande-role.entity';
import { User } from '../../database/entities/user.entity';
import { AdminModule } from '../admin/admin.module';
import { RoleRequestsController } from './role-requests.controller';
import { AdminRoleRequestsController } from './admin-role-requests.controller';
import { RoleRequestsService } from './role-requests.service';

/**
 * Module des demandes de changement de rôle (US-ROL-02).
 *
 * - forFeature([DemandeRole, User]) : lecture/écriture des demandes + identité
 *   des demandeurs.
 * - AdminModule (importé) exporte AdminUsersService : à l'approbation, on
 *   réutilise le cœur du changement de rôle d'US-ROL-01 (appliquerChangementRole)
 *   au lieu de le réimplémenter.
 * - AuditService est @Global (US-AUTH-12) — pas d'import nécessaire.
 * - Deux contrôleurs : utilisateur (RoleRequestsController) et admin
 *   (AdminRoleRequestsController), séparés par préfixe de route et protection.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DemandeRole, User]), AdminModule],
  controllers: [RoleRequestsController, AdminRoleRequestsController],
  providers: [RoleRequestsService],
})
export class RoleRequestsModule {}
