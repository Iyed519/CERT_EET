import { lireLimites, LIMITES_PAR_DEFAUT } from '../../config/configuration';
import { CSP_API, LIMITE_CORPS_JSON, originesCors } from './configurer-application';

/** US-AUTH-13 — réglages de durcissement purs (CORS, limites, CSP). */
describe('Durcissement (US-AUTH-13)', () => {
  it('origines CORS : liste nettoyée, « * » jamais retenu', () => {
    expect(originesCors('https://a.tn, https://b.tn ,')).toEqual(['https://a.tn', 'https://b.tn']);
    expect(originesCors('*')).toEqual([]);
    expect(originesCors('https://a.tn,*')).toEqual(['https://a.tn']);
  });

  it('limites par défaut hors test, réglables par variable', () => {
    const prod = lireLimites({ NODE_ENV: 'production' });
    expect(prod).toMatchObject({
      connexion: 30,
      mfa: 30,
      rafraichissement: 120,
      inscription: 30,
      'verification-email': 30,
      'mdp-oublie': 5,
      'mdp-reinitialisation': 10,
    });
    expect(lireLimites({ NODE_ENV: 'production', LIMITE_CONNEXION: '200' }).connexion).toBe(200);
  });

  it('en test : routes appelées par toutes les suites relâchées, sauf variable posée ; mot de passe oublié jamais relâché', () => {
    const test = lireLimites({ NODE_ENV: 'test' });
    expect(test.connexion).toBe(1_000_000);
    expect(test.rafraichissement).toBe(1_000_000);
    expect(test['mdp-oublie']).toBe(5);
    expect(test['mdp-reinitialisation']).toBe(10);
    expect(lireLimites({ NODE_ENV: 'test', LIMITE_CONNEXION: '3' }).connexion).toBe(3);
    expect(Object.keys(LIMITES_PAR_DEFAUT)).toHaveLength(7);
  });

  it('CSP de l’API : aucun cadre, aucun objet, aucune source tierce ; corps JSON borné', () => {
    expect(CSP_API.frameAncestors).toEqual(["'none'"]);
    expect(CSP_API.objectSrc).toEqual(["'none'"]);
    const sources = Object.values(CSP_API).flat();
    expect(sources.some((src) => src.startsWith('http'))).toBe(false);
    expect(LIMITE_CORPS_JSON).toBe('100kb');
  });
});
