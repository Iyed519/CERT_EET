import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { ActivationComptesService, ACTIVATION_DUREE_SECONDES } from './activation-comptes.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ addBulk: jest.fn(), close: jest.fn() })),
  Worker: jest.fn(),
}));

/** US-CPT-02 — envoi (worker) et activation des comptes importés. */
describe('ActivationComptesService (US-CPT-02)', () => {
  const em = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn((travail: (m: typeof em) => Promise<unknown>) => travail(em)),
  };
  const jetons = { emettre: jest.fn(), consommer: jest.fn() };
  const mail = { sendActivationCompteEmail: jest.fn() };
  const audit = { record: jest.fn() };
  const config = {
    getOrThrow: (cle: string): unknown =>
      ({
        redis: { host: 'localhost', port: 6379 },
        activations: { workerActif: false, tentatives: 3, backoffMs: 10 },
        mail: { appBaseUrl: 'https://cert.tn' },
      })[cle],
  };
  const service = new ActivationComptesService(
    config as never,
    dataSource as never,
    jetons as never,
    mail as never,
    audit as never,
  );
  const enAttente = {
    id: 'u1',
    email: 'a@y.tn',
    prenom: 'Amel',
    statut: StatutCompte.EN_ATTENTE_ACTIVATION,
    mot_de_passe_hash: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jetons.emettre.mockResolvedValue('J'.repeat(43));
  });

  it('48 heures de validité', () => {
    expect(ACTIVATION_DUREE_SECONDES).toBe(172800);
  });

  it('worker : jeton émis à l’envoi, email avec le lien', async () => {
    dataSource.query.mockResolvedValueOnce([enAttente]);
    await service.envoyer('u1');
    expect(jetons.emettre).toHaveBeenCalledWith('u1', 'ACTIVATION_COMPTE', 172800);
    expect(mail.sendActivationCompteEmail).toHaveBeenCalledWith('a@y.tn', {
      prenom: 'Amel',
      lien: `https://cert.tn/activer-compte?token=${'J'.repeat(43)}`,
      heures: 48,
    });
  });

  it.each([
    ['déjà actif', { ...enAttente, statut: StatutCompte.ACTIF }],
    ['inscrit lui-même (mot de passe)', { ...enAttente, mot_de_passe_hash: '$2a$x' }],
  ])('worker : compte %s -> rien émis ni envoyé', async (_cas, ligne) => {
    dataSource.query.mockResolvedValueOnce([ligne]);
    await service.envoyer('u1');
    expect(jetons.emettre).not.toHaveBeenCalled();
    expect(mail.sendActivationCompteEmail).not.toHaveBeenCalled();
  });

  it('activation : jeton consommé, compte verrouillé, mot de passe et statut ACTIF, audit', async () => {
    jetons.consommer.mockResolvedValue('u1');
    em.query.mockResolvedValueOnce([enAttente]).mockResolvedValueOnce([]);
    await service.activer('T'.repeat(43), 'MonPasse123', { adresseIp: '1.1.1.1' });
    expect(jetons.consommer).toHaveBeenCalledWith('T'.repeat(43), 'ACTIVATION_COMPTE', em);
    expect(em.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    const [sql, params] = em.query.mock.calls[1] as [string, string[]];
    expect(sql).toMatch(/statut = \$3/);
    expect(params[2]).toBe(StatutCompte.ACTIF);
    expect(await bcrypt.compare('MonPasse123', params[1])).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPTE_ACTIVE', acteur: 'u1', resultat: 'Succès' }),
    );
  });

  it('activation : lien invalide, ou compte qui n’est plus en attente -> 400, audit Échec', async () => {
    jetons.consommer.mockResolvedValueOnce(null);
    await expect(service.activer('x', 'MonPasse123', { adresseIp: null })).rejects.toThrow(
      BadRequestException,
    );
    jetons.consommer.mockResolvedValueOnce('u1');
    em.query.mockResolvedValueOnce([{ ...enAttente, statut: StatutCompte.DESACTIVE }]);
    await expect(service.activer('x', 'MonPasse123', { adresseIp: null })).rejects.toThrow(
      BadRequestException,
    );
    expect(em.query).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ resultat: 'Échec' }));
  });
});
