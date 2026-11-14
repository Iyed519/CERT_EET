/**
 * Cert_EET — US-UX-01 — Tests de la logique de l'inventaire (node --test).
 *   cd outils/recette && node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliserLibelle, cleLibelle, gabarit, comparer, coutApres, indexer, correspond } = require('./inventaire-lib');

test('normaliserLibelle : espaces réduits, nombres remplacés', () => {
  assert.equal(normaliserLibelle('  Signalées   par l’IA (12) '), 'Signalées par l’IA (#)');
  assert.equal(normaliserLibelle('Note 14,5 / 20'), 'Note # / #');
  assert.equal(normaliserLibelle(null), '');
});

test('cleLibelle : casse et apostrophes unifiées', () => {
  assert.equal(cleLibelle('Journal d’audit'), cleLibelle("journal d'audit"));
});

test('gabarit : identifiants, requête, ancre et barre finale retirés', () => {
  assert.equal(
    gabarit('/formateur/qcm/0b5e7a9c-1d2e-4f3a-9b8c-7d6e5f4a3b2c/tentatives?f=1#x'),
    '/formateur/qcm/:id/tentatives',
  );
  assert.equal(gabarit('/admin/'), '/admin');
  assert.equal(gabarit('/'), '/');
  assert.equal(gabarit(undefined), null);
});

const inv = (pages) => ({ roles: { formateur: { pages } } });

test('comparer : action au même endroit → conservée', () => {
  const a = inv({ '/p': { actions: [{ type: 'bouton', libelle: 'Publier' }] } });
  const c = comparer(a, a);
  assert.equal(c.conservees, 1);
  assert.equal(c.perdues, 0);
});

test('comparer : action passée dans un menu « ⋯ » → conservée (un clic de plus)', () => {
  const avant = inv({ '/p': { actions: [{ type: 'bouton', libelle: 'Modules' }] } });
  const apres = inv({ '/p': { actions: [{ type: 'menu', libelle: 'Modules', profondeur: 1 }] } });
  assert.equal(comparer(avant, apres).conservees, 1);
});

test('comparer : action sur une page liée (onglet à adresse) → conservée', () => {
  const avant = inv({ '/f': { actions: [{ type: 'bouton', libelle: 'Nouveau QCM' }] } });
  const apres = inv({
    '/f': { actions: [{ type: 'lien', libelle: 'Contenu', href: '/f/contenu' }] },
    '/f/contenu': { actions: [{ type: 'bouton', libelle: 'Nouveau QCM' }] },
  });
  const c = comparer(avant, apres);
  assert.equal(c.conservees, 1);
  assert.equal(c.plusLoin, 0);
});

test('comparer : deux clics de plus → signalée « plus loin »', () => {
  const avant = inv({ '/f': { actions: [{ type: 'bouton', libelle: 'Nouveau QCM' }] } });
  const apres = inv({
    '/f': { actions: [{ type: 'lien', libelle: 'Contenu', href: '/f/contenu' }] },
    '/f/contenu': { actions: [{ type: 'menu', libelle: 'Nouveau QCM', profondeur: 1 }] },
  });
  const c = comparer(avant, apres);
  assert.equal(c.plusLoin, 1);
  assert.equal(c.roles.formateur.plusLoin[0].apres, 2);
});

test('comparer : un lien de profondeur 1 ne compte pas comme voisin direct', () => {
  const index = indexer({
    '/f': { actions: [{ type: 'menu', libelle: 'Contenu', href: '/f/contenu', profondeur: 1 }] },
    '/f/contenu': { actions: [{ type: 'bouton', libelle: 'X' }] },
  });
  assert.equal(coutApres('/f', { type: 'bouton', libelle: 'X' }, index, {}), null);
});

test('comparer : libellé changé mais même destination → conservée', () => {
  const avant = inv({ '/f': { actions: [{ type: 'lien', libelle: 'Suivi pédagogique', href: '/f/suivi' }] } });
  const apres = inv({ '/f': { actions: [{ type: 'onglet', libelle: 'Apprenants', href: '/f/suivi' }] } });
  assert.equal(comparer(avant, apres).conservees, 1);
});

test('comparer : équivalence documentée', () => {
  const avant = inv({ '/f': { actions: [{ type: 'bouton', libelle: '+ Nouveau QCM' }] } });
  const apres = inv({ '/f': { actions: [{ type: 'menu', libelle: 'QCM', profondeur: 1 }] } });
  assert.equal(comparer(avant, apres).perdues + comparer(avant, apres).deplacees, 1);
  const c = comparer(avant, apres, { '+ Nouveau QCM': ['QCM'] });
  assert.equal(c.conservees, 1);
});

test('comparer : action présente ailleurs → déplacée ; absente → perdue', () => {
  const avant = inv({
    '/a': { actions: [{ type: 'bouton', libelle: 'Exporter' }, { type: 'bouton', libelle: 'Statut' }] },
  });
  const apres = inv({ '/a': { actions: [] }, '/b': { actions: [{ type: 'bouton', libelle: 'Exporter' }] } });
  const c = comparer(avant, apres);
  assert.equal(c.deplacees, 1);
  assert.equal(c.perdues, 1);
  assert.equal(c.roles.formateur.perdues[0].libelle, 'Statut');
});

test('comparer : page absente après → signalée, ses actions cherchées ailleurs', () => {
  const avant = inv({ '/vieux': { actions: [{ type: 'bouton', libelle: 'Y' }] } });
  const apres = inv({ '/neuf': { actions: [{ type: 'bouton', libelle: 'Y' }] } });
  const c = comparer(avant, apres);
  assert.equal(c.pagesDisparues, 1);
  assert.equal(c.deplacees, 1);
});

test('comparer : doublons d’une même page comptés une fois', () => {
  const avant = inv({
    '/p': { actions: [{ type: 'bouton', libelle: 'Modifier' }, { type: 'bouton', libelle: 'Modifier' }] },
  });
  assert.equal(comparer(avant, avant).conservees, 1);
});

test('correspond : liens de destinations différentes et libellés différents → non', () => {
  assert.equal(
    correspond({ libelle: 'A', href: '/x' }, { libelle: 'B', href: '/y' }, {}),
    false,
  );
});

test('comparer : lien de page passé dans la coque (menu latéral) → conservé', () => {
  const avant = inv({ '/admin/formations': { actions: [{ type: 'lien', libelle: 'Propositions', href: '/admin/propositions-formation' }] } });
  const apres = inv({
    '(coque)': { actions: [{ type: 'lien', libelle: 'Propositions', href: '/admin/propositions-formation' }] },
    '/admin/formations': { actions: [] },
  });
  assert.equal(comparer(avant, apres).conservees, 1);
});
