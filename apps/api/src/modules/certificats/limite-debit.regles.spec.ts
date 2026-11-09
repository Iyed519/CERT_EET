import { cleCompteur, depasse, premierRefus } from './limite-debit.regles';

/** Règles pures de la limitation de débit (US-CERT-05). */
describe('limite-debit.regles (US-CERT-05)', () => {
  it('clé par IP, IPv4 mappée normalisée, IP absente regroupée', () => {
    expect(cleCompteur('::ffff:203.0.113.7')).toBe('limite:verification:203.0.113.7');
    expect(cleCompteur('203.0.113.7')).toBe('limite:verification:203.0.113.7');
    expect(cleCompteur('2001:db8::1')).toBe('limite:verification:2001:db8::1');
    expect(cleCompteur(undefined)).toBe('limite:verification:inconnue');
  });

  it('refus au-delà de la limite ; seul le premier refus est tracé', () => {
    expect(depasse(20, 20)).toBe(false);
    expect(depasse(21, 20)).toBe(true);
    expect(premierRefus(21, 20)).toBe(true);
    expect(premierRefus(22, 20)).toBe(false);
  });
});
