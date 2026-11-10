import { NotFoundException } from '@nestjs/common';
import { ILike } from 'typeorm';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { CertificatAdminVue, CertificatsService, criteresRecherche } from './certificats.service';
import {
  ACTION_VERIFICATION,
  MAX_HISTORIQUE,
  NB_CONSULTATIONS_RECENTES,
  SupervisionCertificatsService,
} from './supervision-certificats.service';

/**
 * US-DASH-02 — Supervision des certificats : compteur de consultations
 * (une requête groupée, zéro par défaut), fiche (résumé, consultations
 * récentes sans IP, historique sans les vérifications), critères de recherche.
 * La base réelle est éprouvée par l'e2e (`E2E-DASH02`).
 */
describe('SupervisionCertificatsService (US-DASH-02)', () => {
  const DATE = new Date('2026-11-09T10:00:00Z');
  const vue = (id: string): CertificatAdminVue =>
    ({ id, statut: StatutCertificat.ACTIF, empreinteSha256: 'abc' }) as CertificatAdminVue;

  const dataSource = { query: jest.fn() };
  const certificats = { lister: jest.fn(), vueAdminOu404: jest.fn() };
  let service: SupervisionCertificatsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SupervisionCertificatsService(
      dataSource as never,
      certificats as unknown as CertificatsService,
    );
  });

  describe('lister / enrichir', () => {
    it('compte les consultations en une requête groupée ; zéro sans vérification', async () => {
      certificats.lister.mockResolvedValue([vue('c1'), vue('c2')]);
      dataSource.query.mockResolvedValue([{ cible: 'c1', total: 3, derniere: DATE }]);

      const liste = await service.lister(StatutCertificat.ACTIF, '  ines ');

      expect(certificats.lister).toHaveBeenCalledWith(StatutCertificat.ACTIF, 'ines');
      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('GROUP BY cible');
      expect(params).toEqual([ACTION_VERIFICATION, ['c1', 'c2']]);
      expect(liste[0].consultations).toEqual({ total: 3, derniere: DATE });
      expect(liste[1].consultations).toEqual({ total: 0, derniere: null });
    });

    it('recherche vide ou blanche -> pas de recherche', async () => {
      certificats.lister.mockResolvedValue([]);
      await service.lister(undefined, '   ');
      expect(certificats.lister).toHaveBeenCalledWith(undefined, undefined);
    });

    it('liste vide -> aucune requête de comptage', async () => {
      certificats.lister.mockResolvedValue([]);
      await expect(service.lister()).resolves.toEqual([]);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('fiche', () => {
    it('404 si le certificat n existe pas (aucune lecture du journal)', async () => {
      certificats.vueAdminOu404.mockRejectedValue(new NotFoundException('Certificat introuvable.'));
      await expect(service.fiche('c1')).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('résumé, consultations récentes (date + verdict), historique sans vérifications', async () => {
      certificats.vueAdminOu404.mockResolvedValue(vue('c1'));
      dataSource.query
        .mockResolvedValueOnce([{ total: 5, valides: 3, derniere: DATE }])
        .mockResolvedValueOnce([{ horodatage: DATE, verdict: 'REVOQUE' }])
        .mockResolvedValueOnce([
          {
            horodatage: DATE,
            action: 'CERTIFICAT_DEMANDE',
            resultat: 'Succès',
            details: { scoreFinal: 80 },
            user_id: null,
            email: null,
            prenom: null,
            nom: null,
          },
          {
            horodatage: DATE,
            action: 'CERTIFICAT_REVOQUE',
            resultat: 'Succès',
            details: null,
            user_id: 'adm',
            email: 'adm@x.tn',
            prenom: 'Inès',
            nom: 'Admin',
          },
          {
            horodatage: DATE,
            action: 'CERTIFICAT_RELANCE',
            resultat: 'Succès',
            details: null,
            user_id: 'supprime',
            email: null,
            prenom: null,
            nom: null,
          },
        ]);

      const fiche = await service.fiche('c1');

      expect(fiche.certificat.empreinteSha256).toBe('abc');
      expect(fiche.certificat.consultations).toEqual({ total: 5, derniere: DATE });
      expect(fiche.consultations).toEqual({ total: 5, valides: 3, refusees: 2, derniere: DATE });
      expect(fiche.consultationsRecentes).toEqual([{ horodatage: DATE, verdict: 'REVOQUE' }]);
      expect(fiche.historique.map((e) => e.action)).toEqual([
        'CERTIFICAT_DEMANDE',
        'CERTIFICAT_REVOQUE',
        'CERTIFICAT_RELANCE',
      ]);
      expect(fiche.historique[0].acteur).toBeNull();
      expect(fiche.historique[1].acteur).toEqual({
        id: 'adm',
        email: 'adm@x.tn',
        prenom: 'Inès',
        nom: 'Admin',
      });
      expect(fiche.historique[2].acteur).toBeNull();

      const [, paramsRecentes] = dataSource.query.mock.calls[1];
      expect(paramsRecentes).toEqual([ACTION_VERIFICATION, 'c1', NB_CONSULTATIONS_RECENTES]);
      const [sqlHisto, paramsHisto] = dataSource.query.mock.calls[2];
      expect(sqlHisto).toContain('a.action <> $2');
      expect(sqlHisto).toContain('ORDER BY a.horodatage ASC');
      expect(paramsHisto).toEqual(['c1', ACTION_VERIFICATION, MAX_HISTORIQUE]);
      // Données minimales : aucune adresse IP de visiteur.
      expect(JSON.stringify(fiche.consultationsRecentes)).not.toMatch(/adresse|ip/i);
    });
  });

  describe('criteresRecherche', () => {
    it('OU sur email, prénom, nom, titre ; jokers neutralisés ; statut conservé', () => {
      const c = criteresRecherche({ statut: StatutCertificat.ACTIF }, ' 50%_x ');
      const motif = ILike('%50\\%\\_x%');
      expect(c).toEqual([
        { statut: StatutCertificat.ACTIF, apprenant: { email: motif } },
        { statut: StatutCertificat.ACTIF, apprenant: { prenom: motif } },
        { statut: StatutCertificat.ACTIF, apprenant: { nom: motif } },
        { statut: StatutCertificat.ACTIF, formation: { titre: motif } },
      ]);
    });

    it('un identifiant (UUID) ajoute la correspondance exacte', () => {
      const id = '0b0f8a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
      const c = criteresRecherche({}, id);
      expect(c).toHaveLength(5);
      expect(c[4]).toEqual({ id });
    });
  });
});
