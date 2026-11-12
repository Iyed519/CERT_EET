import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionRisqueBalayageService } from './prediction-risque-balayage.service';
import { PredictionRisqueService } from './prediction-risque.service';

describe('PredictionRisqueBalayageService', () => {
  const config = (nodeEnv: string, balayageActif = true): ConfigService =>
    ({
      getOrThrow: (cle: string) =>
        cle === 'app'
          ? { nodeEnv }
          : { balayageActif, intervalleMinutes: 60, premierCalculSecondes: 60, mlUrl: '', delaiMs: 3000 },
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('désactivé en test et par configuration : aucun minuteur', () => {
    const calculer = jest.fn();
    for (const c of [config('test'), config('production', false)]) {
      const s = new PredictionRisqueBalayageService(c, { calculer } as unknown as PredictionRisqueService);
      s.onModuleInit();
      jest.advanceTimersByTime(3 * 3_600_000);
      s.onModuleDestroy();
    }
    expect(calculer).not.toHaveBeenCalled();
  });

  it('activé : un premier calcul après le délai, puis à chaque intervalle', () => {
    const calculer = jest.fn().mockResolvedValue({ examinees: 0, enregistres: 0, serviceDisponible: true });
    const s = new PredictionRisqueBalayageService(
      config('production'),
      { calculer } as unknown as PredictionRisqueService,
    );
    s.onModuleInit();
    jest.advanceTimersByTime(59_000);
    expect(calculer).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_000);
    expect(calculer).toHaveBeenCalledTimes(1);
    s.onModuleDestroy();
  });

  it('jamais deux calculs simultanés ; une erreur est journalisée, jamais propagée', async () => {
    let terminer: () => void = () => undefined;
    const calculer = jest
      .fn()
      .mockImplementationOnce(() => new Promise((ok) => (terminer = (): void => ok({ examinees: 1, enregistres: 1, serviceDisponible: true }))))
      .mockRejectedValueOnce(new Error('base indisponible'));
    const s = new PredictionRisqueBalayageService(
      config('production'),
      { calculer } as unknown as PredictionRisqueService,
    );
    const premier = s.tourner();
    await expect(s.tourner()).resolves.toBeNull(); // ignoré : le précédent n'est pas fini
    terminer();
    await expect(premier).resolves.toEqual({ examinees: 1, enregistres: 1, serviceDisponible: true });
    await expect(s.tourner()).resolves.toBeNull();
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
    expect(calculer).toHaveBeenCalledTimes(2);
  });
});
