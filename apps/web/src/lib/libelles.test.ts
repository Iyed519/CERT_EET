/**
 * US-UX-01 — Tests des libellés humains (fonctions pures).
 * Lancement : `npm run test:unitaires` (Node 22+, `--experimental-strip-types`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LIBELLES_ACTION_AUDIT,
  LIBELLES_CATEGORIE_AUDIT,
  categorieAudit,
  libelleActeur,
  libelleActionAudit,
  pastilleDuStatut,
} from './libelles.ts';

describe('libelleActionAudit', () => {
  it('traduit les codes vus dans « Activité récente »', () => {
    assert.equal(libelleActionAudit('LOGIN'), 'Connexion');
    assert.equal(libelleActionAudit('COMPTE_ACTIVE'), 'Compte activé');
    assert.equal(libelleActionAudit('GENERATION_IA_TERMINEE'), 'Génération IA terminée');
  });
  it('donne un repli lisible pour un code inconnu, sigles gardés', () => {
    assert.equal(libelleActionAudit('NOUVEAU_CODE_INCONNU'), 'Nouveau code inconnu');
    assert.equal(libelleActionAudit('QCM_ARCHIVE_IA'), 'QCM archive IA');
  });
  it('tiret pour une valeur absente', () => {
    assert.equal(libelleActionAudit(null), '—');
    assert.equal(libelleActionAudit(''), '—');
  });
  it('aucun libellé connu ne contient de code brut', () => {
    for (const [code, libelle] of Object.entries(LIBELLES_ACTION_AUDIT)) {
      assert.ok(!/[A-Z]{2,}_[A-Z]/.test(libelle), `${code} → ${libelle}`);
      assert.notEqual(libelle, code);
    }
  });
});

describe('categorieAudit', () => {
  const attendu: Array<[string, string]> = [
    ['LOGIN', 'connexions'],
    ['LOGOUT', 'connexions'],
    ['CONNEXION_OAUTH', 'connexions'],
    ['COMPTE_ACTIVE', 'comptes'],
    ['ROLE_CHANGE', 'comptes'],
    ['DEMANDE_ROLE_TRAITEE', 'comptes'],
    ['FORMATION_CREEE', 'formations'],
    ['DEMANDE_AFFECTATION_ACCEPTEE', 'formations'],
    ['INSCRIPTION_SUSPENDUE', 'formations'],
    ['ALERTE_DECROCHAGE_CREEE', 'formations'],
    ['RAPPORT_GENERE', 'formations'],
    ['QCM_PUBLIE', 'evaluations'],
    ['TENTATIVE_NOTEE', 'evaluations'],
    ['LIVRABLE_SOUMIS', 'evaluations'],
    ['SURVEILLANCE_ALERTE', 'evaluations'],
    ['ALERTE_SURVEILLANCE_EXAMINEE', 'evaluations'],
    ['RAPPORT_QCM_TELECHARGE', 'evaluations'],
    ['CERTIFICAT_EMIS', 'certificats'],
    ['CERTIFICATION_DECLENCHEE', 'certificats'],
    ['GENERATION_IA_TERMINEE', 'ia'],
    ['QUESTIONS_EXTRACTION_LANCEE', 'ia'],
    ['QUESTION_EXTRAITE_ACCEPTEE', 'ia'],
    ['SUPPORT_INDEXE', 'ia'],
    ['MFA_ACTIVEE', 'securite'],
    ['AUDIT_CONSULTE', 'securite'],
    ['ACCES_RESSOURCE_REFUSE', 'securite'],
  ];
  for (const [code, cat] of attendu) {
    it(`${code} → ${cat}`, () => assert.equal(categorieAudit(code), cat));
  }
  it('inconnu ou vide → sécurité', () => {
    assert.equal(categorieAudit('XYZ'), 'securite');
    assert.equal(categorieAudit(undefined), 'securite');
  });
  it('chaque code connu tombe dans une catégorie qui a un libellé', () => {
    for (const code of Object.keys(LIBELLES_ACTION_AUDIT)) {
      assert.ok(LIBELLES_CATEGORIE_AUDIT[categorieAudit(code)]);
    }
  });
});

describe('pastilleDuStatut', () => {
  it('statuts connus : libellé et ton', () => {
    assert.deepEqual(pastilleDuStatut('PUBLIE'), { libelle: 'Publié', ton: 'succes' });
    assert.deepEqual(pastilleDuStatut('BROUILLON'), { libelle: 'Brouillon', ton: 'brouillon' });
    assert.deepEqual(pastilleDuStatut('REVOQUE'), { libelle: 'Révoqué', ton: 'danger' });
    assert.equal(pastilleDuStatut('EN_ATTENTE').ton, 'attention');
  });
  it('statut inconnu : libellé lisible, ton neutre', () => {
    assert.deepEqual(pastilleDuStatut('ETAT_INEDIT'), { libelle: 'Etat inedit', ton: 'neutre' });
  });
});

describe('libelleActeur', () => {
  it('e-mail ou « Système »', () => {
    assert.equal(libelleActeur('a@b.tn'), 'a@b.tn');
    assert.equal(libelleActeur(null), 'Système');
    assert.equal(libelleActeur('  '), 'Système');
  });
});
