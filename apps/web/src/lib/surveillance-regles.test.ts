/**
 * US-QCM-15 / US-QCM-16 — Tests des règles de la surveillance par IA (fonctions pures).
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

const PAS = 500; // deux analyses par seconde, comme dans le navigateur

const normale = (t: number, extra: Partial<Observation> = {}): Observation => ({
  t,
  personnes: 1,
  telephone: 0,
  livre: 0,
  luminosite: 120,
  ...extra,
});

type Alerte = { t: number; type: string; confiance: number | null };

/** Rejoue une observation toutes les 500 ms de `de` à `a` (inclus) ; renvoie les alertes. */
const rejouer = (
  d: DetecteurAnomalies,
  de: number,
  a: number,
  extra: Partial<Observation> | ((t: number) => Partial<Observation>),
): Alerte[] => {
  const sortie: Alerte[] = [];
  for (let t = de; t <= a; t += PAS) {
    const x = typeof extra === 'function' ? extra(t) : extra;
    for (const an of d.observer(normale(t, x)).anomalies) sortie.push({ t, ...an });
  }
  return sortie;
};

describe('DetecteurAnomalies', () => {
  it('situation normale : aucune alerte pendant 10 minutes', () => {
    assert.deepEqual(rejouer(new DetecteurAnomalies(), 0, 600_000, {}), []);
  });

  it('téléphone montré une demi-seconde (2 images) : alerte, avec le meilleur score', () => {
    const d = new DetecteurAnomalies();
    assert.deepEqual(d.observer(normale(0, { telephone: 0.34 })).anomalies, []);
    assert.deepEqual(d.observer(normale(500, { telephone: 0.41 })).anomalies, [
      { type: 'TELEPHONE', confiance: 0.41 },
    ]);
    // Toujours là : pas de deuxième alerte pour le même épisode.
    assert.deepEqual(rejouer(d, 1000, 20_000, { telephone: 0.9 }), []);
  });

  it('téléphone manqué une image sur deux par le modèle : confirmé quand même', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 3000, (t) => ({
      telephone: t % 1000 === 0 ? 0.32 : 0,
    }));
    assert.deepEqual(a, [{ t: 1000, type: 'TELEPHONE', confiance: 0.32 }]);
  });

  it('téléphone vu une seule fois, sous le seuil, ou à des instants trop espacés : rien', () => {
    const d = new DetecteurAnomalies();
    assert.deepEqual(rejouer(d, 0, 0, { telephone: 0.9 }), []);
    assert.deepEqual(rejouer(d, 500, 10_000, { telephone: SEUILS.scoreTelephone - 0.01 }), []);
    const e = new DetecteurAnomalies();
    // Une image toutes les 2 s : trou plus long que la tolérance (1,5 s).
    assert.deepEqual(
      rejouer(e, 0, 20_000, (t) => ({ telephone: t % 2000 === 0 ? 0.8 : 0 })),
      [],
    );
  });

  it('meilleure image : signalée quand le score monte, pas quand il baisse', () => {
    const d = new DetecteurAnomalies();
    assert.deepEqual(d.observer(normale(0, { telephone: 0.35 })).meilleures, ['TELEPHONE']);
    assert.deepEqual(d.observer(normale(500, { telephone: 0.3 })).meilleures, []);
    assert.deepEqual(d.observer(normale(1000, { telephone: 0.6 })).meilleures, ['TELEPHONE']);
    assert.deepEqual(d.observer(normale(1500, {})).meilleures, []);
    // Nouvel épisode (trou > 1,5 s) : la première image redevient la meilleure.
    assert.deepEqual(d.observer(normale(5000, { telephone: 0.31 })).meilleures, ['TELEPHONE']);
  });

  it('même type : nouvel épisode signalé seulement après une minute', () => {
    const d = new DetecteurAnomalies();
    assert.equal(rejouer(d, 0, 3000, { telephone: 0.9 }).length, 1);
    rejouer(d, 3500, 6000, {}); // retour à la normale
    assert.equal(rejouer(d, 6500, 20_000, { telephone: 0.9 }).length, 0);
    rejouer(d, 20_500, 23_000, {});
    const c = rejouer(d, 61_000, 70_000, { telephone: 0.9 });
    assert.deepEqual(c.map((x) => x.t), [61_500]);
  });

  it('plusieurs personnes : 3 images sur 1,5 s, même avec une image manquée', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 10_000, { personnes: 2 });
    assert.deepEqual(a, [{ t: 1500, type: 'PERSONNES_MULTIPLES', confiance: null }]);
    const b = rejouer(new DetecteurAnomalies(), 0, 10_000, (t) => ({
      personnes: t === 1000 ? 1 : 2,
    }));
    assert.deepEqual(b.map((x) => x.t), [1500]);
    const c = new DetecteurAnomalies();
    assert.deepEqual(c.observer(normale(0, { personnes: 2 })).meilleures, ['PERSONNES_MULTIPLES']);
    assert.deepEqual(c.observer(normale(500, { personnes: 3 })).meilleures, [
      'PERSONNES_MULTIPLES',
    ]);
  });

  it('absence : seuil réglable (5 min par défaut), continue, une alerte par absence', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 900_000, { personnes: 0 });
    assert.deepEqual(a, [{ t: 300_000, type: 'ABSENCE', confiance: null }]);
    const b = rejouer(new DetecteurAnomalies(60_000), 0, 120_000, { personnes: 0 });
    assert.deepEqual(b.map((x) => x.t), [60_000]);
  });

  it('absence interrompue par un retour : le compteur repart de zéro', () => {
    const d = new DetecteurAnomalies(60_000);
    assert.equal(rejouer(d, 0, 50_000, { personnes: 0 }).length, 0);
    rejouer(d, 50_500, 50_500, {});
    assert.equal(rejouer(d, 51_000, 110_500, { personnes: 0 }).length, 0);
    assert.equal(rejouer(d, 111_000, 112_000, { personnes: 0 }).length, 1);
  });

  it('caméra masquée : après 10 s ; ni absence ni objet signalés sur une image noire', () => {
    const a = rejouer(new DetecteurAnomalies(5000), 0, 60_000, {
      luminosite: 5,
      personnes: 0,
      telephone: 0.9,
    });
    assert.deepEqual(a, [{ t: 10_000, type: 'CAMERA_MASQUEE', confiance: null }]);
  });

  it('livre : 3 images sur 1,5 s ; deux anomalies simultanées signalées toutes les deux', () => {
    const a = rejouer(new DetecteurAnomalies(), 0, 5000, { livre: 0.7, personnes: 2 });
    assert.deepEqual(
      a.map((x) => [x.t, x.type, x.confiance]),
      [
        [1500, 'PERSONNES_MULTIPLES', null],
        [1500, 'DOCUMENT', 0.7],
      ],
    );
    assert.deepEqual(rejouer(new DetecteurAnomalies(), 0, 5000, { livre: 0.39 }), []);
  });

  it('livre vu 2 fois seulement (même espacées de 1,5 s) : rien ; à la 3e image : alerte', () => {
    const d = new DetecteurAnomalies();
    const vu = (t: number): Partial<Observation> => ({ livre: [0, 1500, 3000].includes(t) ? 0.6 : 0 });
    assert.deepEqual(rejouer(d, 0, 2500, vu), []);
    assert.deepEqual(rejouer(d, 3000, 3000, vu), [{ t: 3000, type: 'DOCUMENT', confiance: 0.6 }]);
  });
});

describe('retourSurLaPage', () => {
  it('page cachée 5 s ou plus : alerte ; moins : rien ; une par minute', () => {
    const d = new DetecteurAnomalies();
    assert.equal(d.retourSurLaPage(1000, 4999), null);
    assert.deepEqual(d.retourSurLaPage(2000, 5000), { type: 'ONGLET_QUITTE', confiance: null });
    assert.equal(d.retourSurLaPage(30_000, 20_000), null);
    assert.deepEqual(d.retourSurLaPage(62_000, 8000), { type: 'ONGLET_QUITTE', confiance: null });
  });
});

describe('resumerDetections', () => {
  it('compte les personnes au-dessus du seuil, garde le meilleur score des objets', () => {
    const r = resumerDetections([
      { categories: [{ categoryName: 'person', score: 0.9 }] },
      { categories: [{ categoryName: 'person', score: 0.3 }] },
      { categories: [{ categoryName: 'person', score: 0.6 }] },
      { categories: [{ categoryName: 'cell phone', score: 0.28 }] },
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
