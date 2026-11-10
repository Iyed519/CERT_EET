import {
  ApprenantSuivi,
  FicheApprenant,
  SuiviFormation,
} from '../pilotage/suivi-formation.service';
import { ContenuSession, csvSession, nomFichier, pdfSession } from './rapport-session';

const D = new Date('2026-11-10T09:00:00Z');

function apprenant(p: Partial<ApprenantSuivi> = {}): ApprenantSuivi {
  return {
    id: 'u1',
    prenom: 'Amel',
    nom: 'Ben Ali',
    email: 'amel@x.tn',
    statutInscription: 'EN_COURS',
    dateInscription: D,
    derniereConnexion: D,
    derniereActivite: D,
    avancement: 50,
    qcm: { reussis: 1, passes: 2, total: 2, scoreMoyen: 72.5 },
    ateliers: { rendus: 1, notes: 1, total: 1, noteMoyenne: 80, enRetard: 0, nonRendus: 0 },
    moyenne: 76.25,
    certificat: null,
    risque: { inactif: false, joursSansConnexion: 0 },
    alertes: [],
    ...p,
  };
}

function suivi(apprenants: ApprenantSuivi[]): SuiviFormation {
  return {
    formation: { id: 'f1', titre: 'Back-end', statut: 'OUVERTE' },
    kpis: {
      inscrits: apprenants.length,
      actifs: 1,
      inactifs: 0,
      termines: 0,
      suspendus: 0,
      tauxCompletion: 50,
      scoreMoyenQcm: 72.5,
      noteMoyenneAteliers: 80,
      certifies: 0,
      alertesOuvertes: 1,
      qcmPublies: 2,
      ateliersPublies: 1,
    },
    histogramme: [{ tranche: '70–79', min: 70, max: 79, effectif: 1 }],
    apprenants,
  };
}

function lignes(c: string): string[][] {
  return c
    .replace(/^﻿/, '')
    .trimEnd()
    .split('\r\n')
    .map((l) => l.split(';'));
}

describe('rapport-session (US-RPT-01)', () => {
  it('GLOBAL / CSV : en-tête en liste blanche, une ligne par apprenant', () => {
    const c = csvSession({
      portee: 'GLOBAL',
      suivi: suivi([
        apprenant({ alertes: ['INACTIVITE', 'RETARD_LIVRABLE'], certificat: 'ACTIF' }),
        apprenant({ id: 'u2', email: '=cmd@x', prenom: null, nom: null, moyenne: null }),
      ]),
    });
    const [entete, l1, l2] = lignes(c);
    expect(entete).toContain('email');
    expect(entete).toHaveLength(19);
    expect(entete.filter((e) => /^(mot_de_passe|adresse_ip|ip|reponses?)$/.test(e))).toEqual([]);
    expect(l1.slice(0, 5)).toEqual(['Ben Ali', 'Amel', 'amel@x.tn', 'En cours', '50']);
    expect(l1[7]).toBe('72,5');
    expect(l1[13]).toBe('76,25');
    expect(l1[17]).toBe('INACTIVITE RETARD_LIVRABLE');
    expect(l1[18]).toBe('ACTIF');
    expect(l2[2]).toBe("'=cmd@x");
    expect(l2[13]).toBe('');
  });

  it('INDIVIDUEL / CSV : tentatives, livrables, alertes', () => {
    const fiche = {
      apprenant: apprenant(),
      tentatives: [
        {
          id: 't1',
          qcmId: 'q1',
          qcmTitre: 'QCM 1',
          dateDebut: D,
          dateFin: D,
          dureeEffective: 125,
          score: 60,
          reussie: true,
          statut: 'NOTEE',
        },
      ],
      livrables: [
        {
          id: 'l1',
          atelierId: 'a1',
          atelierTitre: 'API',
          version: 2,
          dateSoumission: D,
          enRetard: true,
          statut: 'CORRIGE',
          note: 80,
        },
      ],
      certificat: null,
      chronologie: [],
      alertes: [
        {
          id: 'x1',
          critere: 'INACTIVITE',
          statut: 'OUVERTE',
          donnees: {},
          suggestion: 's',
          dateCreation: D,
        },
      ],
    } as unknown as FicheApprenant;
    const [entete, t, l, a] = lignes(
      csvSession({ portee: 'INDIVIDUEL', formation: { titre: 'F' }, fiche }),
    );
    expect(entete).toEqual(['type', 'titre', 'date', 'statut', 'note', 'detail', 'complement']);
    expect(t).toEqual(['QCM', 'QCM 1', '10/11/2026 10:00', 'NOTEE', '60', 'oui', '2']);
    expect(l).toEqual(['ATELIER', 'API', '10/11/2026 10:00', 'CORRIGE', '80', 'en retard', 'v2']);
    expect(a[0]).toBe('ALERTE');
    expect(a[1]).toBe('INACTIVITE');
  });

  it('MODULE / CSV : une colonne par évaluation, vide sans note', () => {
    const [entete, l1] = lignes(
      csvSession({
        portee: 'MODULE',
        formation: { titre: 'F' },
        donnees: {
          module: { id: 'm', titre: 'M', ordre: 1 },
          evaluations: [
            { id: 'q', type: 'QCM', titre: 'Q' },
            { id: 'a', type: 'ATELIER', titre: 'A' },
          ],
          lignes: [
            {
              prenom: 'A',
              nom: 'B',
              email: 'a@x',
              statutInscription: 'SUSPENDUE',
              notes: [55.5, null],
            },
          ],
        },
      }),
    );
    expect(entete).toEqual(['nom', 'prenom', 'email', 'statut_inscription', 'QCM Q', 'ATELIER A']);
    expect(l1).toEqual(['B', 'A', 'a@x', 'Suspendue', '55,5', '']);
  });

  it('PDF : les trois portées produisent un PDF', async () => {
    const contenus: ContenuSession[] = [
      {
        portee: 'GLOBAL',
        suivi: suivi([
          apprenant(),
          apprenant({ risque: { inactif: true, joursSansConnexion: 9 } }),
        ]),
      },
      { portee: 'GLOBAL', suivi: suivi([]) },
      {
        portee: 'MODULE',
        formation: { titre: 'F' },
        donnees: { module: { id: 'm', titre: 'M', ordre: 1 }, evaluations: [], lignes: [] },
      },
    ];
    for (const c of contenus) {
      const t = await pdfSession(c, D);
      expect(t.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('nomFichier : ASCII, sans espace, portée, date, extension', () => {
    expect(nomFichier('Développement back-end : été 2026', 'GLOBAL', 'CSV', D)).toBe(
      'rapport-developpement-back-end-ete-2026-global-2026-11-10.csv',
    );
    expect(nomFichier('***', 'MODULE', 'PDF', D)).toBe('rapport-formation-module-2026-11-10.pdf');
    expect(nomFichier('x'.repeat(100), 'INDIVIDUEL', 'PDF', D)).toHaveLength(
      'rapport-'.length + 60 + '-individuel-2026-11-10.pdf'.length,
    );
  });
});
