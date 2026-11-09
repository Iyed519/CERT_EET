import Redis from 'ioredis';
import { RedisService } from './redis.service';

/** RedisService.incrementer (US-CERT-05) : client ioredis simulé. */
describe('RedisService.incrementer (US-CERT-05)', () => {
  const exec = jest.fn();
  const chaine = { incr: jest.fn(), expire: jest.fn(), ttl: jest.fn(), exec };
  const client = { multi: jest.fn(() => chaine) };
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    chaine.incr.mockReturnValue(chaine);
    chaine.expire.mockReturnValue(chaine);
    chaine.ttl.mockReturnValue(chaine);
    service = new RedisService(client as unknown as Redis);
  });

  it('INCR puis EXPIRE NX (fenêtre fixe) dans une transaction ; compte et temps restant', async () => {
    exec.mockResolvedValue([
      [null, 3],
      [null, 0],
      [null, 42],
    ]);
    await expect(service.incrementer('k', 60)).resolves.toEqual({ compte: 3, resteSecondes: 42 });
    expect(chaine.incr).toHaveBeenCalledWith('k');
    expect(chaine.expire).toHaveBeenCalledWith('k', 60, 'NX');
    expect(chaine.ttl).toHaveBeenCalledWith('k');
  });

  it('temps restant inconnu (-1) : la fenêtre entière', async () => {
    exec.mockResolvedValue([
      [null, 1],
      [null, 1],
      [null, -1],
    ]);
    await expect(service.incrementer('k', 60)).resolves.toEqual({ compte: 1, resteSecondes: 60 });
  });

  it('erreur d’une commande ou transaction annulée : relancée', async () => {
    exec.mockResolvedValueOnce([
      [new Error('OOM'), null],
      [null, 0],
      [null, 0],
    ]);
    await expect(service.incrementer('k', 60)).rejects.toThrow('OOM');
    exec.mockResolvedValueOnce(null);
    await expect(service.incrementer('k', 60)).rejects.toThrow('transaction annulée');
  });
});
