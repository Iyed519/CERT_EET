import { BadRequestException, ConflictException } from '@nestjs/common';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import {
  BORNES_SUPPORT,
  FichierRecu,
  cleStockageSupport,
  extensionDe,
  MESSAGE_FICHIER_ABSENT,
  MESSAGE_FORMAT_SUPPORT,
  MESSAGE_SIGNATURE_SUPPORT,
  MESSAGE_SUPPORT_TROP_GROS,
  MESSAGE_SUPPORT_VIDE,
  MESSAGE_TEXTE_BINAIRE,
  nomOriginal,
  resumeErreurSupport,
  titreSupport,
  verifierFichierSupport,
  verifierReindexable,
} from './support.regles';

describe('support.regles (US-IA-01)', () => {
  const PDF = Buffer.from('%PDF-1.7\n...');
  const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const fichier = (nom: string, entete: Buffer, taille = 1000): FichierRecu => ({
    nom,
    taille,
    entete,
  });

  describe('extensionDe', () => {
    it.each([
      ['cours.PDF', 'pdf'],
      ['notes.tar.md', 'md'],
      ['sans-extension', ''],
      ['.cache', ''],
      ['point.', ''],
    ])('%s -> « %s »', (nom, attendu) => expect(extensionDe(nom)).toBe(attendu));
  });

  describe('verifierFichierSupport', () => {
    it('accepte les cinq formats, signature conforme', () => {
      expect(verifierFichierSupport(fichier('a.pdf', PDF))).toBe('pdf');
      expect(verifierFichierSupport(fichier('a.pptx', ZIP))).toBe('pptx');
      expect(verifierFichierSupport(fichier('a.docx', ZIP))).toBe('docx');
      expect(verifierFichierSupport(fichier('a.txt', Buffer.from('Bonjour')))).toBe('txt');
      expect(verifierFichierSupport(fichier('a.MD', Buffer.from('# Titre')))).toBe('md');
    });

    it('refuse l’absence de fichier', () => {
      expect(() => verifierFichierSupport(null)).toThrow(
        new BadRequestException(MESSAGE_FICHIER_ABSENT),
      );
    });

    it.each(['a.exe', 'a.zip', 'a.ppt', 'sans-extension', 'a.html'])(
      'refuse le format de %s',
      (nom) => {
        expect(() => verifierFichierSupport(fichier(nom, PDF))).toThrow(
          new BadRequestException(MESSAGE_FORMAT_SUPPORT),
        );
      },
    );

    it('refuse un fichier vide et un fichier de plus de 20 Mo (borne incluse acceptée)', () => {
      expect(() => verifierFichierSupport(fichier('a.pdf', PDF, 0))).toThrow(
        new BadRequestException(MESSAGE_SUPPORT_VIDE),
      );
      expect(() =>
        verifierFichierSupport(fichier('a.pdf', PDF, BORNES_SUPPORT.tailleMaxOctets + 1)),
      ).toThrow(new BadRequestException(MESSAGE_SUPPORT_TROP_GROS));
      expect(verifierFichierSupport(fichier('a.pdf', PDF, BORNES_SUPPORT.tailleMaxOctets))).toBe(
        'pdf',
      );
    });

    it('refuse un contenu qui ne correspond pas à l’extension', () => {
      expect(() => verifierFichierSupport(fichier('a.pdf', ZIP))).toThrow(
        new BadRequestException(MESSAGE_SIGNATURE_SUPPORT),
      );
      expect(() => verifierFichierSupport(fichier('a.pptx', PDF))).toThrow(
        new BadRequestException(MESSAGE_SIGNATURE_SUPPORT),
      );
      expect(() => verifierFichierSupport(fichier('a.pdf', Buffer.from('%PD')))).toThrow(
        new BadRequestException(MESSAGE_SIGNATURE_SUPPORT),
      );
    });

    it('refuse un « texte » qui contient un octet nul (binaire renommé)', () => {
      expect(() =>
        verifierFichierSupport(fichier('a.txt', Buffer.from([0x41, 0x00, 0x42]))),
      ).toThrow(new BadRequestException(MESSAGE_TEXTE_BINAIRE));
    });
  });

  describe('nomOriginal', () => {
    it('retire le chemin et les caractères de contrôle', () => {
      expect(nomOriginal('C:\\Users\\x\\cours\u0007.pdf')).toBe('cours.pdf');
      expect(nomOriginal('../../etc/passwd.txt')).toBe('passwd.txt');
      expect(nomOriginal('   ')).toBe('support');
    });

    it('tronque à 255 caractères en gardant l’extension', () => {
      const nom = nomOriginal(`${'a'.repeat(300)}.pptx`);
      expect(nom).toHaveLength(255);
      expect(nom.endsWith('.pptx')).toBe(true);
    });
  });

  describe('titreSupport', () => {
    it('garde le titre saisi, espaces réduites, 200 caractères au plus', () => {
      expect(titreSupport('  Cours   JWT ', 'x.pdf')).toBe('Cours JWT');
      expect(titreSupport('t'.repeat(250), 'x.pdf')).toHaveLength(200);
    });

    it('à défaut, le nom du fichier sans extension', () => {
      expect(titreSupport(undefined, 'Chapitre_3_securite.pdf')).toBe('Chapitre 3 securite');
      expect(titreSupport('   ', 'notes.md')).toBe('notes');
      expect(titreSupport(null, '.pdf')).toBe('.pdf');
    });
  });

  it('clé de stockage sous supports/, sans le nom d’origine', () => {
    expect(cleStockageSupport('m-1', 's-1', 'pdf')).toBe('supports/m-1/s-1/original.pdf');
  });

  describe('verifierReindexable', () => {
    it('autorise seulement un support en échec', () => {
      expect(() => verifierReindexable(StatutSupport.ECHEC_INDEXATION)).not.toThrow();
      expect(() => verifierReindexable(StatutSupport.INDEXE)).toThrow(ConflictException);
      expect(() => verifierReindexable(StatutSupport.EN_INDEXATION)).toThrow(ConflictException);
    });
  });

  it('résume une erreur sur une ligne de 500 caractères au plus', () => {
    expect(resumeErreurSupport(new Error('a\n  b'))).toBe('a b');
    expect(resumeErreurSupport('')).toBe('Erreur inconnue');
    expect(resumeErreurSupport('x'.repeat(600))).toHaveLength(500);
  });
});
