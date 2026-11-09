import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { EvaluationLue, verdictEligibilite } from './eligibilite.regles';

/** Règles pures de l'éligibilité (US-ATEL-09). */
describe('verdictEligibilite (US-ATEL-09)', () => {
  const qcm = (score: number | null, reussie: boolean): EvaluationLue => ({
    type: 'QCM',
    id: `q-${score}`,
    titre: 'QCM',
    score,
    reussie,
  });
  const atelier = (score: number | null): EvaluationLue => ({
    type: 'ATELIER',
    id: `a-${score}`,
    titre: 'Atelier',
    score,
  });
  const base = {
    statutFormation: StatutFormation.OUVERTE,
    statutInscription: StatutInscription.EN_COURS as StatutInscription | null,
    seuilCertification: 60,
  };

  it('tous les QCM réussis et tous les ateliers ≥ seuil : éligible, moyenne au centième', () => {
    const v = verdictEligibilite({
      ...base,
      evaluations: [qcm(80, true), atelier(60), atelier(71)],
    });
    expect(v).toMatchObject({
      eligible: true,
      raison: null,
      validees: 3,
      requises: 3,
      scoreFinal: 70.33,
    });
  });

  it('atelier sous le seuil (même d’un centième) : non éligible, avec le décompte', () => {
    const v = verdictEligibilite({ ...base, evaluations: [qcm(80, true), atelier(59.99)] });
    expect(v.eligible).toBe(false);
    expect(v.raison).toBe('Certification non éligible : 1 évaluation validée sur 2.');
    expect(v.scoreFinal).toBeNull();
    expect(v.evaluations.map((e) => e.validee)).toEqual([true, false]);
  });

  it('QCM : la réussite vient de son propre seuil, pas du seuil de la formation', () => {
    expect(verdictEligibilite({ ...base, evaluations: [qcm(55, true)] }).eligible).toBe(true);
    expect(verdictEligibilite({ ...base, evaluations: [qcm(90, false)] }).eligible).toBe(false);
  });

  it('évaluation pas encore notée : non éligible', () => {
    const v = verdictEligibilite({ ...base, evaluations: [qcm(null, false), atelier(null)] });
    expect(v.raison).toBe('Certification non éligible : 0 évaluation validée sur 2.');
  });

  it.each([
    [{ statutFormation: StatutFormation.ARCHIVEE }, 'la formation est clôturée.'],
    [{ statutInscription: null }, 'pas d’inscription à cette formation.'],
    [{ statutInscription: StatutInscription.SUSPENDUE }, 'l’inscription est suspendue.'],
  ])('%o -> non éligible', (surcharge, fin) => {
    const v = verdictEligibilite({ ...base, ...surcharge, evaluations: [qcm(90, true)] });
    expect(v.eligible).toBe(false);
    expect(v.raison).toBe(`Certification non éligible : ${fin}`);
  });

  it('aucune évaluation publiée : non éligible', () => {
    expect(verdictEligibilite({ ...base, evaluations: [] }).raison).toBe(
      'Certification non éligible : la formation ne compte encore aucune évaluation publiée.',
    );
  });

  it('formation FERMEE et inscription TERMINEE : toujours éligibles', () => {
    const v = verdictEligibilite({
      ...base,
      statutFormation: StatutFormation.FERMEE,
      statutInscription: StatutInscription.TERMINEE,
      evaluations: [atelier(100)],
    });
    expect(v).toMatchObject({ eligible: true, scoreFinal: 100 });
  });
});
