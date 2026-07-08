import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService, LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';

/**
 * Contrôleur d'authentification (US-AUTH-01).
 *
 * Rôle volontairement mince : valider la forme de la requête (délégué au
 * LoginDto + ValidationPipe global, main.ts) et transmettre à AuthService,
 * qui porte toute la logique métier. Le contrôleur ne fait AUCUNE
 * vérification de mot de passe ou de statut lui-même — Règle de séparation
 * des responsabilités (contrôleur = HTTP, service = métier).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   *
   * @HttpCode(200) explicite : NestJS renvoie 201 par défaut sur un POST,
   * mais une connexion réussie n'est pas une "création de ressource" au
   * sens REST — 200 est plus juste sémantiquement pour cette action.
   *
   * L'adresse IP et le user-agent sont extraits de la requête Express pour
   * être stockés avec la session (table refresh_tokens) — utile pour
   * qu'un utilisateur puisse un jour voir "d'où" il est connecté, et pour
   * l'audit de sécurité.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' })
  @ApiResponse({ status: 200, description: 'Connexion réussie, jetons émis.' })
  @ApiResponse({
    status: 401,
    description:
      'Identifiants invalides ou compte inactif (message générique volontaire — sécurité par opacité).',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResult> {
    return this.authService.login(dto, {
      adresseIp: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}