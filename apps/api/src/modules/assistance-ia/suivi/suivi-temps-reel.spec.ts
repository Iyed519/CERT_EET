import { NotFoundException } from '@nestjs/common';
import { lastValueFrom, toArray } from 'rxjs';
import { GenerationsService } from '../generations/generations.service';
import { SupportsService } from '../supports/supports.service';
import { estFinal, etatGeneration, etatSupport, memeEtat } from './suivi.regles';
import { SuiviTempsReelService } from './suivi-temps-reel.service';

describe('Suivi en temps réel (US-IA-07)', () => {
  const support = (statut: string, nbSegments: number | null = null): Record<string, unknown> => ({
    id: 's1',
    statut,
    nbTentatives: 1,
    derniereErreur: null,
    nbSegments,
    titre: 'Cours',
    sha256: 'x',
    apercu: [{ ordre: 1, texte: 'secret' }],
  });

  it('règles : états finaux, liste blanche, comparaison', () => {
    expect(estFinal('support', 'INDEXE')).toBe(true);
    expect(estFinal('support', 'ECHEC_INDEXATION')).toBe(true);
    expect(estFinal('support', 'EN_INDEXATION')).toBe(false);
    expect(estFinal('generation', 'TERMINEE')).toBe(true);
    expect(estFinal('generation', 'ECHEC')).toBe(true);
    expect(estFinal('generation', 'EN_COURS')).toBe(false);
    const e = etatSupport(support('INDEXE', 12) as never);
    expect(e).toEqual({
      nature: 'support',
      id: 's1',
      statut: 'INDEXE',
      nbTentatives: 1,
      derniereErreur: null,
      resultat: 12,
      final: true,
    });
    expect(JSON.stringify(e)).not.toContain('secret');
    const g = etatGeneration({
      id: 'g1',
      statut: 'EN_COURS',
      nbTentatives: 0,
      derniereErreur: null,
      nbSuggestions: null,
    });
    expect(g).toMatchObject({ nature: 'generation', final: false, resultat: null });
    expect(memeEtat(null, g)).toBe(false);
    expect(memeEtat(g, { ...g })).toBe(true);
    expect(memeEtat(g, { ...g, nbTentatives: 1 })).toBe(false);
  });

  const monter = (detail: jest.Mock, vue: jest.Mock = jest.fn()): SuiviTempsReelService =>
    new SuiviTempsReelService(
      { detail } as unknown as SupportsService,
      { vue } as unknown as GenerationsService,
    );

  it('flux : premier état toujours envoyé, seuls les changements ensuite, fin à l’état final', async () => {
    const detail = jest
      .fn()
      .mockResolvedValueOnce(support('EN_INDEXATION'))
      .mockResolvedValueOnce(support('EN_INDEXATION'))
      .mockResolvedValueOnce(support('EN_INDEXATION'))
      .mockResolvedValueOnce(support('INDEXE', 7));
    const evenements = await lastValueFrom(
      monter(detail).flux('support', 's1', { intervalleMs: 5 }).pipe(toArray()),
    );
    expect(evenements.map((e) => e.data.statut)).toEqual(['EN_INDEXATION', 'INDEXE']);
    expect(evenements[1]).toEqual({
      type: 'etat',
      data: expect.objectContaining({ final: true, resultat: 7 }),
    });
    expect(detail).toHaveBeenCalledTimes(4);
  });

  it('flux : durée maximale -> fin sans état final', async () => {
    const detail = jest.fn().mockResolvedValue(support('EN_INDEXATION'));
    const evenements = await lastValueFrom(
      monter(detail).flux('support', 's1', { intervalleMs: 5, dureeMaxMs: 30 }).pipe(toArray()),
    );
    expect(evenements).toHaveLength(1);
    expect(detail.mock.calls.length).toBeGreaterThan(1);
  });

  it('flux : ressource disparue -> erreur ; génération lue par sa vue', async () => {
    const detail = jest.fn().mockRejectedValue(new NotFoundException('Support introuvable.'));
    await expect(
      lastValueFrom(monter(detail).flux('support', 's1', { intervalleMs: 5 })),
    ).rejects.toBeInstanceOf(NotFoundException);
    const vue = jest.fn().mockResolvedValue({
      id: 'g1',
      statut: 'TERMINEE',
      nbTentatives: 1,
      derniereErreur: null,
      nbSuggestions: 4,
    });
    const [e] = await lastValueFrom(
      monter(jest.fn(), vue).flux('generation', 'g1', { intervalleMs: 5 }).pipe(toArray()),
    );
    expect(e.data).toMatchObject({ nature: 'generation', resultat: 4, final: true });
  });

  it('désabonnement : plus aucune lecture', async () => {
    const detail = jest.fn().mockResolvedValue(support('EN_INDEXATION'));
    const abonnement = monter(detail).flux('support', 's1', { intervalleMs: 5 }).subscribe();
    await new Promise((r) => setTimeout(r, 20));
    abonnement.unsubscribe();
    const apres = detail.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(detail.mock.calls.length).toBeLessThanOrEqual(apres + 1);
  });
});
