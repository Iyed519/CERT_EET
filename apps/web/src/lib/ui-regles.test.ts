/**
 * US-UX-01 — Tests des règles des briques d'interface.
 * Lancement : `npm run test:unitaires` (Node 22+).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { etapeCourante, parFormation, texteCompteur } from './ui-regles.ts';

describe('texteCompteur', () => {
  it('absent → rien', () => {
    assert.equal(texteCompteur({}), null);
    assert.equal(texteCompteur({ compteur: null }), null);
  });
  it('zéro à traiter masqué, zéro informatif affiché', () => {
    assert.equal(texteCompteur({ compteur: 0, compteurAlerte: true }), null);
    assert.equal(texteCompteur({ compteur: 0 }), '0');
  });
  it('valeurs et plafond', () => {
    assert.equal(texteCompteur({ compteur: 7, compteurAlerte: true }), '7');
    assert.equal(texteCompteur({ compteur: 999 }), '999');
    assert.equal(texteCompteur({ compteur: 1000 }), '999+');
  });
});

describe('etapeCourante', () => {
  it('première étape non faite', () => {
    assert.equal(etapeCourante([{ etat: 'fait' }, { etat: 'bloquant' }, { etat: 'a-faire' }]), 1);
    assert.equal(etapeCourante([{ etat: 'a-faire' }]), 0);
  });
  it('tout fait → -1', () => {
    assert.equal(etapeCourante([{ etat: 'fait' }, { etat: 'fait' }]), -1);
    assert.equal(etapeCourante([]), -1);
  });
});

describe('parFormation', () => {
  it('regroupe dans l’ordre reçu, sans perdre de ligne', () => {
    const lignes = [
      { id: 1, formationId: 'b', formationTitre: 'B' },
      { id: 2, formationId: 'a', formationTitre: 'A' },
      { id: 3, formationId: 'b', formationTitre: 'B' },
    ];
    const g = parFormation(lignes);
    assert.deepEqual(g.map((x) => x.id), ['b', 'a']);
    assert.deepEqual(g[0].lignes.map((l) => l.id), [1, 3]);
    assert.equal(g.reduce((n, x) => n + x.lignes.length, 0), 3);
    assert.deepEqual(parFormation([]), []);
  });
});
