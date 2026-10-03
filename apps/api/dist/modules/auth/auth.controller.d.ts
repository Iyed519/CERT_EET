import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService, MfaSetupResult, ProfilResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { MfaCodeDto } from './dto/mfa-code.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { AuthenticatedRequest, OauthProfile } from './auth.types';
interface LoginResponseBody {
    accessToken: string;
    user: {
        id: string;
        email: string;
        role: string;
    };
}
export declare class AuthController {
    private readonly authService;
    private readonly configService;
    private readonly jwtConfig;
    constructor(authService: AuthService, configService: ConfigService);
    register(dto: RegisterDto, req: Request): Promise<{
        message: string;
    }>;
    verifyEmail(dto: VerifyEmailDto): Promise<{
        message: string;
    }>;
    googleAuth(): void;
    googleCallback(req: Request & {
        user?: OauthProfile;
    }, res: Response): Promise<void>;
    githubAuth(): void;
    githubCallback(req: Request & {
        user?: OauthProfile;
    }, res: Response): Promise<void>;
    login(dto: LoginDto, req: Request, res: Response): Promise<LoginResponseBody | {
        mfaRequired: true;
        mfaToken: string;
    }>;
    mfaVerify(dto: MfaVerifyDto, req: Request, res: Response): Promise<LoginResponseBody>;
    refresh(req: Request, res: Response): Promise<LoginResponseBody>;
    logout(req: Request, res: Response): Promise<{
        message: string;
    }>;
    me(req: AuthenticatedRequest): Promise<ProfilResult>;
    completeProfile(dto: CompleteProfileDto, req: AuthenticatedRequest): Promise<ProfilResult>;
    mfaSetup(req: AuthenticatedRequest): Promise<MfaSetupResult>;
    mfaEnable(dto: MfaCodeDto, req: AuthenticatedRequest): Promise<{
        message: string;
    }>;
    mfaDisable(dto: MfaCodeDto, req: AuthenticatedRequest): Promise<{
        message: string;
    }>;
    private completeOauthLogin;
    private setRefreshTokenCookie;
}
export {};
