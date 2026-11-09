import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  analyserLien,
  domaineDe,
  lireDebut,
  MESSAGE_ORDRE_INVALIDE,
  MESSAGE_TROP_DE_RESSOURCES,
  MESSAGE_URL_IDENTIFIANTS,
  MESSAGE_URL_INVALIDE,
  MESSAGE_VIDEO_INTROUVABLE,
  nettoyerTexte,
  verifierNouvelOrdre,
  verifierPlace,
} from './ressource.regles';

describe('ressource.regles (US-FORM-05)', () => {
  describe('analyserLien — YouTube', () => {
    it.each([
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', null],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=90', 90],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 90],
      ['https://youtu.be/dQw4w9WgXcQ?t=42', 42],
      ['https://www.youtube.com/shorts/dQw4w9WgXcQ', null],
      ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', null],
      ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=10', 10],
      ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', null],
    ])('%s', (url, debut) => {
      expect(analyserLien(url)).toEqual({
        url: new URL(url).href,
        plateforme: 'YOUTUBE',
        videoId: 'dQw4w9WgXcQ',
        debutSecondes: debut,
      });
    });

    it.each([
      'https://www.youtube.com/watch?v=court',
      'https://www.youtube.com/watch?list=PL1',
      'https://youtu.be/',
      'https://www.youtube.com/channel/UCabc',
    ])('400 : vidéo sans identifiant valide (%s)', (url) => {
      expect(() => analyserLien(url)).toThrow(new BadRequestException(MESSAGE_VIDEO_INTROUVABLE));
    });
  });

  describe('analyserLien — Vimeo', () => {
    it.each([
      ['https://vimeo.com/76979871', null],
      ['https://vimeo.com/channels/staffpicks/76979871#t=1m5s', 65],
      ['https://player.vimeo.com/video/76979871', null],
    ])('%s', (url, debut) => {
      expect(analyserLien(url)).toEqual(
        expect.objectContaining({ plateforme: 'VIMEO', videoId: '76979871', debutSecondes: debut }),
      );
    });

    it('400 sans identifiant numérique', () => {
      expect(() => analyserLien('https://vimeo.com/about')).toThrow(
        new BadRequestException(MESSAGE_VIDEO_INTROUVABLE),
      );
    });
  });

  describe('analyserLien — autres liens et refus', () => {
    it('un autre lien est une page web, adresse normalisée', () => {
      expect(analyserLien('  https://GitHub.com/nestjs/nest  ')).toEqual({
        url: 'https://github.com/nestjs/nest',
        plateforme: 'WEB',
        videoId: null,
        debutSecondes: null,
      });
      expect(analyserLien('https://notyoutube.com/watch?v=dQw4w9WgXcQ').plateforme).toBe('WEB');
    });

    it.each([
      'javascript:alert(1)',
      'ftp://exemple.tn/x',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
      'pas une adresse',
      'https://localhost/x',
      '//exemple.tn/x',
    ])('400 : %s', (url) => {
      expect(() => analyserLien(url)).toThrow(new BadRequestException(MESSAGE_URL_INVALIDE));
    });

    it('400 : identifiants dans l’adresse', () => {
      expect(() => analyserLien('https://moi:secret@exemple.tn/')).toThrow(
        new BadRequestException(MESSAGE_URL_IDENTIFIANTS),
      );
    });

    it('400 : adresse de plus de 2 048 caractères une fois normalisée', () => {
      expect(() => analyserLien(`https://exemple.tn/${'a'.repeat(2040)}`)).toThrow(
        BadRequestException,
      );
      expect(analyserLien(`https://exemple.tn/${'a'.repeat(2000)}`).plateforme).toBe('WEB');
    });
  });

  it('lireDebut : secondes, suffixe s, h/m/s ; nul ou illisible -> null', () => {
    expect(lireDebut('75')).toBe(75);
    expect(lireDebut('75s')).toBe(75);
    expect(lireDebut('2m')).toBe(120);
    expect(lireDebut('1h2m3s')).toBe(3723);
    expect(lireDebut('0')).toBeNull();
    expect(lireDebut('abc')).toBeNull();
    expect(lireDebut(null)).toBeNull();
  });

  it('domaineDe retire « www. » ; nettoyerTexte réduit les espaces', () => {
    expect(domaineDe('https://www.rfc-editor.org/rfc/rfc7519')).toBe('rfc-editor.org');
    expect(domaineDe('pas une url')).toBe('');
    expect(nettoyerTexte('  Les   jetons ')).toBe('Les jetons');
    expect(nettoyerTexte('   ')).toBeNull();
    expect(nettoyerTexte(undefined)).toBeNull();
  });

  it('50 ressources au plus par module', () => {
    expect(() => verifierPlace(49)).not.toThrow();
    expect(() => verifierPlace(50)).toThrow(new ConflictException(MESSAGE_TROP_DE_RESSOURCES));
  });

  describe('verifierNouvelOrdre', () => {
    it('accepte une permutation complète', () => {
      expect(() => verifierNouvelOrdre(['a', 'b', 'c'], ['c', 'a', 'b'])).not.toThrow();
    });

    it.each([[['a', 'b']], [['a', 'b', 'b']], [['a', 'b', 'x']], [['a', 'b', 'c', 'd']]])(
      '400 : %j',
      (demande) => {
        expect(() => verifierNouvelOrdre(['a', 'b', 'c'], demande)).toThrow(
          new BadRequestException(MESSAGE_ORDRE_INVALIDE),
        );
      },
    );
  });
});
