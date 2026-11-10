import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { FormatRapport } from '../../database/enums/rapport.enum';
import { MailService } from '../../mail/mail.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { SuiviFormationService } from '../pilotage/suivi-formation.service';
import { FileRapportsService } from './file-rapports.service';
import {
  MESSAGE_LIMITE_RAPPORTS,
  MESSAGE_RAPPORT_INTROUVABLE,
  MESSAGE_RAPPORT_NON_PRET,
  RapportsService,
} from './rapports.service';

const MOI = 'u0000000-0000-4000-8000-000000000001';
const AUTRE = 'u0000000-0000-4000-8000-000000000002';
const FORM = 'f0000000-0000-4000-8000-000000000001';
const R = 'r0000000-0000-4000-8000-000000000001';
const D = new Date('2026-11-10T10:00:00Z');

function ligne(p: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: R,
    type: 'SESSION',
    format: 'CSV',
    statut: 'PRET',
    parametres: { portee: 'GLOBAL' },
    formation_id: FORM,
    titre: 'Back-end',
    nom_fichier: 'r.csv',
    taille_octets: 10,
    empreinte_sha256: 'a'.repeat(64),
    derniere_erreur: null,
    date_demande: D,
    date_fin: D,
    demandeur_id: MOI,
    cle_stockage: `rapports/${R}/r.csv`,
    ...p,
  };
}

interface Options {
  recents?: number;
  inscrit?: boolean;
  module?: boolean;
  rapport?: Record<string, unknown> | null;
  prise?: Record<string, unknown> | null;
  lireEchoue?: boolean;
  deposerEchoue?: boolean;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- banc de test : type inféré
function monter(o: Options = {}) {
  const {
    recents = 0,
    inscrit = true,
    module = true,
    rapport = ligne(),
    prise = {
      format: 'CSV',
      demandeur_id: MOI,
      formation_id: FORM,
      parametres: { portee: 'GLOBAL' },
    },
    lireEchoue = false,
    deposerEchoue = false,
  } = o;
  const tx = jest.fn(async (sql: string, params?: unknown[]) => {
    void params;
    if (sql.includes('pg_advisory_xact_lock')) return [{}];
    if (sql.includes('count(*)')) return [{ n: recents }];
    if (sql.includes('INSERT INTO rapports')) return [{ id: R }];
    return [];
  });
  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown> => {
    void params;
    if (sql.includes('FROM inscriptions WHERE')) return inscrit ? [{}] : [];
    if (sql.includes('FROM modules WHERE id = $1 AND formation_id')) {
      return module ? [{ id: 'm', titre: 'M', ordre: 1 }] : [];
    }
    if (sql.includes("SET statut = 'EN_COURS'")) return [prise ? [prise] : [], prise ? 1 : 0];
    if (sql.includes("SET statut = 'ECHEC'")) {
      return [prise ? [{ demandeur_id: MOI, formation_id: FORM }] : [], prise ? 1 : 0];
    }
    if (sql.includes('UPDATE rapports')) return [[], 1];
    if (sql.includes('FROM rapports r')) return rapport ? [rapport] : [];
    if (sql.includes('SELECT titre FROM formations')) return [{ titre: 'Back-end' }];
    if (sql.includes('SELECT email, prenom FROM users')) return [{ email: 'f@x', prenom: 'Sami' }];
    return [];
  });
  const dataSource = {
    query,
    transaction: jest.fn(async (fn: (m: { query: jest.Mock }) => Promise<unknown>) =>
      fn({ query: tx }),
    ),
  } as unknown as DataSource;
  const file = { ajouter: jest.fn(), demarrerWorker: jest.fn() };
  const stockage = {
    lire: jest.fn(async () => {
      if (lireEchoue) throw new Error('S3 KO');
      return { flux: Readable.from(['x']), taille: 1 };
    }),
    deposerTampon: jest.fn(async () => {
      if (deposerEchoue) throw new Error('S3 KO');
    }),
  };
  const suivi = {
    suivi: jest.fn(async () => ({
      formation: { id: FORM, titre: 'Back-end', statut: 'OUVERTE' },
      kpis: {},
      histogramme: [],
      apprenants: [],
    })),
    fiche: jest.fn(),
  };
  const record = jest.fn();
  const mail = { sendRapportPretEmail: jest.fn(async () => undefined) };
  const service = new RapportsService(
    dataSource,
    file as unknown as FileRapportsService,
    stockage as unknown as StockageService,
    suivi as unknown as SuiviFormationService,
    { record } as unknown as AuditService,
    mail as unknown as MailService,
  );
  return { service, query, tx, file, stockage, record, mail, suivi };
}

describe('RapportsService (US-RPT-01)', () => {
  describe('demanderSession', () => {
    it('insère EN_ATTENTE sous verrou, ajoute le travail, trace la demande', async () => {
      const m = monter({ rapport: ligne({ statut: 'EN_ATTENTE' }) });
      const r = await m.service.demanderSession(MOI, FORM, {
        format: FormatRapport.CSV,
        portee: 'GLOBAL',
      });
      expect(r.statut).toBe('EN_ATTENTE');
      expect(m.tx.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
      expect(m.tx.mock.calls[0][1]).toEqual([MOI]);
      const insert = m.tx.mock.calls.find((c) => String(c[0]).includes('INSERT'));
      expect(insert?.[1]).toEqual(['CSV', MOI, FORM, JSON.stringify({ portee: 'GLOBAL' })]);
      expect(m.file.ajouter).toHaveBeenCalledWith(R);
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RAPPORT_DEMANDE', acteur: MOI, cible: R }),
      );
    });

    it('429 à la 6e demande de la minute, rien d’inséré', async () => {
      const m = monter({ recents: 5 });
      const e = await m.service
        .demanderSession(MOI, FORM, { format: FormatRapport.PDF, portee: 'GLOBAL' })
        .catch((x: unknown) => x);
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      expect((e as HttpException).message).toBe(MESSAGE_LIMITE_RAPPORTS);
      expect(m.tx.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false);
      expect(m.file.ajouter).not.toHaveBeenCalled();
    });

    it('4 demandes récentes : la 5e passe', async () => {
      const m = monter({ recents: 4 });
      await m.service.demanderSession(MOI, FORM, { format: FormatRapport.PDF, portee: 'GLOBAL' });
      expect(m.file.ajouter).toHaveBeenCalled();
    });

    it('400 : apprenantId hors INDIVIDUEL, moduleId hors MODULE', async () => {
      const m = monter();
      await expect(
        m.service.demanderSession(MOI, FORM, {
          format: FormatRapport.CSV,
          portee: 'GLOBAL',
          apprenantId: AUTRE,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        m.service.demanderSession(MOI, FORM, {
          format: FormatRapport.CSV,
          portee: 'INDIVIDUEL',
          apprenantId: AUTRE,
          moduleId: 'm',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 : apprenant non inscrit, module d’une autre formation', async () => {
      await expect(
        monter({ inscrit: false }).service.demanderSession(MOI, FORM, {
          format: FormatRapport.CSV,
          portee: 'INDIVIDUEL',
          apprenantId: AUTRE,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        monter({ module: false }).service.demanderSession(MOI, FORM, {
          format: FormatRapport.CSV,
          portee: 'MODULE',
          moduleId: 'm',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('paramètres conservés : seulement ceux de la portée', async () => {
      const m = monter();
      await m.service.demanderSession(MOI, FORM, {
        format: FormatRapport.CSV,
        portee: 'INDIVIDUEL',
        apprenantId: AUTRE,
      });
      const insert = m.tx.mock.calls.find((c) => String(c[0]).includes('INSERT'));
      expect(JSON.parse((insert?.[1] as unknown as string[])[3])).toEqual({
        portee: 'INDIVIDUEL',
        apprenantId: AUTRE,
      });
    });
  });

  describe('lecture et téléchargement', () => {
    it('404 identique pour un rapport inconnu ou d’un autre', async () => {
      await expect(monter({ rapport: null }).service.monRapport(MOI, R)).rejects.toThrow(
        MESSAGE_RAPPORT_INTROUVABLE,
      );
      await expect(
        monter({ rapport: ligne({ demandeur_id: AUTRE }) }).service.monRapport(MOI, R),
      ).rejects.toThrow(MESSAGE_RAPPORT_INTROUVABLE);
      await expect(
        monter({ rapport: ligne({ demandeur_id: AUTRE }) }).service.fichier(MOI, R),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 tant que le rapport n’est pas PRET', async () => {
      for (const statut of ['EN_ATTENTE', 'EN_COURS', 'ECHEC']) {
        const m = monter({ rapport: ligne({ statut }) });
        await expect(m.service.fichier(MOI, R)).rejects.toThrow(MESSAGE_RAPPORT_NON_PRET);
        expect(m.record).not.toHaveBeenCalled();
      }
    });

    it('PRET : flux, type MIME, nom ; trace RAPPORT_TELECHARGE', async () => {
      const m = monter({ rapport: ligne({ format: 'PDF', nom_fichier: 'r.pdf' }) });
      const f = await m.service.fichier(MOI, R, { adresseIp: '1.2.3.4' });
      expect(f.type).toBe('application/pdf');
      expect(f.nomFichier).toBe('r.pdf');
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RAPPORT_TELECHARGE',
          acteur: MOI,
          adresseIp: '1.2.3.4',
        }),
      );
    });

    it('503 si le stockage est injoignable, sans trace', async () => {
      const m = monter({ lireEchoue: true });
      await expect(m.service.fichier(MOI, R)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.record).not.toHaveBeenCalled();
    });

    it('mesRapports : filtre facultatif', async () => {
      const m = monter();
      const l = await m.service.mesRapports(MOI);
      expect(l).toHaveLength(1);
      expect(l[0].formation).toEqual({ id: FORM, titre: 'Back-end' });
      expect(m.query.mock.calls[0][1]).toEqual([MOI, null]);
      await m.service.mesRapports(MOI, FORM);
      expect(m.query.mock.calls[1][1]).toEqual([MOI, FORM]);
    });
  });

  describe('generer (worker)', () => {
    it('prend EN_ATTENTE seulement ; dépose, PRET, audit, email', async () => {
      const m = monter();
      await m.service.generer(R, D);
      const prise = m.query.mock.calls.find((c) =>
        String(c[0]).includes("SET statut = 'EN_COURS'"),
      );
      expect(String(prise?.[0])).toContain("statut = 'EN_ATTENTE'");
      const [cle, tampon, type] = m.stockage.deposerTampon.mock.calls[0] as unknown as [
        string,
        Buffer,
        string,
      ];
      expect(cle).toBe(`rapports/${R}/rapport-back-end-global-2026-11-10.csv`);
      expect(tampon.toString('utf8').startsWith('﻿nom;prenom;email')).toBe(true);
      expect(type).toBe('text/csv; charset=utf-8');
      const pret = m.query.mock.calls.find((c) => String(c[0]).includes("SET statut = 'PRET'"));
      expect(String(pret?.[0])).toContain("statut = 'EN_COURS'");
      expect(m.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RAPPORT_GENERE', cible: R }),
      );
      expect(m.mail.sendRapportPretEmail).toHaveBeenCalledWith(
        'f@x',
        expect.objectContaining({ reussi: true, titreFormation: 'Back-end' }),
      );
    });

    it('déjà pris ou terminé : rien', async () => {
      const m = monter({ prise: null });
      await m.service.generer(R, D);
      expect(m.stockage.deposerTampon).not.toHaveBeenCalled();
      expect(m.record).not.toHaveBeenCalled();
    });

    it('erreur : remis EN_ATTENTE avec l’erreur, puis relancée (reprise BullMQ)', async () => {
      const m = monter({ deposerEchoue: true });
      await expect(m.service.generer(R, D)).rejects.toThrow('S3 KO');
      const remise = m.query.mock.calls.find((c) =>
        String(c[0]).includes("SET statut = 'EN_ATTENTE'"),
      );
      expect(remise?.[1]).toEqual([R, 'S3 KO']);
      expect(m.record).not.toHaveBeenCalled();
    });

    it('un email en échec ne fait pas échouer la génération', async () => {
      const m = monter();
      m.mail.sendRapportPretEmail.mockRejectedValueOnce(new Error('SMTP KO'));
      await expect(m.service.generer(R, D)).resolves.toBeUndefined();
    });

    it('échec définitif : ECHEC, audit, email d’échec ; rien si déjà terminé', async () => {
      const m = monter();
      await m.service.echecDefinitif(R, new Error('x'.repeat(2000)));
      const echec = m.query.mock.calls.find((c) => String(c[0]).includes("SET statut = 'ECHEC'"));
      expect((echec?.[1] as unknown as string[])[1]).toHaveLength(1000);
      expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'RAPPORT_ECHEC' }));
      expect(m.mail.sendRapportPretEmail).toHaveBeenCalledWith(
        'f@x',
        expect.objectContaining({ reussi: false }),
      );
      const n = monter({ prise: null });
      await n.service.echecDefinitif(R, 'x');
      expect(n.record).not.toHaveBeenCalled();
    });
  });

  it('démarre le worker au démarrage de l’application', () => {
    const m = monter();
    m.service.onApplicationBootstrap();
    expect(m.file.demarrerWorker).toHaveBeenCalledTimes(1);
  });

  it('erreurs typées', () => {
    expect(new ConflictException(MESSAGE_RAPPORT_NON_PRET).getStatus()).toBe(409);
  });
});
