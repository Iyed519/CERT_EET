import { genererPdfCertificat } from './certificat-pdf';

/** PDF du certificat (US-CERT-01) : un vrai document, produit en mémoire. */
describe('genererPdfCertificat (US-CERT-01)', () => {
  it('produit un PDF d’une page, avec ses métadonnées', async () => {
    const pdf = await genererPdfCertificat({
      certificatId: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      nomApprenant: 'Inès Gharbi',
      titreFormation: 'Développement back-end',
      scoreFinal: 71.5,
      mention: 'Bien',
      dateEmission: new Date('2026-11-09T10:00:00Z'),
      organismeEmetteur: 'ESPRIT Entreprise',
      urlVerification: 'http://localhost:3001/verifier/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    });
    const texte = pdf.toString('latin1');
    expect(texte.startsWith('%PDF-')).toBe(true);
    expect(texte.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(texte.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(texte).toContain('Certificat 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
    expect(texte).toContain('/Subtype /Image');
  });
});
