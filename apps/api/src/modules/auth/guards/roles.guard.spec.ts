import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../../../database/enums/role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  const mockReflector = { getAllAndOverride: jest.fn() };

  const contextForUser = (user?: { role: Role }): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(mockReflector as unknown as Reflector);
  });

  it('laisse passer si aucune contrainte de rôle', () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextForUser({ role: Role.APPRENANT }))).toBe(
      true,
    );
  });

  it('laisse passer si le rôle correspond', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMINISTRATEUR]);
    expect(
      guard.canActivate(contextForUser({ role: Role.ADMINISTRATEUR })),
    ).toBe(true);
  });

  it('refuse (403) si le rôle ne correspond pas', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMINISTRATEUR]);
    expect(() =>
      guard.canActivate(contextForUser({ role: Role.APPRENANT })),
    ).toThrow(ForbiddenException);
  });

  it('refuse (403) si aucun utilisateur n est présent', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.FORMATEUR]);
    expect(() => guard.canActivate(contextForUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
