import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, DataSource } from 'typeorm';
import { MESSAGE_DEJA_REEMIS, verifierReemettable } from './certificat.regles';
import { CertificatsService } from './certificats.service';

/** US-CERT-08 — Réémission d'un certificat révoqué pour erreur administrative. */
describe('Réémission (US-CERT-08)', () => {
  it('règle : révoqué pour ERREUR_ADMIN seulement', () => {
    expect(() => verifierReemettable('REVOQUE', 'ERREUR_ADMIN')).not.toThrow();
    expect(() => verifierReemettable('ACTIF', null)).toThrow(/Seul un certificat révoqué/);
    expect(() => verifierReemettable('EXPIRE', null)).toThrow(ConflictException);
    expect(() => verifierReemettable('REVOQUE', 'FRAUDE')).toThrow(/erreur administrative/);
  });

  const monter = (
    reponses: Array<unknown[] | Error>,
  ): {
    service: CertificatsService;
    query: jest.Mock;
    ajouter: jest.Mock;
    record: jest.Mock;
  } => {
    const query = jest.fn();
    for (const r of reponses) {
      if (r instanceof Error) query.mockRejectedValueOnce(r);
      else query.mockResolvedValueOnce(r);
    }
    const ajouter = jest.fn();
    const record = jest.fn();
    const dataSource = {
      transaction: async (cb: (m: unknown) => unknown): Promise<unknown> => cb({ query }),
      query: jest.fn().mockResolvedValue([]),
      manager: { find: jest.fn().mockResolvedValue([]) },
    };
    const service = new CertificatsService(
      dataSource as unknown as DataSource,
      { ajouter } as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    );
    return { service, query, ajouter, record };
  };

  it('nominal : verrou, contrôle, nouvelle ligne liée, audit, travail en file', async () => {
    const { service, query, ajouter, record } = monter([
      [{ id: 'old', statut: 'REVOQUE', motif: 'ERREUR_ADMIN' }],
      [],
      [{ id: 'new' }],
    ]);
    await service.reemettre('adm', 'old', { adresseIp: null }).catch(() => undefined);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain('WHERE remplace_certificat_id = $1');
    expect(query.mock.calls[2][0]).toContain('remplace_certificat_id)');
    expect(query.mock.calls[2][0]).toContain('make_interval(months => f.duree_validite_mois)');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICAT_REEMIS',
        cible: 'new',
        detailsAvantApres: { remplace: 'old' },
      }),
    );
    expect(ajouter).toHaveBeenCalledWith('new');
  });

  it('inconnu 404 ; déjà réémis 409 ; course perdue (23505) 409 ; rien en file', async () => {
    let m = monter([[]]);
    await expect(m.service.reemettre('adm', 'x', { adresseIp: null })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    m = monter([[{ id: 'old', statut: 'REVOQUE', motif: 'ERREUR_ADMIN' }], [{ id: 'new' }]]);
    await expect(m.service.reemettre('adm', 'old', { adresseIp: null })).rejects.toThrow(
      MESSAGE_DEJA_REEMIS,
    );
    const course = new QueryFailedError('INSERT', [], new Error('dup'));
    (course as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
    m = monter([[{ id: 'old', statut: 'REVOQUE', motif: 'ERREUR_ADMIN' }], [], course]);
    await expect(m.service.reemettre('adm', 'old', { adresseIp: null })).rejects.toThrow(
      MESSAGE_DEJA_REEMIS,
    );
    expect(m.ajouter).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });
});
