import { dispositionPieceJointe } from './corrections.controller';

/** En-tête de pièce jointe du téléchargement (US-ATEL-06). */
describe('dispositionPieceJointe (US-ATEL-06)', () => {
  it('nom ASCII de repli et nom UTF-8 encodé (RFC 5987)', () => {
    expect(dispositionPieceJointe('résumé final.pdf')).toBe(
      `attachment; filename="resume final.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20final.pdf`,
    );
  });

  it('neutralise guillemets, barres obliques inverses et caractères non imprimables', () => {
    expect(dispositionPieceJointe('a"b\\c\nd.md')).toMatch(/^attachment; filename="a_b_c_d\.md";/);
  });

  it('caractères hors latin : remplacés dans le repli, conservés en UTF-8', () => {
    const entete = dispositionPieceJointe('تقرير.pdf');
    expect(entete).toContain('filename="_____.pdf"');
    expect(entete).toContain(`filename*=UTF-8''${encodeURIComponent('تقرير.pdf')}`);
  });
});
