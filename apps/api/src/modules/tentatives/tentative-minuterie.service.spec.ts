import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { TentativeMinuterieService } from './tentative-minuterie.service';

/**
 * Tests unitaires de la minuterie Redis (US-QCM-07, D1) : clé `timer:{id}`
 * à expiration ABSOLUE (`PXAT` = échéance), rien pour une échéance passée,
 * et une panne de Redis qui ne remonte jamais.
 */
describe('TentativeMinuterieService', () => {
  let service: TentativeMinuterieService;
  let client: { set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    client = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    const moduleRef = await Test.createTestingModule({
      providers: [TentativeMinuterieService, { provide: REDIS_CLIENT, useValue: client }],
    }).compile();
    service = moduleRef.get(TentativeMinuterieService);
  });

  it('pose la clé avec une expiration absolue à l’échéance (PXAT)', async () => {
    const echeance = new Date(Date.now() + 30 * 60_000);
    await service.armer('t-1', echeance);
    expect(client.set).toHaveBeenCalledWith(
      'timer:t-1',
      echeance.getTime().toString(),
      'PXAT',
      echeance.getTime(),
    );
  });

  it('reposer la clé donne la même échéance : le temps n’est jamais rallongé', async () => {
    const echeance = new Date(Date.now() + 60_000);
    await service.armer('t-1', echeance);
    await service.armer('t-1', echeance);
    expect(client.set.mock.calls[0]).toEqual(client.set.mock.calls[1]);
  });

  it('ne pose rien pour une échéance passée', async () => {
    await service.armer('t-1', new Date(Date.now() - 1));
    expect(client.set).not.toHaveBeenCalled();
  });

  it('efface la clé', async () => {
    await service.effacer('t-1');
    expect(client.del).toHaveBeenCalledWith('timer:t-1');
  });

  it('une panne de Redis est journalisée, jamais remontée', async () => {
    client.set.mockRejectedValue(new Error('ECONNREFUSED'));
    client.del.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.armer('t-1', new Date(Date.now() + 60_000))).resolves.toBeUndefined();
    await expect(service.effacer('t-1')).resolves.toBeUndefined();
  });
});
