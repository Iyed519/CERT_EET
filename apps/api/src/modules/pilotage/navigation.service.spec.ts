import { DataSource } from 'typeorm';
import { Role } from '../../database/enums/role.enum';
import { NavigationService } from './navigation.service';

/** US-UX-02 — compteurs du menu latéral et pages d'ensemble du formateur. */
describe('US-UX-02 — NavigationService', () => {
  const requete = jest.fn();
  const service = new NavigationService({ query: requete } as unknown as DataSource);

  beforeEach(() => requete.mockReset());

  it('administrateur : trois demandes en attente, nombres convertis', async () => {
    requete.mockResolvedValueOnce([{ role: '2', affectation: '0', propositions: 5 }]);
    await expect(service.compteurs({ id: 'a1', role: Role.ADMINISTRATEUR })).resolves.toEqual({
      role: 'ADMINISTRATEUR',
      demandesRole: 2,
      demandesAffectation: 0,
      propositions: 5,
    });
    const [sql, params] = requete.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("demandes_role WHERE statut = 'EN_ATTENTE'");
    expect(sql).toContain("demandes_affectation WHERE statut = 'EN_ATTENTE'");
    expect(sql).toContain("propositions_formation WHERE statut = 'EN_ATTENTE'");
    expect(params).toEqual([]);
    expect(requete).toHaveBeenCalledTimes(1);
  });

  it('formateur : une requête, limitée à ses affectations, « Alertes » = décrochage + surveillance', async () => {
    requete.mockResolvedValueOnce([{ decrochage: '3', surveillance: '2', livrables: '4', tentatives: null }]);
    await expect(service.compteurs({ id: 'f1', role: Role.FORMATEUR })).resolves.toEqual({
      role: 'FORMATEUR',
      alertes: 5,
      alertesDecrochage: 3,
      alertesSurveillance: 2,
      livrablesACorriger: 4,
      tentativesAEvaluer: 0,
    });
    const [sql, params] = requete.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['f1']);
    expect(sql).toContain('formation_formateurs WHERE formateur_id = $1');
    expect(sql).toContain("l.statut IN ('SOUMIS', 'EN_CORRECTION')");
    expect(sql).toContain("t.statut IN ('SOUMISE', 'ABANDONNEE_TIMER')");
    expect(sql).toContain("q.statut <> 'BROUILLON'");
    expect(sql).toContain("e.statut = 'NOUVEAU'");
    expect(sql).toContain("statut = 'OUVERTE'");
    expect(requete).toHaveBeenCalledTimes(1);
  });

  it('évaluations : deux requêtes sur les formations du formateur, lignes converties', async () => {
    requete
      .mockResolvedValueOnce([
        {
          id: 'at1',
          titre: 'Atelier',
          statut: 'PUBLIE',
          module_titre: 'M1',
          formation_id: 'fo1',
          formation_titre: 'F',
          a_corriger: '2',
          en_correction: '1',
          notes: '0',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'q1',
          titre: 'QCM',
          statut: 'PUBLIE',
          module_titre: 'M1',
          formation_id: 'fo1',
          formation_titre: 'F',
          tentatives: '7',
          a_evaluer: '1',
          alertes: '3',
        },
      ]);
    await expect(service.evaluations('f1')).resolves.toEqual({
      ateliers: [
        {
          id: 'at1',
          titre: 'Atelier',
          statut: 'PUBLIE',
          moduleTitre: 'M1',
          formationId: 'fo1',
          formationTitre: 'F',
          aCorriger: 2,
          enCorrection: 1,
          notes: 0,
        },
      ],
      qcm: [
        {
          id: 'q1',
          titre: 'QCM',
          statut: 'PUBLIE',
          moduleTitre: 'M1',
          formationId: 'fo1',
          formationTitre: 'F',
          tentatives: 7,
          aEvaluer: 1,
          alertesAExaminer: 3,
        },
      ],
    });
    expect(requete).toHaveBeenCalledTimes(2);
    for (const [sql, params] of requete.mock.calls as Array<[string, unknown[]]>) {
      expect(params).toEqual(['f1']);
      expect(sql).toContain('formation_formateurs WHERE formateur_id = $1');
    }
  });

  it('évaluations : rien d’affecté → listes vides', async () => {
    requete.mockResolvedValue([]);
    await expect(service.evaluations('f9')).resolves.toEqual({ ateliers: [], qcm: [] });
  });
});
