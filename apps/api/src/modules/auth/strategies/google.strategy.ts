import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { OauthGoogleConfig } from '../../../config/configuration';
import { OauthProfile } from '../auth.types';
/**
 * Stratégie Passport — connexion Google (US-AUTH-14).
 *
 * Passport gère TOUT le dialogue OAuth (redirection, paramètre state, échange
 * du code contre les jetons Google, récupération du profil). On se contente de
 * NORMALISER le profil en OauthProfile ; l'émission de session JWT reste faite
 * maison dans AuthService (ADR-08 : la session n'est pas déléguée à Passport).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const { clientId, clientSecret, callbackUrl } =
      configService.getOrThrow<OauthGoogleConfig>('oauthGoogle');
    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });
  }
  /**
   * Appelée par Passport après un retour Google valide. La valeur retournée est
   * attachée à req.user, consommée par le contrôleur pour ouvrir la session.
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): OauthProfile {
    return {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      nom: profile.name?.familyName ?? null,
      prenom: profile.name?.givenName ?? null,
    };
  }
}
