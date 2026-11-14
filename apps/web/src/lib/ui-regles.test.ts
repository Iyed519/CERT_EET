/**
 * US-UX-01 — Tests des règles des briques d'interface.
 * Lancement : `npm run test:unitaires` (Node 22+).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { avancementMoyen, etapeCourante, parFormation, resumeModule, texteCompteur } from './ui-regles.ts';

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

describe('avancementMoyen', () => {
  it('moyenne des apprenants en cours, arrondie, bornée à 0–100', () => {
    assert.equal(
      avancementMoyen([
        { statutInscription: 'EN_COURS', avancement: 50 },
        { statutInscription: 'EN_COURS', avancement: 25 },
        { statutInscription: 'TERMINEE', avancement: 100 },
        { statutInscription: 'SUSPENDUE', avancement: 0 },
      ]),
      38,
    );
    assert.equal(avancementMoyen([{ statutInscription: 'EN_COURS', avancement: 130 }]), 100);
    assert.equal(avancementMoyen([{ statutInscription: 'EN_COURS', avancement: -5 }]), 0);
  });
  it('aucun apprenant en cours → null', () => {
    assert.equal(avancementMoyen([]), null);
    assert.equal(avancementMoyen([{ statutInscription: 'TERMINEE', avancement: 100 }]), null);
  });
});

describe('resumeModule', () => {
  it('compte les QCM publiés, accorde le pluriel', () => {
    assert.equal(
      resumeModule({ qcm: ['PUBLIE', 'BROUILLON', 'NON_PUBLIE'], ateliers: 1, ressources: 2, supports: 1 }),
      '3 QCM dont 1 publié · 1 atelier · 2 ressources · 1 support IA',
    );
    assert.equal(
      resumeModule({ qcm: ['PUBLIE', 'PUBLIE'], ateliers: 0, ressources: 0, supports: 3 }),
      '2 QCM dont 2 publiés · 0 atelier · 0 ressource · 3 supports IA',
    );
  });
  it('module vide ; ressources et supports pas encore chargés', () => {
    assert.equal(resumeModule({ qcm: [], ateliers: 2 }), '0 QCM · 2 ateliers');
  });
});
