import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { OauthGithubConfig } from '../../../config/configuration';
import { OauthProfile } from '../auth.types';
/**
 * Stratégie Passport — connexion GitHub (US-AUTH-14, 2e fournisseur).
 *
 * Même principe que GoogleStrategy : Passport gère TOUT le dialogue OAuth ;
 * on se contente de NORMALISER le profil GitHub en OauthProfile. L'émission de
 * session JWT reste faite maison dans AuthService (ADR-08).
 *
 * Scope `user:email` : GitHub ne renvoie l'email que si on le demande
 * explicitement (beaucoup d'utilisateurs gardent leur email privé). Sans email
 * exploitable, loginWithOauth refuse (401) — garde déjà en place.
 */
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(configService: ConfigService) {
    const { clientId, clientSecret, callbackUrl } =
      configService.getOrThrow<OauthGithubConfig>('oauthGithub');
    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['user:email'],
    });
  }
  /**
   * Appelée par Passport après un retour GitHub valide. La valeur retournée est
   * attachée à req.user, consommée par le contrôleur pour ouvrir la session.
   *
   * GitHub ne fournit pas de nom/prénom structurés : on découpe `displayName`
   * (ou, à défaut, `username`) sur le premier espace — prénom = 1er mot,
   * nom = le reste. Ces champs sont facultatifs (nullable en base).
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): OauthProfile {
    const affichage = profile.displayName ?? profile.username ?? null;
    let prenom: string | null = null;
    let nom: string | null = null;
    if (affichage) {
      const morceaux = affichage.trim().split(/\s+/);
      prenom = morceaux[0] ?? null;
      nom = morceaux.length > 1 ? morceaux.slice(1).join(' ') : null;
    }
    return {
      provider: 'github',
      providerId: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      nom,
      prenom,
    };
  }
}
