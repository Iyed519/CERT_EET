import * as zlib from 'zlib';
import { deflateRawSync } from 'zlib';
import { docx, pptx, zip } from '../../../../test/outils/fichiers-office';
import { genererPdfCertificat } from '../../certificats/certificat-pdf';
import { ErreurExtraction } from './erreur-extraction';
import { messagePdf } from './extraction-pdf';
import { decoderEntitesXml, decoderTexte, extraireTexte, texteXmlOffice } from './extraction-texte';
import { BORNES_ZIP, lireEntreesZip } from './lecteur-zip';

describe('extraction du texte (US-IA-01)', () => {
  describe('TXT / MD', () => {
    it('UTF-8 (marque BOM retirée), sinon Windows-1252', async () => {
      expect(decoderTexte(Buffer.from('﻿Élève à l’école', 'utf8'))).toBe('Élève à l’école');
      expect(decoderTexte(Buffer.from([0x45, 0x6c, 0xe8, 0x76, 0x65, 0x80]))).toBe('Elève€');
      expect(
        decoderTexte(
          Buffer.from([0x93, 0x63, 0x6f, 0x75, 0x72, 0x73, 0x94, 0x20, 0x96, 0x9c, 0x81]),
        ),
      ).toBe('“cours” –œ\u0081');
      await expect(extraireTexte('md', Buffer.from('# Titre\nTexte'))).resolves.toBe(
        '# Titre\nTexte',
      );
    });
  });

  describe('XML Office', () => {
    it('décode les entités prédéfinies et numériques', () => {
      expect(
        decoderEntitesXml('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#233;&#x20AC;'),
      ).toBe('a & b <c> "d" \'e\' é€');
      expect(decoderEntitesXml('&#0;&#x110000;x')).toBe('x');
    });

    it('garde le texte des balises t, un saut par paragraphe, une espace par tabulation', () => {
      const xml =
        '<w:p><w:r><w:t>Un</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve">deux</w:t></w:r></w:p>' +
        '<w:p><w:tbl/><w:r><w:t>trois</w:t><w:br/><w:t>quatre</w:t></w:r></w:p>';
      expect(texteXmlOffice(xml, 'w')).toBe('Un deux\ntrois quatre\n');
    });
  });

  describe('PPTX / DOCX', () => {
    it('lit les diapositives dans l’ordre de leur numéro', async () => {
      const fichier = zip({
        'ppt/slides/slide10.xml': '<a:p><a:r><a:t>Dix</a:t></a:r></a:p>',
        'ppt/slides/slide2.xml': '<a:p><a:r><a:t>Deux &amp; demi</a:t></a:r></a:p>',
        'ppt/slides/_rels/slide2.xml.rels': '<a:t>ignoré</a:t>',
        'ppt/notesSlides/notesSlide1.xml': '<a:t>notes ignorées</a:t>',
      });
      await expect(extraireTexte('pptx', fichier)).resolves.toBe('Deux & demi\n\n\nDix\n');
    });

    it('lit le corps d’un DOCX (entrées compressées ou stockées)', async () => {
      const texte = await extraireTexte('docx', docx(['Premier § é', 'Second <b>']));
      expect(texte).toBe('Premier § é\nSecond <b>\n');
      const stocke = zip({ 'word/document.xml': '<w:p><w:r><w:t>OK</w:t></w:r></w:p>' }, false);
      await expect(extraireTexte('docx', stocke)).resolves.toBe('OK\n');
    });

    it('refuse un PPTX sans diapositive et un DOCX sans document', async () => {
      await expect(extraireTexte('pptx', docx(['x']))).rejects.toThrow(
        new ErreurExtraction('Présentation PPTX sans diapositive lisible.'),
      );
      await expect(extraireTexte('docx', pptx(['x']))).rejects.toThrow(
        new ErreurExtraction('Document DOCX sans contenu lisible.'),
      );
    });

    it('refuse une archive tronquée, illisible ou chiffrée', async () => {
      const valide = docx(['Bonjour']);
      expect(() => lireEntreesZip(valide.subarray(0, 40), () => true)).toThrow(ErreurExtraction);
      expect(() => lireEntreesZip(Buffer.from('PK\u0003\u0004 pas un zip'), () => true)).toThrow(
        ErreurExtraction,
      );
      const chiffre = Buffer.from(valide);
      // Bit 0 des drapeaux de l'entrée dans le répertoire central = chiffrement.
      const central = chiffre.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      for (
        let p = central;
        p >= 0;
        p = chiffre.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p - 1)
      ) {
        chiffre.writeUInt16LE(1, p + 8);
      }
      expect(() => lireEntreesZip(chiffre, () => true)).toThrow(
        new ErreurExtraction('Document protégé par mot de passe.'),
      );
    });

    it('plafonne la décompression (« bombe zip »)', () => {
      const bombe = zip({
        'word/document.xml': Buffer.alloc(BORNES_ZIP.octetsDecompressesMax + 10),
      });
      expect(bombe.length).toBeLessThan(200_000);
      expect(() => lireEntreesZip(bombe, () => true)).toThrow(
        new ErreurExtraction('Document trop volumineux.'),
      );
    });

    it('chaque décompression est plafonnée dès zlib (jamais tout en mémoire)', () => {
      const espion = jest.spyOn(zlib, 'inflateRawSync');
      try {
        lireEntreesZip(docx(['Bonjour']), () => true);
        expect(espion).toHaveBeenCalled();
        for (const [, options] of espion.mock.calls) {
          expect((options as zlib.ZlibOptions).maxOutputLength).toBeLessThanOrEqual(
            BORNES_ZIP.octetsDecompressesMax,
          );
        }
      } finally {
        espion.mockRestore();
      }
    });

    it('refuse une méthode de compression inconnue', () => {
      const fichier = zip({ 'word/document.xml': deflateRawSync(Buffer.from('x')) }, false);
      const central = fichier.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      fichier.writeUInt16LE(12, central + 10); // bzip2
      expect(() => lireEntreesZip(fichier, () => true)).toThrow(ErreurExtraction);
    });
  });

  describe('PDF (processus enfant)', () => {
    jest.setTimeout(60_000);

    it('extrait le texte de chaque page', async () => {
      const pdf = await genererPdfCertificat({
        certificatId: '00000000-0000-4000-8000-000000000000',
        nomApprenant: 'Élève Témoin',
        titreFormation: 'Sécurité des API REST',
        scoreFinal: 80,
        mention: 'Bien',
        dateEmission: new Date('2026-11-09T10:00:00Z'),
        organismeEmetteur: 'ESPRIT Entreprise',
        urlVerification: 'http://localhost/verifier/x',
      });
      const texte = await extraireTexte('pdf', pdf);
      expect(texte).toContain('Sécurité des API REST');
      expect(texte).toContain('Élève Témoin');
    });

    it('refuse un PDF illisible avec un message français', async () => {
      await expect(extraireTexte('pdf', Buffer.from('%PDF-1.4 rien'))).rejects.toThrow(
        new ErreurExtraction('PDF illisible ou endommagé.'),
      );
    });

    it('traduit les erreurs de pdf.js', () => {
      expect(messagePdf('PasswordException')).toMatch(/mot de passe/);
      expect(messagePdf('InvalidPDFException')).toBe('PDF illisible ou endommagé.');
      expect(messagePdf(undefined)).toMatch(/n’a pas pu être extrait/);
    });
  });
});
