import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Module d'authentification (US-AUTH-01).
 *
 * - TypeOrmModule.forFeature([...]) : enregistre les repositories User et
 *   RefreshToken pour ce module. C'est le PREMIER module du projet à
 *   utiliser forFeature — DatabaseModule (global) ne fait que la connexion
 *   racine (TypeOrmModule.forRoot), chaque module métier enregistre
 *   ensuite ses propres entités au besoin (pattern NestJS standard).
 *
 * - JwtModule.register({}) : enregistré VIDE volontairement. La clé privée
 *   RS256 est lue à la demande dans AuthService (getPrivateKey()), pas ici
 *   au démarrage du module — on évite de bloquer tout le module d'auth si
 *   jamais la lecture du fichier de clé échouait au boot plutôt qu'à
 *   l'usage. algorithm/expiresIn sont passés explicitement à chaque appel
 *   signAsync() dans AuthService, donc aucune config globale n'est requise
 *   ici.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}