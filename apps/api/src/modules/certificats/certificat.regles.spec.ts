import { ConflictException } from '@nestjs/common';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import {
  arrondiScore,
  cleStockageCertificat,
  estAGenerer,
  mentionPour,
  resumeErreur,
  urlVerification,
  verifierRelancable,
} from './certificat.regles';

/** Règles pures des certificats (US-CERT-01). */
describe('certificat.regles (US-CERT-01)', () => {
  it.each([
    [100, 'Très bien'],
    [80, 'Très bien'],
    [79.99, 'Bien'],
    [70, 'Bien'],
    [60, 'Assez bien'],
    [59.99, 'Passable'],
    [0, 'Passable'],
  ])('score %d -> %s', (score, mention) => {
    expect(mentionPour(score)).toBe(mention);
  });

  it('score hors bornes -> erreur de programmation', () => {
    expect(() => mentionPour(101)).toThrow(RangeError);
    expect(() => mentionPour(-1)).toThrow(RangeError);
    expect(() => mentionPour(NaN)).toThrow(RangeError);
  });

  it('arrondi au centième', () => {
    expect(arrondiScore(71.456)).toBe(71.46);
    expect(arrondiScore(70)).toBe(70);
  });

  it('URL de vérification : seulement l’identifiant ; barre finale tolérée', () => {
    expect(urlVerification('https://cert.esprit.tn/', 'abc')).toBe(
      'https://cert.esprit.tn/verifier/abc',
    );
    expect(urlVerification('http://localhost:3001', 'abc')).toBe(
      'http://localhost:3001/verifier/abc',
    );
  });

  it('clé de stockage sous le préfixe certificats/', () => {
    expect(cleStockageCertificat('abc')).toBe('certificats/abc.pdf');
  });

  it('seul un certificat en attente est pris par le worker', () => {
    expect(estAGenerer(StatutCertificat.EN_ATTENTE_GENERATION)).toBe(true);
    for (const s of [
      StatutCertificat.EN_GENERATION,
      StatutCertificat.ACTIF,
      StatutCertificat.REVOQUE,
    ]) {
      expect(estAGenerer(s)).toBe(false);
    }
  });

  it('relance : en attente ou bloqué seulement, 409 sinon', () => {
    expect(() => verifierRelancable(StatutCertificat.EN_ATTENTE_GENERATION)).not.toThrow();
    expect(() => verifierRelancable(StatutCertificat.EN_GENERATION)).not.toThrow();
    expect(() => verifierRelancable(StatutCertificat.ACTIF)).toThrow(ConflictException);
    expect(() => verifierRelancable(StatutCertificat.REVOQUE)).toThrow(ConflictException);
  });

  it('résumé d’erreur : une ligne, 500 caractères au plus', () => {
    expect(resumeErreur(new Error('a\n  b'))).toBe('a b');
    expect(resumeErreur('')).toBe('Erreur inconnue');
    expect(resumeErreur('x'.repeat(600))).toHaveLength(500);
  });
});
