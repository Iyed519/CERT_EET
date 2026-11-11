import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  LigneFormationFormateur,
  moyenne,
  totaliser,
  versFormation,
} from './tableau-de-bord-formateur.regles';
import { TableauDeBordFormateurService } from './tableau-de-bord-formateur.service';
import { STATUTS_FORMATION, TableauDeBordService } from './tableau-de-bord.service';

const ligne = (surcharge: Partial<LigneFormationFormateur> = {}): LigneFormationFormateur => ({
  id: 'f1',
  titre: 'Formation',
  statut: 'OUVERTE',
  inscrits: 0,
  actifs: 0,
  nouveaux: 0,
  tentatives_notees: 0,
  tentatives_reussies: 0,
  somme_scores: null,
  tentatives_a_evaluer: 0,
  livrables_a_evaluer: 0,
  alertes_ouvertes: 0,
  certificats_delivres: 0,
  ...surcharge,
});

describe('US-DASH-03 — règles du tableau de bord du formateur', () => {
  it('moyenne : somme / nombre arrondie à 2 décimales ; null sans tentative', () => {
    expect(moyenne('200', 3)).toBe(66.67);
    expect(moyenne(null, 0)).toBeNull();
    expect(moyenne('0', 0)).toBeNull();
    expect(moyenne(0, 2)).toBe(0);
  });

  it('versFormation : taux de réussite, score moyen et compteurs numériques', () => {
    const f = versFormation(
      ligne({
        inscrits: 4,
        actifs: 3,
        tentatives_notees: 4,
        tentatives_reussies: 3,
        somme_scores: '290.00',
        tentatives_a_evaluer: 1,
        livrables_a_evaluer: 2,
        alertes_ouvertes: 1,
        certificats_delivres: 2,
      }),
    );
    expect(f).toEqual({
      id: 'f1',
      titre: 'Formation',
      statut: 'OUVERTE',
      inscrits: 4,
      actifs: 3,
      tentativesNotees: 4,
      tauxReussite: 75,
      scoreMoyen: 72.5,
      tentativesAEvaluer: 1,
      livrablesAEvaluer: 2,
      alertesOuvertes: 1,
      certificatsDelivres: 2,
    });
  });

  it('totaliser : sommes, statuts à zéro compris, moyenne pondérée (pas de moyenne de moyennes)', () => {
    const t = totaliser(
      [
        ligne({ id: 'a', statut: 'OUVERTE', inscrits: 2, actifs: 2, nouveaux: 1, tentatives_notees: 1, tentatives_reussies: 1, somme_scores: '100', livrables_a_evaluer: 1, certificats_delivres: 1 }),
        ligne({ id: 'b', statut: 'OUVERTE', inscrits: 3, actifs: 1, tentatives_notees: 3, tentatives_reussies: 0, somme_scores: '60', tentatives_a_evaluer: 2, alertes_ouvertes: 2 }),
        ligne({ id: 'c', statut: 'ARCHIVEE', inscrits: 1 }),
      ],
      STATUTS_FORMATION,
    );
    expect(t.formations).toEqual({ parStatut: { OUVERTE: 2, FERMEE: 0, ARCHIVEE: 1 }, total: 3 });
    expect(t.apprenants).toEqual({ inscrits: 6, actifs: 3, nouveaux: 1 });
    // (100 + 60) / 4 = 40 — et non la moyenne des moyennes (100 + 20) / 2 = 60.
    expect(t.qcm).toEqual({ tentativesNotees: 4, reussies: 1, tauxReussite: 25, scoreMoyen: 40, aEvaluer: 2 });
    expect(t.ateliers).toEqual({ livrablesAEvaluer: 1 });
    expect(t.alertesOuvertes).toBe(2);
    expect(t.certificatsDelivres).toBe(1);
  });

  it('totaliser : aucune formation -> zéros et score moyen nul', () => {
    const t = totaliser([], STATUTS_FORMATION);
    expect(t.formations.total).toBe(0);
    expect(t.qcm.tauxReussite).toBe(0);
    expect(t.qcm.scoreMoyen).toBeNull();
  });
});

describe('US-DASH-03 — TableauDeBordFormateurService', () => {
  const query = jest.fn();
  const service = new TableauDeBordFormateurService(
    { query } as unknown as DataSource,
    new TableauDeBordService({} as DataSource),
  );

  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValueOnce([ligne({ inscrits: 2 })]).mockResolvedValueOnce([]);
  });

  it('deux requêtes agrégées seulement, filtrées par le formateur ($3), période passée en $1/$2', async () => {
    const t = await service.pour('formateur-1', '2026-10-01', '2026-10-31');
    expect(query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of query.mock.calls as Array<[string, unknown[]]>) {
      expect(sql).toContain('FROM formation_formateurs WHERE formateur_id = $3');
      expect(params.slice(0, 3)).toEqual(['2026-10-01', '2026-10-31', 'formateur-1']);
    }
    expect(t.periode).toEqual({ du: '2026-10-01', au: '2026-10-31', jours: 31 });
    expect(t.apprenants.inscrits).toBe(2);
    expect(t.mesFormations).toHaveLength(1);
  });

  it('période invalide -> 400 sans requête', async () => {
    await expect(service.pour('formateur-1', '2026-10-31', '2026-10-01')).rejects.toThrow(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
