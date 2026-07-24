import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { CompteOauth } from '../../database/entities/compte-oauth.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
/**
 * Module d'authentification (US-AUTH-01/03/04/11 + US-CPT-05 + US-AUTH-14).
 *
 * Les deux guards restent GLOBAUX (APP_GUARD). PassportModule + les stratégies
 * OAuth (Google, GitHub) ajoutent la connexion sociale : Passport n'intervient
 * QUE sur l'acquisition d'identité OAuth (routes /auth/oauth/*) ; la session JWT
 * reste maison.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AuditLog, CompteOauth]),
    JwtModule.register({}),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleStrategy,
    GithubStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
