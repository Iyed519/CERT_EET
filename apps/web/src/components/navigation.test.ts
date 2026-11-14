/**
 * US-UX-02 — Tests du menu latéral (fonctions pures de navigation.ts).
 * Lancement : `npm run test:unitaires` (Node 22+).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NAVIGATION_LATERALE,
  aNavigationLaterale,
  entreeActive,
  filAriane,
  precisionMotif,
  sousNavigation,
  texteCompteurMenu,
} from './navigation.ts';

const F = NAVIGATION_LATERALE.FORMATEUR!;
const A = NAVIGATION_LATERALE.ADMINISTRATEUR!;
const actif = (groupes: typeof F, chemin: string): string | undefined => entreeActive(groupes, chemin)?.libelle;
const ID = '0b5e7a9c-1d2e-4f3a-9b8c-7d6e5f4a3b2c';

describe('precisionMotif', () => {
  it('segments fixes, identifiant, joker', () => {
    assert.equal(precisionMotif('/a/b', '/a/b'), 21);
    assert.equal(precisionMotif('/a/*', '/a'), 10);
    assert.equal(precisionMotif('/a/*', '/a/b/c'), 10);
    assert.equal(precisionMotif('/a/:id', '/a/x'), 16);
    assert.equal(precisionMotif('/a/:id', '/a'), -1);
    assert.equal(precisionMotif('/a/:id', '/a/x/y'), -1);
    assert.equal(precisionMotif('/a/b', '/a/c'), -1);
    assert.equal(precisionMotif('/a/b', '/a/b?x=1'), 21);
  });
});

describe('entreeActive — formateur', () => {
  const cas: Array<[string, string]> = [
    ['/formateur/tableau-de-bord', 'Accueil'],
    ['/formateur/formations', 'Mes formations'],
    [`/formateur/formations/${ID}`, 'Mes formations'],
    [`/formateur/qcm/${ID}`, 'Mes formations'],
    [`/formateur/ateliers/${ID}`, 'Mes formations'],
    ['/formateur/qcm', 'Tentatives des QCM'],
    [`/formateur/qcm/${ID}/tentatives`, 'Tentatives des QCM'],
    ['/formateur/livrables', 'Livrables à corriger'],
    [`/formateur/livrables/${ID}`, 'Livrables à corriger'],
    [`/formateur/formations/${ID}/suivi`, 'Apprenants'],
    ['/formateur/apprenants', 'Apprenants'],
    [`/formateur/formations/${ID}/rapports`, 'Rapports'],
    ['/rapports', 'Rapports'],
    ['/formateur/alertes', 'Alertes'],
    ['/formateur/alertes/surveillance', 'Alertes'],
    ['/formateur/demandes', 'Demander une formation'],
    ['/formateur/propositions', 'Proposer une formation'],
    [`/catalogue/${ID}`, 'Catalogue'],
  ];
  for (const [chemin, attendu] of cas) it(`${chemin} → ${attendu}`, () => assert.equal(actif(F, chemin), attendu));
  it('hors menu → null', () => {
    assert.equal(entreeActive(F, '/securite'), null);
    assert.equal(entreeActive(F, null), null);
  });
});

describe('entreeActive — administrateur', () => {
  const cas: Array<[string, string]> = [
    ['/admin/tableau-de-bord', 'Accueil'],
    ['/admin/utilisateurs', 'Comptes'],
    ['/admin/role-requests', 'Demandes de rôle'],
    ['/admin/formations', 'Formations'],
    [`/admin/formations/${ID}/inscriptions`, 'Formations'],
    ['/admin/demandes-affectation', 'Demandes d’affectation'],
    ['/admin/propositions-formation', 'Propositions'],
    ['/admin/certificats', 'Certificats'],
    ['/admin/rapports', 'Rapports'],
    ['/admin/risque', 'Prédiction du risque'],
    ['/admin/generations-ia', 'Générations IA'],
    ['/admin/audit', 'Journal d’audit'],
  ];
  for (const [chemin, attendu] of cas) it(`${chemin} → ${attendu}`, () => assert.equal(actif(A, chemin), attendu));
});

describe('structure du menu', () => {
  it('Accueil en tête, sans titre ; adresses uniques', () => {
    for (const groupes of [F, A]) {
      assert.equal(groupes[0].titre, null);
      assert.equal(groupes[0].entrees[0].libelle, 'Accueil');
      const hrefs = groupes.flatMap((g) => g.entrees.map((e) => e.href));
      assert.equal(new Set(hrefs).size, hrefs.length);
      // Chaque entrée est active sur sa propre adresse.
      for (const g of groupes) for (const e of g.entrees) assert.equal(entreeActive(groupes, e.href)?.href, e.href);
    }
  });
  it('compteurs : Alertes, livrables, demandes', () => {
    const cles = (g: typeof F): string[] => g.flatMap((x) => x.entrees.map((e) => e.compteur).filter(Boolean) as string[]);
    assert.deepEqual(cles(F).sort(), ['alertes', 'livrablesACorriger', 'tentativesAEvaluer']);
    assert.deepEqual(cles(A).sort(), ['demandesAffectation', 'demandesRole', 'propositions']);
  });
  it('rôles concernés', () => {
    assert.equal(aNavigationLaterale('FORMATEUR'), true);
    assert.equal(aNavigationLaterale('ADMINISTRATEUR'), true);
    assert.equal(aNavigationLaterale('APPRENANT'), false);
    assert.equal(aNavigationLaterale(null), false);
  });
});

describe('filAriane', () => {
  it('suit le menu latéral pour le formateur et l’administrateur', () => {
    assert.deepEqual(filAriane('FORMATEUR', `/formateur/qcm/${ID}/tentatives`), [
      { href: '/formateur/tableau-de-bord', libelle: 'Accueil' },
      { href: '/formateur/qcm', libelle: 'Tentatives des QCM' },
    ]);
    assert.deepEqual(filAriane('ADMINISTRATEUR', '/admin/role-requests'), [
      { href: '/admin/tableau-de-bord', libelle: 'Accueil' },
      { href: '/admin/role-requests', libelle: 'Demandes de rôle' },
    ]);
  });
  it('onglets d’Alertes gardés', () => {
    assert.deepEqual(filAriane('FORMATEUR', '/formateur/alertes/surveillance'), [
      { href: '/formateur/tableau-de-bord', libelle: 'Accueil' },
      { href: '/formateur/alertes', libelle: 'Alertes' },
      { href: '/formateur/alertes/surveillance', libelle: 'Surveillance des QCM' },
    ]);
    assert.equal(sousNavigation('ADMINISTRATEUR', 'Formations').length, 0);
  });
  it('vide sur l’accueil et hors menu ; apprenant inchangé', () => {
    assert.deepEqual(filAriane('FORMATEUR', '/formateur/tableau-de-bord'), []);
    assert.deepEqual(filAriane('ADMINISTRATEUR', '/securite'), []);
    assert.deepEqual(filAriane('APPRENANT', '/mes-certificats'), [
      { href: '/mon-espace', libelle: 'Accueil' },
      { href: '/mes-certificats', libelle: 'Mes certificats' },
    ]);
  });
});

describe('texteCompteurMenu', () => {
  it('zéro ou absent masqué, plafond 99+', () => {
    assert.equal(texteCompteurMenu(0), null);
    assert.equal(texteCompteurMenu(undefined), null);
    assert.equal(texteCompteurMenu(-1), null);
    assert.equal(texteCompteurMenu(7), '7');
    assert.equal(texteCompteurMenu(120), '99+');
  });
});
