import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { Role } from '../../database/enums/role.enum';
import { PREFIXE_JETON_ALERTE, SurveillanceAlertesService } from './surveillance-alertes.service';
import {
  ALERTES_MAX_PAR_TENTATIVE,
  confianceValide,
  estTypeEvenement,
  LIBELLES_EVENEMENT,
  TYPES_EVENEMENT,
} from './surveillance.regles';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(50, 2),
]);

describe('Alertes de surveillance — règles (US-QCM-15)', () => {
  it('sept types d’anomalie, chacun avec un libellé français', () => {
    expect(TYPES_EVENEMENT).toEqual([
      'PERSONNES_MULTIPLES',
      'ABSENCE',
      'TELEPHONE',
      'DOCUMENT',
      'CAMERA_MASQUEE',
      'ONGLET_QUITTE',
      'ANALYSE_INDISPONIBLE',
    ]);
    for (const type of TYPES_EVENEMENT) {
      expect(estTypeEvenement(type)).toBe(true);
      expect(LIBELLES_EVENEMENT[type].length).toBeGreaterThan(5);
    }
    expect(LIBELLES_EVENEMENT.TELEPHONE).toBe('Téléphone détecté');
    expect(estTypeEvenement('telephone')).toBe(false);
    expect(estTypeEvenement(undefined)).toBe(false);
    expect(estTypeEvenement('toString')).toBe(false);
  });

  it('score de confiance : entre 0 et 1, arrondi au millième, sinon ignoré', () => {
    expect(confianceValide('0.8765')).toBe(0.877);
    expect(confianceValide(0)).toBe(0);
    expect(confianceValide(1)).toBe(1);
    expect(confianceValide('1.0001')).toBeNull();
    expect(confianceValide(-0.1)).toBeNull();
    expect(confianceValide('')).toBeNull();
    expect(confianceValide('  ')).toBeNull();
    expect(confianceValide('abc')).toBeNull();
    expect(confianceValide(undefined)).toBeNull();
    expect(confianceValide(Infinity)).toBeNull();
  });
});

describe('SurveillanceAlertesService (US-QCM-15)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const stockage = { deposerTampon: jest.fn(), lire: jest.fn(), supprimer: jest.fn() };
  const redis = { set: jest.fn(), get: jest.fn() };
  const audit = { record: jest.fn() };
  let active = true;
  const config = {
    getOrThrow: (): Record<string, unknown> => ({ active, absenceSecondes: 300 }),
  };
  const mail = { sendAlerteSurveillanceEmail: jest.fn() };
  const service = new SurveillanceAlertesService(
    dataSource as never,
    stockage as never,
    redis as never,
    audit as never,
    config as never,
    mail as never,
  );
  const MAINTENANT = new Date('2026-11-13T10:00:00Z');
  const contexte = { adresseIp: '10.0.0.1', methode: 'GET', route: '/x' };
  const tentative = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    apprenant_id: 'a1',
    statut: 'EN_COURS',
    date_limite: new Date(MAINTENANT.getTime() + 600_000),
    consentement_surveillance_le: MAINTENANT,
    qcm_id: 'q1',
    proctoring_webcam: true,
    ...extra,
  });
  const preparer = (
    t: Record<string, unknown> | undefined,
    stats = { n: 0, derniere: null as Date | null },
  ): void => {
    em.query
      .mockResolvedValueOnce(t ? [t] : [])
      .mockResolvedValueOnce([{ maintenant: MAINTENANT }])
      .mockResolvedValueOnce([stats])
      .mockResolvedValueOnce([]);
  };
  const deposer = (
    entree: Partial<{ type: unknown; confiance: unknown; photo: Buffer }> = {},
    apprenant = 'a1',
  ): ReturnType<SurveillanceAlertesService['deposer']> =>
    service.deposer(
      apprenant,
      't1',
      { type: 'TELEPHONE', confiance: '0.9', photo: JPEG, ...entree },
      contexte,
    );
  const ligneAlerte = {
    id: 'e1',
    tentative_id: 't1',
    type: 'TELEPHONE',
    confiance: '0.900',
    statut: 'NOUVEAU',
    detecte_le: MAINTENANT,
    examine_le: null,
    formation_id: 'f1',
    formation_titre: 'Java',
    qcm_id: 'q1',
    qcm_titre: 'Bases',
    prenom: 'Amel',
    nom: 'Abidi',
    email: 'amel@cert-eet.local',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    em.query.mockReset();
    dataSource.query.mockReset();
    active = true;
  });

  describe('deposer', () => {
    it('nominal : verrou, ligne, photo déposée, audit, e-mail à la première alerte', async () => {
      preparer(tentative());
      dataSource.query
        .mockResolvedValueOnce([
          {
            qcm: 'Bases',
            formation: 'Java',
            formation_id: 'f1',
            apprenant: 'Amel Abidi',
            email_apprenant: 'amel@cert-eet.local',
          },
        ])
        .mockResolvedValueOnce([
          { email: 'sami@cert-eet.local', prenom: 'Sami' },
          { email: 'rim@cert-eet.local', prenom: null },
        ]);
      const res = await deposer();
      expect(res).toEqual({ id: expect.any(String), type: 'TELEPHONE', detecteLe: MAINTENANT });
      expect(em.query.mock.calls[0][0]).toMatch(/FOR UPDATE OF t/);
      const [sql, params] = em.query.mock.calls[3] as [string, unknown[]];
      expect(sql).toMatch(/INSERT INTO evenements_surveillance/);
      expect(params).toEqual([
        res.id,
        't1',
        'TELEPHONE',
        0.9,
        `surveillance/t1/evenements/${res.id}.jpg`,
        JPEG.length,
        'image/jpeg',
        MAINTENANT,
      ]);
      expect(stockage.deposerTampon).toHaveBeenCalledWith(
        params[4],
        JPEG,
        'image/jpeg',
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
      expect(audit.record).toHaveBeenCalledWith({
        action: 'SURVEILLANCE_ALERTE',
        acteur: 'a1',
        cible: 't1',
        adresseIp: '10.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: { evenementId: res.id, type: 'TELEPHONE', confiance: 0.9 },
      });
      expect(mail.sendAlerteSurveillanceEmail).toHaveBeenCalledTimes(2);
      expect(mail.sendAlerteSurveillanceEmail).toHaveBeenNthCalledWith(1, 'sami@cert-eet.local', {
        prenom: 'Sami',
        apprenant: 'Amel Abidi',
        qcm: 'Bases',
        formation: 'Java',
        anomalie: 'Téléphone détecté',
      });
      expect(dataSource.query.mock.calls[1][0]).toMatch(/statut = 'ACTIF'/);
    });

    it('PNG : extension .png ; nom vide -> e-mail de l’apprenant dans le message', async () => {
      preparer(tentative());
      dataSource.query
        .mockResolvedValueOnce([
          { qcm: 'Q', formation: 'F', formation_id: 'f1', apprenant: ' ', email_apprenant: 'x@y.z' },
        ])
        .mockResolvedValueOnce([{ email: 's@y.z', prenom: null }]);
      const res = await deposer({ photo: PNG, type: 'ABSENCE', confiance: undefined });
      const params = em.query.mock.calls[3][1] as unknown[];
      expect(params[3]).toBeNull();
      expect(params[4]).toBe(`surveillance/t1/evenements/${res.id}.png`);
      expect(params[6]).toBe('image/png');
      expect(mail.sendAlerteSurveillanceEmail).toHaveBeenCalledWith(
        's@y.z',
        expect.objectContaining({ apprenant: 'x@y.z', anomalie: LIBELLES_EVENEMENT.ABSENCE }),
      );
    });

    it('pas d’e-mail après la première alerte ; un e-mail en échec ne casse pas le dépôt', async () => {
      preparer(tentative(), { n: 3, derniere: null });
      await deposer();
      expect(mail.sendAlerteSurveillanceEmail).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
      preparer(tentative());
      dataSource.query.mockRejectedValueOnce(new Error('panne'));
      await expect(deposer()).resolves.toMatchObject({ type: 'TELEPHONE' });
    });

    it('refus avant toute transaction : type inconnu 400, trop lourde 413, pas une image 400', async () => {
      await expect(deposer({ type: 'MAGIE' })).rejects.toThrow(BadRequestException);
      await expect(deposer({ photo: Buffer.alloc(200 * 1024 + 1, 0xff) })).rejects.toThrow(
        PayloadTooLargeException,
      );
      await expect(deposer({ photo: Buffer.alloc(200 * 1024, 0xff) })).rejects.toThrow(
        BadRequestException,
      );
      await expect(deposer({ photo: Buffer.from('texte') })).rejects.toThrow(
        'La photo doit être une image JPEG ou PNG.',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('tentative absente ou d’un autre apprenant : 404', async () => {
      preparer(undefined);
      await expect(deposer()).rejects.toThrow(NotFoundException);
      em.query.mockReset();
      preparer(tentative({ apprenant_id: 'autre' }));
      await expect(deposer()).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['soumise', { statut: 'SOUMISE' }, 'La tentative est terminée : plus d’alerte.'],
      ['délai écoulé', { date_limite: MAINTENANT }, 'La tentative est terminée : plus d’alerte.'],
      ['QCM non surveillé', { proctoring_webcam: false }, 'Cette tentative n’est pas surveillée.'],
      [
        'sans consentement',
        { consentement_surveillance_le: null },
        'Cette tentative n’est pas surveillée.',
      ],
    ])('%s : 409', async (_nom, extra, message) => {
      preparer(tentative(extra));
      await expect(deposer()).rejects.toThrow(new ConflictException(message));
      expect(stockage.deposerTampon).not.toHaveBeenCalled();
    });

    it('surveillance désactivée sur la plateforme : 409', async () => {
      active = false;
      preparer(tentative());
      await expect(deposer()).rejects.toThrow(ConflictException);
    });

    it('plafond atteint : 409 ; juste en dessous : accepté', async () => {
      preparer(tentative(), { n: ALERTES_MAX_PAR_TENTATIVE, derniere: null });
      await expect(deposer()).rejects.toThrow('Nombre maximal d’alertes atteint');
      em.query.mockReset();
      preparer(tentative(), { n: ALERTES_MAX_PAR_TENTATIVE - 1, derniere: null });
      await expect(deposer()).resolves.toBeDefined();
    });

    it('même anomalie moins de 30 s après : 429 avec l’attente ; à 30 s : accepté', async () => {
      preparer(tentative(), { n: 1, derniere: new Date(MAINTENANT.getTime() - 12_500) });
      const erreur = await deposer().catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(HttpException);
      expect((erreur as HttpException).getStatus()).toBe(429);
      expect((erreur as HttpException).getResponse()).toEqual({
        statusCode: 429,
        message: 'Même alerte trop rapprochée : réessayez dans 18 s.',
        attente: 18,
      });
      expect(em.query.mock.calls[2][1]).toEqual(['t1', 'TELEPHONE']);
      em.query.mockReset();
      preparer(tentative(), { n: 1, derniere: new Date(MAINTENANT.getTime() - 30_000) });
      await expect(deposer()).resolves.toBeDefined();
    });

    it('stockage en panne : 503, rien d’audité', async () => {
      preparer(tentative());
      stockage.deposerTampon.mockRejectedValueOnce(new Error('S3'));
      await expect(deposer()).rejects.toThrow(ServiceUnavailableException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('file, aExaminer, deTentative', () => {
    it('formateur : filtre d’affectation et de statut, nouvelles d’abord, audit', async () => {
      dataSource.query.mockResolvedValueOnce([ligneAlerte]);
      const res = await service.file({ id: 'f1', role: Role.FORMATEUR }, 'NOUVEAU', contexte);
      const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toMatch(/ORDER BY \(e\.statut = 'NOUVEAU'\) DESC, e\.detecte_le DESC/);
      expect(sql).toMatch(/LIMIT 200/);
      expect(params).toEqual([false, 'f1', 'NOUVEAU']);
      expect(res).toEqual([
        {
          id: 'e1',
          tentativeId: 't1',
          type: 'TELEPHONE',
          libelle: 'Téléphone détecté',
          confiance: 0.9,
          statut: 'NOUVEAU',
          detecteLe: MAINTENANT,
          examineLe: null,
          formation: { id: 'f1', titre: 'Java' },
          qcm: { id: 'q1', titre: 'Bases' },
          apprenant: { prenom: 'Amel', nom: 'Abidi', email: 'amel@cert-eet.local' },
        },
      ]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ALERTES_SURVEILLANCE_CONSULTEES',
          detailsAvantApres: { statut: 'NOUVEAU', nbAlertes: 1 },
        }),
      );
    });

    it('admin : toutes les formations ; aExaminer compte les nouvelles', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.file({ id: 'ad', role: Role.ADMINISTRATEUR }, null, contexte);
      expect(dataSource.query.mock.calls[0][1]).toEqual([true, 'ad', null]);
      dataSource.query.mockResolvedValueOnce([{ n: 4 }]);
      await expect(service.aExaminer({ id: 'f1', role: Role.FORMATEUR })).resolves.toEqual({
        nombre: 4,
      });
      expect(dataSource.query.mock.calls[1][0]).toMatch(/e\.statut = 'NOUVEAU'/);
      expect(dataSource.query.mock.calls[1][1]).toEqual([false, 'f1']);
    });

    it('deTentative : inconnue 404 ; non affecté 403 journalisé ; affecté -> ordre chronologique', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.deTentative({ id: 'g', role: Role.FORMATEUR }, 't1', contexte),
      ).rejects.toThrow(NotFoundException);
      dataSource.query.mockResolvedValueOnce([{ formation_id: 'f1' }]).mockResolvedValueOnce([]);
      await expect(
        service.deTentative({ id: 'g', role: Role.FORMATEUR }, 't1', contexte),
      ).rejects.toThrow(ForbiddenException);
      expect(audit.record).toHaveBeenCalledWith({
        action: 'ACCES_RESSOURCE_REFUSE',
        acteur: 'g',
        cible: 'f1',
        adresseIp: '10.0.0.1',
        resultat: 'Échec',
        detailsAvantApres: {
          ressource: 'evenements_surveillance',
          tentativeId: 't1',
          methode: 'GET',
          route: '/x',
        },
      });
      dataSource.query
        .mockResolvedValueOnce([{ formation_id: 'f1' }])
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([ligneAlerte]);
      const res = await service.deTentative({ id: 'f', role: Role.FORMATEUR }, 't1', contexte);
      expect(res).toHaveLength(1);
      expect(dataSource.query.mock.calls[5][0]).toMatch(/ORDER BY e\.detecte_le, e\.id/);
    });

    it('un apprenant n’a jamais accès, même s’il était inscrit comme formateur', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ formation_id: 'f1' }])
        .mockResolvedValueOnce([{ '?column?': 1 }]);
      await expect(
        service.deTentative({ id: 'a1', role: Role.APPRENANT }, 't1', contexte),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('examiner', () => {
    it('affecté : statut mis à jour, audit avant/après, vue relue', async () => {
      dataSource.query
        .mockResolvedValueOnce([ligneAlerte])
        .mockResolvedValueOnce([{ '?column?': 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ ...ligneAlerte, statut: 'EXAMINE', examine_le: MAINTENANT }]);
      const res = await service.examiner(
        { id: 'f', role: Role.FORMATEUR },
        'e1',
        'EXAMINE',
        contexte,
      );
      expect(res).toMatchObject({ statut: 'EXAMINE', examineLe: MAINTENANT });
      expect(dataSource.query.mock.calls[2][1]).toEqual(['e1', 'EXAMINE', 'f']);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ALERTE_SURVEILLANCE_EXAMINEE',
          cible: 't1',
          detailsAvantApres: { alerteId: 'e1', avant: 'NOUVEAU', apres: 'EXAMINE' },
        }),
      );
    });

    it('alerte inconnue : 404 ; non affecté : 403 sans mise à jour', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await expect(
        service.examiner({ id: 'f', role: Role.FORMATEUR }, 'x', 'EXAMINE', contexte),
      ).rejects.toThrow(NotFoundException);
      dataSource.query.mockResolvedValueOnce([ligneAlerte]).mockResolvedValueOnce([]);
      await expect(
        service.examiner({ id: 'g', role: Role.FORMATEUR }, 'e1', 'EXAMINE', contexte),
      ).rejects.toThrow(ForbiddenException);
      expect(dataSource.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('lien et servir', () => {
    it('lien : jeton aléatoire de 2 min en Redis ; admin sans vérification d’affectation', async () => {
      dataSource.query.mockResolvedValueOnce([ligneAlerte]);
      const res = await service.lien({ id: 'ad', role: Role.ADMINISTRATEUR }, 'e1', contexte);
      expect(res.expireDansSecondes).toBe(120);
      const jeton = res.url.split('/').pop() as string;
      expect(res.url).toBe(`/api/surveillance/alertes/photo/${jeton}`);
      expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(redis.set).toHaveBeenCalledWith(
        `${PREFIXE_JETON_ALERTE}${jeton}`,
        JSON.stringify({ alerteId: 'e1', utilisateurId: 'ad' }),
        120,
      );
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });

    it('servir : jeton mal formé ou inconnu 404 sans lecture ; valide -> flux', async () => {
      await expect(service.servir('court')).rejects.toThrow(NotFoundException);
      expect(redis.get).not.toHaveBeenCalled();
      const jeton = 'a'.repeat(43);
      redis.get.mockResolvedValueOnce(null);
      await expect(service.servir(jeton)).rejects.toThrow(NotFoundException);
      expect(redis.get).toHaveBeenCalledWith(`${PREFIXE_JETON_ALERTE}${jeton}`);
      redis.get.mockResolvedValueOnce(JSON.stringify({ alerteId: 'e1' }));
      dataSource.query.mockResolvedValueOnce([]);
      await expect(service.servir(jeton)).rejects.toThrow(NotFoundException);
      const flux = Readable.from([JPEG]);
      redis.get.mockResolvedValueOnce(JSON.stringify({ alerteId: 'e1' }));
      dataSource.query.mockResolvedValueOnce([
        { cle_stockage: 'k', type_contenu: 'image/jpeg', taille_octets: 204 },
      ]);
      stockage.lire.mockResolvedValueOnce({ flux });
      await expect(service.servir(jeton)).resolves.toEqual({
        flux,
        type: 'image/jpeg',
        taille: 204,
      });
      redis.get.mockResolvedValueOnce(JSON.stringify({ alerteId: 'e1' }));
      dataSource.query.mockResolvedValueOnce([
        { cle_stockage: 'k', type_contenu: 'image/jpeg', taille_octets: 204 },
      ]);
      stockage.lire.mockRejectedValueOnce(new Error('S3'));
      await expect(service.servir(jeton)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('purger', () => {
    it('rien à purger : aucun appel au stockage', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await expect(service.purger({ avant: MAINTENANT })).resolves.toBe(0);
      expect(dataSource.query.mock.calls[0][1]).toEqual([MAINTENANT]);
      expect(stockage.supprimer).not.toHaveBeenCalled();
    });

    it('anonymisation : toutes les alertes de l’apprenant, stockage puis base', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { id: 'e1', cle_stockage: 'k1' },
          { id: 'e2', cle_stockage: 'k2' },
        ])
        .mockResolvedValueOnce([]);
      await expect(service.purger({ apprenantId: 'a1' })).resolves.toBe(2);
      expect(dataSource.query.mock.calls[0][0]).toMatch(/t\.apprenant_id = \$1/);
      expect(dataSource.query.mock.calls[0][1]).toEqual(['a1']);
      expect(stockage.supprimer).toHaveBeenCalledWith(['k1', 'k2']);
      expect(dataSource.query.mock.calls[1]).toEqual([
        'DELETE FROM evenements_surveillance WHERE id = ANY($1::uuid[])',
        [['e1', 'e2']],
      ]);
    });

    it('stockage en panne : la base n’est pas touchée', async () => {
      dataSource.query.mockResolvedValueOnce([{ id: 'e1', cle_stockage: 'k1' }]);
      stockage.supprimer.mockRejectedValueOnce(new Error('S3'));
      await expect(service.purger({ avant: MAINTENANT })).rejects.toThrow('S3');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
    });
  });
});
