import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import {
  AdminInscriptionsService,
  MESSAGE_DEJA_SUSPENDUE,
  MESSAGE_FORMATION_COMPLETE,
  MESSAGE_FORMATION_NON_OUVERTE,
  MESSAGE_PAS_SUSPENDUE,
} from './admin-inscriptions.service';

const F = 'f0000000-0000-4000-8000-000000000001';
const I = 'i0000000-0000-4000-8000-000000000001';
const ADMIN = 'a0000000-0000-4000-8000-000000000001';

interface Compte {
  id: string;
  role: string;
  statut: string;
}

interface Options {
  formation?: Record<string, unknown> | null;
  occupees?: number;
  comptes?: Record<string, Compte>;
  existantes?: Record<string, string>;
  inscription?: Record<string, unknown>;
  majLignes?: number;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- banc de test : type inféré
function monter(o: Options = {}) {
  const {
    formation = {
      id: F,
      titre: 'Back-end',
      statut: 'OUVERTE',
      capacite_max: 3,
      date_debut: null,
      date_fin: '2026-12-31',
    },
    occupees = 0,
    comptes = { 'a@x.tn': { id: 'ua', role: 'APPRENANT', statut: 'ACTIF' } },
    existantes = {},
    inscription = {
      statut: 'EN_COURS',
      apprenant_id: 'ua',
      formation_id: F,
      formation_titre: 'Back-end',
      formation_statut: 'OUVERTE',
      motif_suspension: null,
    },
    majLignes = 1,
  } = o;
  let inserts = 0;
  const query = jest.fn(async (sql: string, p: unknown[] = []): Promise<unknown> => {
    if (sql.includes('FROM formations WHERE id = $1')) return formation ? [formation] : [];
    if (sql.includes("statut <> 'SUSPENDUE'")) return [{ n: occupees + inserts }];
    if (sql.includes('FROM users WHERE lower(email)')) {
      const c = comptes[p[0] as string];
      return c ? [c] : [];
    }
    if (sql.includes('FROM inscriptions WHERE apprenant_id')) {
      const s = existantes[p[0] as string];
      return s ? [{ statut: s }] : [];
    }
    if (sql.includes('INSERT INTO inscriptions')) {
      inserts += 1;
      return [{ id: `ins-${inserts}` }];
    }
    if (sql.includes('JOIN formations f ON f.id = i.formation_id WHERE i.id')) return [inscription];
    if (sql.includes('SELECT statut::text AS statut FROM inscriptions WHERE id')) {
      return [{ statut: inscription.statut }];
    }
    if (sql.includes('UPDATE inscriptions'))
      return [Array.from({ length: majLignes }, () => ({ id: I })), majLignes];
    if (sql.includes('SELECT email, prenom FROM users'))
      return [{ email: 'a@x.tn', prenom: 'Amel' }];
    if (sql.includes('FROM inscriptions i JOIN users u')) return [{ id: I }];
    return [];
  });
  const dataSource = {
    query,
    manager: { query },
    transaction: jest.fn(async (fn: (m: { query: typeof query }) => Promise<unknown>) =>
      fn({ query }),
    ),
  } as unknown as DataSource;
  const record = jest.fn();
  const mail = {
    sendBienvenueInscriptionEmail: jest.fn(async () => undefined),
    sendStatutInscriptionEmail: jest.fn(async () => undefined),
  };
  const service = new AdminInscriptionsService(
    dataSource,
    { record } as unknown as AuditService,
    mail as unknown as MailService,
  );
  return { service, query, record, mail };
}

describe('AdminInscriptionsService (US-INSC-02)', () => {
  describe('inscrire', () => {
    it('formation verrouillée, insertion, audit, email de bienvenue', async () => {
      const m = monter();
      await m.service.inscrire(ADMIN, F, ' A@X.tn ');
      const lecture = m.query.mock.calls.find((c) =>
        String(c[0]).includes('FROM formations WHERE id'),
      );
      expect(String(lecture?.[0])).toContain('FOR UPDATE');
      const insert = m.query.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO inscriptions'),
      );
      expect(insert?.[1]).toEqual(['ua', F, '2026-12-31']);
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INSCRIPTION_AJOUTEE', acteur: ADMIN, cible: 'ins-1' }),
      );
      expect(m.mail.sendBienvenueInscriptionEmail).toHaveBeenCalledWith(
        'a@x.tn',
        expect.objectContaining({ titreFormation: 'Back-end' }),
      );
    });

    it('refus traduits en HTTP, sans insertion', async () => {
      const cas: Array<[Options, string, unknown]> = [
        [{ comptes: {} }, 'a@x.tn', NotFoundException],
        [
          { comptes: { 'a@x.tn': { id: 'ua', role: 'FORMATEUR', statut: 'ACTIF' } } },
          'a@x.tn',
          ConflictException,
        ],
        [
          { comptes: { 'a@x.tn': { id: 'ua', role: 'APPRENANT', statut: 'DESACTIVE' } } },
          'a@x.tn',
          ConflictException,
        ],
        [{ existantes: { ua: 'EN_COURS' } }, 'a@x.tn', ConflictException],
        [{ existantes: { ua: 'SUSPENDUE' } }, 'a@x.tn', ConflictException],
        [{ occupees: 3 }, 'a@x.tn', ConflictException],
        [{}, 'pas-un-email', BadRequestException],
      ];
      for (const [opts, email, type] of cas) {
        const m = monter(opts);
        await expect(m.service.inscrire(ADMIN, F, email)).rejects.toBeInstanceOf(type as never);
        expect(m.query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false);
        expect(m.record).not.toHaveBeenCalled();
      }
      await expect(monter({ occupees: 3 }).service.inscrire(ADMIN, F, 'a@x.tn')).rejects.toThrow(
        MESSAGE_FORMATION_COMPLETE,
      );
    });

    it('formation non ouverte -> 409 ; inconnue -> 404', async () => {
      const fermee = {
        id: F,
        titre: 'T',
        statut: 'FERMEE',
        capacite_max: 3,
        date_debut: null,
        date_fin: null,
      };
      await expect(
        monter({ formation: fermee }).service.inscrire(ADMIN, F, 'a@x.tn'),
      ).rejects.toThrow(MESSAGE_FORMATION_NON_OUVERTE);
      await expect(
        monter({ formation: null }).service.inscrire(ADMIN, F, 'a@x.tn'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('suspendre / réactiver', () => {
    it('suspendre : UPDATE conditionnel EN_COURS, motif nettoyé, audit, email', async () => {
      const m = monter();
      await m.service.suspendre(ADMIN, I, '  Absences  ');
      const maj = m.query.mock.calls.find((c) => String(c[0]).includes('UPDATE inscriptions'));
      expect(String(maj?.[0])).toContain("WHERE id = $1 AND statut = 'EN_COURS'");
      expect(maj?.[1]).toEqual([I, 'Absences', ADMIN]);
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSCRIPTION_SUSPENDUE',
          detailsAvantApres: expect.objectContaining({ motif: 'Absences' }),
        }),
      );
      expect(m.mail.sendStatutInscriptionEmail).toHaveBeenCalledWith(
        'a@x.tn',
        expect.objectContaining({ suspendue: true, motif: 'Absences' }),
      );
    });

    it('suspendre : déjà suspendue -> 409, sans trace', async () => {
      const m = monter({
        majLignes: 0,
        inscription: { statut: 'SUSPENDUE', formation_statut: 'OUVERTE' },
      });
      await expect(m.service.suspendre(ADMIN, I, 'x')).rejects.toThrow(MESSAGE_DEJA_SUSPENDUE);
      expect(m.record).not.toHaveBeenCalled();
    });

    it('réactiver : capacité vérifiée sous verrou, motif effacé, audit, email', async () => {
      const m = monter({
        occupees: 2,
        inscription: {
          statut: 'SUSPENDUE',
          apprenant_id: 'ua',
          formation_id: F,
          formation_titre: 'Back-end',
          formation_statut: 'OUVERTE',
          motif_suspension: 'Absences',
        },
      });
      await m.service.reactiver(ADMIN, I);
      const maj = m.query.mock.calls.find((c) => String(c[0]).includes('UPDATE inscriptions'));
      expect(String(maj?.[0])).toContain('motif_suspension = NULL');
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSCRIPTION_REACTIVEE',
          detailsAvantApres: expect.objectContaining({ motifPrecedent: 'Absences' }),
        }),
      );
      expect(m.mail.sendStatutInscriptionEmail).toHaveBeenCalledWith(
        'a@x.tn',
        expect.objectContaining({ suspendue: false }),
      );
    });

    it('réactiver : pas suspendue -> 409 ; formation complète -> 409', async () => {
      await expect(monter().service.reactiver(ADMIN, I)).rejects.toThrow(MESSAGE_PAS_SUSPENDUE);
      const pleine = monter({
        occupees: 3,
        inscription: { statut: 'SUSPENDUE', formation_id: F, formation_statut: 'OUVERTE' },
      });
      await expect(pleine.service.reactiver(ADMIN, I)).rejects.toThrow(MESSAGE_FORMATION_COMPLETE);
      expect(
        pleine.query.mock.calls.some((c) => String(c[0]).includes('UPDATE inscriptions')),
      ).toBe(false);
    });
  });

  describe('importer', () => {
    it('rapport ligne par ligne, capacité décrémentée, doublon, une trace, emails', async () => {
      const m = monter({
        occupees: 1,
        comptes: {
          'a@x.tn': { id: 'ua', role: 'APPRENANT', statut: 'ACTIF' },
          'b@x.tn': { id: 'ub', role: 'APPRENANT', statut: 'ACTIF' },
          'c@x.tn': { id: 'uc', role: 'APPRENANT', statut: 'ACTIF' },
          'f@x.tn': { id: 'uf', role: 'FORMATEUR', statut: 'ACTIF' },
          's@x.tn': { id: 'us', role: 'APPRENANT', statut: 'ACTIF' },
        },
        existantes: { us: 'SUSPENDUE' },
      });
      const r = await m.service.importer(
        ADMIN,
        F,
        Buffer.from('email\na@x.tn\nA@x.tn\nf@x.tn\ninconnu@x.tn\nnope\ns@x.tn\nb@x.tn\nc@x.tn\n'),
      );
      expect(r.lignes.map((l) => [l.ligne, l.resultat])).toEqual([
        [2, 'INSCRIT'],
        [3, 'DOUBLON'],
        [4, 'PAS_APPRENANT'],
        [5, 'COMPTE_INCONNU'],
        [6, 'EMAIL_INVALIDE'],
        [7, 'INSCRIPTION_SUSPENDUE'],
        [8, 'INSCRIT'],
        [9, 'COMPLET'],
      ]);
      expect(r.total).toBe(8);
      expect(r.bilan.INSCRIT).toBe(2);
      expect(m.record).toHaveBeenCalledTimes(1);
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INSCRIPTIONS_IMPORTEES' }),
      );
      expect(m.mail.sendBienvenueInscriptionEmail).toHaveBeenCalledTimes(2);
    });

    it('fichier invalide -> 400 avant toute transaction ; formation fermée -> 409', async () => {
      const m = monter();
      await expect(m.service.importer(ADMIN, F, Buffer.from('\n\n'))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.query).not.toHaveBeenCalled();
      const fermee = {
        id: F,
        titre: 'T',
        statut: 'FERMEE',
        capacite_max: 3,
        date_debut: null,
        date_fin: null,
      };
      await expect(
        monter({ formation: fermee }).service.importer(ADMIN, F, Buffer.from('a@x.tn')),
      ).rejects.toThrow(MESSAGE_FORMATION_NON_OUVERTE);
    });

    it('un email en échec n’empêche pas le rapport', async () => {
      const m = monter();
      m.mail.sendBienvenueInscriptionEmail.mockRejectedValueOnce(new Error('SMTP KO'));
      await expect(m.service.importer(ADMIN, F, Buffer.from('a@x.tn'))).resolves.toMatchObject({
        total: 1,
      });
    });
  });
});
