import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SuiviFormationService } from './suivi-formation.service';

type Reponse = (params: unknown[]) => unknown[];

function source(reponses: Array<[string, Reponse]>): { ds: DataSource; query: jest.Mock } {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    const r = reponses.find(([fragment]) => sql.includes(fragment));
    return r ? r[1](params) : [];
  });
  return { ds: { query } as unknown as DataSource, query };
}

const F = 'f0000000-0000-4000-8000-000000000001';
const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const MAINTENANT = new Date('2026-11-10T12:00:00Z');
const il = (j: number): Date => new Date(MAINTENANT.getTime() - j * 86_400_000);

const FORMATION: [string, Reponse] = [
  'FROM formations WHERE id',
  (): unknown[] => [{ id: F, titre: 'Back-end', statut: 'OUVERTE' }],
];
const COMPTEURS: [string, Reponse] = [
  'AS echus',
  (): unknown[] => [{ qcm: 2, ateliers: 2, echus: ['at1', 'at2'] }],
];
const INSCRITS: [string, Reponse] = [
  'ORDER BY u.nom',
  (): unknown[] => [
    {
      id: A,
      prenom: 'Amel',
      nom: 'A',
      email: 'a@x',
      statut: 'EN_COURS',
      date_inscription: il(30),
      derniere_connexion: il(1),
      certificat: 'ACTIF',
    },
    {
      id: B,
      prenom: 'Bilel',
      nom: 'B',
      email: 'b@x',
      statut: 'EN_COURS',
      date_inscription: il(30),
      derniere_connexion: il(10),
      certificat: null,
    },
  ],
];

describe('SuiviFormationService (US-SUIVI-01)', () => {
  it('formation inconnue -> 404', async () => {
    const { ds } = source([]);
    await expect(new SuiviFormationService(ds).suivi(F)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('formation sans inscrit : KPIs à zéro, histogramme vide', async () => {
    const { ds } = source([FORMATION, COMPTEURS]);
    const s = await new SuiviFormationService(ds).suivi(F, MAINTENANT);
    expect(s.kpis).toEqual({
      inscrits: 0,
      actifs: 0,
      inactifs: 0,
      termines: 0,
      suspendus: 0,
      tauxCompletion: 0,
      scoreMoyenQcm: null,
      noteMoyenneAteliers: null,
      certifies: 0,
      alertesOuvertes: 0,
      surveillanceAExaminer: 0,
      qcmPublies: 2,
      ateliersPublies: 2,
    });
    expect(s.apprenants).toEqual([]);
    expect(s.histogramme.every((t) => t.effectif === 0)).toBe(true);
  });

  it('agrège tentatives et livrables par apprenant', async () => {
    const { ds } = source([
      FORMATION,
      COMPTEURS,
      INSCRITS,
      [
        'GROUP BY t.apprenant_id, t.qcm_id',
        (): unknown[] => [
          {
            apprenant_id: A,
            qcm_id: 'q1',
            meilleur: '80',
            reussi: true,
            notees: 2,
            derniere: il(5),
          },
          {
            apprenant_id: A,
            qcm_id: 'q2',
            meilleur: '40',
            reussi: false,
            notees: 1,
            derniere: il(4),
          },
          {
            apprenant_id: B,
            qcm_id: 'q1',
            meilleur: null,
            reussi: null,
            notees: 0,
            derniere: il(12),
          },
        ],
      ],
      [
        'LEFT JOIN corrections c ON c.livrable_id = l.id',
        (): unknown[] => [
          {
            apprenant_id: A,
            atelier_id: 'at1',
            statut: 'NOTE',
            en_retard: true,
            date_soumission: il(3),
            note: '90',
          },
        ],
      ],
    ]);
    const s = await new SuiviFormationService(ds).suivi(F, MAINTENANT);
    const [a, b] = s.apprenants;
    expect(a).toMatchObject({
      id: A,
      avancement: 50,
      qcm: { reussis: 1, passes: 2, total: 2, scoreMoyen: 60 },
      ateliers: { rendus: 1, notes: 1, total: 2, noteMoyenne: 90, enRetard: 1, nonRendus: 1 },
      moyenne: 70,
      certificat: 'ACTIF',
      risque: { inactif: false, joursSansConnexion: 1 },
    });
    expect(a.derniereActivite).toEqual(il(3));
    expect(b).toMatchObject({
      avancement: 0,
      qcm: { reussis: 0, passes: 0, scoreMoyen: null },
      ateliers: { rendus: 0, nonRendus: 2 },
      moyenne: null,
      risque: { inactif: true, joursSansConnexion: 10 },
    });
    expect(b.derniereActivite).toEqual(il(12));
    expect(s.kpis).toMatchObject({
      inscrits: 2,
      actifs: 1,
      inactifs: 1,
      tauxCompletion: 25,
      scoreMoyenQcm: 60,
      noteMoyenneAteliers: 90,
      certifies: 1,
    });
    expect(s.histogramme[7].effectif).toBe(1);
  });

  it('suspendus exclus du taux de complétion ; ni actifs ni inactifs', async () => {
    const { ds } = source([
      FORMATION,
      COMPTEURS,
      [
        'ORDER BY u.nom',
        (): unknown[] => [
          {
            id: A,
            prenom: null,
            nom: null,
            email: 'a@x',
            statut: 'SUSPENDUE',
            date_inscription: il(30),
            derniere_connexion: null,
            certificat: null,
          },
        ],
      ],
    ]);
    const s = await new SuiviFormationService(ds).suivi(F, MAINTENANT);
    expect(s.kpis).toMatchObject({
      inscrits: 1,
      suspendus: 1,
      actifs: 0,
      inactifs: 0,
      tauxCompletion: 0,
    });
  });

  it('US-SUIVI-02 : critères des alertes ouvertes par apprenant ; compteur', async () => {
    const { ds } = source([
      FORMATION,
      COMPTEURS,
      INSCRITS,
      [
        "statut = 'OUVERTE'",
        (): unknown[] => [
          { apprenant_id: B, critere: 'ECHECS_QCM' },
          { apprenant_id: B, critere: 'INACTIVITE' },
        ],
      ],
    ]);
    const s = await new SuiviFormationService(ds).suivi(F, MAINTENANT);
    expect(s.apprenants.map((a) => a.alertes)).toEqual([[], ['ECHECS_QCM', 'INACTIVITE']]);
    expect(s.kpis.alertesOuvertes).toBe(2);
  });

  it('US-QCM-17 : alertes de surveillance par apprenant (toutes, à examiner) ; compteur', async () => {
    const { ds, query } = source([
      FORMATION,
      COMPTEURS,
      INSCRITS,
      [
        'FROM evenements_surveillance e',
        (): unknown[] => [{ apprenant_id: B, alertes: 3, a_examiner: 2 }],
      ],
    ]);
    const s = await new SuiviFormationService(ds).suivi(F, MAINTENANT);
    expect(s.apprenants.map((a) => a.surveillance)).toEqual([
      { alertes: 0, aExaminer: 0 },
      { alertes: 3, aExaminer: 2 },
    ]);
    expect(s.kpis.surveillanceAExaminer).toBe(2);
    const appel = query.mock.calls.find(([sql]) =>
      (sql as string).includes('evenements_surveillance'),
    ) as [string, unknown[]];
    expect(appel[0]).toContain("count(*) FILTER (WHERE e.statut = 'NOUVEAU')");
    expect(appel[0]).toContain('m.formation_id = $1');
    expect(appel[1]).toEqual([F, null]);
  });

  describe('fiche', () => {
    it('apprenant non inscrit -> 404', async () => {
      const { ds } = source([FORMATION]);
      await expect(new SuiviFormationService(ds).fiche(F, A)).rejects.toEqual(
        new NotFoundException('Apprenant non inscrit à cette formation.'),
      );
    });

    it('détail, agrégat limité aux évaluations publiées, chronologie décroissante', async () => {
      const { ds, query } = source([
        FORMATION,
        COMPTEURS,
        [
          'i.apprenant_id = $2',
          (): unknown[] => [
            {
              id: A,
              prenom: 'Amel',
              nom: 'A',
              email: 'a@x',
              statut: 'EN_COURS',
              date_inscription: il(30),
              derniere_connexion: il(1),
              certificat: 'ACTIF',
            },
          ],
        ],
        [
          'FROM tentatives_qcm t\n           JOIN qcm q',
          (): unknown[] => [
            {
              id: 't2',
              qcm_id: 'q1',
              qcm_titre: 'Q1',
              date_debut: il(5),
              date_fin: il(5),
              duree_effective: 600,
              score: '80',
              est_reussie: true,
              statut: 'NOTEE',
              publie: true,
            },
            {
              id: 't1',
              qcm_id: 'q1',
              qcm_titre: 'Q1',
              date_debut: il(6),
              date_fin: il(6),
              duree_effective: 500,
              score: '50',
              est_reussie: false,
              statut: 'NOTEE',
              publie: true,
            },
            {
              id: 't0',
              qcm_id: 'qx',
              qcm_titre: 'Ancien',
              date_debut: il(20),
              date_fin: il(20),
              duree_effective: 100,
              score: '99',
              est_reussie: true,
              statut: 'NOTEE',
              publie: false,
            },
          ],
        ],
        [
          'FROM livrables l\n           JOIN ateliers a',
          (): unknown[] => [
            {
              id: 'l1',
              atelier_id: 'at1',
              atelier_titre: 'API',
              version: 1,
              date_soumission: il(4),
              en_retard: false,
              statut: 'NOTE',
              note: '75',
              date_finalisation: il(2),
              publie: true,
            },
          ],
        ],
        [
          'FROM certificats c WHERE formation_id',
          (): unknown[] => [
            { id: 'c1', statut: 'ACTIF', score_final: '77.5', date_generation: il(1) },
          ],
        ],
      ]);
      const f = await new SuiviFormationService(ds).fiche(F, A, MAINTENANT);
      expect(query.mock.calls.every(([, p]) => (p as unknown[])[0] === F)).toBe(true);
      expect(f.apprenant).toMatchObject({
        qcm: { reussis: 1, passes: 1, scoreMoyen: 80 },
        ateliers: { notes: 1, noteMoyenne: 75, nonRendus: 1 },
        avancement: 50,
        moyenne: 77.5,
      });
      // US-QCM-17 : alertes de surveillance de cet apprenant seulement.
      expect(f.apprenant.surveillance).toEqual({ alertes: 0, aExaminer: 0 });
      const surv = query.mock.calls.find(([sql]) =>
        (sql as string).includes('evenements_surveillance'),
      ) as [string, unknown[]];
      expect(surv[1]).toEqual([F, A]);
      expect(f.tentatives.map((t) => t.id)).toEqual(['t2', 't1', 't0']);
      expect(f.tentatives[0]).toEqual({
        id: 't2',
        qcmId: 'q1',
        qcmTitre: 'Q1',
        dateDebut: il(5),
        dateFin: il(5),
        dureeEffective: 600,
        score: 80,
        reussie: true,
        statut: 'NOTEE',
      });
      expect(f.livrables[0]).toMatchObject({ note: 75, version: 1 });
      expect(f.certificat).toEqual({
        id: 'c1',
        statut: 'ACTIF',
        scoreFinal: 77.5,
        dateGeneration: il(1),
      });
      expect(f.chronologie.map((e) => e.type)).toEqual([
        'CERTIFICAT',
        'CORRECTION',
        'LIVRABLE',
        'TENTATIVE',
        'TENTATIVE',
        'TENTATIVE',
        'INSCRIPTION',
      ]);
      expect(f.chronologie[3].libelle).toBe('QCM « Q1 » : 80 / 100 (réussi)');
      const dates = f.chronologie.map((e) => e.date.getTime());
      expect([...dates].sort((x, y) => y - x)).toEqual(dates);
    });
  });
});
