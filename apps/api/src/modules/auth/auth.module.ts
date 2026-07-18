import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Module d'authentification (US-AUTH-01/03/04/11).
 *
 * Les deux guards sont enregistrés en APP_GUARD -> GLOBAUX (toutes les routes
 * de l'app). Ordre important : JwtAuthGuard (authentification) AVANT RolesGuard
 * (autorisation). Les routes ouvertes sont marquées @Public(). Enregistrés ici
 * (et non via app.useGlobalGuards) pour pouvoir injecter leurs dépendances
 * (Reflector, JwtService, ConfigService, RedisService).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AuditLog]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
