import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { LoginDto } from './dto/login.dto';
import { JwtConfig } from '../../config/configuration';

/**
 * Message d'erreur volontairement générique (US-AUTH-01, "sécurité par
 * opacité" — voir DS-01 et le Gherkin du backlog). Email inconnu, mauvais
 * mot de passe et compte non ACTIF renvoient TOUS ce même message, pour
 * qu'un attaquant ne puisse pas déduire lequel des trois cas s'est produit
 * (anti-énumération de comptes).
 */
const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte inactif.';

/**
 * Forme du token retourné à l'appelant après une connexion réussie.
 * Le refresh token n'est renvoyé qu'une seule fois, en clair, ici : seule
 * sa version hachée (SHA-256) est conservée en base (cf. RefreshToken.tokenHash).
 */
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: User['role'];
  };
}

@Injectable()
export class AuthService {
  /**
   * Clé privée RS256 chargée UNE SEULE FOIS au démarrage du service (et non
   * relue à chaque requête) : lire un fichier sur disque à chaque login
   * serait un coût inutile alors que la clé ne change jamais en cours
   * d'exécution (elle est injectée via un secret Docker en lecture seule,
   * cf. INF07).
   */
  private readonly jwtConfig: JwtConfig;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtConfig = this.configService.getOrThrow<JwtConfig>('jwt');
  }

  /**
   * US-AUTH-01 — Connexion par email + mot de passe.
   *
   * Déroulé (voir DS-01, étapes 1-2) :
   *   1. Recherche du compte par email.
   *   2. Vérification du mot de passe via bcrypt.compare() — exécutée
   *      MÊME si le compte n'existe pas (comparaison "factice" contre un
   *      hash bidon), pour que le temps de réponse ne révèle pas si
   *      l'email existe ou non (protection par le temps, en plus du
   *      message générique).
   *   3. Vérification du statut du compte (ACTIF requis) — APRÈS la
   *      comparaison du mot de passe, pour la même raison de constance
   *      temporelle.
   *   4. Émission des tokens RS256 (access 15 min, refresh 7 j),
   *      persistance de la session, mise à jour de derniereConnexion.
   *
   * Toute erreur (compte inconnu, mauvais mot de passe, compte inactif)
   * lève la MÊME exception avec le MÊME message (GENERIC_LOGIN_ERROR).
   */
  async login(
    dto: LoginDto,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    // Hash bidon utilisé quand aucun utilisateur n'est trouvé, pour que
    // bcrypt.compare() prenne un temps comparable dans les deux cas
    // (compte existant vs compte inexistant). La valeur exacte n'a pas
    // d'importance : elle ne correspondra jamais à un mot de passe réel.
    const hashToCompare =
      user?.motDePasseHash ??
      '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';

    const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (user.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.signRefreshToken(user);

    await this.persistRefreshToken(user.id, refreshToken, context);

    user.derniereConnexion = new Date();
    await this.userRepository.save(user);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Signe l'access token (courte durée, 15 min — ADR-08). Contient
   * l'identifiant utilisateur (sub) et le rôle, nécessaire au frontend
   * pour router vers le bon espace ET au futur RBAC (US-AUTH-11) pour
   * savoir qui appelle sans re-interroger la base à chaque requête.
   */
  private async signAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        privateKey: this.getPrivateKey(),
        algorithm: 'RS256',
        expiresIn: this.jwtConfig.accessTokenExpiresIn,
      },
    );
  }

  /**
   * Signe le refresh token (longue durée, 7 j — ADR-08). Payload minimal
   * à dessein : un refresh token ne sert qu'à obtenir un nouvel access
   * token (US-AUTH-03), il n'a pas besoin de porter le rôle.
   */
  private async signRefreshToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, type: 'refresh' },
      {
        privateKey: this.getPrivateKey(),
        algorithm: 'RS256',
        expiresIn: this.jwtConfig.refreshTokenExpiresIn,
      },
    );
  }

  /**
   * Persiste la session en base (table refresh_tokens). On ne stocke
   * JAMAIS le refresh token en clair : uniquement son empreinte SHA-256
   * (rapide, déterministe, sans limite de longueur — contrairement à
   * bcrypt qui tronque au-delà de 72 caractères et qui est délibérément
   * lent, ce qui n'a pas de sens pour un jeton déjà aléatoire).
   */
  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
    context: { adresseIp: string | null; userAgent: string | null },
  ): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + 7); // ADR-08 : 7 jours

    const session = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      adresseIp: context.adresseIp,
      userAgent: context.userAgent,
      active: true,
      dateExpiration,
    });

    await this.refreshTokenRepository.save(session);
  }

  /**
   * Lit la clé privée RS256 depuis le chemin injecté par Docker (secret
   * en lecture seule, cf. INF07). fs.readFileSync est synchrone mais
   * n'est appelé qu'à la connexion (opération peu fréquente) — pas dans
   * une boucle chaude, donc acceptable sans mise en cache supplémentaire.
   */
private getPrivateKey(): string {
    return fs.readFileSync(this.jwtConfig.privateKeyPath, 'utf8');
  }
}