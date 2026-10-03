import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { CompteOauth } from '../../database/entities/compte-oauth.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { NiveauEtudes } from '../../database/enums/niveau-etudes.enum';
import { OauthProfile } from './auth.types';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
export interface MfaSetupResult {
    otpauthUrl: string;
    qrDataUrl: string;
}
export interface MfaChallengeResult {
    mfaRequired: true;
    mfaToken: string;
}
export interface LoginResult {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        role: User['role'];
    };
}
export interface ProfilResult {
    id: string;
    email: string;
    role: User['role'];
    profilComplet: boolean;
    mfaActive: boolean;
    dateNaissance: string | null;
    age: number | null;
    niveauEtudes: NiveauEtudes | null;
    domaineEtudesId: string | null;
    etablissementId: string | null;
    etablissementAutre: string | null;
}
export declare class AuthService {
    private readonly userRepository;
    private readonly refreshTokenRepository;
    private readonly compteOauthRepository;
    private readonly jwtService;
    private readonly configService;
    private readonly redisService;
    private readonly mailService;
    private readonly auditService;
    private readonly jwtConfig;
    constructor(userRepository: Repository<User>, refreshTokenRepository: Repository<RefreshToken>, compteOauthRepository: Repository<CompteOauth>, jwtService: JwtService, configService: ConfigService, redisService: RedisService, mailService: MailService, auditService: AuditService);
    register(dto: RegisterDto, context: {
        adresseIp: string | null;
    }): Promise<void>;
    verifyEmail(token: string): Promise<void>;
    login(dto: LoginDto, context: {
        adresseIp: string | null;
        userAgent: string | null;
    }): Promise<LoginResult | MfaChallengeResult>;
    mfaVerify(mfaToken: string, code: string, context: {
        adresseIp: string | null;
        userAgent: string | null;
    }): Promise<LoginResult>;
    private issueSession;
    loginWithOauth(oauth: OauthProfile, context: {
        adresseIp: string | null;
        userAgent: string | null;
    }): Promise<LoginResult>;
    refresh(refreshToken: string, context: {
        adresseIp: string | null;
        userAgent: string | null;
    }): Promise<LoginResult>;
    logout(accessToken: string | null, refreshToken: string | null, context: {
        adresseIp: string | null;
    }): Promise<void>;
    invalidateUserSessions(userId: string): Promise<void>;
    getMe(userId: string): Promise<ProfilResult>;
    completeProfile(userId: string, dto: CompleteProfileDto, context: {
        adresseIp: string | null;
    }): Promise<ProfilResult>;
    mfaSetup(userId: string): Promise<MfaSetupResult>;
    mfaEnable(userId: string, code: string, context: {
        adresseIp: string | null;
    }): Promise<void>;
    mfaDisable(userId: string, code: string, context: {
        adresseIp: string | null;
    }): Promise<void>;
    private verifierTotp;
    private mapProfil;
    private calculerAge;
    private signAccessToken;
    private signRefreshToken;
    private persistRefreshToken;
    private burnRefreshToken;
    private revokeFamille;
    private journaliserLogout;
    private decodeAccessToken;
    private remainingSeconds;
    private hashToken;
    private getPrivateKey;
    private getPublicKey;
}
