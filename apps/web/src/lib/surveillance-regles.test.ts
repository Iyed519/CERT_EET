/**
 * US-QCM-15 — Tests des règles de la surveillance par IA (fonctions pures).
 * Lancement : `npm run test:regles` (Node 22+, `--experimental-strip-types`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DetecteurAnomalies,
  luminositeMoyenne,
  type Observation,
  resumerDetections,
  SEUILS,
} from './surveillance-regles.ts';

const normale = (t: number, extra: Partial<Observation> = {}): Observation => ({
  t,
  personnes: 1,
  telephone: 0,
  livre: 0,
  luminosite: 120,
  pageVisible: true,
  ...extra,
});

/** Rejoue une observation par seconde de `de` à `a` (inclus) ; renvoie les alertes. */
const rejouer = (
  d: DetecteurAnomalies,
  de: number,
  a: number,
  extra: Partial<Observation>,
): Array<{ t: number; type: string; confiance: number | null }> => {
  const sortie: Array<{ t: number; type: string; confiance: number | null }> = [];
  for (let t = de; t <= a; t += 1000) {
    for (const x of d.observer(normale(t, extra))) sortie.push({ t, ...x });
  }
  return sortie;
};

describe('DetecteurAnomalies', () => {
  it('situation normale : aucune alerte', () => {
    assert.deepEqual(rejouer(new DetecteurAnomalies(), 0, 600_000, {}), []);
  });

  it('téléphone : confirmé après 2 s, une seule alerte par épisode, meilleur score', () => {
    const d = new DetecteurAnomalies();
    const a = rejouer(d, 0, 1000, { telephone: 0.55 });
    assert.deepEqual(a, []);
    const b = rejouer(d, 2000, 30_000, { telephone: 0.8 });
    assert.deepEqual(b, [{ t: 2000, type: 'TELEPHONE', confiance: 0.8 }]);
  });

  it('téléphone sous le seuil ou trop bref : rien', () => {
    const d = new DetecteurAnomalies();
    assert.deepEqual(rejouer(d, 0, 10_000, { telephone: SEUILS.scoreObjet - 0.01 }), []);
    assert.deepEqual(rejouer(d, 11_000, 12_000, { telephone: 0.9 }), []);
  });

  it('même type : nouvel épisode signalé seulement après une minute', () => {
    const d = new DetecteurAnomalies();
    assert.equal(rejouer(d, 0, 3000, { telephone: 0.9 }).length, 1);
    rejouer(d, 4000, 5000, {}); // retour à la normale
    assert.equal(rejouer(d, 6000, 20_000, { telephone: 0.9 }).length, 0);
    rejouer(d, 21_000, 22_000, {});
    const c = rejouer(d, 61_000, 70_000, { telephone: 0.9 });
    assert.deepEqual(c.map((x) => x.t), [63_000]);
  });

  it('plusieurs personnes : après 3 s', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 10_000, { personnes: 2 });
    assert.deepEqual(a, [{ t: 3000, type: 'PERSONNES_MULTIPLES', confiance: null }]);
  });

  it('absence : seuil réglable (5 min par défaut), une alerte par absence', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 900_000, { personnes: 0 });
    assert.deepEqual(a, [{ t: 300_000, type: 'ABSENCE', confiance: null }]);
    const b = rejouer(new DetecteurAnomalies(60_000), 0, 120_000, { personnes: 0 });
    assert.deepEqual(b.map((x) => x.t), [60_000]);
  });

  it('absence interrompue par un retour : le compteur repart de zéro', () => {
    const d = new DetecteurAnomalies(60_000);
    assert.equal(rejouer(d, 0, 50_000, { personnes: 0 }).length, 0);
    rejouer(d, 51_000, 51_000, {});
    assert.equal(rejouer(d, 52_000, 100_000, { personnes: 0 }).length, 0);
    assert.equal(rejouer(d, 101_000, 112_000, { personnes: 0 }).length, 1);
  });

  it('caméra masquée : après 10 s ; ni absence ni objet signalés sur une image noire', () => {
    const a = rejouer(new DetecteurAnomalies(5000), 0, 60_000, {
      luminosite: 5,
      personnes: 0,
      telephone: 0.9,
    });
    assert.deepEqual(a, [{ t: 10_000, type: 'CAMERA_MASQUEE', confiance: null }]);
  });

  it('page quittée : après 5 s', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 20_000, { pageVisible: false });
    assert.deepEqual(a, [{ t: 5000, type: 'ONGLET_QUITTE', confiance: null }]);
  });

  it('livre : après 3 s ; deux anomalies simultanées signalées toutes les deux', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 5000, { livre: 0.7, personnes: 2 });
    assert.deepEqual(
      a.map((x) => x.type),
      ['PERSONNES_MULTIPLES', 'DOCUMENT'],
    );
  });
});

describe('resumerDetections', () => {
  it('compte les personnes au-dessus du seuil, garde le meilleur score des objets', () => {
    const r = resumerDetections([
      { categories: [{ categoryName: 'person', score: 0.9 }] },
      { categories: [{ categoryName: 'person', score: 0.3 }] },
      { categories: [{ categoryName: 'person', score: 0.6 }] },
      { categories: [{ categoryName: 'cell phone', score: 0.4 }] },
      { categories: [{ categoryName: 'cell phone', score: 0.7 }] },
      { categories: [{ categoryName: 'book', score: 0.55 }] },
      { categories: [{ categoryName: 'laptop', score: 0.99 }] },
      { categories: [] },
    ]);
    assert.deepEqual(r, { personnes: 2, telephone: 0.7, livre: 0.55 });
  });
});

describe('luminositeMoyenne', () => {
  it('noir 0, blanc 255, vide 0', () => {
    assert.equal(luminositeMoyenne(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255])), 0);
    assert.equal(
      Math.round(luminositeMoyenne(new Uint8ClampedArray([255, 255, 255, 255]))),
      255,
    );
    assert.equal(luminositeMoyenne(new Uint8ClampedArray([])), 0);
  });
});
