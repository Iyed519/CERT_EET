import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CritereAlerte } from '../../database/enums/critere-alerte.enum';
import { Role } from '../../database/enums/role.enum';
import { StatutAlerte } from '../../database/enums/statut-alerte.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AlertesBalayageService } from './alertes-balayage.service';
import { AlertesDecrochageService, JOURS_REPIT } from './alertes-decrochage.service';
import { SUGGESTIONS } from './alertes.regles';

type Reponse = (params: unknown[]) => unknown[];

const F = 'f0000000-0000-4000-8000-000000000001';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const MAINTENANT = new Date('2026-11-10T12:00:00Z');
const il = (jours: number): Date => new Date(MAINTENANT.getTime() - jours * 86_400_000);

function monter(
  reponses: Array<[string, Reponse]>,
  email = true,
): {
  service: AlertesDecrochageService;
  query: jest.Mock;
  record: jest.Mock;
  mail: jest.Mock;
} {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    const r = reponses.find(([fragment]) => sql.includes(fragment));
    return r ? r[1](params) : [];
  });
  const record = jest.fn().mockResolvedValue(undefined);
  const mail = jest.fn().mockResolvedValue(undefined);
  const service = new AlertesDecrochageService(
    { query } as unknown as DataSource,
    { record } as unknown as AuditService,
    { sendAlertesDecrochageEmail: mail } as unknown as MailService,
    { get: () => ({ email }) } as unknown as ConfigService,
  );
  return { service, query, record, mail };
}

const INSCRITS: [string, Reponse] = [
  "WHERE i.statut = 'EN_COURS'",
  (): unknown[] => [
    { formation_id: F, apprenant_id: A, date_inscription: il(30), derniere_connexion: il(1) },
    { formation_id: F, apprenant_id: B, date_inscription: il(30), derniere_connexion: il(9) },
  ],
];
const NOTES: [string, Reponse] = [
  'UNION ALL',
  (): unknown[] => [
    {
      formation_id: F,
      apprenant_id: A,
      type: 'QCM',
      titre: 'Q1',
      valeur: '30',
      date: il(5),
      reussie: false,
    },
    {
      formation_id: F,
      apprenant_id: A,
      type: 'QCM',
      titre: 'Q2',
      valeur: '20',
      date: il(4),
      reussie: false,
    },
    {
      formation_id: F,
      apprenant_id: A,
      type: 'ATELIER',
      titre: 'At',
      valeur: '95',
      date: il(6),
      reussie: null,
    },
  ],
];

describe('AlertesDecrochageService (US-SUIVI-02)', () => {
  describe('detecter', () => {
    it('inactivité, échecs consécutifs, chute ; rien pour qui ne remplit aucun critère', async () => {
      const { service } = monter([INSCRITS, NOTES]);
      const c = await service.detecter(MAINTENANT);
      expect(c.map((x) => [x.apprenantId, x.critere])).toEqual([
        [A, CritereAlerte.ECHECS_QCM],
        [A, CritereAlerte.SCORE_EN_CHUTE],
        [B, CritereAlerte.INACTIVITE],
      ]);
      expect(c[2].donnees).toEqual({
        joursSansConnexion: 9,
        derniereConnexion: il(9).toISOString(),
      });
    });

    it('aucun inscrit : aucune alerte', async () => {
      const { service } = monter([NOTES]);
      expect(await service.detecter(MAINTENANT)).toEqual([]);
    });

    it('livrable en retard : seulement les ateliers échus après l’inscription, non rendus', async () => {
      const { service } = monter([
        [
          "WHERE i.statut = 'EN_COURS'",
          (): unknown[] => [
            {
              formation_id: F,
              apprenant_id: A,
              date_inscription: il(10),
              derniere_connexion: il(1),
            },
          ],
        ],
        [
          'SELECT m.formation_id, a.id, a.titre, a.date_limite',
          (): unknown[] => [
            { formation_id: F, id: 'avant', titre: 'Avant inscription', date_limite: il(20) },
            { formation_id: F, id: 'rendu', titre: 'Rendu', date_limite: il(5) },
            { formation_id: F, id: 'manque', titre: 'Manquant', date_limite: il(3) },
            { formation_id: F, id: 'recent', titre: 'Échu hier', date_limite: il(1) },
          ],
        ],
        [
          'SELECT m.formation_id, l.apprenant_id, l.atelier_id',
          (): unknown[] => [{ formation_id: F, apprenant_id: A, atelier_id: 'rendu' }],
        ],
      ]);
      const c = await service.detecter(MAINTENANT);
      expect(c).toHaveLength(1);
      expect(c[0].critere).toBe(CritereAlerte.LIVRABLE_EN_RETARD);
      expect((c[0].donnees.ateliers as Array<{ id: string }>).map((a) => a.id)).toEqual(['manque']);
    });
  });

  describe('balayer', () => {
    const INSERT = 'INSERT INTO alertes_decrochage';

    it('crée, trace et notifie ; ignore un doublon (ON CONFLICT) ; paramètres de répit', async () => {
      let n = 0;
      const { service, query, record, mail } = monter([
        INSCRITS,
        NOTES,
        // 1re et 3e insertions acceptées, 2e en conflit (alerte déjà ouverte).
        [INSERT, (): unknown[] => (++n === 2 ? [] : [{ id: `alerte-${n}` }])],
        [
          'FROM formation_formateurs ff',
          (): unknown[] => [
            {
              formateur_email: 'f1@x',
              formateur_prenom: 'Sami',
              formation_id: F,
              titre: 'Back-end',
            },
            { formateur_email: 'f2@x', formateur_prenom: null, formation_id: F, titre: 'Back-end' },
          ],
        ],
        [
          'FROM users WHERE id = ANY',
          (): unknown[] => [
            { id: A, prenom: 'Amel', nom: 'A', email: 'a@x' },
            { id: B, prenom: null, nom: null, email: 'b@x' },
          ],
        ],
      ]);
      const creees = await service.balayer(MAINTENANT);
      expect(creees.map((c) => c.critere)).toEqual([
        CritereAlerte.ECHECS_QCM,
        CritereAlerte.INACTIVITE,
      ]);
      const inserts = query.mock.calls.filter(([sql]) => (sql as string).includes(INSERT));
      expect(inserts).toHaveLength(3);
      expect(inserts[0][1]).toEqual([
        F,
        A,
        CritereAlerte.ECHECS_QCM,
        expect.any(String),
        SUGGESTIONS[CritereAlerte.ECHECS_QCM],
        MAINTENANT.toISOString(),
        JOURS_REPIT,
      ]);
      expect(JSON.parse(inserts[0][1][3] as string).tentatives).toHaveLength(2);
      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledWith({
        action: 'ALERTE_DECROCHAGE_CREEE',
        acteur: null,
        cible: 'alerte-1',
        resultat: 'Succès',
        detailsAvantApres: { formationId: F, apprenantId: A, critere: CritereAlerte.ECHECS_QCM },
      });
      expect(mail).toHaveBeenCalledTimes(2);
      expect(mail).toHaveBeenCalledWith('f1@x', {
        prenom: 'Sami',
        alertes: [
          { apprenant: 'Amel A', formation: 'Back-end', critere: CritereAlerte.ECHECS_QCM },
          { apprenant: 'b@x', formation: 'Back-end', critere: CritereAlerte.INACTIVITE },
        ],
      });
    });

    it('rien de nouveau : ni audit ni email', async () => {
      const { service, query, record, mail } = monter([
        INSCRITS,
        NOTES,
        [INSERT, (): unknown[] => []],
      ]);
      expect(await service.balayer(MAINTENANT)).toEqual([]);
      expect(record).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([q]) => (q as string).includes('formation_formateurs'))).toBe(
        false,
      );
      expect(mail).not.toHaveBeenCalled();
    });

    it('email désactivé : alertes créées sans email', async () => {
      const { service, mail } = monter(
        [
          INSCRITS,
          [INSERT, (): unknown[] => [{ id: 'x' }]],
          [
            'FROM formation_formateurs ff',
            (): unknown[] => [
              { formateur_email: 'f1@x', formateur_prenom: null, formation_id: F, titre: 'T' },
            ],
          ],
        ],
        false,
      );
      expect(await service.balayer(MAINTENANT)).toHaveLength(1);
      expect(mail).not.toHaveBeenCalled();
    });

    it('échec d’envoi : journalisé, les alertes restent créées', async () => {
      const { service, mail } = monter([
        INSCRITS,
        [INSERT, (): unknown[] => [{ id: 'x' }]],
        [
          'FROM formation_formateurs ff',
          (): unknown[] => [
            { formateur_email: 'f1@x', formateur_prenom: null, formation_id: F, titre: 'T' },
          ],
        ],
      ]);
      mail.mockRejectedValueOnce(new Error('SMTP en panne'));
      expect(await service.balayer(MAINTENANT)).toHaveLength(1);
      expect(mail).toHaveBeenCalledTimes(1);
    });
  });

  describe('lister / compteur', () => {
    it('formateur : restreint à ses affectations ; filtres statut et formation', async () => {
      const { service, query } = monter([
        [
          'FROM alertes_decrochage a',
          (): unknown[] => [
            {
              id: 'x',
              critere: 'INACTIVITE',
              statut: 'OUVERTE',
              donnees: { joursSansConnexion: 9 },
              suggestion: 's',
              date_creation: il(1),
              date_traitement: null,
              formation_id: F,
              titre: 'Back-end',
              apprenant_id: B,
              prenom: 'B',
              nom: null,
              email: 'b@x',
            },
          ],
        ],
      ]);
      const liste = await service.lister(
        { sub: 'form-1', role: Role.FORMATEUR },
        { statut: StatutAlerte.OUVERTE, formationId: F },
      );
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('formation_formateurs WHERE formateur_id = $1');
      expect(sql).toContain('a.statut = $2');
      expect(sql).toContain('a.formation_id = $3');
      expect(params).toEqual(['form-1', StatutAlerte.OUVERTE, F]);
      expect(liste[0]).toEqual({
        id: 'x',
        critere: 'INACTIVITE',
        statut: 'OUVERTE',
        donnees: { joursSansConnexion: 9 },
        suggestion: 's',
        dateCreation: il(1),
        dateTraitement: null,
        formation: { id: F, titre: 'Back-end' },
        apprenant: { id: B, prenom: 'B', nom: null, email: 'b@x' },
      });
    });

    it('administrateur : toutes les formations, sans filtre', async () => {
      const { service, query } = monter([]);
      await service.lister({ sub: 'adm', role: Role.ADMINISTRATEUR });
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('formation_formateurs');
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('compteur : ouvertes, restreint pour un formateur', async () => {
      const { service, query } = monter([["statut = 'OUVERTE'", (): unknown[] => [{ n: 4 }]]]);
      expect(await service.compteur({ sub: 'form-1', role: Role.FORMATEUR })).toEqual({
        ouvertes: 4,
      });
      expect(query.mock.calls[0][0]).toContain('formateur_id = $1');
      await service.compteur({ sub: 'adm', role: Role.ADMINISTRATEUR });
      expect(query.mock.calls[1][0]).not.toContain('formateur_id');
    });
  });
});

describe('AlertesBalayageService (US-SUIVI-02)', () => {
  const config = (nodeEnv: string, balayageActif = true): ConfigService =>
    ({
      getOrThrow: (cle: string) =>
        cle === 'app' ? { nodeEnv } : { balayageActif, intervalleMinutes: 60, email: true },
    }) as unknown as ConfigService;

  afterEach(() => jest.useRealTimers());

  it('désactivé en test et par configuration ; actif sinon (minuteur)', () => {
    jest.useFakeTimers();
    const balayer = jest.fn().mockResolvedValue([]);
    const alertes = { balayer } as unknown as AlertesDecrochageService;
    for (const [env, actif] of [
      ['test', true],
      ['production', false],
    ] as Array<[string, boolean]>) {
      const s = new AlertesBalayageService(config(env, actif), alertes);
      s.onModuleInit();
      jest.advanceTimersByTime(3_600_000);
      s.onModuleDestroy();
    }
    expect(balayer).not.toHaveBeenCalled();
    const s = new AlertesBalayageService(config('production'), alertes);
    s.onModuleInit();
    jest.advanceTimersByTime(3_600_000);
    expect(balayer).toHaveBeenCalledTimes(1);
    s.onModuleDestroy();
    jest.advanceTimersByTime(3_600_000);
    expect(balayer).toHaveBeenCalledTimes(1);
  });

  it('tourner : un seul balayage à la fois ; erreur journalisée, 0', async () => {
    let fin!: (v: unknown[]) => void;
    const balayer = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (fin = r)))
      .mockRejectedValueOnce(new Error('base indisponible'));
    const s = new AlertesBalayageService(config('production'), {
      balayer,
    } as unknown as AlertesDecrochageService);
    const premier = s.tourner();
    expect(await s.tourner()).toBe(0);
    fin([{}, {}]);
    expect(await premier).toBe(2);
    expect(await s.tourner()).toBe(0);
    expect(balayer).toHaveBeenCalledTimes(2);
  });
});
