import { BadRequestException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Role } from '../../../database/enums/role.enum';
import {
  decouperCsv,
  FichierImportInvalide,
  lireFichierComptes,
  normaliserEntete,
  validerLignes,
} from './import-comptes.regles';
import { ImportComptesService } from './import-comptes.service';

const csv = (texte: string): Buffer => Buffer.from(texte, 'utf8');

describe('Import CSV de comptes — règles (US-CPT-02)', () => {
  it('en-tête : ordre libre, casse et accents indifférents, BOM, séparateur « , » ou « ; »', () => {
    expect(normaliserEntete(' Prénom ')).toBe('prenom');
    const l = lireFichierComptes(
      csv('﻿Nom,E-mail,PRÉNOM,Role\nBen Ali,x@y.tn,Amel,formateur\n'.replace('E-mail', 'email')),
    );
    expect(l).toEqual([
      { ligne: 2, email: 'x@y.tn', nom: 'Ben Ali', prenom: 'Amel', role: 'FORMATEUR' },
    ]);
    const p = lireFichierComptes(csv('email;nom;prenom\nA@Y.TN;Trabelsi;Sami\r\n\r\n'));
    expect(p).toEqual([{ ligne: 2, email: 'a@y.tn', nom: 'Trabelsi', prenom: 'Sami', role: '' }]);
  });

  it('guillemets RFC 4180 : séparateur et guillemet doublé dans un champ', () => {
    expect(decouperCsv('a,"b, c","d ""e"""\n', ',')).toEqual([
      { ligne: 1, champs: ['a', 'b, c', 'd "e"'] },
    ]);
    expect(() => decouperCsv('a,"b\n', ',')).toThrow(FichierImportInvalide);
  });

  it('fichier inexploitable : colonnes manquantes, vide, trop gros, trop long, non UTF-8', () => {
    expect(() => lireFichierComptes(csv('email;nom\nx@y.tn;A\n'))).toThrow(/prenom/);
    expect(() => lireFichierComptes(csv('email;nom;prenom\n'))).toThrow(/aucun compte/);
    expect(() => lireFichierComptes(Buffer.alloc(256 * 1024 + 1, 97))).toThrow(/256 Ko/);
    const long =
      'email;nom;prenom\n' + Array.from({ length: 501 }, (_, i) => `u${i}@y.tn;N;P`).join('\n');
    expect(() => lireFichierComptes(csv(long))).toThrow(/500 comptes/);
    expect(() => lireFichierComptes(Buffer.from([0x65, 0x6d, 0xff, 0xfe, 0x0a]))).toThrow(/UTF-8/);
  });

  it('validation ligne par ligne : format, champs, rôle, doublon du fichier, compte existant', () => {
    const lignes = lireFichierComptes(
      csv(
        'email;nom;prenom;role\n' +
          'ok@y.tn;A;B;\n' +
          'pas-un-email;A;B;\n' +
          'c@y.tn;;B;APPRENANT\n' +
          'd@y.tn;A;;\n' +
          `e@y.tn;${'x'.repeat(101)};B;\n` +
          'f@y.tn;A;B;ADMINISTRATEUR\n' +
          'OK@y.tn;A;B;\n' +
          'existe@y.tn;A;B;FORMATEUR\n',
      ),
    );
    const { valides, erreurs } = validerLignes(lignes, new Set(['existe@y.tn']));
    expect(valides).toEqual([
      { ligne: 2, email: 'ok@y.tn', nom: 'A', prenom: 'B', role: Role.APPRENANT },
    ]);
    expect(erreurs.map((e) => [e.ligne, e.erreurs])).toEqual([
      [3, ['EMAIL_INVALIDE']],
      [4, ['NOM_MANQUANT']],
      [5, ['PRENOM_MANQUANT']],
      [6, ['CHAMP_TROP_LONG']],
      [7, ['ROLE_INVALIDE']],
      [8, ['DOUBLON_FICHIER']],
      [9, ['COMPTE_EXISTANT']],
    ]);
    expect(erreurs[0].libelles).toEqual(['Adresse email invalide']);
  });
});

describe('ImportComptesService (US-CPT-02)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const audit = { record: jest.fn() };
  const activations = { planifier: jest.fn() };
  const service = new ImportComptesService(
    dataSource as never,
    audit as never,
    activations as never,
  );
  const FICHIER = csv('email;nom;prenom;role\na@y.tn;Abidi;Amel;\nb@y.tn;Ben;Bilel;FORMATEUR\n');

  beforeEach(() => jest.clearAllMocks());

  it('tout valide : verrou, relecture des existants, une seule insertion, audits, activations en file', async () => {
    em.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'id-a', email: 'a@y.tn' },
        { id: 'id-b', email: 'b@y.tn' },
      ]);
    const r = await service.importer('admin', FICHIER, { adresseIp: '1.2.3.4' });
    expect(r).toEqual({
      crees: 2,
      comptes: [
        { ligne: 2, id: 'id-a', email: 'a@y.tn', role: Role.APPRENANT },
        { ligne: 3, id: 'id-b', email: 'b@y.tn', role: Role.FORMATEUR },
      ],
    });
    expect(em.query.mock.calls[0][0]).toMatch(/pg_advisory_xact_lock/);
    expect(em.query.mock.calls[1][1]).toEqual([['a@y.tn', 'b@y.tn']]);
    const [sql, params] = em.query.mock.calls[2] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO users/);
    expect(sql).toMatch(/'EN_ATTENTE_ACTIVATION'/);
    expect(sql).toMatch(/NULL, false\)/);
    expect(params).toEqual([
      'a@y.tn',
      'Abidi',
      'Amel',
      'APPRENANT',
      'b@y.tn',
      'Ben',
      'Bilel',
      'FORMATEUR',
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPTES_IMPORTES',
        resultat: 'Succès',
        detailsAvantApres: { crees: 2, parRole: { APPRENANT: 1, FORMATEUR: 1 } },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPTE_CREE', cible: 'id-b' }),
    );
    expect(activations.planifier).toHaveBeenCalledWith(['id-a', 'id-b']);
  });

  it('une ligne en erreur : rien inséré, 400 avec le rapport, audit Échec, aucune activation', async () => {
    em.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ email: 'b@y.tn' }]);
    const promesse = service.importer('admin', FICHIER, { adresseIp: null });
    await expect(promesse).rejects.toThrow(BadRequestException);
    await promesse.catch((e: BadRequestException) => {
      expect(e.getResponse()).toMatchObject({
        lignesAnalysees: 2,
        lignesEnErreur: 1,
        erreurs: [{ ligne: 3, email: 'b@y.tn', erreurs: ['COMPTE_EXISTANT'] }],
      });
    });
    expect(em.query).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ resultat: 'Échec' }));
    expect(activations.planifier).not.toHaveBeenCalled();
  });

  it('collision tardive (23505) : 409, rien d’autre', async () => {
    const collision = new QueryFailedError('INSERT', [], new Error('duplicate'));
    (collision as unknown as { code: string }).code = '23505';
    em.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(collision);
    await expect(service.importer('admin', FICHIER, { adresseIp: null })).rejects.toThrow(
      ConflictException,
    );
    expect(audit.record).not.toHaveBeenCalled();
    expect(activations.planifier).not.toHaveBeenCalled();
  });

  it('fichier inexploitable : 400 avant toute transaction', async () => {
    await expect(
      service.importer('admin', csv('email\nx@y.tn\n'), { adresseIp: null }),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('renvoi d’activation : seulement pour un compte importé en attente', async () => {
    dataSource.query.mockResolvedValueOnce([
      { statut: 'EN_ATTENTE_ACTIVATION', mot_de_passe_hash: null },
    ]);
    await service.renvoyerActivation('admin', 'u1', { adresseIp: null });
    expect(activations.planifier).toHaveBeenCalledWith(['u1']);
    dataSource.query.mockResolvedValueOnce([
      { statut: 'EN_ATTENTE_ACTIVATION', mot_de_passe_hash: '$2a$x' },
    ]);
    await expect(service.renvoyerActivation('admin', 'u2', { adresseIp: null })).rejects.toThrow(
      ConflictException,
    );
    dataSource.query.mockResolvedValueOnce([]);
    await expect(service.renvoyerActivation('admin', 'u3', { adresseIp: null })).rejects.toThrow(
      /introuvable/,
    );
  });
});
