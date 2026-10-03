"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const register_dto_1 = require("./dto/register.dto");
const verify_email_dto_1 = require("./dto/verify-email.dto");
const complete_profile_dto_1 = require("./dto/complete-profile.dto");
const mfa_code_dto_1 = require("./dto/mfa-code.dto");
const mfa_verify_dto_1 = require("./dto/mfa-verify.dto");
const public_decorator_1 = require("./decorators/public.decorator");
let AuthController = class AuthController {
    constructor(authService, configService) {
        this.authService = authService;
        this.configService = configService;
        this.jwtConfig = this.configService.getOrThrow('jwt');
    }
    async register(dto, req) {
        await this.authService.register(dto, {
            adresseIp: req.ip ?? null,
        });
        return {
            message: 'Compte créé. Un email de vérification vous a été envoyé pour activer votre compte.',
        };
    }
    async verifyEmail(dto) {
        await this.authService.verifyEmail(dto.token);
        return {
            message: 'Votre adresse email a été vérifiée. Vous pouvez maintenant vous connecter.',
        };
    }
    googleAuth() {
    }
    async googleCallback(req, res) {
        await this.completeOauthLogin(req, res);
    }
    githubAuth() {
    }
    async githubCallback(req, res) {
        await this.completeOauthLogin(req, res);
    }
    async login(dto, req, res) {
        const result = await this.authService.login(dto, {
            adresseIp: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
        });
        if ('mfaRequired' in result) {
            return { mfaRequired: true, mfaToken: result.mfaToken };
        }
        this.setRefreshTokenCookie(res, result.refreshToken);
        return { accessToken: result.accessToken, user: result.user };
    }
    async mfaVerify(dto, req, res) {
        const result = await this.authService.mfaVerify(dto.mfaToken, dto.code, {
            adresseIp: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
        });
        this.setRefreshTokenCookie(res, result.refreshToken);
        return { accessToken: result.accessToken, user: result.user };
    }
    async refresh(req, res) {
        const refreshToken = req.cookies?.['refreshToken'];
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('Session invalide ou expirée.');
        }
        const result = await this.authService.refresh(refreshToken, {
            adresseIp: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
        });
        this.setRefreshTokenCookie(res, result.refreshToken);
        return { accessToken: result.accessToken, user: result.user };
    }
    async logout(req, res) {
        const authHeader = req.headers.authorization;
        const accessToken = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length)
            : null;
        const refreshToken = req.cookies?.['refreshToken'] ?? null;
        await this.authService.logout(accessToken, refreshToken, {
            adresseIp: req.ip ?? null,
        });
        res.clearCookie('refreshToken', { path: '/api/auth' });
        return { message: 'Déconnexion effectuée.' };
    }
    async me(req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.authService.getMe(user.sub);
    }
    async completeProfile(dto, req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.authService.completeProfile(user.sub, dto, {
            adresseIp: req.ip ?? null,
        });
    }
    async mfaSetup(req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        return this.authService.mfaSetup(user.sub);
    }
    async mfaEnable(dto, req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        await this.authService.mfaEnable(user.sub, dto.code, {
            adresseIp: req.ip ?? null,
        });
        return { message: 'Double authentification activee.' };
    }
    async mfaDisable(dto, req) {
        const user = req.user;
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        await this.authService.mfaDisable(user.sub, dto.code, {
            adresseIp: req.ip ?? null,
        });
        return { message: 'Double authentification desactivee.' };
    }
    async completeOauthLogin(req, res) {
        const { appBaseUrl } = this.configService.getOrThrow('mail');
        const oauth = req.user;
        if (!oauth) {
            res.redirect(`${appBaseUrl}/login?erreur=oauth`);
            return;
        }
        try {
            const result = await this.authService.loginWithOauth(oauth, {
                adresseIp: req.ip ?? null,
                userAgent: req.headers['user-agent'] ?? null,
            });
            this.setRefreshTokenCookie(res, result.refreshToken);
            res.redirect(`${appBaseUrl}/oauth/callback`);
        }
        catch {
            res.redirect(`${appBaseUrl}/login?erreur=oauth`);
        }
    }
    setRefreshTokenCookie(res, refreshToken) {
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/api/auth',
            maxAge: this.jwtConfig.refreshTokenExpiresIn * 1000,
        });
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Auto-inscription publique (US-CPT-05)' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Compte créé (APPRENANT, EN_ATTENTE_ACTIVATION) ; email de vérification envoyé. Aucune session ouverte.',
    }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Cet email est déjà utilisé.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('verify-email'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: "Vérifier l'email et activer le compte (US-CPT-05)" }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Compte activé (statut ACTIF).' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Jeton invalide ou expiré.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_email_dto_1.VerifyEmailDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('oauth/google'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('google')),
    (0, swagger_1.ApiOperation)({ summary: 'Démarrer la connexion Google (US-AUTH-14)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "googleAuth", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('oauth/google/callback'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('google')),
    (0, swagger_1.ApiOperation)({ summary: 'Callback Google : ouvre la session (US-AUTH-14)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCallback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('oauth/github'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('github')),
    (0, swagger_1.ApiOperation)({ summary: 'Démarrer la connexion GitHub (US-AUTH-14)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "githubAuth", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('oauth/github/callback'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('github')),
    (0, swagger_1.ApiOperation)({ summary: 'Callback GitHub : ouvre la session (US-AUTH-14)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "githubCallback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Connexion par email + mot de passe (US-AUTH-01)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Identifiants invalides ou compte inactif.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('mfa/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Vérifier le code MFA et ouvrir la session (US-AUTH-02)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'accessToken en JSON, refreshToken en cookie httpOnly.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Jeton MFA invalide/expiré ou code invalide.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_verify_dto_1.MfaVerifyDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mfaVerify", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Rafraîchir la session avec rotation (US-AUTH-03)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Nouvel access token ; refresh token pivoté.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Refresh absent/invalide/expiré/révoqué.' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Déconnexion : révoque access + refresh (US-AUTH-04)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Déconnexion effectuée (idempotente).' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Utilisateur authentifié courant (US-AUTH-11/15)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Profil courant (incl. profil_complet).',
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifié / jeton révoqué.' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Patch)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Compléter le profil apprenant (US-AUTH-15)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Profil complété.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Données invalides (âge, domaine…).' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifié.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [complete_profile_dto_1.CompleteProfileDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "completeProfile", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Post)('mfa/setup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: "Demarrer l'enrolement MFA (US-AUTH-09)" }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'otpauthUrl + qrDataUrl (secret en attente).' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifie.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'MFA deja activee.' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mfaSetup", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Post)('mfa/enable'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: "Confirmer l'activation MFA (US-AUTH-09)" }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'MFA activee.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Code invalide ou activation expiree.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifie.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'MFA deja activee.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_code_dto_1.MfaCodeDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mfaEnable", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.Post)('mfa/disable'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Desactiver la MFA (US-AUTH-09)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'MFA desactivee.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'MFA non activee ou code invalide.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Non authentifie.' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mfa_code_dto_1.MfaCodeDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mfaDisable", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        config_1.ConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map