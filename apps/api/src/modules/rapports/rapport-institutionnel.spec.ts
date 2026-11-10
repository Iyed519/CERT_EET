import { TableauDeBordGlobal } from '../pilotage/tableau-de-bord.service';
import {
  BilanFormation,
  csvInstitutionnel,
  libellePeriode,
  nomFichierInstitutionnel,
  pdfInstitutionnel,
  tauxReussite,
} from './rapport-institutionnel';

const P = { du: '2026-10-01', au: '2026-10-31' };
const D = new Date('2026-11-10T10:00:00Z');

const TDB = {
  periode: { ...P, jours: 31 },
  utilisateurs: {
    parRole: { APPRENANT: 3, FORMATEUR: 1, ADMINISTRATEUR: 1 },
    parStatut: { ACTIF: 5 },
    total: 5,
    nouveaux: 2,
    connectes: 4,
  },
  formations: { parStatut: { OUVERTE: 1, FERMEE: 0, ARCHIVEE: 0 }, total: 1, nouvelles: 1 },
  inscriptions: { parStatut: { EN_COURS: 3 }, total: 3, nouvelles: 3 },
  evaluations: {
    qcm: { tentativesNotees: 4, reussies: 3, tauxReussite: 75, scoreMoyen: 66.5, enCours: 1 },
    ateliers: {
      livrablesSoumis: 2,
      correctionsFinalisees: 1,
      noteMoyenne: null,
      enAttenteCorrection: 1,
      enCorrection: 0,
    },
  },
  certificats: { parStatut: { ACTIF: 1, REVOQUE: 1 }, emis: 2, revoques: 1, consultations: 7 },
  activite: [],
  activiteRecente: [],
  alertes: [],
} as unknown as TableauDeBordGlobal;

function bilan(p: Partial<BilanFormation> = {}): BilanFormation {
  return {
    titre: 'Back-end',
    statut: 'OUVERTE',
    inscrits: 3,
    nouvellesInscriptions: 2,
    terminees: 1,
    suspendues: 0,
    tentativesNotees: 3,
    tentativesReussies: 2,
    scoreMoyen: 61.33,
    correctionsFinalisees: 1,
    noteMoyenneAteliers: 91,
    certificatsEmis: 1,
    certificatsRevoques: 0,
    ...p,
  };
}

const lignes = (c: string): string[][] =>
  c
    .replace(/^﻿/, '')
    .trimEnd()
    .split('\r\n')
    .map((l) => l.split(';'));

describe('rapport-institutionnel (US-RPT-02)', () => {
  it('libellePeriode, tauxReussite, nom de fichier', () => {
    expect(libellePeriode(P)).toBe('du 01/10/2026 au 31/10/2026');
    expect(tauxReussite(2, 3)).toBe(66.7);
    expect(tauxReussite(0, 0)).toBeNull();
    expect(nomFichierInstitutionnel('CERTIFICATS', P, 'PDF')).toBe(
      'rapport-institutionnel-certificats-2026-10-01-2026-10-31.pdf',
    );
  });

  it('SYNTHESE / CSV : période puis indicateurs (bloc, indicateur, valeur)', () => {
    const [entete, periode, ...reste] = lignes(
      csvInstitutionnel({ modele: 'SYNTHESE', periode: P, tdb: TDB }),
    );
    expect(entete).toEqual(['bloc', 'indicateur', 'valeur']);
    expect(periode).toEqual(['Période', '', 'du 01/10/2026 au 31/10/2026']);
    const index = Object.fromEntries(reste.map((l) => [l[1], l[2]]));
    expect(index['Par rôle']).toBe('APPRENANT 3, FORMATEUR 1, ADMINISTRATEUR 1');
    expect(index['Taux de réussite QCM']).toBe('75 %');
    expect(index['Score moyen QCM']).toBe('66,5 / 100');
    expect(index['Note moyenne des ateliers']).toBe('—');
    expect(index['Consultations publiques']).toBe('7');
  });

  it('FORMATIONS / CSV : une ligne par formation, taux calculé', () => {
    const [entete, l1, l2] = lignes(
      csvInstitutionnel({
        modele: 'FORMATIONS',
        periode: P,
        formations: [
          bilan(),
          bilan({ titre: '=Autre', tentativesNotees: 0, tentativesReussies: 0, scoreMoyen: null }),
        ],
      }),
    );
    expect(entete).toHaveLength(13);
    expect(l1.slice(0, 9)).toEqual([
      'Back-end',
      'OUVERTE',
      '3',
      '2',
      '1',
      '0',
      '3',
      '66,7',
      '61,33',
    ]);
    expect(l2[0]).toBe("'=Autre");
    expect(l2[7]).toBe('');
    expect(l2[8]).toBe('');
  });

  it('CERTIFICATS / CSV : registre, date à l’heure de Tunis', () => {
    const [entete, l1] = lignes(
      csvInstitutionnel({
        modele: 'CERTIFICATS',
        periode: P,
        certificats: [
          {
            id: 'c1',
            titulaire: 'Amel Ben Ali',
            email: 'a@x.tn',
            formation: 'Back-end',
            scoreFinal: 78.5,
            mention: null,
            statut: 'ACTIF',
            dateEmission: new Date('2026-10-05T08:00:00Z'),
            consultations: 2,
          },
        ],
      }),
    );
    expect(entete[0]).toBe('certificat');
    expect(l1).toEqual([
      'c1',
      'Amel Ben Ali',
      'a@x.tn',
      'Back-end',
      '78,5',
      '',
      'ACTIF',
      '05/10/2026 09:00',
      '2',
    ]);
  });

  it('PDF : trois modèles, vides compris', async () => {
    for (const c of [
      { modele: 'SYNTHESE' as const, periode: P, tdb: TDB },
      {
        modele: 'FORMATIONS' as const,
        periode: P,
        formations: [bilan({ certificatsRevoques: 1 })],
      },
      { modele: 'FORMATIONS' as const, periode: P, formations: [] },
      { modele: 'CERTIFICATS' as const, periode: P, certificats: [] },
    ]) {
      const t = await pdfInstitutionnel(c, D);
      expect(t.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});
