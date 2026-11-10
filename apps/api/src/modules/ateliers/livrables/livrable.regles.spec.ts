import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  extensionDe,
  hashTracabilite,
  MESSAGE_DEPOT_CLOS,
  nettoyerCommentaire,
  nomPourStockage,
  normaliserLiens,
  signatureConforme,
  verifierDelaiDepot,
  verifierFichiers,
  verifierRemplacement,
} from './livrable.regles';

/**
 * Règles pures du dépôt d'un livrable (US-ATEL-04). Dates FIXES : le
 * « maintenant » est passé en paramètre, comme le fait le service.
 */
describe('livrable.regles (US-ATEL-04)', () => {
  const LIMITE = new Date('2026-11-20T12:00:00.000Z');
  const H = 3_600_000;
  const PDF = Buffer.from('%PDF-1.7\n');
  const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const TEXTE = Buffer.from('# Titre');
  const MODALITES = { typesLivrables: ['pdf', 'zip', 'md'], tailleMaxMo: 2, nbMaxFichiers: 2 };
  const fichier = (
    nom: string,
    entete: Buffer,
    taille = 1_000,
  ): { nom: string; taille: number; entete: Buffer } => ({ nom, taille, entete });

  describe('verifierDelaiDepot', () => {
    it('à l’heure avant la date limite (exclue)', () => {
      expect(verifierDelaiDepot(LIMITE, 0, new Date(LIMITE.getTime() - 1))).toEqual({
        enRetard: false,
      });
    });

    it('en retard pendant la tolérance (bornes : limite incluse, fin exclue)', () => {
      expect(verifierDelaiDepot(LIMITE, 2, LIMITE)).toEqual({ enRetard: true });
      expect(verifierDelaiDepot(LIMITE, 2, new Date(LIMITE.getTime() + 2 * H - 1))).toEqual({
        enRetard: true,
      });
    });

    it('409 après la tolérance, et dès la date limite sans tolérance', () => {
      expect(() => verifierDelaiDepot(LIMITE, 2, new Date(LIMITE.getTime() + 2 * H))).toThrow(
        new ConflictException(MESSAGE_DEPOT_CLOS),
      );
      expect(() => verifierDelaiDepot(LIMITE.toISOString(), 0, LIMITE)).toThrow(ConflictException);
    });
  });

  describe('extensionDe / signatureConforme', () => {
    it('extension en minuscules, sans point ; vide si absente ou nom en « .xxx »', () => {
      expect(extensionDe('Rapport.Final.PDF')).toBe('pdf');
      expect(extensionDe('README')).toBe('');
      expect(extensionDe('.env')).toBe('');
      expect(extensionDe('fin.')).toBe('');
    });

    it('formats binaires : signature exigée ; formats texte : aucune', () => {
      expect(signatureConforme('pdf', PDF)).toBe(true);
      expect(signatureConforme('pdf', ZIP)).toBe(false);
      expect(signatureConforme('docx', ZIP)).toBe(true);
      expect(signatureConforme('png', PNG)).toBe(true);
      expect(signatureConforme('jpg', JPG)).toBe(true);
      expect(signatureConforme('jpg', PNG)).toBe(false);
      expect(signatureConforme('zip', Buffer.from([0x50, 0x4b]))).toBe(false); // trop court
      expect(signatureConforme('md', ZIP)).toBe(true);
      expect(signatureConforme('py', Buffer.alloc(0))).toBe(true);
    });
  });

  describe('verifierFichiers', () => {
    it('accepte des fichiers conformes et renvoie leurs extensions dans l’ordre', () => {
      expect(
        verifierFichiers([fichier('rapport.PDF', PDF), fichier('notes.md', TEXTE)], MODALITES),
      ).toEqual(['pdf', 'md']);
    });

    it('400 sans fichier, et au-delà du nombre maximal de l’atelier', () => {
      expect(() => verifierFichiers([], MODALITES)).toThrow('Joignez au moins un fichier.');
      expect(() =>
        verifierFichiers(
          [fichier('a.pdf', PDF), fichier('b.pdf', PDF), fichier('c.pdf', PDF)],
          MODALITES,
        ),
      ).toThrow('Trop de fichiers : cet atelier en accepte 2 au plus par soumission.');
    });

    it('400 pour une extension hors de la liste de l’atelier, avec la liste acceptée', () => {
      expect(() => verifierFichiers([fichier('photo.png', PNG)], MODALITES)).toThrow(
        'Format non autorisé pour « photo.png ». Extensions acceptées : .pdf, .zip, .md.',
      );
      expect(() => verifierFichiers([fichier('script.exe', ZIP)], MODALITES)).toThrow(
        BadRequestException,
      );
      expect(() => verifierFichiers([fichier('sans-extension', PDF)], MODALITES)).toThrow(
        BadRequestException,
      );
    });

    it('400 pour un fichier vide ou trop volumineux (borne exacte acceptée)', () => {
      expect(() => verifierFichiers([fichier('a.pdf', PDF, 0)], MODALITES)).toThrow(
        'Le fichier « a.pdf » est vide.',
      );
      expect(() =>
        verifierFichiers([fichier('a.pdf', PDF, 2 * 1024 * 1024 + 1)], MODALITES),
      ).toThrow('Le fichier « a.pdf » est trop volumineux : 2 Mo au plus par fichier.');
      expect(verifierFichiers([fichier('a.pdf', PDF, 2 * 1024 * 1024)], MODALITES)).toEqual([
        'pdf',
      ]);
    });

    it('400 pour un fichier renommé (contenu non conforme à l’extension)', () => {
      expect(() => verifierFichiers([fichier('faux.pdf', ZIP)], MODALITES)).toThrow(
        'Le contenu de « faux.pdf » ne correspond pas à un fichier .pdf.',
      );
    });

    it('400 pour un nom vide ou de plus de 255 caractères', () => {
      expect(() => verifierFichiers([fichier('   ', PDF)], MODALITES)).toThrow(BadRequestException);
      expect(() => verifierFichiers([fichier(`${'a'.repeat(252)}.pdf`, PDF)], MODALITES)).toThrow(
        'Chaque fichier doit avoir un nom de 1 à 255 caractères.',
      );
    });
  });

  describe('hashTracabilite', () => {
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);

    it('un fichier seul : son propre SHA-256', () => {
      expect(hashTracabilite([h1])).toBe(h1);
    });

    it('plusieurs fichiers : SHA-256 de la liste triée, indépendant de l’ordre', () => {
      const attendu = createHash('sha256').update(`${h1}\n${h2}`).digest('hex');
      expect(hashTracabilite([h2, h1])).toBe(attendu);
      expect(hashTracabilite([h1, h2])).toBe(attendu);
    });
  });

  describe('nettoyerCommentaire / normaliserLiens', () => {
    it('commentaire rogné, vide -> null, 2 000 caractères au plus', () => {
      expect(nettoyerCommentaire('  Bonjour  ')).toBe('Bonjour');
      expect(nettoyerCommentaire('   ')).toBeNull();
      expect(nettoyerCommentaire(undefined)).toBeNull();
      expect(nettoyerCommentaire('x'.repeat(2000))).toHaveLength(2000);
      expect(() => nettoyerCommentaire('x'.repeat(2001))).toThrow(BadRequestException);
    });

    it('liens : rognés, vides et doublons retirés, http(s) seulement, 5 au plus', () => {
      expect(
        normaliserLiens([' https://github.com/a/b ', '', 'https://github.com/a/b', 'http://x.tn']),
      ).toEqual(['https://github.com/a/b', 'http://x.tn']);
      expect(normaliserLiens(undefined)).toEqual([]);
      expect(() => normaliserLiens(['javascript:alert(1)'])).toThrow(
        'Seuls les liens http(s) sont acceptés : « javascript:alert(1) ».',
      );
      expect(() => normaliserLiens(['pas un lien'])).toThrow('Lien invalide : « pas un lien ».');
      expect(() =>
        normaliserLiens(['1', '2', '3', '4', '5', '6'].map((n) => `https://a.tn/${n}`)),
      ).toThrow('5 liens au plus par soumission.');
      expect(() => normaliserLiens([`https://a.tn/${'x'.repeat(500)}`])).toThrow(
        'Un lien dépasse 500 caractères.',
      );
    });
  });

  describe('nomPourStockage', () => {
    it('sans accent ni caractère risqué, jamais vide, 100 caractères au plus', () => {
      expect(nomPourStockage('Résumé final (v2).pdf')).toBe('Resume_final_v2_.pdf');
      expect(nomPourStockage('../../etc/passwd')).toBe('etc_passwd');
      expect(nomPourStockage('???')).toBe('fichier');
      expect(nomPourStockage(`${'a'.repeat(150)}.pdf`)).toHaveLength(100);
    });
  });

  describe('verifierRemplacement (US-ATEL-05)', () => {
    const limite = new Date('2026-11-20T12:00:00Z');
    it('SOUMIS avant la date limite : accepté', () => {
      expect(() =>
        verifierRemplacement('SOUMIS', limite, new Date('2026-11-20T11:59:59Z')),
      ).not.toThrow();
    });
    it('à la date limite (exclue) ou après : 409 clos, sans tolérance', () => {
      expect(() => verifierRemplacement('SOUMIS', limite, limite)).toThrow(
        /ne peut plus être remplacé/,
      );
      expect(() =>
        verifierRemplacement('SOUMIS', limite, new Date('2026-11-20T13:00:00Z')),
      ).toThrow(ConflictException);
    });
    it('EN_CORRECTION ou NOTE : 409 avec le motif', () => {
      expect(() => verifierRemplacement('EN_CORRECTION', limite, new Date(0))).toThrow(
        /en cours de correction/,
      );
      expect(() => verifierRemplacement('NOTE', limite, new Date(0))).toThrow(/a été noté/);
    });
  });
});
