import {
  cleSessionQcm,
  evaluerSession,
  sessionDe,
  trancherSession,
} from './tentative-session.regles';

/**
 * Règles pures du verrou de session (US-QCM-10, D2, D6, D7) : même session,
 * autre session, blocage désactivé, session détentrice terminée, jeton sans
 * `sid`.
 */
describe('tentative-session.regles', () => {
  const S1 = 's0000000-0000-4000-8000-000000000001';
  const S2 = 's0000000-0000-4000-8000-000000000002';

  describe('sessionDe', () => {
    it('prend le `sid` du jeton', () => {
      expect(sessionDe({ sid: S1, jti: S2 })).toBe(S1);
    });

    it('jeton émis avant US-QCM-10 (sans `sid`) : son `jti` tient lieu de session', () => {
      expect(sessionDe({ jti: S2 })).toBe(S2);
    });
  });

  describe('evaluerSession', () => {
    it('même session -> autorisee', () => {
      expect(
        evaluerSession({ blocageActif: true, sessionTentative: S1, sessionCourante: S1 }),
      ).toBe('autorisee');
    });

    it('autre session, blocage actif -> il faut vérifier la session détentrice', () => {
      expect(
        evaluerSession({ blocageActif: true, sessionTentative: S1, sessionCourante: S2 }),
      ).toBe('verifier_proprietaire');
    });

    it('blocage désactivé (D7) -> autorisee, même depuis une autre session', () => {
      expect(
        evaluerSession({ blocageActif: false, sessionTentative: S1, sessionCourante: S2 }),
      ).toBe('autorisee');
      expect(
        evaluerSession({ blocageActif: false, sessionTentative: null, sessionCourante: S2 }),
      ).toBe('autorisee');
    });

    it('tentative sans session (créée avant US-QCM-10), blocage actif -> adoptee', () => {
      expect(
        evaluerSession({ blocageActif: true, sessionTentative: null, sessionCourante: S2 }),
      ).toBe('adoptee');
    });
  });

  describe('trancherSession (D6)', () => {
    it('session détentrice encore ouverte -> refusee', () => {
      expect(trancherSession(true)).toBe('refusee');
    });

    it('session détentrice terminée (déconnexion, révocation) -> adoptee', () => {
      expect(trancherSession(false)).toBe('adoptee');
    });
  });

  it('clé Redis du miroir : session_qcm:{apprenantId}:{qcmId} (DS-02)', () => {
    expect(cleSessionQcm('a-1', 'q-1')).toBe('session_qcm:a-1:q-1');
  });
});
