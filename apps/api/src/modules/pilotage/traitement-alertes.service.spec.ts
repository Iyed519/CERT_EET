import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  MESSAGE_ALERTE_INTROUVABLE,
  MESSAGE_DEJA_OUVERTE,
  MESSAGE_DEJA_TRAITEE,
  MESSAGE_OUVERTE_EXISTANTE,
  TraitementAlertesService,
} from './traitement-alertes.service';

const AL = 'a1e00000-0000-4000-8000-000000000001';
const FORM = 'f0000000-0000-4000-8000-0000000000f0';
const DATE = new Date('2026-11-10T10:00:00Z');

const LIGNE_ALERTE = {
  id: AL,
  critere: 'INACTIVITE',
  statut: 'TRAITEE',
  donnees: { joursSansConnexion: 9 },
  suggestion: 's',
  date_creation: DATE,
  date_traitement: DATE,
  formation_id: 'f1',
  titre: 'Back-end',
  apprenant_id: 'u1',
  prenom: 'Amel',
  nom: null,
  email: 'a@x',
};

/**
 * DataSource factice : `query` (lectures hors transaction) et `transaction`
 * (gestionnaire dont `query` répond selon le SQL).
 */
function monter(options: {
  misAJour?: number;
  existe?: boolean;
  erreurUpdate?: unknown;
  alerte?: boolean;
}): { service: TraitementAlertesService; tx: jest.Mock; record: jest.Mock } {
  const { misAJour = 1, existe = true, erreurUpdate, alerte = true } = options;
  const tx = jest.fn(async (sql: string) => {
    if (sql.includes('UPDATE alertes_decrochage')) {
      if (erreurUpdate) throw erreurUpdate;
      return [Array.from({ length: misAJour }, () => ({ id: AL })), misAJour];
    }
    if (sql.includes('SELECT 1 FROM alertes_decrochage')) return existe ? [{ '?column?': 1 }] : [];
    return [];
  });
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM alertes_decrochage a')) return alerte ? [LIGNE_ALERTE] : [];
    if (sql.includes('FROM actions_alerte')) {
      return [
        {
          id: 'x1',
          type: 'TRAITEMENT',
          commentaire: 'Appel passé.',
          date_action: DATE,
          auteur_id: FORM,
          prenom: 'Sami',
          nom: 'F',
          email: 'f@x',
        },
        {
          id: 'x2',
          type: 'REOUVERTURE',
          commentaire: 'Toujours absent.',
          date_action: DATE,
          auteur_id: null,
          prenom: null,
          nom: null,
          email: null,
        },
      ];
    }
    return [];
  });
  const ds = {
    query,
    transaction: async (cb: (m: { query: jest.Mock }) => Promise<unknown>) => cb({ query: tx }),
  } as unknown as DataSource;
  const record = jest.fn().mockResolvedValue(undefined);
  return {
    service: new TraitementAlertesService(ds, { record } as unknown as AuditService),
    tx,
    record,
  };
}

describe('TraitementAlertesService (US-SUIVI-03)', () => {
  describe('detail', () => {
    it('alerte et historique chronologique ; auteur supprimé = null', async () => {
      const { service } = monter({});
      const d = await service.detail(AL);
      expect(d).toMatchObject({
        id: AL,
        statut: 'TRAITEE',
        formation: { id: 'f1', titre: 'Back-end' },
        apprenant: { id: 'u1', prenom: 'Amel', nom: null, email: 'a@x' },
      });
      expect(d.historique).toEqual([
        {
          id: 'x1',
          type: 'TRAITEMENT',
          commentaire: 'Appel passé.',
          date: DATE,
          auteur: { id: FORM, prenom: 'Sami', nom: 'F', email: 'f@x' },
        },
        {
          id: 'x2',
          type: 'REOUVERTURE',
          commentaire: 'Toujours absent.',
          date: DATE,
          auteur: null,
        },
      ]);
    });

    it('404 si inconnue', async () => {
      const { service } = monter({ alerte: false });
      await expect(service.detail(AL)).rejects.toEqual(
        new NotFoundException(MESSAGE_ALERTE_INTROUVABLE),
      );
    });
  });

  describe('traiter', () => {
    it('OUVERTE -> TRAITEE : transition conditionnelle, historique, audit', async () => {
      const { service, tx, record } = monter({});
      await service.traiter(FORM, AL, 'Appel passé.', { adresseIp: '10.0.0.1' });
      const [update, insert] = tx.mock.calls as Array<[string, unknown[]]>;
      expect(update[0]).toContain(
        "SET statut = 'TRAITEE', date_traitement = now(), traite_par = $2",
      );
      expect(update[0]).toContain("WHERE id = $1 AND statut = 'OUVERTE'");
      expect(update[1]).toEqual([AL, FORM]);
      expect(insert[0]).toContain('INSERT INTO actions_alerte');
      expect(insert[1]).toEqual([AL, FORM, 'TRAITEMENT', 'Appel passé.']);
      expect(record).toHaveBeenCalledWith({
        action: 'ALERTE_TRAITEE',
        acteur: FORM,
        cible: AL,
        adresseIp: '10.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: { avant: 'OUVERTE', apres: 'TRAITEE' },
      });
    });

    it('déjà traitée : 409, rien historisé ni tracé', async () => {
      const { service, tx, record } = monter({ misAJour: 0 });
      await expect(service.traiter(FORM, AL, 'x')).rejects.toEqual(
        new ConflictException(MESSAGE_DEJA_TRAITEE),
      );
      expect(tx.mock.calls.some(([sql]) => (sql as string).includes('INSERT'))).toBe(false);
      expect(record).not.toHaveBeenCalled();
    });

    it('inconnue : 404', async () => {
      const { service } = monter({ misAJour: 0, existe: false });
      await expect(service.traiter(FORM, AL, 'x')).rejects.toEqual(
        new NotFoundException(MESSAGE_ALERTE_INTROUVABLE),
      );
    });
  });

  describe('rouvrir', () => {
    it('TRAITEE -> OUVERTE : traitement effacé, motif historisé, audit', async () => {
      const { service, tx, record } = monter({});
      await service.rouvrir(FORM, AL, 'Toujours absent.');
      const [update, insert] = tx.mock.calls as Array<[string, unknown[]]>;
      expect(update[0]).toContain(
        "SET statut = 'OUVERTE', date_traitement = NULL, traite_par = NULL",
      );
      expect(update[0]).toContain("WHERE id = $1 AND statut = 'TRAITEE'");
      expect(insert[1]).toEqual([AL, FORM, 'REOUVERTURE', 'Toujours absent.']);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ALERTE_ROUVERTE', acteur: FORM, cible: AL }),
      );
    });

    it('déjà ouverte : 409', async () => {
      const { service, record } = monter({ misAJour: 0 });
      await expect(service.rouvrir(FORM, AL, 'x')).rejects.toEqual(
        new ConflictException(MESSAGE_DEJA_OUVERTE),
      );
      expect(record).not.toHaveBeenCalled();
    });

    it('une autre alerte ouverte pour ce critère (23505) : 409 explicite', async () => {
      const { service, record } = monter({
        erreurUpdate: Object.assign(new Error('dup'), { code: '23505' }),
      });
      await expect(service.rouvrir(FORM, AL, 'x')).rejects.toEqual(
        new ConflictException(MESSAGE_OUVERTE_EXISTANTE),
      );
      expect(record).not.toHaveBeenCalled();
    });

    it('autre erreur de base : relancée telle quelle', async () => {
      const panne = new Error('connexion perdue');
      const { service } = monter({ erreurUpdate: panne });
      await expect(service.rouvrir(FORM, AL, 'x')).rejects.toBe(panne);
    });
  });
});
