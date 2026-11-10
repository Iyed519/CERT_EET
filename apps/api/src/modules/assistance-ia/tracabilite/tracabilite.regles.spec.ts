import { BadRequestException } from '@nestjs/common';
import { decalage, decompte, verifierPeriode } from './tracabilite.regles';

describe('Traçabilité des générations — règles (US-IA-05)', () => {
  it('verifierPeriode : du après au -> 400 ; bornes égales ou absentes acceptées', () => {
    expect(() => verifierPeriode('2005-03-31T00:00:00Z', '2005-03-01T00:00:00Z')).toThrow(
      BadRequestException,
    );
    expect(() => verifierPeriode('2005-03-01T00:00:00Z', '2005-03-01T00:00:00Z')).not.toThrow();
    expect(() => verifierPeriode(undefined, '2005-03-01T00:00:00Z')).not.toThrow();
    expect(() => verifierPeriode('2005-03-01T00:00:00Z', undefined)).not.toThrow();
  });

  it('decompte : toutes les clés, 0 par défaut, nombres', () => {
    expect(decompte([])).toEqual({ proposees: 0, acceptees: 0, modifiees: 0, rejetees: 0 });
    expect(
      decompte([
        { statut: 'REJETEE', n: 2 },
        { statut: 'ACCEPTEE', n: '3' as unknown as number },
      ]),
    ).toEqual({ proposees: 0, acceptees: 3, modifiees: 0, rejetees: 2 });
  });

  it('decalage : page 1 -> 0 ; page 3 de 20 -> 40 ; page < 1 ramenée à 1', () => {
    expect(decalage(1, 20)).toBe(0);
    expect(decalage(3, 20)).toBe(40);
    expect(decalage(0, 20)).toBe(0);
  });
});
