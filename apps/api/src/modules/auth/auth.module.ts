import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Module d'authentification (US-AUTH-01, US-AUTH-03, US-AUTH-04).
 *
 * TypeOrmModule.forFeature enregistre les repositories utilisés par
 * AuthService : User + RefreshToken (login/refresh) et AuditLog (journal
 * LOGOUT, US-AUTH-04). Redis est fourni globalement par RedisModule.
 * JwtModule.register({}) reste vide : clés et options passées explicitement
 * à chaque signAsync/verifyAsync dans AuthService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AuditLog]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
