import { StatutFormation } from '../../database/enums/statut-formation.enum';
import {
  ACTION_AUDIT,
  MESSAGE_ARCHIVEE_DEFINITIF,
  confirmationRequise,
  messageTransitionRefusee,
  total,
  transitionAutorisee,
} from './cycle-formation.regles';

const { OUVERTE, FERMEE, ARCHIVEE } = StatutFormation;
const AUCUNE = {
  tentativesEnCours: 0,
  livrablesACorriger: 0,
  correctionsEnCours: 0,
  certificatsEnEmission: 0,
};

describe('cycle-formation.regles (US-FORM-02)', () => {
  it('transitions : OUVERTE -> FERMEE -> ARCHIVEE, FERMEE -> OUVERTE ; ARCHIVEE définitif', () => {
    expect(transitionAutorisee(OUVERTE, FERMEE)).toBe(true);
    expect(transitionAutorisee(FERMEE, ARCHIVEE)).toBe(true);
    expect(transitionAutorisee(FERMEE, OUVERTE)).toBe(true);
    expect(transitionAutorisee(OUVERTE, ARCHIVEE)).toBe(false);
    expect(transitionAutorisee(OUVERTE, OUVERTE)).toBe(false);
    for (const s of [OUVERTE, FERMEE, ARCHIVEE])
      expect(transitionAutorisee(ARCHIVEE, s)).toBe(false);
  });

  it('messages de refus', () => {
    expect(messageTransitionRefusee(ARCHIVEE, OUVERTE)).toBe(MESSAGE_ARCHIVEE_DEFINITIF);
    expect(messageTransitionRefusee(FERMEE, FERMEE)).toBe('La formation est déjà fermée.');
    expect(messageTransitionRefusee(OUVERTE, ARCHIVEE)).toBe(
      'Transition impossible : une formation ouverte ne peut pas devenir archivée.',
    );
  });

  it('actions d’audit selon le statut d’arrivée', () => {
    expect(ACTION_AUDIT[FERMEE]).toBe('FORMATION_CLOTUREE');
    expect(ACTION_AUDIT[ARCHIVEE]).toBe('FORMATION_ARCHIVEE');
    expect(ACTION_AUDIT[OUVERTE]).toBe('FORMATION_ROUVERTE');
  });

  it('confirmation : exigée pour clôturer ou archiver avec des évaluations en cours, jamais pour rouvrir', () => {
    expect(total({ ...AUCUNE, tentativesEnCours: 2, certificatsEnEmission: 1 })).toBe(3);
    expect(confirmationRequise(FERMEE, AUCUNE)).toBe(false);
    for (const champ of Object.keys(AUCUNE)) {
      const e = { ...AUCUNE, [champ]: 1 };
      expect(confirmationRequise(FERMEE, e)).toBe(true);
      expect(confirmationRequise(ARCHIVEE, e)).toBe(true);
      expect(confirmationRequise(OUVERTE, e)).toBe(false);
    }
  });
});
