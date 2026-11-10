import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MESSAGE_PERIODE_INVERSEE } from './periode.regles';
import {
  ACTIONS_CONNEXION,
  JOURS_LIVRABLE_EN_ATTENTE,
  NB_ACTIVITE_RECENTE,
  TableauDeBordService,
  repartition,
} from './tableau-de-bord.service';

type Reponse = (sql: string, params: unknown[]) => unknown[];

/** DataSource factice : chaque requête est reconnue par un fragment de SQL. */
function source(reponses: Array<[string, Reponse]>): { ds: DataSource; query: jest.Mock } {
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    const trouvee = reponses.find(([fragment]) => sql.includes(fragment));
    return trouvee ? trouvee[1](sql, params) : [];
  });
  return { ds: { query } as unknown as DataSource, query };
}

const VIDE: Array<[string, Reponse]> = [
  [
    'FROM tentatives_qcm',
    (): unknown[] => [{ notees: 0, reussies: 0, moyenne: null, en_cours: 0 }],
  ],
  ['AS en_correction', (): unknown[] => [{ soumis: 0, en_attente: 0, en_correction: 0 }]],
  ['FROM corrections', (): unknown[] => [{ finalisees: 0, moyenne: null }]],
  ["action = 'CERTIFICAT_VERIFIE'", (): unknown[] => [{ n: 0 }]],
  [
    'AS bloques',
    (): unknown[] => [{ bloques: 0, supports: 0, generations: 0, demandes: 0, livrables: 0 }],
  ],
];

describe('TableauDeBordService (US-DASH-01)', () => {
  it('repartition : toutes les valeurs à zéro puis les comptes', () => {
    expect(repartition(['A', 'B'], [{ cle: 'B', n: 3 }])).toEqual({ A: 0, B: 3 });
  });

  it('période vide : indicateurs à zéro, moyennes nulles, aucune alerte', async () => {
    const { ds } = source(VIDE);
    const t = await new TableauDeBordService(ds).global('2001-01-01', '2001-01-31');
    expect(t.periode).toEqual({ du: '2001-01-01', au: '2001-01-31', jours: 31 });
    expect(t.utilisateurs).toEqual({
      parRole: { APPRENANT: 0, FORMATEUR: 0, ADMINISTRATEUR: 0 },
      parStatut: { EN_ATTENTE_ACTIVATION: 0, ACTIF: 0, DESACTIVE: 0, ANONYMISE: 0 },
      total: 0,
      nouveaux: 0,
      connectes: 0,
    });
    expect(t.formations).toEqual({
      parStatut: { OUVERTE: 0, FERMEE: 0, ARCHIVEE: 0 },
      total: 0,
      nouvelles: 0,
    });
    expect(t.inscriptions.total).toBe(0);
    expect(t.evaluations).toEqual({
      qcm: { tentativesNotees: 0, reussies: 0, tauxReussite: 0, scoreMoyen: null, enCours: 0 },
      ateliers: {
        livrablesSoumis: 0,
        correctionsFinalisees: 0,
        noteMoyenne: null,
        enAttenteCorrection: 0,
        enCorrection: 0,
      },
    });
    expect(t.certificats).toEqual({
      parStatut: { EN_ATTENTE_GENERATION: 0, EN_GENERATION: 0, ACTIF: 0, REVOQUE: 0, EXPIRE: 0 },
      emis: 0,
      revoques: 0,
      consultations: 0,
    });
    expect(t.activite).toEqual([]);
    expect(t.activiteRecente).toEqual([]);
    expect(t.alertes).toEqual([]);
  });

  it('agrège les blocs ; un compte anonymisé ne compte dans aucun rôle', async () => {
    const date = new Date('2026-11-01T10:00:00Z');
    const { ds } = source([
      [
        'FROM users GROUP BY',
        (): unknown[] => [
          { role: 'APPRENANT', statut: 'ACTIF', n: 5, nouveaux: 2, connectes: 4 },
          { role: 'APPRENANT', statut: 'ANONYMISE', n: 1, nouveaux: 0, connectes: 0 },
          { role: 'FORMATEUR', statut: 'ACTIF', n: 2, nouveaux: 1, connectes: 1 },
          { role: 'ADMINISTRATEUR', statut: 'DESACTIVE', n: 1, nouveaux: 0, connectes: 0 },
        ],
      ],
      [
        'FROM formations GROUP BY',
        (): unknown[] => [
          { cle: 'OUVERTE', n: 3, nouvelles: 1 },
          { cle: 'ARCHIVEE', n: 1, nouvelles: 0 },
        ],
      ],
      ['FROM inscriptions GROUP BY', (): unknown[] => [{ cle: 'EN_COURS', n: 7, nouvelles: 4 }]],
      [
        'FROM tentatives_qcm',
        (): unknown[] => [{ notees: 3, reussies: 2, moyenne: '71.666', en_cours: 1 }],
      ],
      ['AS en_correction', (): unknown[] => [{ soumis: 4, en_attente: 2, en_correction: 1 }]],
      ['FROM corrections', (): unknown[] => [{ finalisees: 2, moyenne: '80.5' }]],
      [
        'FROM certificats GROUP BY',
        (): unknown[] => [
          { cle: 'ACTIF', n: 5, emis: 3, revoques: 0 },
          { cle: 'REVOQUE', n: 1, emis: 1, revoques: 1 },
        ],
      ],
      ["action = 'CERTIFICAT_VERIFIE'", (): unknown[] => [{ n: 9 }]],
      [
        'generate_series',
        (): unknown[] => [{ jour: '2026-11-01', evenements: 4, connexions: 2, echecs: 1 }],
      ],
      [
        'LEFT JOIN users u',
        (): unknown[] => [
          {
            horodatage: date,
            action: 'LOGIN',
            resultat: 'Succès',
            email: 'a@x',
            prenom: 'A',
            nom: null,
          },
          {
            horodatage: date,
            action: 'CERTIFICAT_VERIFIE',
            resultat: 'Succès',
            email: null,
            prenom: null,
            nom: null,
          },
        ],
      ],
      [
        'AS bloques',
        (): unknown[] => [{ bloques: 2, supports: 0, generations: 1, demandes: 3, livrables: 0 }],
      ],
    ]);
    const t = await new TableauDeBordService(ds).global('2026-11-01', '2026-11-10');
    expect(t.utilisateurs.parRole).toEqual({ APPRENANT: 5, FORMATEUR: 2, ADMINISTRATEUR: 1 });
    expect(t.utilisateurs.parStatut).toEqual({
      EN_ATTENTE_ACTIVATION: 0,
      ACTIF: 7,
      DESACTIVE: 1,
      ANONYMISE: 1,
    });
    expect(t.utilisateurs.total).toBe(8);
    expect(t.utilisateurs.nouveaux).toBe(3);
    expect(t.utilisateurs.connectes).toBe(5);
    expect(t.formations).toEqual({
      parStatut: { OUVERTE: 3, FERMEE: 0, ARCHIVEE: 1 },
      total: 4,
      nouvelles: 1,
    });
    expect(t.inscriptions).toEqual({
      parStatut: { EN_COURS: 7, TERMINEE: 0, SUSPENDUE: 0 },
      total: 7,
      nouvelles: 4,
    });
    expect(t.evaluations.qcm).toEqual({
      tentativesNotees: 3,
      reussies: 2,
      tauxReussite: 66.7,
      scoreMoyen: 71.67,
      enCours: 1,
    });
    expect(t.evaluations.ateliers).toEqual({
      livrablesSoumis: 4,
      correctionsFinalisees: 2,
      noteMoyenne: 80.5,
      enAttenteCorrection: 2,
      enCorrection: 1,
    });
    expect(t.certificats.emis).toBe(4);
    expect(t.certificats.revoques).toBe(1);
    expect(t.certificats.consultations).toBe(9);
    expect(t.certificats.parStatut.ACTIF).toBe(5);
    expect(t.activite).toHaveLength(1);
    expect(t.activiteRecente).toEqual([
      {
        horodatage: date,
        action: 'LOGIN',
        resultat: 'Succès',
        acteur: { email: 'a@x', prenom: 'A', nom: null },
      },
      { horodatage: date, action: 'CERTIFICAT_VERIFIE', resultat: 'Succès', acteur: null },
    ]);
    expect(t.alertes).toEqual([
      { code: 'CERTIFICATS_BLOQUES', nombre: 2 },
      { code: 'GENERATIONS_EN_ECHEC', nombre: 1 },
      { code: 'DEMANDES_ROLE_EN_ATTENTE', nombre: 3 },
    ]);
  });

  it('paramètres SQL : bornes de période, actions de connexion, seuil des livrables', async () => {
    const { ds, query } = source(VIDE);
    await new TableauDeBordService(ds).global('2026-01-01', '2026-01-31');
    const appels = query.mock.calls as Array<[string, unknown[]]>;
    expect(appels).toHaveLength(11);
    for (const [, params] of appels)
      expect(params.slice(0, 2)).toEqual(['2026-01-01', '2026-01-31']);
    const serie = appels.find(([sql]) => sql.includes('generate_series'));
    expect(serie?.[1][2]).toEqual(ACTIONS_CONNEXION);
    const alertes = appels.find(([sql]) => sql.includes('AS bloques'));
    expect(alertes?.[1][2]).toBe(JOURS_LIVRABLE_EN_ATTENTE);
    const recente = appels.find(([sql]) => sql.includes('LEFT JOIN users u'));
    expect(recente?.[0]).toContain(`LIMIT ${NB_ACTIVITE_RECENTE}`);
    // Bornes en jours de Tunis, fin exclusive au lendemain du dernier jour.
    expect(appels[0][0]).toContain("($1::date)::timestamp AT TIME ZONE 'Africa/Tunis'");
    expect(appels[0][0]).toContain("(($2::date) + 1)::timestamp AT TIME ZONE 'Africa/Tunis'");
  });

  it('période invalide -> 400 avant toute requête', async () => {
    const { ds, query } = source(VIDE);
    await expect(new TableauDeBordService(ds).global('2026-02-02', '2026-02-01')).rejects.toEqual(
      new BadRequestException(MESSAGE_PERIODE_INVERSEE),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('période par défaut : 30 jours se terminant aujourd’hui (Tunis)', () => {
    const { ds } = source(VIDE);
    const p = new TableauDeBordService(ds).periode(
      undefined,
      undefined,
      new Date('2026-11-09T23:30:00Z'),
    );
    expect(p).toEqual({ du: '2026-10-12', au: '2026-11-10', jours: 30 });
  });
});
