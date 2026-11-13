import { BadRequestException, ConflictException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { texteDocument } from '../extraction/extraction-texte';
import { analyserDocumentFactice, LlmFactice } from '../llm/llm-factice';
import {
  BORNES_EXTRACTION,
  cleStockageExtraction,
  construireDemandeExtraction,
  estPdfScanne,
  extensionDe,
  lireCsv,
  lireXlsx,
  MESSAGE_EXTRACTION_TROP_GROS,
  MESSAGE_EXTRACTION_VIDE,
  MESSAGE_FICHIER_EXTRACTION_ABSENT,
  MESSAGE_FORMAT_EXTRACTION,
  MESSAGE_SIGNATURE_EXTRACTION,
  MESSAGE_TEXTE_BINAIRE_EXTRACTION,
  nomFichierExtraction,
  questionDepuisExtraite,
  rendreTableau,
  separateurCsv,
  SYSTEME_EXTRACTION,
  typeMediaImage,
  validerExtraction,
  validerQuestionExtraite,
  verifierFichierExtraction,
  verifierQuotaExtractions,
  verifierRelancable,
} from './extraction-questions.regles';

const FIXTURES = join(__dirname, '../../../../test/fixtures/extraction');
const fixture = (nom: string): Buffer => readFileSync(join(FIXTURES, nom));
const fichier = (
  nom: string,
  contenu: Buffer,
): { nom: string; taille: number; contenu: Buffer } => ({
  nom,
  taille: contenu.length,
  contenu,
});

describe('Extraction de questions — règles (US-IA-08)', () => {
  describe('verifierFichierExtraction', () => {
    it.each([
      ['examen-2025.docx', 'docx'],
      ['examen-texte.pdf', 'pdf'],
      ['banque.csv', 'csv'],
      ['banque.xlsx', 'xlsx'],
      ['feuille.jpg', 'jpg'],
      ['piege.txt', 'txt'],
    ])('accepte %s (signature conforme)', (nom, extension) => {
      expect(verifierFichierExtraction(fichier(nom, fixture(nom)))).toBe(extension);
    });

    it('accepte PNG, JPEG (.jpeg), WEBP, MD par leur signature', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
      expect(verifierFichierExtraction(fichier('a.PNG', png))).toBe('png');
      expect(verifierFichierExtraction(fichier('a.jpeg', fixture('feuille.jpg')))).toBe('jpeg');
      const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
      expect(verifierFichierExtraction(fichier('a.webp', webp))).toBe('webp');
      expect(verifierFichierExtraction(fichier('a.md', Buffer.from('# Titre')))).toBe('md');
    });

    it('refuse absence, format, vide, trop lourd', () => {
      expect(() => verifierFichierExtraction(null)).toThrow(MESSAGE_FICHIER_EXTRACTION_ABSENT);
      expect(() => verifierFichierExtraction(fichier('a.pptx', Buffer.from('x')))).toThrow(
        MESSAGE_FORMAT_EXTRACTION,
      );
      expect(() => verifierFichierExtraction(fichier('sansext', Buffer.from('x')))).toThrow(
        MESSAGE_FORMAT_EXTRACTION,
      );
      expect(() => verifierFichierExtraction(fichier('a.txt', Buffer.alloc(0)))).toThrow(
        MESSAGE_EXTRACTION_VIDE,
      );
      const gros = {
        nom: 'a.txt',
        taille: BORNES_EXTRACTION.tailleMaxOctets + 1,
        contenu: Buffer.from('x'),
      };
      expect(() => verifierFichierExtraction(gros)).toThrow(MESSAGE_EXTRACTION_TROP_GROS);
      const limite = {
        nom: 'a.txt',
        taille: BORNES_EXTRACTION.tailleMaxOctets,
        contenu: Buffer.from('x'),
      };
      expect(verifierFichierExtraction(limite)).toBe('txt');
    });

    it('refuse un contenu qui ne correspond pas à l’extension', () => {
      const cas: Array<[string, Buffer]> = [
        ['faux.pdf', Buffer.from('bonjour')],
        ['faux.jpg', fixture('examen-texte.pdf')],
        ['faux.png', fixture('feuille.jpg')],
        ['faux.webp', Buffer.from('RIFF0000AVI LIST')],
        // Un DOCX renommé en .xlsx (même conteneur ZIP) et l'inverse.
        ['renomme.xlsx', fixture('examen-2025.docx')],
        ['renomme.docx', fixture('banque.xlsx')],
        // Signature ZIP sans répertoire lisible.
        ['casse.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])],
      ];
      for (const [nom, contenu] of cas) {
        expect(() => verifierFichierExtraction(fichier(nom, contenu))).toThrow(
          MESSAGE_SIGNATURE_EXTRACTION,
        );
      }
      expect(() =>
        verifierFichierExtraction(fichier('bin.csv', Buffer.from([0x41, 0, 0x42]))),
      ).toThrow(MESSAGE_TEXTE_BINAIRE_EXTRACTION);
    });

    it('les refus sont des 400', () => {
      expect(() => verifierFichierExtraction(null)).toThrow(BadRequestException);
    });
  });

  it('nom, extension, clé de stockage, type d’image', () => {
    expect(extensionDe('Examen.Final.DOCX')).toBe('docx');
    expect(extensionDe('.env')).toBe('');
    expect(nomFichierExtraction('C:\\Users\\x\\sujet\u0007.pdf')).toBe('sujet.pdf');
    expect(nomFichierExtraction('')).toBe('document');
    const long = `${'a'.repeat(300)}.xlsx`;
    expect(nomFichierExtraction(long)).toHaveLength(255);
    expect(nomFichierExtraction(long).endsWith('.xlsx')).toBe(true);
    expect(cleStockageExtraction('q', 'e', 'pdf')).toBe('extractions/q/e/original.pdf');
    expect(typeMediaImage('jpg')).toBe('image/jpeg');
    expect(typeMediaImage('jpeg')).toBe('image/jpeg');
    expect(typeMediaImage('png')).toBe('image/png');
    expect(typeMediaImage('webp')).toBe('image/webp');
    expect(typeMediaImage('pdf')).toBeNull();
  });

  it('relance : échec seulement, fichier conservé ; plafond horaire', () => {
    expect(() => verifierRelancable('ECHEC', true)).not.toThrow();
    for (const s of ['EN_ATTENTE', 'EN_COURS', 'TERMINEE']) {
      expect(() => verifierRelancable(s, true)).toThrow(ConflictException);
    }
    expect(() => verifierRelancable('ECHEC', false)).toThrow(/plus conservé/);
    expect(() => verifierQuotaExtractions(10, 10, 60)).not.toThrow();
    expect(() => verifierQuotaExtractions(11, 10, 61)).toThrow(/10 extractions par heure.*2 min/);
  });

  it('PDF scanné : moins de 20 caractères utiles par page en moyenne', () => {
    expect(estPdfScanne([])).toBe(true);
    expect(estPdfScanne(['   \n ', ''])).toBe(true);
    expect(estPdfScanne(['a'.repeat(39), ''])).toBe(true);
    expect(estPdfScanne(['a'.repeat(40), ''])).toBe(false);
    expect(estPdfScanne(['Quelle est la capitale ? A) Tunis'])).toBe(false);
  });

  describe('tableaux', () => {
    it('séparateur CSV : le plus fréquent hors guillemets sur la 1re ligne', () => {
      expect(separateurCsv('a;b;c\n1,2,3,4,5')).toBe(';');
      expect(separateurCsv('"a;b",c,d\n')).toBe(',');
      expect(separateurCsv('a\tb\tc')).toBe('\t');
      expect(separateurCsv('seule')).toBe(';');
    });

    it('CSV Windows-1252 avec « ; » : accents, cellules vides', () => {
      const lignes = lireCsv(fixture('banque.csv'));
      expect(lignes).toHaveLength(4);
      expect(lignes[0]).toEqual([
        'Question',
        'Option A',
        'Option B',
        'Option C',
        'Bonne réponse',
        'Explication',
      ]);
      expect(lignes[3][0]).toBe('Que signifie « CI » ?');
      expect(lignes[3][1]).toBe('Intégration continue');
      expect(lignes[3][4]).toBe('');
    });

    it('CSV : guillemets, "" échappé, saut de ligne dans une cellule, BOM, lignes vides', () => {
      const texte = '\uFEFFq,a,b\r\n"Un ""vrai"" choix, ou pas ?","x\ny",z\n\n,,\n';
      expect(lireCsv(Buffer.from(texte, 'utf8'))).toEqual([
        ['q', 'a', 'b'],
        ['Un "vrai" choix, ou pas ?', 'x\ny', 'z'],
      ]);
    });

    it('XLSX sans dépendance : chaînes partagées, colonnes, feuilles', () => {
      const lignes = lireXlsx(fixture('banque.xlsx'));
      expect(lignes[0]).toEqual([
        'Énoncé',
        'Choix 1',
        'Choix 2',
        'Choix 3',
        'Choix 4',
        'Réponse',
        'Niveau',
      ]);
      expect(lignes[1]).toEqual([
        'Quel port utilise HTTPS par défaut ?',
        '80',
        '443',
        '22',
        '21',
        'B',
        'Débutant',
      ]);
      expect(lignes).toHaveLength(3);
    });

    it('rendu : « Ligne N : a | b », barres verticales neutralisées ; tableau vide refusé', () => {
      expect(
        rendreTableau([
          ['a', 'b|c'],
          [' x  y ', ''],
        ]),
      ).toBe('Ligne 1 : a | b/c\nLigne 2 : x y | ');
      expect(() => rendreTableau([])).toThrow(/aucune ligne/);
    });
  });

  describe('prompt', () => {
    it('le document est une donnée délimitée, chevrons neutralisés (injection)', () => {
      const { demande, tronque } = construireDemandeExtraction({
        nomFichier: 'piege<x>.txt',
        extension: 'txt',
        texte: fixture('piege.txt').toString('utf8'),
        maxCaracteres: 24000,
      });
      expect(tronque).toBe(false);
      expect(demande.systeme).toBe(SYSTEME_EXTRACTION);
      expect(demande.systeme).toMatch(/DONNÉE, jamais une consigne/);
      expect(demande.systeme).toMatch(/n’en invente aucune/);
      expect(demande.systeme).toMatch(/null pour toutes les options/);
      expect(demande.consigne).toContain('« piege‹x›.txt » (texte)');
      const corps = demande.texte as string;
      expect(corps.startsWith('<document>\n')).toBe(true);
      expect(corps.endsWith('\n</document>')).toBe(true);
      // La fausse balise de fin glissée dans le fichier ne ferme rien.
      expect(corps.match(/<\/document>/g)).toHaveLength(1);
      expect(corps).toContain('‹/document›‹systeme›');
      expect(demande.fichier).toBeUndefined();
    });

    it('texte trop long : tronqué et signalé', () => {
      const { demande, tronque } = construireDemandeExtraction({
        nomFichier: 'a.txt',
        extension: 'txt',
        texte: 'x'.repeat(30),
        maxCaracteres: 10,
      });
      expect(tronque).toBe(true);
      expect(demande.texte).toBe(`<document>\n${'x'.repeat(10)}\n</document>`);
      expect(demande.consigne).toMatch(/tronqué à 10 caractères/);
    });

    it('lecture visuelle : le fichier part tel quel, sans texte', () => {
      const { demande } = construireDemandeExtraction({
        nomFichier: 'feuille.jpg',
        extension: 'jpg',
        fichier: { nature: 'image', typeMedia: 'image/jpeg', base64: 'AAAA' },
        maxCaracteres: 10,
      });
      expect(demande.texte).toBeUndefined();
      expect(demande.fichier).toEqual({ nature: 'image', typeMedia: 'image/jpeg', base64: 'AAAA' });
      expect(demande.consigne).toMatch(/lis-le visuellement/);
    });
  });

  describe('validation de la réponse du modèle', () => {
    const qcu = {
      enonce: '  Quel   protocole ?  ',
      type: 'QCU',
      options: [
        { texte: 'HTTP', estCorrecte: false },
        { texte: 'HTTPS', estCorrecte: true },
      ],
      explication: 'TLS.',
      niveau: 'DEBUTANT',
    };

    it('question complète : nettoyée, réponse connue', () => {
      expect(validerQuestionExtraite(qcu)).toEqual({
        enonce: 'Quel protocole ?',
        type: 'QCU',
        options: [
          { texte: 'HTTP', estCorrecte: false },
          { texte: 'HTTPS', estCorrecte: true },
        ],
        reponseConnue: true,
        explication: 'TLS.',
        niveau: 'DEBUTANT',
      });
    });

    it('bonne réponse absente : null -> « à choisir », toutes à faux', () => {
      const v = validerQuestionExtraite({
        ...qcu,
        options: [
          { texte: 'HTTP', estCorrecte: null },
          { texte: 'HTTPS', estCorrecte: true },
        ],
        niveau: 'inconnu',
        explication: null,
      });
      expect(v?.reponseConnue).toBe(false);
      expect(v?.options.every((o) => o.estCorrecte === false)).toBe(true);
      expect(v?.niveau).toBeNull();
      expect(v?.explication).toBeNull();
    });

    it('écarte les questions non conformes, ne les corrige pas', () => {
      const invalides: unknown[] = [
        null,
        'texte',
        { ...qcu, type: 'OUVERTE' },
        { ...qcu, enonce: '   ' },
        { ...qcu, enonce: 'x'.repeat(4001) },
        { ...qcu, options: 'A,B' },
        { ...qcu, options: [{ texte: 'Seule', estCorrecte: true }] },
        {
          ...qcu,
          options: Array.from({ length: 11 }, (_v, i) => ({
            texte: `O${i}`,
            estCorrecte: i === 0,
          })),
        },
        {
          ...qcu,
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'a', estCorrecte: false },
          ],
        },
        {
          ...qcu,
          options: [
            { texte: 'A', estCorrecte: 'oui' },
            { texte: 'B', estCorrecte: false },
          ],
        },
        {
          ...qcu,
          options: [
            { texte: '', estCorrecte: true },
            { texte: 'B', estCorrecte: false },
          ],
        },
        {
          ...qcu,
          options: [
            { texte: 'A', estCorrecte: false },
            { texte: 'B', estCorrecte: false },
          ],
        },
        {
          ...qcu,
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'B', estCorrecte: true },
          ],
        },
        {
          ...qcu,
          type: 'VRAI_FAUX',
          options: [
            { texte: 'Vrai', estCorrecte: true },
            { texte: 'Faux', estCorrecte: false },
            { texte: 'Peut-être', estCorrecte: false },
          ],
        },
        {
          ...qcu,
          type: 'VRAI_FAUX',
          options: [
            { texte: 'Vrai', estCorrecte: true },
            { texte: 'Faux', estCorrecte: true },
          ],
        },
        [qcu],
      ];
      for (const q of invalides) expect(validerQuestionExtraite(q)).toBeNull();
    });

    it('QCM : plusieurs bonnes réponses ; 2 et 10 options acceptées ; limites des textes', () => {
      const dix = Array.from({ length: 10 }, (_v, i) => ({ texte: `O${i}`, estCorrecte: i < 2 }));
      expect(validerQuestionExtraite({ ...qcu, type: 'QCM', options: dix })?.options).toHaveLength(
        10,
      );
      expect(validerQuestionExtraite({ ...qcu, enonce: 'x'.repeat(4000) })).not.toBeNull();
      expect(validerQuestionExtraite({ ...qcu, enonce: 'Q' })).not.toBeNull();
      expect(
        validerQuestionExtraite({ ...qcu, explication: 'x'.repeat(4001) })?.explication,
      ).toBeNull();
    });

    it('réponse : doublons d’énoncé et plafond de 100 comptés comme écartés ; illisible -> null', () => {
      expect(validerExtraction(null)).toBeNull();
      expect(validerExtraction({ items: [] })).toBeNull();
      expect(validerExtraction({ questions: [] })).toEqual({ valides: [], ecartees: 0 });
      const r = validerExtraction({
        questions: [qcu, { ...qcu, enonce: 'QUEL PROTOCOLE ?' }, null],
      });
      expect(r?.valides).toHaveLength(1);
      expect(r?.ecartees).toBe(2);
      const cent = Array.from({ length: 102 }, (_v, i) => ({ ...qcu, enonce: `Question ${i}` }));
      const plafond = validerExtraction({ questions: cent });
      expect(plafond?.valides).toHaveLength(100);
      expect(plafond?.ecartees).toBe(2);
    });

    it('question extraite -> saisie de l’éditeur de QCM', () => {
      expect(
        questionDepuisExtraite({
          enonce: 'Q ?',
          type: 'QCU',
          options: [
            { texte: 'A', estCorrecte: true },
            { texte: 'B', estCorrecte: false },
          ],
          explication: null,
          niveau: 'AVANCE',
        }),
      ).toEqual({
        enonce: 'Q ?',
        type: 'QCU',
        explication: undefined,
        niveauDifficulte: 'AVANCE',
        options: [
          { texte: 'A', estCorrecte: true },
          { texte: 'B', estCorrecte: false },
        ],
      });
    });
  });

  describe('fournisseur factice (analyse déterministe)', () => {
    it('sujet Word : types, options, réponses, explication, niveau', () => {
      const r = validerExtraction({
        questions: analyserDocumentFactice(texteDocument(fixture('examen-2025.docx'))),
      });
      expect(r?.ecartees).toBe(0);
      expect(r?.valides.map((q) => q.type)).toEqual(['QCU', 'QCM', 'VRAI_FAUX']);
      expect(r?.valides[0]).toMatchObject({
        enonce: 'Quel protocole chiffre les échanges entre un navigateur et un site web ?',
        reponseConnue: true,
        explication: 'HTTPS ajoute TLS à HTTP.',
        niveau: 'DEBUTANT',
      });
      expect(r?.valides[0].options.filter((o) => o.estCorrecte).map((o) => o.texte)).toEqual([
        'HTTPS',
      ]);
      expect(r?.valides[1].options.filter((o) => o.estCorrecte).map((o) => o.texte)).toEqual([
        'git push',
        'git pull',
      ]);
    });

    it('sujet sans corrigé : réponses inconnues', () => {
      const q = analyserDocumentFactice('1. Question ?\nA) Un\nB) Deux\n');
      expect(q[0].options.every((o) => o.estCorrecte === null)).toBe(true);
    });

    it('option marquée d’un astérisque, réponse donnée par le texte', () => {
      expect(analyserDocumentFactice('Q1) Capitale ?\na) Tunis *\nb) Sfax')[0].options).toEqual([
        { texte: 'Tunis', estCorrecte: true },
        { texte: 'Sfax', estCorrecte: false },
      ]);
      expect(
        analyserDocumentFactice('1. Capitale ?\nA) Tunis\nB) Sfax\nBonne réponse : sfax')[0]
          .options[1].estCorrecte,
      ).toBe(true);
    });

    it('tableaux CSV et XLSX : colonnes reconnues par leurs en-têtes', () => {
      const csv = validerExtraction({
        questions: analyserDocumentFactice(rendreTableau(lireCsv(fixture('banque.csv')))),
      });
      expect(csv?.valides).toHaveLength(3);
      expect(csv?.valides[0]).toMatchObject({
        enonce: 'Quel outil orchestre des conteneurs ?',
        explication: 'Kubernetes orchestre.',
      });
      expect(csv?.valides[2].reponseConnue).toBe(false);
      const xlsx = validerExtraction({
        questions: analyserDocumentFactice(rendreTableau(lireXlsx(fixture('banque.xlsx')))),
      });
      expect(xlsx?.valides.map((q) => q.niveau)).toEqual(['DEBUTANT', 'INTERMEDIAIRE']);
      expect(xlsx?.valides[0].options).toHaveLength(4);
      expect(xlsx?.valides[0].options[1]).toEqual({ texte: '443', estCorrecte: true });
    });

    it('document sans question et texte piégé : seules les vraies questions sont recopiées', async () => {
      expect(analyserDocumentFactice(fixture('sans-question.txt').toString('utf8'))).toEqual([]);
      const llm = new LlmFactice();
      const { demande } = construireDemandeExtraction({
        nomFichier: 'piege.txt',
        extension: 'txt',
        texte: fixture('piege.txt').toString('utf8'),
        maxCaracteres: 24000,
      });
      const r = validerExtraction(await llm.extraireQuestions(demande));
      expect(r?.valides.map((q) => q.enonce)).toEqual(['Quel outil versionne le code source ?']);
    });

    it('vision, [factice:vide], [factice:panne]', async () => {
      const llm = new LlmFactice();
      const image = await llm.extraireQuestions({
        systeme: '',
        consigne: '',
        fichier: { nature: 'image', typeMedia: 'image/jpeg', base64: '' },
      });
      expect(validerExtraction(image)?.valides[0].enonce).toMatch(/sur l’image/);
      const pdf = await llm.extraireQuestions({
        systeme: '',
        consigne: '',
        fichier: { nature: 'document', typeMedia: 'application/pdf', base64: '' },
      });
      expect(validerExtraction(pdf)?.valides[0].enonce).toMatch(/PDF scanné/);
      await expect(
        llm.extraireQuestions({
          systeme: '',
          consigne: '',
          texte: '<document>\n[factice:vide]\n</document>',
        }),
      ).resolves.toEqual({ questions: [] });
      await expect(
        llm.extraireQuestions({
          systeme: '',
          consigne: '',
          texte: '<document>\n[factice:panne]\n</document>',
        }),
      ).rejects.toThrow('panne simulée');
    });
  });
});
