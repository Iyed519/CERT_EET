import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RedisService } from '../../../redis/redis.service';
import { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';
import { Role } from '../../../database/enums/role.enum';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  const mockReflector = { getAllAndOverride: jest.fn() };
  const mockJwtService = { verifyAsync: jest.fn() };
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue({
      privateKeyPath: '/fake/private.pem',
      publicKeyPath: '/fake/public.pem',
      accessTokenExpiresIn: 900,
      refreshTokenExpiresIn: 604800,
    }),
  };
  const mockRedisService = { exists: jest.fn(), get: jest.fn() };

  const validPayload = (): AccessTokenPayload => ({
    sub: 'u1',
    email: 'a@cert-eet.local',
    role: Role.APPRENANT,
    jti: 'jti-1',
    iat: 1000,
    exp: 9_999_999_999,
  });

  const contextFor = (
    request: Partial<AuthenticatedRequest>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, 'readFileSync').mockReturnValue('fake-public-key');
    mockReflector.getAllAndOverride.mockReturnValue(false);
    mockRedisService.exists.mockResolvedValue(false);
    mockRedisService.get.mockResolvedValue(null);
    guard = new JwtAuthGuard(
      mockReflector as unknown as Reflector,
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
      mockRedisService as unknown as RedisService,
    );
  });

  it('est défini', () => {
    expect(guard).toBeDefined();
  });

  it('laisse passer une route @Public sans vérifier de token', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );
    expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejette (401) sans en-tête Authorization', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejette (401) un token invalide', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid'));
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer bad' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepte un token valide et attache req.user', async () => {
    const payload = validPayload();
    mockJwtService.verifyAsync.mockResolvedValue(payload);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good' },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('rejette (401) un jti présent sur la denylist', async () => {
    mockJwtService.verifyAsync.mockResolvedValue(validPayload());
    mockRedisService.exists.mockResolvedValue(true);
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer good' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejette (401) un token émis avant le marqueur sessions-valid-after', async () => {
    mockJwtService.verifyAsync.mockResolvedValue(validPayload()); // iat = 1000
    mockRedisService.get.mockResolvedValue('2000'); // marqueur > iat
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer good' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
