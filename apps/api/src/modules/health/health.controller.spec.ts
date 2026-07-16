import { Test, TestingModule } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  // Le HealthController lit désormais nodeEnv via ConfigService (seuil heap
  // test-aware, US-AUTH-03). On fournit un faux ConfigService renvoyant
  // l'environnement 'test' : le seuil élevé évite un faux négatif dû au heap
  // gonflé du process jest.
  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue({ nodeEnv: 'test' }),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: ConfigService, useValue: mockConfigService }],
    }).compile();
    controller = moduleRef.get<HealthController>(HealthController);
  });

  it('est défini', () => {
    expect(controller).toBeDefined();
  });

  it('retourne un statut "ok" pour le liveness', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.details).toHaveProperty('memory_heap');
  });
});
