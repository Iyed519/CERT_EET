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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const typeorm_2 = require("typeorm");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const otplib_1 = require("otplib");
const QRCode = require("qrcode");
const fs = require("fs");
const user_entity_1 = require("../../database/entities/user.entity");
const refresh_token_entity_1 = require("../../database/entities/refresh-token.entity");
const compte_oauth_entity_1 = require("../../database/entities/compte-oauth.entity");
const statut_compte_enum_1 = require("../../database/enums/statut-compte.enum");
const role_enum_1 = require("../../database/enums/role.enum");
const domaine_etudes_entity_1 = require("../../database/entities/domaine-etudes.entity");
const etablissement_entity_1 = require("../../database/entities/etablissement.entity");
const redis_service_1 = require("../../redis/redis.service");
const mail_service_1 = require("../../mail/mail.service");
const audit_service_1 = require("../audit/audit.service");
const auth_keys_1 = require("./auth.keys");
const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte inactif.';
const GENERIC_REFRESH_ERROR = 'Session invalide ou expirée.';
const GENERIC_OAUTH_ERROR = 'Connexion sociale impossible.';
const GENERIC_MFA_ERROR = 'Code de vérification invalide ou expiré.';
const VERIFY_EMAIL_TTL_SECONDS = 48 * 3600;
const MFA_ISSUER = 'Cert_EET';
const MFA_SETUP_TTL_SECONDS = 10 * 60;
const MFA_SESSION_TTL_SECONDS = 5 * 60;
let AuthService = class AuthService {
    constructor(userRepository, refreshTokenRepository, compteOauthRepository, jwtService, configService, redisService, mailService, auditService) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.compteOauthRepository = compteOauthRepository;
        this.jwtService = jwtService;
        this.configService = configService;
        this.redisService = redisService;
        this.mailService = mailService;
        this.auditService = auditService;
        this.jwtConfig = this.configService.getOrThrow('jwt');
        otplib_1.authenticator.options = { window: 1 };
    }
    async register(dto, context) {
        const emailExistant = await this.userRepository.findOne({
            where: { email: dto.email },
        });
        if (emailExistant) {
            throw new common_1.ConflictException('Cet email est déjà utilisé.');
        }
        const motDePasseHash = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({
            email: dto.email,
            nom: dto.nom,
            prenom: dto.prenom,
            motDePasseHash,
            role: role_enum_1.Role.APPRENANT,
            statut: statut_compte_enum_1.StatutCompte.EN_ATTENTE_ACTIVATION,
        });
        const saved = await this.userRepository.save(user);
        const token = crypto.randomUUID();
        await this.redisService.set((0, auth_keys_1.verifyEmailKey)(token), saved.id, VERIFY_EMAIL_TTL_SECONDS);
        await this.mailService.sendVerificationEmail(saved.email, token);
        await this.auditService.record({
            action: 'COMPTE_CREE',
            acteur: saved.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
    }
    async verifyEmail(token) {
        const key = (0, auth_keys_1.verifyEmailKey)(token);
        const userId = await this.redisService.get(key);
        if (!userId) {
            throw new common_1.BadRequestException('Lien de vérification invalide ou expiré.');
        }
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            await this.redisService.del(key);
            throw new common_1.BadRequestException('Lien de vérification invalide ou expiré.');
        }
        user.statut = statut_compte_enum_1.StatutCompte.ACTIF;
        await this.userRepository.save(user);
        await this.redisService.del(key);
        await this.auditService.record({
            action: 'EMAIL_VERIFIE',
            acteur: user.id,
            resultat: 'Succès',
        });
    }
    async login(dto, context) {
        const user = await this.userRepository.findOne({
            where: { email: dto.email },
        });
        const hashToCompare = user?.motDePasseHash ??
            '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';
        const passwordMatches = await bcrypt.compare(dto.password, hashToCompare);
        if (!user || !passwordMatches) {
            throw new common_1.UnauthorizedException(GENERIC_LOGIN_ERROR);
        }
        if (user.statut !== statut_compte_enum_1.StatutCompte.ACTIF) {
            throw new common_1.UnauthorizedException(GENERIC_LOGIN_ERROR);
        }
        if (user.mfaActive) {
            const mfaToken = crypto.randomUUID();
            await this.redisService.set((0, auth_keys_1.mfaSessionKey)(mfaToken), user.id, MFA_SESSION_TTL_SECONDS);
            return { mfaRequired: true, mfaToken };
        }
        return this.issueSession(user, context, 'LOGIN');
    }
    async mfaVerify(mfaToken, code, context) {
        const userId = await this.redisService.get((0, auth_keys_1.mfaSessionKey)(mfaToken));
        if (!userId) {
            throw new common_1.UnauthorizedException(GENERIC_MFA_ERROR);
        }
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user ||
            user.statut !== statut_compte_enum_1.StatutCompte.ACTIF ||
            !user.mfaActive ||
            !user.mfaSecret) {
            throw new common_1.UnauthorizedException(GENERIC_MFA_ERROR);
        }
        if (!this.verifierTotp(code, user.mfaSecret)) {
            throw new common_1.UnauthorizedException(GENERIC_MFA_ERROR);
        }
        await this.redisService.del((0, auth_keys_1.mfaSessionKey)(mfaToken));
        return this.issueSession(user, context, 'LOGIN');
    }
    async issueSession(user, context, auditAction) {
        const accessToken = await this.signAccessToken(user);
        const refreshToken = await this.signRefreshToken(user);
        const familleId = crypto.randomUUID();
        await this.persistRefreshToken(user.id, refreshToken, familleId, context);
        user.derniereConnexion = new Date();
        await this.userRepository.save(user);
        await this.auditService.record({
            action: auditAction,
            acteur: user.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, role: user.role },
        };
    }
    async loginWithOauth(oauth, context) {
        const lien = await this.compteOauthRepository.findOne({
            where: { provider: oauth.provider, providerId: oauth.providerId },
        });
        let user = null;
        if (lien) {
            user = await this.userRepository.findOne({ where: { id: lien.userId } });
        }
        else {
            if (!oauth.email) {
                throw new common_1.UnauthorizedException(GENERIC_OAUTH_ERROR);
            }
            user = await this.userRepository.findOne({
                where: { email: oauth.email },
            });
            if (!user) {
                user = this.userRepository.create({
                    email: oauth.email,
                    nom: oauth.nom,
                    prenom: oauth.prenom,
                    motDePasseHash: null,
                    role: role_enum_1.Role.APPRENANT,
                    statut: statut_compte_enum_1.StatutCompte.ACTIF,
                });
                user = await this.userRepository.save(user);
                await this.auditService.record({
                    action: 'COMPTE_CREE',
                    acteur: user.id,
                    adresseIp: context.adresseIp,
                    resultat: 'Succès',
                });
            }
            const nouveauLien = this.compteOauthRepository.create({
                userId: user.id,
                provider: oauth.provider,
                providerId: oauth.providerId,
                email: oauth.email,
            });
            await this.compteOauthRepository.save(nouveauLien);
        }
        if (!user) {
            throw new common_1.UnauthorizedException(GENERIC_OAUTH_ERROR);
        }
        if (user.statut === statut_compte_enum_1.StatutCompte.EN_ATTENTE_ACTIVATION) {
            user.statut = statut_compte_enum_1.StatutCompte.ACTIF;
        }
        if (user.statut !== statut_compte_enum_1.StatutCompte.ACTIF) {
            throw new common_1.UnauthorizedException(GENERIC_OAUTH_ERROR);
        }
        const accessToken = await this.signAccessToken(user);
        const refreshToken = await this.signRefreshToken(user);
        const familleId = crypto.randomUUID();
        await this.persistRefreshToken(user.id, refreshToken, familleId, context);
        user.derniereConnexion = new Date();
        await this.userRepository.save(user);
        await this.auditService.record({
            action: 'CONNEXION_OAUTH',
            acteur: user.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
        return {
            accessToken,
            refreshToken,
            user: { id: user.id, email: user.email, role: user.role },
        };
    }
    async refresh(refreshToken, context) {
        const tokenHash = this.hashToken(refreshToken);
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(refreshToken, {
                publicKey: this.getPublicKey(),
                algorithms: ['RS256'],
            });
        }
        catch {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        if (payload.type !== 'refresh') {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        if (await this.redisService.exists((0, auth_keys_1.refreshDenylistKey)(tokenHash))) {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        const stored = await this.refreshTokenRepository.findOne({
            where: { tokenHash },
        });
        if (!stored) {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        if (!stored.active) {
            await this.revokeFamille(stored.familleId);
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        if (stored.dateExpiration.getTime() <= Date.now()) {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
        });
        if (!user || user.statut !== statut_compte_enum_1.StatutCompte.ACTIF) {
            throw new common_1.UnauthorizedException(GENERIC_REFRESH_ERROR);
        }
        await this.burnRefreshToken(stored);
        const accessToken = await this.signAccessToken(user);
        const newRefreshToken = await this.signRefreshToken(user);
        await this.persistRefreshToken(user.id, newRefreshToken, stored.familleId, context);
        return {
            accessToken,
            refreshToken: newRefreshToken,
            user: { id: user.id, email: user.email, role: user.role },
        };
    }
    async logout(accessToken, refreshToken, context) {
        let userId = null;
        let revoked = false;
        if (accessToken) {
            const claims = await this.decodeAccessToken(accessToken);
            if (claims) {
                userId = claims.sub;
                const key = (0, auth_keys_1.accessDenylistKey)(claims.jti);
                const ttl = this.remainingSeconds(claims.exp);
                if (ttl > 0 && !(await this.redisService.exists(key))) {
                    await this.redisService.set(key, '1', ttl);
                    revoked = true;
                }
            }
        }
        if (refreshToken) {
            const stored = await this.refreshTokenRepository.findOne({
                where: { tokenHash: this.hashToken(refreshToken) },
            });
            if (stored) {
                userId = userId ?? stored.userId;
                if (stored.active) {
                    await this.burnRefreshToken(stored);
                    revoked = true;
                }
            }
        }
        if (revoked && userId) {
            await this.journaliserLogout(userId, context.adresseIp);
        }
    }
    async invalidateUserSessions(userId) {
        await this.refreshTokenRepository.update({ userId, active: true }, { active: false });
        const nowSeconds = Math.floor(Date.now() / 1000);
        await this.redisService.set((0, auth_keys_1.sessionsValidAfterKey)(userId), String(nowSeconds), this.jwtConfig.accessTokenExpiresIn);
    }
    async getMe(userId) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        return this.mapProfil(user);
    }
    async completeProfile(userId, dto, context) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifié.');
        }
        if (this.calculerAge(dto.dateNaissance) < 13) {
            throw new common_1.BadRequestException("L'âge minimum requis est de 13 ans.");
        }
        if (dto.enEtudes) {
            if (!dto.domaineEtudesId) {
                throw new common_1.BadRequestException("Le domaine d'études est requis.");
            }
            const domaine = await this.userRepository.manager.findOne(domaine_etudes_entity_1.DomaineEtudes, {
                where: { id: dto.domaineEtudesId },
            });
            if (!domaine) {
                throw new common_1.BadRequestException("Domaine d'études inconnu.");
            }
            user.domaineEtudesId = dto.domaineEtudesId;
            if (dto.etablissementId) {
                const etab = await this.userRepository.manager.findOne(etablissement_entity_1.Etablissement, {
                    where: { id: dto.etablissementId },
                });
                if (!etab) {
                    throw new common_1.BadRequestException('Établissement inconnu.');
                }
                user.etablissementId = dto.etablissementId;
                user.etablissementAutre = null;
            }
            else if (dto.etablissementAutre) {
                user.etablissementId = null;
                user.etablissementAutre = dto.etablissementAutre;
            }
            else {
                user.etablissementId = null;
                user.etablissementAutre = null;
            }
        }
        else {
            user.domaineEtudesId = null;
            user.etablissementId = null;
            user.etablissementAutre = null;
        }
        user.dateNaissance = dto.dateNaissance;
        user.niveauEtudes = dto.niveauEtudes;
        user.profilComplet = true;
        await this.userRepository.save(user);
        await this.auditService.record({
            action: 'PROFIL_COMPLETE',
            acteur: user.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
        return this.mapProfil(user);
    }
    async mfaSetup(userId) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        if (user.mfaActive) {
            throw new common_1.ConflictException('La double authentification est deja activee.');
        }
        const secret = otplib_1.authenticator.generateSecret();
        await this.redisService.set((0, auth_keys_1.mfaSetupKey)(userId), secret, MFA_SETUP_TTL_SECONDS);
        const otpauthUrl = otplib_1.authenticator.keyuri(user.email, MFA_ISSUER, secret);
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
        return { otpauthUrl, qrDataUrl };
    }
    async mfaEnable(userId, code, context) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        if (user.mfaActive) {
            throw new common_1.ConflictException('La double authentification est deja activee.');
        }
        const secret = await this.redisService.get((0, auth_keys_1.mfaSetupKey)(userId));
        if (!secret) {
            throw new common_1.BadRequestException("Aucune activation en cours ou delai depasse. Relancez l'activation.");
        }
        if (!this.verifierTotp(code, secret)) {
            throw new common_1.BadRequestException('Code invalide.');
        }
        user.mfaSecret = secret;
        user.mfaActive = true;
        await this.userRepository.save(user);
        await this.redisService.del((0, auth_keys_1.mfaSetupKey)(userId));
        await this.auditService.record({
            action: 'MFA_ACTIVEE',
            acteur: user.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
    }
    async mfaDisable(userId, code, context) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.UnauthorizedException('Non authentifie.');
        }
        if (!user.mfaActive || !user.mfaSecret) {
            throw new common_1.BadRequestException("La double authentification n'est pas activee.");
        }
        if (!this.verifierTotp(code, user.mfaSecret)) {
            throw new common_1.BadRequestException('Code invalide.');
        }
        user.mfaActive = false;
        user.mfaSecret = null;
        await this.userRepository.save(user);
        await this.auditService.record({
            action: 'MFA_DESACTIVEE',
            acteur: user.id,
            adresseIp: context.adresseIp,
            resultat: 'Succès',
        });
    }
    verifierTotp(code, secret) {
        try {
            return otplib_1.authenticator.verify({ token: code, secret });
        }
        catch {
            return false;
        }
    }
    mapProfil(user) {
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            profilComplet: user.profilComplet,
            mfaActive: user.mfaActive,
            dateNaissance: user.dateNaissance,
            age: user.dateNaissance ? this.calculerAge(user.dateNaissance) : null,
            niveauEtudes: user.niveauEtudes,
            domaineEtudesId: user.domaineEtudesId,
            etablissementId: user.etablissementId,
            etablissementAutre: user.etablissementAutre,
        };
    }
    calculerAge(dateNaissance) {
        const naissance = new Date(dateNaissance);
        const maintenant = new Date();
        let age = maintenant.getFullYear() - naissance.getFullYear();
        const mois = maintenant.getMonth() - naissance.getMonth();
        if (mois < 0 ||
            (mois === 0 && maintenant.getDate() < naissance.getDate())) {
            age -= 1;
        }
        return age;
    }
    async signAccessToken(user) {
        return this.jwtService.signAsync({
            sub: user.id,
            email: user.email,
            role: user.role,
            jti: crypto.randomUUID(),
        }, {
            privateKey: this.getPrivateKey(),
            algorithm: 'RS256',
            expiresIn: this.jwtConfig.accessTokenExpiresIn,
        });
    }
    async signRefreshToken(user) {
        return this.jwtService.signAsync({ sub: user.id, type: 'refresh', jti: crypto.randomUUID() }, {
            privateKey: this.getPrivateKey(),
            algorithm: 'RS256',
            expiresIn: this.jwtConfig.refreshTokenExpiresIn,
        });
    }
    async persistRefreshToken(userId, refreshToken, familleId, context) {
        const dateExpiration = new Date();
        dateExpiration.setDate(dateExpiration.getDate() + 7);
        const session = this.refreshTokenRepository.create({
            userId,
            familleId,
            tokenHash: this.hashToken(refreshToken),
            adresseIp: context.adresseIp,
            userAgent: context.userAgent,
            active: true,
            dateExpiration,
        });
        await this.refreshTokenRepository.save(session);
    }
    async burnRefreshToken(token) {
        token.active = false;
        await this.refreshTokenRepository.save(token);
        const ttlSeconds = Math.max(1, Math.ceil((token.dateExpiration.getTime() - Date.now()) / 1000));
        await this.redisService.set((0, auth_keys_1.refreshDenylistKey)(token.tokenHash), '1', ttlSeconds);
    }
    async revokeFamille(familleId) {
        await this.refreshTokenRepository.update({ familleId, active: true }, { active: false });
    }
    async journaliserLogout(userId, adresseIp) {
        await this.auditService.record({
            action: 'LOGOUT',
            acteur: userId,
            adresseIp,
            resultat: 'Succès',
        });
    }
    async decodeAccessToken(token) {
        try {
            return await this.jwtService.verifyAsync(token, {
                publicKey: this.getPublicKey(),
                algorithms: ['RS256'],
            });
        }
        catch {
            return null;
        }
    }
    remainingSeconds(expSeconds) {
        return Math.max(0, expSeconds - Math.floor(Date.now() / 1000));
    }
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    getPrivateKey() {
        return fs.readFileSync(this.jwtConfig.privateKeyPath, 'utf8');
    }
    getPublicKey() {
        return fs.readFileSync(this.jwtConfig.publicKeyPath, 'utf8');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(refresh_token_entity_1.RefreshToken)),
    __param(2, (0, typeorm_1.InjectRepository)(compte_oauth_entity_1.CompteOauth)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService,
        mail_service_1.MailService,
        audit_service_1.AuditService])
], AuthService);
//# sourceMappingURL=auth.service.js.map