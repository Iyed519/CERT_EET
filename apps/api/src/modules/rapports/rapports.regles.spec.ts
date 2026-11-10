import { FormatRapport } from '../../database/enums/rapport.enum';
import {
  LIMITE_DEMANDES_PAR_MINUTE,
  assemblerModule,
  cleStockageRapport,
  limiteAtteinte,
  typeMime,
} from './rapports.regles';

describe('rapports.regles (US-RPT-01)', () => {
  it('limite : 5 demandes par minute, la 6e est refusée', () => {
    expect(LIMITE_DEMANDES_PAR_MINUTE).toBe(5);
    expect(limiteAtteinte(0)).toBe(false);
    expect(limiteAtteinte(4)).toBe(false);
    expect(limiteAtteinte(5)).toBe(true);
    expect(limiteAtteinte(9)).toBe(true);
  });

  it('clé de stockage et type MIME', () => {
    expect(cleStockageRapport('r1', 'x.csv')).toBe('rapports/r1/x.csv');
    expect(typeMime(FormatRapport.PDF)).toBe('application/pdf');
    expect(typeMime(FormatRapport.CSV)).toBe('text/csv; charset=utf-8');
  });

  it('assemblerModule : ordre conservé, meilleure note, null sans note', () => {
    const d = assemblerModule(
      { id: 'm1', titre: 'Module', ordre: 2 },
      [
        { id: 'q1', type: 'QCM', titre: 'QCM 1' },
        { id: 'a1', type: 'ATELIER', titre: 'Atelier 1' },
      ],
      [
        { id: 'u2', prenom: 'Zied', nom: 'B', email: 'z@x', statut: 'EN_COURS' },
        { id: 'u1', prenom: 'Amel', nom: 'A', email: 'a@x', statut: 'SUSPENDUE' },
      ],
      [
        { apprenantId: 'u1', evaluationId: 'q1', note: 40 },
        { apprenantId: 'u1', evaluationId: 'q1', note: 75 },
        { apprenantId: 'u1', evaluationId: 'q1', note: 60 },
        { apprenantId: 'u2', evaluationId: 'a1', note: 88 },
        { apprenantId: 'u3', evaluationId: 'q1', note: 99 },
      ],
    );
    expect(d.module.ordre).toBe(2);
    expect(d.lignes.map((l) => l.email)).toEqual(['z@x', 'a@x']);
    expect(d.lignes[0].notes).toEqual([null, 88]);
    expect(d.lignes[1].notes).toEqual([75, null]);
    expect(d.lignes[1].statutInscription).toBe('SUSPENDUE');
  });

  it('assemblerModule : aucune évaluation -> lignes sans note', () => {
    const d = assemblerModule(
      { id: 'm1', titre: 'M', ordre: 1 },
      [],
      [{ id: 'u1', prenom: null, nom: null, email: 'a@x', statut: 'EN_COURS' }],
      [],
    );
    expect(d.lignes).toEqual([
      { prenom: null, nom: null, email: 'a@x', statutInscription: 'EN_COURS', notes: [] },
    ]);
  });
});
