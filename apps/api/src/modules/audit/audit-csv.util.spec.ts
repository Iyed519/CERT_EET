import type { AuditEntreeVue } from './audit.service';
import { AUDIT_CSV_HEADERS, auditLogsToCsv } from './audit-csv.util';

/**
 * Tests unitaires de la sérialisation CSV (US-AUTH-12, export).
 * Vérifie l'en-tête, le mapping des colonnes, l'échappement RFC 4180 et le
 * détail JSON.
 */
describe('auditLogsToCsv', () => {
  const ligne = (over: Partial<AuditEntreeVue> = {}): AuditEntreeVue =>
    ({
      id: 'a1',
      userId: 'admin-1',
      acteur: {
        id: 'admin-1',
        email: 'admin@esprit.tn',
        prenom: 'Admin',
        nom: 'Esprit',
        role: 'ADMIN',
      },
      action: 'ROLE_CHANGE',
      cible: 'user-2',
      adresseIp: '127.0.0.1',
      resultat: 'Succès',
      detailsAvantApres: { ancienRole: 'APPRENANT' },
      horodatage: new Date('2026-01-15T10:00:00.000Z'),
      ...over,
    }) as AuditEntreeVue;

  it('émet la ligne d en-tête attendue', () => {
    const csv = auditLogsToCsv([]);
    expect(csv).toBe(AUDIT_CSV_HEADERS.join(','));
  });

  it('mappe les colonnes dans le bon ordre (acteur = userId, e-mail de l acteur, détail JSON)', () => {
    const csv = auditLogsToCsv([ligne()]);
    const lignes = csv.split('\r\n');
    expect(lignes[1]).toBe(
      '2026-01-15T10:00:00.000Z,ROLE_CHANGE,admin-1,admin@esprit.tn,user-2,127.0.0.1,Succès,' +
        '"{""ancienRole"":""APPRENANT""}"',
    );
  });

  it('échappe virgule / guillemet / saut de ligne (RFC 4180)', () => {
    const csv = auditLogsToCsv([
      ligne({
        action: 'A,B',
        cible: 'dit "bonjour"',
        detailsAvantApres: null,
        adresseIp: null,
      }),
    ]);
    const cols = csv.split('\r\n')[1];
    expect(cols).toContain('"A,B"');
    expect(cols).toContain('"dit ""bonjour"""');
  });

  it('remplace les valeurs nulles par des cellules vides', () => {
    const csv = auditLogsToCsv([
      ligne({
        userId: null,
        acteur: null,
        cible: null,
        adresseIp: null,
        resultat: null,
        detailsAvantApres: null,
      }),
    ]);
    // acteur, e-mail, cible, ip, resultat, details tous vides -> virgules successives.
    expect(csv.split('\r\n')[1]).toBe('2026-01-15T10:00:00.000Z,ROLE_CHANGE,,,,,,');
  });
});
