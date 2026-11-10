import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import {
  DesinscriptionService,
  MESSAGE_DEJA_DESINSCRIT,
  MESSAGE_PAS_INSCRIT,
  MOTIF_DESINSCRIPTION,
} from './desinscription.service';

const APP = 'u0000000-0000-4000-8000-000000000001';
const F = 'f0000000-0000-4000-8000-000000000001';

interface Options {
  ligne?: Record<string, unknown> | null;
  maj?: number;
  formateurs?: Array<{ email: string; prenom: string | null }>;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- banc de test : type inféré
function monter(o: Options = {}) {
  const {
    ligne = {
      id: 'ins-1',
      statut: 'EN_COURS',
      taux: 40,
      titre: 'Back-end',
      tentatives: 0,
      livrables: 0,
      certificats: 0,
    },
    maj = 1,
    formateurs = [
      { email: 'f1@x.tn', prenom: 'Sami' },
      { email: 'f2@x.tn', prenom: null },
    ],
  } = o;
  const query = jest.fn(async (sql: string, p?: unknown[]): Promise<unknown> => {
    void p;
    if (sql.includes('FROM inscriptions i JOIN formations f')) return ligne ? [ligne] : [];
    if (sql.includes('UPDATE inscriptions'))
      return [Array.from({ length: maj }, () => ({ id: 'ins-1' })), maj];
    if (sql.includes('SELECT email, prenom, nom FROM users'))
      return [{ email: 'a@x.tn', prenom: 'Amel', nom: 'Ben Ali' }];
    if (sql.includes('FROM formation_formateurs')) return formateurs;
    return [];
  });
  const record = jest.fn();
  const mail = { sendDesinscriptionFormateurEmail: jest.fn(async () => undefined) };
  const service = new DesinscriptionService(
    { query } as unknown as DataSource,
    { record } as unknown as AuditService,
    mail as unknown as MailService,
  );
  return { service, query, record, mail };
}

describe('DesinscriptionService (US-INSC-03)', () => {
  it('conséquences : accès retiré, réactivation par un administrateur, certificats', async () => {
    const c = await monter().service.consequences(APP, F);
    expect(c).toMatchObject({
      statut: 'EN_COURS',
      possible: true,
      tauxAvancement: 40,
      certificatsConserves: 0,
    });
    expect(c.consequences).toHaveLength(3);
    expect(c.consequences[2]).toBe('Aucun certificat n’est concerné.');
  });

  it('conséquences : tentatives, livrables et certificats annoncés ; impossible si suspendue', async () => {
    const c = await monter({
      ligne: {
        id: 'i',
        statut: 'SUSPENDUE',
        taux: 0,
        titre: 'T',
        tentatives: 1,
        livrables: 2,
        certificats: 1,
      },
    }).service.consequences(APP, F);
    expect(c.possible).toBe(false);
    expect(c.consequences).toHaveLength(5);
    expect(c.consequences.join(' ')).toContain('1 certificat(s) obtenu(s) restent valides');
    expect(c.consequences.join(' ')).toContain('2 livrable(s)');
  });

  it('404 si l’apprenant n’est pas inscrit (requête filtrée par l’apprenant du jeton)', async () => {
    const m = monter({ ligne: null });
    await expect(m.service.consequences(APP, F)).rejects.toThrow(
      new NotFoundException(MESSAGE_PAS_INSCRIT),
    );
    await expect(m.service.desinscrire(APP, F)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.query.mock.calls[0][1]).toEqual([APP, F]);
  });

  it('désinscription : UPDATE conditionnel EN_COURS, motif, audit, formateurs notifiés', async () => {
    const m = monter();
    const r = await m.service.desinscrire(APP, F, { adresseIp: '1.1.1.1' });
    expect(r).toEqual({ statut: 'SUSPENDUE', formation: { id: F, titre: 'Back-end' } });
    const maj = m.query.mock.calls.find((c) => String(c[0]).includes('UPDATE inscriptions'));
    expect(String(maj?.[0])).toContain("WHERE id = $1 AND statut = 'EN_COURS'");
    expect(String(maj?.[0])).toContain('suspendue_par = apprenant_id');
    expect(maj?.[1]).toEqual(['ins-1', MOTIF_DESINSCRIPTION]);
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INSCRIPTION_DESINSCRITE', acteur: APP, cible: 'ins-1' }),
    );
    expect(m.mail.sendDesinscriptionFormateurEmail).toHaveBeenCalledTimes(2);
    expect(m.mail.sendDesinscriptionFormateurEmail).toHaveBeenCalledWith('f1@x.tn', {
      prenomFormateur: 'Sami',
      nomApprenant: 'Amel Ben Ali',
      titreFormation: 'Back-end',
    });
  });

  it('409 si l’inscription n’est plus active ; rien de tracé ni envoyé', async () => {
    const m = monter({ maj: 0 });
    await expect(m.service.desinscrire(APP, F)).rejects.toThrow(
      new ConflictException(MESSAGE_DEJA_DESINSCRIT),
    );
    expect(m.record).not.toHaveBeenCalled();
    expect(m.mail.sendDesinscriptionFormateurEmail).not.toHaveBeenCalled();
  });

  it('un email en échec n’empêche ni la désinscription ni les autres emails', async () => {
    const m = monter();
    m.mail.sendDesinscriptionFormateurEmail.mockRejectedValueOnce(new Error('SMTP KO'));
    await expect(m.service.desinscrire(APP, F)).resolves.toMatchObject({ statut: 'SUSPENDUE' });
    expect(m.mail.sendDesinscriptionFormateurEmail).toHaveBeenCalledTimes(2);
  });
});
