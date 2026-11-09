import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  analyserFichier,
  cleStockageRessource,
  dispositionContenu,
  extensionFichier,
  MESSAGE_CONTENU_NON_CONFORME,
  MESSAGE_FICHIER_MANQUANT,
  MESSAGE_FICHIER_VIDE,
  nomFichier,
  plageDemandee,
} from './fichier-ressource.regles';

describe('fichier-ressource.regles (US-FORM-06)', () => {
  const MO = 1024 * 1024;
  const f = (
    nom: string,
    entete: number[] | string,
    taille = 1000,
  ): { nom: string; taille: number; entete: Buffer } => ({
    nom,
    taille,
    entete: typeof entete === 'string' ? Buffer.from(entete, 'latin1') : Buffer.from(entete),
  });
  const MP4 = [0, 0, 0, 0x20, ...Buffer.from('ftypisom')];

  describe('analyserFichier', () => {
    it.each([
      ['cours.pdf', '%PDF-1.7', 'application/pdf', 'PDF'],
      ['schema.PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d], 'image/png', 'IMAGE'],
      ['photo.jpg', [0xff, 0xd8, 0xff, 0xe0], 'image/jpeg', 'IMAGE'],
      ['anim.gif', 'GIF89a', 'image/gif', 'IMAGE'],
      ['img.webp', 'RIFF\u0000\u0000\u0000\u0000WEBPVP8', 'image/webp', 'IMAGE'],
      ['cours.mp4', MP4, 'video/mp4', 'VIDEO'],
      ['cours.webm', [0x1a, 0x45, 0xdf, 0xa3, 0x01], 'video/webm', 'VIDEO'],
      ['son.mp3', 'ID3\u0004', 'audio/mpeg', 'AUDIO'],
      ['son2.mp3', [0xff, 0xfb, 0x90], 'audio/mpeg', 'AUDIO'],
      ['son.wav', 'RIFF\u0000\u0000\u0000\u0000WAVEfmt', 'audio/wav', 'AUDIO'],
      ['son.ogg', 'OggS\u0000', 'audio/ogg', 'AUDIO'],
    ])('%s -> lisible (%s)', (nom, entete, mime, lecture) => {
      expect(analyserFichier(f(nom, entete), MO)).toEqual(
        expect.objectContaining({ typeMime: mime, lecture }),
      );
    });

    it.each(['outil.exe', 'page.html', 'dessin.svg', 'notes.docx', 'archive.zip', 'Makefile'])(
      '%s -> téléchargement seul (octet-stream), quel que soit le contenu',
      (nom) => {
        expect(analyserFichier(f(nom, '<script>alert(1)</script>'), MO)).toEqual(
          expect.objectContaining({ typeMime: 'application/octet-stream', lecture: null }),
        );
      },
    );

    it.each([
      ['faux.pdf', 'PK\u0003\u0004'],
      ['faux.mp4', '<html>'],
      ['faux.png', '<svg onload=alert(1)>'],
      ['faux.webp', 'RIFF\u0000\u0000\u0000\u0000WAVE'],
    ])('400 : %s au contenu non conforme', (nom, entete) => {
      expect(() => analyserFichier(f(nom, entete), MO)).toThrow(
        new BadRequestException(MESSAGE_CONTENU_NON_CONFORME),
      );
    });

    it('400 absent ou vide ; 413 au-delà de la taille maximale (borne incluse acceptée)', () => {
      expect(() => analyserFichier(null, MO)).toThrow(
        new BadRequestException(MESSAGE_FICHIER_MANQUANT),
      );
      expect(() => analyserFichier(f('a.txt', 'x', 0), MO)).toThrow(
        new BadRequestException(MESSAGE_FICHIER_VIDE),
      );
      expect(() => analyserFichier(f('a.txt', 'x', 2 * MO + 1), 2 * MO)).toThrow(
        new PayloadTooLargeException(
          'Le fichier dépasse 2 Mo, la taille maximale d’une ressource.',
        ),
      );
      expect(analyserFichier(f('a.txt', 'x', 2 * MO), 2 * MO).lecture).toBeNull();
    });
  });

  it('extension et nom : minuscules, sans chemin ni contrôle, 255 caractères', () => {
    expect(extensionFichier('Cours.MP4')).toBe('mp4');
    expect(extensionFichier('sans')).toBe('');
    expect(extensionFichier('a.tar.gz')).toBe('gz');
    expect(extensionFichier('a.é')).toBe('');
    expect(nomFichier('C:\\x\\cours\u0007.pdf')).toBe('cours.pdf');
    expect(nomFichier('  ')).toBe('fichier');
    const long = nomFichier(`${'a'.repeat(300)}.webm`);
    expect(long).toHaveLength(255);
    expect(long.endsWith('.webm')).toBe(true);
  });

  describe('plageDemandee', () => {
    it.each([
      [undefined, null],
      ['bytes=0-99', { debut: 0, fin: 99 }],
      ['bytes=900-', { debut: 900, fin: 999 }],
      ['bytes=950-5000', { debut: 950, fin: 999 }],
      ['bytes=-100', { debut: 900, fin: 999 }],
      ['bytes=-5000', { debut: 0, fin: 999 }],
      ['bytes=0-1,5-9', null],
      ['items=0-9', null],
      ['bytes=-', null],
      ['bytes=1000-', 'INSATISFAISABLE'],
      ['bytes=50-10', 'INSATISFAISABLE'],
      ['bytes=-0', 'INSATISFAISABLE'],
    ])('%s -> %j', (entete, attendu) => {
      expect(plageDemandee(entete, 1000)).toEqual(attendu);
    });
  });

  it('Content-Disposition : inline seulement pour un format lisible, nom UTF-8', () => {
    expect(dispositionContenu('Cours été.pdf', 'PDF')).toBe(
      `inline; filename="Cours _t_.pdf"; filename*=UTF-8''Cours%20%C3%A9t%C3%A9.pdf`,
    );
    expect(dispositionContenu('x"y.exe', null)).toBe(
      `attachment; filename="x_y.exe"; filename*=UTF-8''x%22y.exe`,
    );
  });

  it('clé de stockage sous ressources/, sans le nom d’origine', () => {
    expect(cleStockageRessource('m', 'r', 'mp4')).toBe('ressources/m/r/fichier.mp4');
    expect(cleStockageRessource('m', 'r', '')).toBe('ressources/m/r/fichier');
  });
});
