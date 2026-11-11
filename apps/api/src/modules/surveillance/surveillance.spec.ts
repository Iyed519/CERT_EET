import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Role } from '../../database/enums/role.enum';
import { verifierConsentement } from '../tentatives/tentative-demarrage.regles';
import {
  attenteAvantCapture,
  capturesMax,
  limiteConservation,
  typeImage,
} from './surveillance.regles';
import { SurveillanceService } from './surveillance.service';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(50, 2),
]);

describe('Surveillance webcam — règles (US-QCM-12)', () => {
  it('type reconnu à la signature, jamais au nom', () => {
    expect(typeImage(JPEG)).toBe('image/jpeg');
    expect(typeImage(PNG)).toBe('image/png');
    expect(typeImage(Buffer.from('GIF89a......'))).toBeNull();
    expect(typeImage(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
  it('nombre maximal : une par intervalle sur la durée, plus une marge', () => {
    expect(capturesMax(30, 120)).toBe(18);
    expect(capturesMax(1, 120)).toBe(4);
  });
  it('écart minimal : la moitié de l’intervalle', () => {
    const t0 = new Date('2026-11-11T10:00:00Z');
    expect(attenteAvantCapture(null, t0, 120)).toBe(0);
    expect(attenteAvantCapture(t0, new Date(t0.getTime() + 59_000), 120)).toBe(1);
    expect(attenteAvantCapture(t0, new Date(t0.getTime() + 60_000), 120)).toBe(0);
  });
  it('conservation en jours', () => {
    const t = new Date('2026-11-11T00:00:00Z');
    expect(limiteConservation(t, 30).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
  it('consentement : exigé seulement pour un QCM surveillé', () => {
    expect(verifierConsentement(false, false)).toBeNull();
    expect(verifierConsentement(true, true)).toBeNull();
    expect(verifierConsentement(true, false)).toMatchObject({
      raison: 'consentement_surveillance_requis',
      message: expect.stringMatching(/présentiel/),
    });
  });
});

describe('SurveillanceService (US-QCM-12)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const stockage = { deposerTampon: jest.fn(), lire: jest.fn(), supprimer: jest.fn() };
  const redis = { set: jest.fn(), get: jest.fn() };
  const audit = { record: jest.fn() };
  const autorisation = { estAffecte: jest.fn() };
  const config = {
    getOrThrow: (): Record<string, unknown> => ({
      active: true,
      intervalleSecondes: 120,
      tailleMaxOctets: 100 * 1024,
      conservationJours: 30,
      balayageActif: false,
      balayageMinutes: 60,
    }),
  };
  const service = new SurveillanceService(
    dataSource as never,
    stockage as never,
    redis as never,
    audit as never,
    autorisation as never,
    config as never,
  );
  const MAINTENANT = new Date('2026-11-11T10:00:00Z');
  const tentative = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 't1',
    apprenant_id: 'a1',
    statut: 'EN_COURS',
    date_limite: new Date(MAINTENANT.getTime() + 600_000),
    consentement_surveillance_le: MAINTENANT,
    proctoring_webcam: true,
    duree_max_minutes: 30,
    ...extra,
  });
  const contexte = { adresseIp: null, methode: 'GET', route: '/x' };

  beforeEach(() => {
    jest.clearAllMocks();
    // Les réponses « une fois » non consommées d'un test ne fuient pas au suivant.
    em.query.mockReset();
    dataSource.query.mockReset();
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

  it('dépôt nominal : verrou, ligne insérée, image déposée en privé', async () => {
    preparer(tentative());
    const vue = await service.deposer('a1', 't1', JPEG);
    expect(vue).toMatchObject({ priseLe: MAINTENANT, tailleOctets: JPEG.length });
    expect(em.query.mock.calls[0][0]).toMatch(/FOR UPDATE OF t/);
    const [sql, params] = em.query.mock.calls[3] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO captures_webcam/);
    expect(params[2]).toMatch(/^surveillance\/t1\/[0-9a-f-]{36}\.jpg$/);
    expect(params[4]).toBe('image/jpeg');
    expect(stockage.deposerTampon).toHaveBeenCalledWith(
      params[2],
      JPEG,
      'image/jpeg',
      expect.any(String),
    );
  });

  it('refus : trop gros 413, pas une image 400 — avant toute transaction', async () => {
    await expect(service.deposer('a1', 't1', Buffer.alloc(100 * 1024 + 1, 0xff))).rejects.toThrow(
      PayloadTooLargeException,
    );
    await expect(service.deposer('a1', 't1', Buffer.from('pas une image'))).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['d’un autre apprenant', tentative({ apprenant_id: 'autre' }), NotFoundException],
    ['terminée', tentative({ statut: 'NOTEE' }), ConflictException],
    ['échue', tentative({ date_limite: MAINTENANT }), ConflictException],
    ['non surveillée', tentative({ proctoring_webcam: false }), ConflictException],
    ['sans consentement', tentative({ consentement_surveillance_le: null }), ConflictException],
  ])('tentative %s : refus, rien déposé', async (_cas, t, Erreur) => {
    preparer(t);
    await expect(service.deposer('a1', 't1', JPEG)).rejects.toThrow(Erreur);
    expect(stockage.deposerTampon).not.toHaveBeenCalled();
  });

  it('capture trop rapprochée 429 ; nombre maximal 409', async () => {
    preparer(tentative(), { n: 1, derniere: new Date(MAINTENANT.getTime() - 10_000) });
    const promesse = service.deposer('a1', 't1', JPEG);
    await expect(promesse).rejects.toThrow(HttpException);
    await promesse.catch((e: HttpException) => expect(e.getStatus()).toBe(429));
    em.query.mockReset();
    preparer(tentative(), { n: 18, derniere: null });
    await expect(service.deposer('a1', 't1', JPEG)).rejects.toThrow(/Nombre maximal/);
    expect(stockage.deposerTampon).not.toHaveBeenCalled();
  });

  it('revue : formateur non affecté -> 403 tracé ; affecté -> liste et consultation tracée ; admin sans contrôle d’affectation', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 't1', consentement_surveillance_le: MAINTENANT, formation_id: 'f1' },
    ]);
    autorisation.estAffecte.mockResolvedValueOnce(false);
    await expect(
      service.lister({ id: 'fx', role: Role.FORMATEUR }, 't1', contexte),
    ).rejects.toThrow(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCES_RESSOURCE_REFUSE', cible: 'f1' }),
    );
    dataSource.query
      .mockResolvedValueOnce([
        { id: 't1', consentement_surveillance_le: MAINTENANT, formation_id: 'f1' },
      ])
      .mockResolvedValueOnce([{ id: 'c1', priseLe: MAINTENANT, tailleOctets: 10 }]);
    autorisation.estAffecte.mockResolvedValueOnce(true);
    const vue = await service.lister({ id: 'f1', role: Role.FORMATEUR }, 't1', contexte);
    expect(vue).toMatchObject({
      tentativeId: 't1',
      conservationJours: 30,
      captures: [{ id: 'c1' }],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CAPTURES_CONSULTEES',
        detailsAvantApres: { nbCaptures: 1 },
      }),
    );
    dataSource.query
      .mockResolvedValueOnce([{ id: 't1', consentement_surveillance_le: null, formation_id: 'f1' }])
      .mockResolvedValueOnce([]);
    await service.lister({ id: 'ad', role: Role.ADMINISTRATEUR }, 't1', contexte);
    expect(autorisation.estAffecte).toHaveBeenCalledTimes(2);
    dataSource.query.mockResolvedValueOnce([
      { id: 't1', consentement_surveillance_le: null, formation_id: 'f1' },
    ]);
    await expect(
      service.lister({ id: 'ap', role: Role.APPRENANT }, 't1', contexte),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lien signé de 2 minutes ; jeton inconnu ou mal formé -> 404', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ tentative_id: 't1' }])
      .mockResolvedValueOnce([
        { id: 't1', consentement_surveillance_le: null, formation_id: 'f1' },
      ]);
    const l = await service.lien({ id: 'ad', role: Role.ADMINISTRATEUR }, 'c1', contexte);
    expect(l.url).toMatch(/^\/api\/captures\/fichier\/[A-Za-z0-9_-]{43}$/);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^capture:lien:/),
      expect.any(String),
      120,
    );
    await expect(service.servir('court')).rejects.toThrow(NotFoundException);
    redis.get.mockResolvedValueOnce(null);
    await expect(service.servir('A'.repeat(43))).rejects.toThrow(NotFoundException);
  });

  it('purge : conservation dépassée ou compte anonymisé ; stockage puis base ; journalisée sans PII', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { id: 'c1', cle_stockage: 'surveillance/t1/c1.jpg' },
        { id: 'c2', cle_stockage: 'surveillance/t1/c2.jpg' },
      ])
      .mockResolvedValueOnce([]);
    await expect(service.purger()).resolves.toBe(2);
    const limite = dataSource.query.mock.calls[0][1][0] as Date;
    expect(Date.now() - limite.getTime()).toBeGreaterThanOrEqual(30 * 24 * 3600 * 1000 - 1000);
    expect(stockage.supprimer).toHaveBeenCalledWith([
      'surveillance/t1/c1.jpg',
      'surveillance/t1/c2.jpg',
    ]);
    expect(dataSource.query.mock.calls[1][0]).toMatch(/DELETE FROM captures_webcam/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CAPTURES_PURGEES',
        detailsAvantApres: { nbCaptures: 2, cause: 'CONSERVATION', conservationJours: 30 },
      }),
    );
    dataSource.query.mockResolvedValueOnce([]);
    await expect(service.purger({ apprenantId: 'a1' })).resolves.toBe(0);
    expect(dataSource.query.mock.calls[2][0]).toMatch(/t.apprenant_id = \$1/);
  });
});
