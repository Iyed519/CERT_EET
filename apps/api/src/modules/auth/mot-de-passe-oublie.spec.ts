import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { empreinteJeton, JetonsLienService } from './jetons-lien.service';
import {
  MESSAGE_LIEN_INVALIDE,
  MotDePasseOublieService,
  REINITIALISATION_DUREE_SECONDES,
} from './mot-de-passe-oublie.service';

/** US-AUTH-06 — primitive de lien email et service « mot de passe oublié ». */
describe('JetonsLienService (US-AUTH-06)', () => {
  const em = { query: jest.fn() };
  const service = new JetonsLienService({ manager: em } as never);
  beforeEach(() => jest.clearAllMocks());

  it('émet un jeton aléatoire de 256 bits ; seule son empreinte est enregistrée ; anciens liens retirés', async () => {
    em.query.mockResolvedValue([]);
    const jeton = await service.emettre('u1', 'REINITIALISATION_MDP', 1800);
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(em.query.mock.calls[0][0]).toMatch(/DELETE FROM jetons_lien_email/);
    expect(em.query.mock.calls[0][1]).toEqual(['u1', 'REINITIALISATION_MDP']);
    const [sql, params] = em.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO jetons_lien_email/);
    expect(params).toEqual(['u1', 'REINITIALISATION_MDP', empreinteJeton(jeton), 1800]);
    expect(JSON.stringify(params)).not.toContain(jeton);
    expect(await service.emettre('u1', 'REINITIALISATION_MDP', 1800)).not.toBe(jeton);
  });

  it('consomme par un UPDATE conditionnel (non utilisé, non expiré, bon objet)', async () => {
    em.query.mockResolvedValueOnce([[{ user_id: 'u1' }], 1]);
    await expect(service.consommer('abc', 'REINITIALISATION_MDP')).resolves.toBe('u1');
    const [sql, params] = em.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/utilise_le IS NULL AND expire_le > now\(\)/);
    expect(params).toEqual([empreinteJeton('abc'), 'REINITIALISATION_MDP']);
    em.query.mockResolvedValueOnce([[], 0]);
    await expect(service.consommer('abc', 'REINITIALISATION_MDP')).resolves.toBeNull();
  });
});

describe('MotDePasseOublieService (US-AUTH-06)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const jetons = { emettre: jest.fn(), consommer: jest.fn() };
  const auth = { invalidateUserSessions: jest.fn() };
  const mail = {
    sendReinitialisationMotDePasseEmail: jest.fn(),
    sendMotDePasseModifieEmail: jest.fn(),
  };
  const redis = { incrementer: jest.fn() };
  const audit = { record: jest.fn() };
  const config = { getOrThrow: (): { appBaseUrl: string } => ({ appBaseUrl: 'https://cert.tn' }) };
  const service = new MotDePasseOublieService(
    dataSource as never,
    jetons as unknown as JetonsLienService,
    auth as never,
    mail as never,
    redis as never,
    audit as never,
    config as never,
  );
  const actif = { id: 'u1', email: 'a@cert.tn', prenom: 'Amel', statut: StatutCompte.ACTIF };

  beforeEach(() => {
    jest.clearAllMocks();
    redis.incrementer.mockResolvedValue({ compte: 1, resteSecondes: 3600 });
    jetons.emettre.mockResolvedValue('J'.repeat(43));
    mail.sendReinitialisationMotDePasseEmail.mockResolvedValue(undefined);
    auth.invalidateUserSessions.mockResolvedValue(3);
  });

  it('demande pour un compte actif : jeton de 30 min, audit, email avec le lien', async () => {
    dataSource.query.mockResolvedValue([actif]);
    await service.demander('  a@cert.tn ', { adresseIp: '1.1.1.1' });
    expect(dataSource.query.mock.calls[0][1]).toEqual(['a@cert.tn']);
    expect(jetons.emettre).toHaveBeenCalledWith(
      'u1',
      'REINITIALISATION_MDP',
      REINITIALISATION_DUREE_SECONDES,
    );
    expect(REINITIALISATION_DUREE_SECONDES).toBe(1800);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MDP_RESET_DEMANDE', acteur: 'u1', resultat: 'Succès' }),
    );
    expect(mail.sendReinitialisationMotDePasseEmail).toHaveBeenCalledWith('a@cert.tn', {
      prenom: 'Amel',
      lien: `https://cert.tn/reinitialiser-mot-de-passe?token=${'J'.repeat(43)}`,
      minutes: 30,
    });
  });

  it.each([
    ['inconnu', []],
    ['en attente', [{ ...actif, statut: StatutCompte.EN_ATTENTE_ACTIVATION }]],
    ['désactivé', [{ ...actif, statut: StatutCompte.DESACTIVE }]],
  ])('compte %s : rien émis, rien envoyé, rien journalisé', async (_cas, lignes) => {
    dataSource.query.mockResolvedValue(lignes);
    await service.demander('x@cert.tn', { adresseIp: null });
    expect(jetons.emettre).not.toHaveBeenCalled();
    expect(mail.sendReinitialisationMotDePasseEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('quota horaire dépassé (4e demande) : pas de lien, audit Échec', async () => {
    dataSource.query.mockResolvedValue([actif]);
    redis.incrementer.mockResolvedValue({ compte: 4, resteSecondes: 100 });
    await service.demander('a@cert.tn', { adresseIp: null });
    expect(jetons.emettre).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ resultat: 'Échec' }));
    expect(redis.incrementer.mock.calls[0][0]).toMatch(/^limite:mdp-oublie-email:[0-9a-f]{64}$/);
  });

  it('un email en échec ne fait pas échouer la demande', async () => {
    dataSource.query.mockResolvedValue([actif]);
    mail.sendReinitialisationMotDePasseEmail.mockRejectedValue(new Error('SMTP'));
    await expect(service.demander('a@cert.tn', { adresseIp: null })).resolves.toBeUndefined();
  });

  it('réinitialisation : jeton consommé, compte verrouillé, hash mis à jour, autres liens clos, sessions révoquées, audit, email', async () => {
    jetons.consommer.mockResolvedValue('u1');
    em.query.mockResolvedValueOnce([actif]).mockResolvedValue([]);
    await expect(
      service.reinitialiser('T'.repeat(43), 'Nouveau123', { adresseIp: '2.2.2.2' }),
    ).resolves.toEqual({ sessionsRevoquees: 3 });
    expect(jetons.consommer).toHaveBeenCalledWith('T'.repeat(43), 'REINITIALISATION_MDP', em);
    expect(em.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    const [sqlMaj, params] = em.query.mock.calls[1] as [string, string[]];
    expect(sqlMaj).toMatch(/UPDATE users SET mot_de_passe_hash/);
    expect(await bcrypt.compare('Nouveau123', params[1])).toBe(true);
    expect(em.query.mock.calls[2][0]).toMatch(/UPDATE jetons_lien_email SET utilise_le = now\(\)/);
    expect(auth.invalidateUserSessions).toHaveBeenCalledWith('u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MDP_RESET', acteur: 'u1', resultat: 'Succès' }),
    );
    expect(mail.sendMotDePasseModifieEmail).toHaveBeenCalledWith('a@cert.tn', { prenom: 'Amel' });
  });

  it('jeton invalide / expiré / utilisé : 400, rien modifié, audit Échec', async () => {
    jetons.consommer.mockResolvedValue(null);
    await expect(service.reinitialiser('x', 'Nouveau123', { adresseIp: null })).rejects.toThrow(
      MESSAGE_LIEN_INVALIDE,
    );
    expect(em.query).not.toHaveBeenCalled();
    expect(auth.invalidateUserSessions).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MDP_RESET', resultat: 'Échec' }),
    );
  });

  it('compte devenu inactif entre-temps : 400, rien modifié', async () => {
    jetons.consommer.mockResolvedValue('u1');
    em.query.mockResolvedValueOnce([{ ...actif, statut: StatutCompte.DESACTIVE }]);
    await expect(service.reinitialiser('x', 'Nouveau123', { adresseIp: null })).rejects.toThrow(
      BadRequestException,
    );
    expect(em.query).toHaveBeenCalledTimes(1);
  });
});
