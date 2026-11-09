import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { estPublic, identifiantPlausible, nomTitulaire, verdict } from './verification.regles';

/** Règles pures de la vérification publique (US-CERT-04). */
describe('verification.regles (US-CERT-04)', () => {
  it('identifiant : seul un UUID v4 est plausible', () => {
    expect(identifiantPlausible('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')).toBe(true);
    expect(identifiantPlausible('pas-un-uuid')).toBe(false);
    expect(identifiantPlausible("1' OR '1'='1")).toBe(false);
    expect(identifiantPlausible('88888888-8888-1888-8888-888888888888')).toBe(false);
  });

  it('public : seulement un certificat émis (ACTIF ou REVOQUE)', () => {
    expect(estPublic(StatutCertificat.ACTIF)).toBe(true);
    expect(estPublic(StatutCertificat.REVOQUE)).toBe(true);
    expect(estPublic(StatutCertificat.EN_ATTENTE_GENERATION)).toBe(false);
    expect(estPublic(StatutCertificat.EN_GENERATION)).toBe(false);
  });

  it.each([
    [StatutCertificat.ACTIF, 'VERIFIEE', 'VALIDE'],
    [StatutCertificat.ACTIF, 'NON_VERIFIABLE', 'VALIDE'],
    [StatutCertificat.ACTIF, 'COMPROMISE', 'INTEGRITE_COMPROMISE'],
    [StatutCertificat.REVOQUE, 'VERIFIEE', 'REVOQUE'],
    [StatutCertificat.REVOQUE, 'COMPROMISE', 'REVOQUE'],
  ] as const)('%s + intégrité %s -> %s', (statut, integrite, attendu) => {
    expect(verdict(statut, integrite)).toBe(attendu);
  });

  it('titulaire : prénom et nom, jamais d’email ; repli neutre', () => {
    expect(nomTitulaire('Inès', 'Gharbi')).toBe('Inès Gharbi');
    expect(nomTitulaire(null, 'Gharbi')).toBe('Gharbi');
    expect(nomTitulaire('  ', null)).toBe('Titulaire');
  });
});
