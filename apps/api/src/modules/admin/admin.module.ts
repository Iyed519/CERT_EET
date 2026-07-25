import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * Module d'administration (US-ROL-01).
 *
 * - TypeOrmModule.forFeature([User, AuditLog]) : le service met à jour le rôle
 *   et écrit l'entrée d'audit (même pattern que AuthService).
 * - AuthModule importé pour injecter AuthService.invalidateUserSessions
 *   (hook ADR-08-R1). AuthModule exporte désormais AuthService (même lot).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog]), AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminModule {}
