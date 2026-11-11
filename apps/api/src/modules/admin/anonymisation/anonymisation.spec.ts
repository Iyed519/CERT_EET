import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  emailAnonyme,
  NOM_ANONYMISE,
  retireDernierAdmin,
  TEXTE_ANONYMISE,
} from './anonymisation.regles';
import { AnonymisationService } from './anonymisation.service';

describe('Anonymisation — règles (US-CPT-04)', () => {
  it('adresse de remplacement unique, dans le domaine réservé .invalid', () => {
    expect(emailAnonyme('abc')).toBe('anonyme-abc@anonymise.invalid');
  });
  it('dernier administrateur actif protégé, les autres non', () => {
    expect(retireDernierAdmin({ role: 'ADMINISTRATEUR', statut: 'ACTIF' }, 1)).toBe(true);
    expect(retireDernierAdmin({ role: 'ADMINISTRATEUR', statut: 'ACTIF' }, 2)).toBe(false);
    expect(retireDernierAdmin({ role: 'ADMINISTRATEUR', statut: 'DESACTIVE' }, 1)).toBe(false);
    expect(retireDernierAdmin({ role: 'APPRENANT', statut: 'ACTIF' }, 0)).toBe(false);
  });
});

describe('AnonymisationService (US-CPT-04)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const audit = { record: jest.fn() };
  const auth = { invalidateUserSessions: jest.fn() };
  const surveillance = { purger: jest.fn().mockResolvedValue(3) };
  const service = new AnonymisationService(
    dataSource as never,
    audit as never,
    auth as never,
    surveillance as never,
  );
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash('AdminPasse1', 4);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue([{ mot_de_passe_hash: hash }]);
    auth.invalidateUserSessions.mockResolvedValue(2);
  });

  const nominal = (): void => {
    em.query
      .mockResolvedValueOnce([{ role: 'APPRENANT' }])
      .mockResolvedValueOnce([{ id: 'c1', role: 'APPRENANT', statut: 'DESACTIVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([[{ id: 'o1' }], 1])
      .mockResolvedValue([]);
  };

  it('mot de passe faux : 401, aucune transaction, tentative journalisée', async () => {
    await expect(service.anonymiser('a1', 'c1', 'Mauvais', { adresseIp: null })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPTE_ANONYMISE', resultat: 'Échec', cible: 'c1' }),
    );
  });

  it('son propre compte : 403 sans transaction', async () => {
    await expect(
      service.anonymiser('a1', 'a1', 'AdminPasse1', { adresseIp: null }),
    ).rejects.toThrow(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('nominal : cible verrouillée, identité et secrets remplacés, traces effacées, sessions révoquées, audit sans donnée personnelle', async () => {
    nominal();
    const vue = await service.anonymiser('a1', 'c1', 'AdminPasse1', { adresseIp: '1.1.1.1' });
    expect(vue).toEqual({
      id: 'c1',
      statut: 'ANONYMISE',
      email: 'anonyme-c1@anonymise.invalid',
      nom: NOM_ANONYMISE,
      sessionsRevoquees: 2,
    });
    expect(em.query.mock.calls[1][0]).toMatch(/FOR UPDATE/);
    const [sql, params] = em.query.mock.calls[2] as [string, unknown[]];
    for (const champ of [
      'prenom = NULL',
      'mot_de_passe_hash = NULL',
      'mfa_secret = NULL',
      'date_naissance = NULL',
      'etablissement_autre = NULL',
      "statut = 'ANONYMISE'",
    ]) {
      expect(sql).toContain(champ);
    }
    expect(params).toEqual(['c1', 'anonyme-c1@anonymise.invalid', NOM_ANONYMISE]);
    const requetes = em.query.mock.calls.map((c) => c[0] as string).join('\n');
    expect(requetes).toMatch(/DELETE FROM comptes_oauth/);
    expect(requetes).toMatch(/DELETE FROM jetons_lien_email/);
    expect(requetes).toMatch(/adresse_ip = NULL, user_agent = NULL/);
    expect(em.query.mock.calls.find((c) => /demandes_role/.test(c[0] as string))?.[1]).toEqual([
      'c1',
      TEXTE_ANONYMISE,
    ]);
    expect(auth.invalidateUserSessions).toHaveBeenCalledWith('c1');
    const trace = audit.record.mock.calls[0][0] as { detailsAvantApres: Record<string, unknown> };
    expect(trace).toMatchObject({
      action: 'COMPTE_ANONYMISE',
      resultat: 'Succès',
      acteur: 'a1',
      cible: 'c1',
    });
    expect(trace.detailsAvantApres).toEqual({
      role: 'APPRENANT',
      ancienStatut: 'DESACTIVE',
      sessionsRevoquees: 2,
      liaisonsOauthSupprimees: 1,
      capturesWebcamSupprimees: 3,
    });
    expect(surveillance.purger).toHaveBeenCalledWith({ apprenantId: 'c1', acteur: 'a1' });
  });

  it('administrateur ciblé : administrateurs actifs verrouillés AVANT la cible ; dernier actif -> 403, rien modifié', async () => {
    em.query
      .mockResolvedValueOnce([{ role: 'ADMINISTRATEUR' }])
      .mockResolvedValueOnce([{ id: 'c1' }])
      .mockResolvedValueOnce([{ id: 'c1', role: 'ADMINISTRATEUR', statut: 'ACTIF' }]);
    await expect(
      service.anonymiser('a1', 'c1', 'AdminPasse1', { adresseIp: null }),
    ).rejects.toThrow(/au moins un administrateur actif/);
    expect(em.query.mock.calls[1][0]).toMatch(
      /role = 'ADMINISTRATEUR' AND statut = 'ACTIF' ORDER BY id FOR UPDATE/,
    );
    expect(em.query).toHaveBeenCalledTimes(3);
    expect(auth.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it('déjà anonymisé 409 ; introuvable 404', async () => {
    em.query
      .mockResolvedValueOnce([{ role: 'APPRENANT' }])
      .mockResolvedValueOnce([{ id: 'c1', role: 'APPRENANT', statut: 'ANONYMISE' }]);
    await expect(
      service.anonymiser('a1', 'c1', 'AdminPasse1', { adresseIp: null }),
    ).rejects.toThrow(ConflictException);
    em.query.mockResolvedValueOnce([]);
    await expect(
      service.anonymiser('a1', 'c2', 'AdminPasse1', { adresseIp: null }),
    ).rejects.toThrow(NotFoundException);
  });
});
