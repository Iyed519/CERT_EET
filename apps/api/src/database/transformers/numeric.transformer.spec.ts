import { numericTransformer } from './numeric.transformer';

describe('numericTransformer', () => {
  it('convertit la chaîne renvoyée par PostgreSQL en nombre', () => {
    expect(numericTransformer.from('75.50')).toBe(75.5);
    expect(numericTransformer.from('0.00')).toBe(0);
  });

  it('conserve null (colonne non renseignée) sans le transformer en NaN', () => {
    expect(numericTransformer.from(null)).toBeNull();
    expect(numericTransformer.from(undefined)).toBeNull();
  });

  it("laisse la valeur inchangée à l'écriture", () => {
    expect(numericTransformer.to(12.5)).toBe(12.5);
    expect(numericTransformer.to(null)).toBeNull();
  });
});
