import { horsBanque, motifRecherche, sansDoublons } from './banque.regles';

describe('Banque de questions — règles (US-QCM-02)', () => {
  it('motifRecherche : vide -> null ; espaces retirés ; %, _ et \\ échappés', () => {
    expect(motifRecherche(undefined)).toBeNull();
    expect(motifRecherche('   ')).toBeNull();
    expect(motifRecherche(' REST ')).toBe('%REST%');
    expect(motifRecherche('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
  });

  it('horsBanque : identifiants demandés absents de la banque, dans l’ordre', () => {
    expect(horsBanque(['a', 'x', 'b', 'y'], new Set(['a', 'b']))).toEqual(['x', 'y']);
    expect(horsBanque(['a'], new Set(['a']))).toEqual([]);
  });

  it('sansDoublons : première apparition conservée', () => {
    expect(sansDoublons(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });
});
