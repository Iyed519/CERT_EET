/**
 * US-UX-01 — Tests des règles des briques d'interface.
 * Lancement : `npm run test:unitaires` (Node 22+).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acteurAudit,
  avancementMoyen,
  etapeCourante,
  etapesQcm,
  parFormation,
  repartitionTexte,
  resumeModule,
  statutDepuisAdresse,
  texteCompteur,
} from './ui-regles.ts';

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

describe('etapesQcm', () => {
  const base = { nbQuestions: 0, configure: false, parametresBloquants: null, publie: false, tentatives: false };
  const etats = (x: Parameters<typeof etapesQcm>[0]): string[] => etapesQcm(x).map((e) => e.etat);
  it('nouveau QCM : tout à faire, la première étape est courante', () => {
    assert.deepEqual(etats(base), ['a-faire', 'a-faire', 'a-faire', 'a-faire']);
    assert.equal(etapeCourante(etapesQcm(base)), 0);
  });
  it('questions puis paramètres', () => {
    assert.deepEqual(etats({ ...base, nbQuestions: 3 }), ['fait', 'a-faire', 'a-faire', 'a-faire']);
    assert.deepEqual(etats({ ...base, nbQuestions: 3, configure: true }), ['fait', 'fait', 'a-faire', 'a-faire']);
    assert.equal(etapesQcm({ ...base, nbQuestions: 1 })[0].detail, '1 question');
  });
  it('paramètres bloquants : état et détail', () => {
    const e = etapesQcm({ ...base, nbQuestions: 3, configure: true, parametresBloquants: 'fermeture passée' });
    assert.equal(e[1].etat, 'bloquant');
    assert.equal(e[1].detail, 'fermeture passée');
  });
  it('publié : résultats en attente puis en cours', () => {
    const pub = { ...base, nbQuestions: 3, configure: true, publie: true };
    assert.deepEqual(etats(pub), ['fait', 'fait', 'fait', 'a-faire']);
    assert.deepEqual(etats({ ...pub, tentatives: true }), ['fait', 'fait', 'fait', 'en-cours']);
    // Des tentatives sans publication (QCM retiré de la vue) : les résultats restent « à faire ».
    assert.equal(etats({ ...base, nbQuestions: 3, tentatives: true })[3], 'a-faire');
  });
});

describe('acteurAudit (US-UX-06)', () => {
  it('sans compte → « Système », jamais « visiteur »', () => {
    assert.equal(acteurAudit(null), 'Système');
  });
  it('prénom et nom, ou un seul, ou l’adresse à défaut', () => {
    assert.equal(acteurAudit({ email: 'a@x.tn', prenom: 'Sami', nom: 'Ben Ali' }), 'Sami Ben Ali');
    assert.equal(acteurAudit({ email: 'a@x.tn', prenom: null, nom: 'Ben Ali' }), 'Ben Ali');
    assert.equal(acteurAudit({ email: 'a@x.tn', prenom: '', nom: null }), 'a@x.tn');
  });
});

describe('repartitionTexte (US-UX-06)', () => {
  const libelles = { APPRENANT: 'Apprenants', FORMATEUR: 'Formateurs' };
  it('valeurs non nulles, libellé en minuscules, séparées par « · »', () => {
    assert.equal(repartitionTexte({ APPRENANT: 12, FORMATEUR: 3, ADMINISTRATEUR: 0 }, libelles), '12 apprenants · 3 formateurs');
  });
  it('code inconnu gardé, formateur de nombre appliqué', () => {
    assert.equal(repartitionTexte({ AUTRE: 1500 }, libelles, (n) => `[${n}]`), '[1500] autre');
  });
  it('tout à zéro ou vide → « aucun pour l’instant »', () => {
    assert.equal(repartitionTexte({ APPRENANT: 0 }, libelles), 'aucun pour l’instant');
    assert.equal(repartitionTexte({}, libelles), 'aucun pour l’instant');
  });
});

describe('statutDepuisAdresse (US-UX-06)', () => {
  const statuts = ['BROUILLON', 'OUVERTE'] as const;
  it('valeur connue → retenue', () => {
    assert.equal(statutDepuisAdresse('?statut=OUVERTE', statuts), 'OUVERTE');
    assert.equal(statutDepuisAdresse('?enEchec=true&statut=BROUILLON', statuts), 'BROUILLON');
  });
  it('absente, vide ou inconnue → null', () => {
    assert.equal(statutDepuisAdresse('', statuts), null);
    assert.equal(statutDepuisAdresse('?statut=', statuts), null);
    assert.equal(statutDepuisAdresse('?statut=ouverte', statuts), null);
    assert.equal(statutDepuisAdresse('?statut=SUPPRIMEE', statuts), null);
  });
});
