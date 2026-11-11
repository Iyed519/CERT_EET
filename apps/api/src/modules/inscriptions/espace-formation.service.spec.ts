import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { EligibiliteService } from '../certificats/eligibilite.service';
import { AuditService } from '../audit/audit.service';
import {
  avancementModule,
  avancementQcm,
  EspaceFormationService,
  etatFenetre,
  tentativeAReprendre,
} from './espace-formation.service';

/**
 * Tests unitaires d'EspaceFormationService (US-INSC-04).
 *
 * Repositories et audit simulés : je vérifie qui passe (inscription EN_COURS
 * ou TERMINEE), qui est refusé et tracé (absente, suspendue), que seuls les
 * QCM PUBLIÉS sont demandés, et le calcul d'avancement QCM / module.
 */
describe('EspaceFormationService', () => {
  let service: EspaceFormationService;

  const mockInscriptionRepo = { findOne: jest.fn() };
  const mockFormationRepo = { findOneOrFail: jest.fn() };
  const mockQcmRepo = { find: jest.fn() };
  const mockTentativeRepo = { find: jest.fn() };
  const mockAtelierRepo = { find: jest.fn(), query: jest.fn() };
  const mockLivrableRepo = { find: jest.fn(), query: jest.fn() };
  const mockRessourceRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockAuditService = { record: jest.fn().mockResolvedValue(undefined) };
  const mockEligibilite = {
    evaluer: jest.fn().mockResolvedValue({
      eligible: false,
      raison: 'Certification non éligible : 0 évaluation validée sur 1.',
      validees: 0,
      requises: 1,
      evaluations: [],
      scoreFinal: null,
    }),
  };

  const contexte = {
    adresseIp: '127.0.0.1',
    methode: 'GET',
    route: '/api/formations/form-1/mon-espace',
  };

  const inscription = (statut: StatutInscription): Partial<Inscription> => ({
    id: 'insc-1',
    statut,
    dateInscription: new Date('2026-10-10T10:00:00Z'),
    dateEcheance: '2026-12-18',
    tauxAvancement: 25,
  });

  const formation = {
    id: 'form-1',
    titre: 'DevOps',
    description: null,
    objectifs: null,
    prerequis: null,
    dateDebut: '2026-11-02',
    dateFin: '2026-12-18',
    dureeHeures: 42,
    statut: StatutFormation.FERMEE,
    noteMinCertification: 70,
    modules: [
      { id: 'mod-1', titre: 'Intro', ordre: 1, description: null },
      { id: 'mod-2', titre: 'Docker', ordre: 2, description: 'Conteneurs' },
      { id: 'mod-3', titre: 'Bilan', ordre: 3, description: null },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EspaceFormationService,
        { provide: getRepositoryToken(Inscription), useValue: mockInscriptionRepo },
        { provide: getRepositoryToken(Formation), useValue: mockFormationRepo },
        { provide: getRepositoryToken(Qcm), useValue: mockQcmRepo },
        { provide: getRepositoryToken(TentativeQcm), useValue: mockTentativeRepo },
        { provide: getRepositoryToken(Atelier), useValue: mockAtelierRepo },
        { provide: getRepositoryToken(Livrable), useValue: mockLivrableRepo },
        { provide: getRepositoryToken(RessourceModule), useValue: mockRessourceRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EligibiliteService, useValue: mockEligibilite },
      ],
    }).compile();
    service = moduleRef.get(EspaceFormationService);

    mockInscriptionRepo.findOne.mockResolvedValue(inscription(StatutInscription.EN_COURS));
    mockFormationRepo.findOneOrFail.mockResolvedValue(formation);
    mockQcmRepo.find.mockResolvedValue([
      { id: 'qcm-1', moduleId: 'mod-1', titre: 'Quiz intro', description: null },
      { id: 'qcm-2', moduleId: 'mod-2', titre: 'Quiz Docker 1', description: null },
      { id: 'qcm-3', moduleId: 'mod-2', titre: 'Quiz Docker 2', description: null },
    ]);
    mockTentativeRepo.find.mockResolvedValue([
      { qcmId: 'qcm-1', statut: StatutTentative.NOTEE, estReussie: true },
      { qcmId: 'qcm-2', statut: StatutTentative.NOTEE, estReussie: false },
    ]);
    mockAtelierRepo.find.mockResolvedValue([]);
    mockLivrableRepo.find.mockResolvedValue([]);
    mockLivrableRepo.query.mockResolvedValue([]);
    mockAtelierRepo.query.mockResolvedValue([{ maintenant: new Date('2026-11-08T10:00:00Z') }]);
  });

  describe('monEspace — certification (US-ATEL-09)', () => {
    it('donne le verdict d’éligibilité et, s’il existe, le statut de mon certificat', async () => {
      mockLivrableRepo.query.mockResolvedValue([{ id: 'cert-1', statut: 'EN_GENERATION' }]);
      const espace = await service.monEspace('appr-1', 'form-1', contexte);
      expect(mockEligibilite.evaluer).toHaveBeenCalledWith('appr-1', 'form-1');
      expect(mockLivrableRepo.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'NOT EXISTS (SELECT 1 FROM certificats n WHERE n.remplace_certificat_id = c.id)',
        ),
        ['appr-1', 'form-1'],
      );
      expect(espace.certification).toEqual({
        eligible: false,
        raison: 'Certification non éligible : 0 évaluation validée sur 1.',
        validees: 0,
        requises: 1,
        certificat: { id: 'cert-1', statut: 'EN_GENERATION' },
      });
    });
  });

  describe('monEspace — ateliers publiés (US-ATEL-03)', () => {
    it('US-ATEL-08 : « Nouveau feedback » pour un livrable NOTÉ jamais consulté', async () => {
      mockAtelierRepo.find.mockResolvedValue(
        ['at-1', 'at-2', 'at-3'].map((id) => ({
          id,
          moduleId: 'mod-2',
          titre: id,
          dateLimite: new Date('2026-11-20T23:59:00Z'),
          toleranceRetardHeures: 0,
          typesLivrables: ['zip'],
        })),
      );
      mockLivrableRepo.find.mockResolvedValue([
        { id: 'l1', atelierId: 'at-1', statut: 'NOTE' },
        { id: 'l2', atelierId: 'at-2', statut: 'NOTE' },
        { id: 'l3', atelierId: 'at-3', statut: 'EN_CORRECTION' },
      ]);
      mockLivrableRepo.query.mockResolvedValue([{ livrable_id: 'l2' }]);

      const espace = await service.monEspace('appr-1', 'form-1', contexte);
      expect(mockLivrableRepo.query).toHaveBeenCalledWith(
        'SELECT livrable_id FROM consultations_feedback WHERE livrable_id = ANY($1)',
        [['l1', 'l2']],
      );
      expect(espace.modules[1].ateliers.map((a) => [a.id, a.nouveauFeedback])).toEqual([
        ['at-1', true],
        ['at-2', false],
        ['at-3', false],
      ]);
    });

    it('ne demande que les ateliers PUBLIÉS des modules, et les range par module avec l’état du dépôt (horloge PostgreSQL)', async () => {
      mockAtelierRepo.find.mockResolvedValue([
        {
          id: 'at-1',
          moduleId: 'mod-2',
          titre: 'Dockeriser une API',
          dateLimite: new Date('2026-11-20T23:59:00Z'),
          toleranceRetardHeures: 0,
          typesLivrables: ['zip'],
        },
        {
          id: 'at-2',
          moduleId: 'mod-2',
          titre: 'Compose',
          dateLimite: new Date('2026-11-08T09:00:00Z'),
          toleranceRetardHeures: 2,
          typesLivrables: ['zip', 'md'],
        },
        {
          id: 'at-3',
          moduleId: 'mod-1',
          titre: 'Ancien',
          dateLimite: new Date('2026-11-01T00:00:00Z'),
          toleranceRetardHeures: 0,
          typesLivrables: ['pdf'],
        },
      ]);

      mockLivrableRepo.find.mockResolvedValue([{ id: 'l1', atelierId: 'at-1', statut: 'SOUMIS' }]);
      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(mockAtelierRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ statut: StatutAtelier.PUBLIE }),
        }),
      );
      // Liste blanche : jamais l'énoncé ni le formateur.
      const select = mockAtelierRepo.find.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('enonce');
      expect(select).not.toHaveProperty('formateurId');
      expect(mockAtelierRepo.query).toHaveBeenCalledWith('SELECT now() AS maintenant');
      expect(espace.modules[0].ateliers.map((a) => [a.id, a.etatDepot])).toEqual([
        ['at-3', 'CLOS'],
      ]);
      expect(espace.modules[1].ateliers.map((a) => [a.id, a.etatDepot])).toEqual([
        ['at-1', 'OUVERT'],
        ['at-2', 'EN_RETARD'],
      ]);
      expect(espace.modules[2].ateliers).toEqual([]);
      // US-ATEL-04 : seulement MES livrables, sur ces ateliers.
      expect(mockLivrableRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apprenantId: 'appr-1' }),
        }),
      );
      expect(espace.modules[1].ateliers.map((a) => a.statutMonLivrable)).toEqual(['SOUMIS', null]);
      expect(espace.modules[1].ateliers.map((a) => a.nouveauFeedback)).toEqual([false, false]);
      // Les ateliers ne changent pas l'avancement du module (pas encore notés).
      expect(espace.modules[2].avancement).toBe('SANS_EVALUATION');
    });

    it('sans atelier publié : pas de lecture de l’horloge, listes vides', async () => {
      const espace = await service.monEspace('appr-1', 'form-1', contexte);
      expect(mockAtelierRepo.query).not.toHaveBeenCalled();
      expect(espace.modules.every((m) => m.ateliers.length === 0)).toBe(true);
    });

    it('exigerAccesContenu : 403 tracé pour un non-inscrit, sans lire la formation', async () => {
      mockInscriptionRepo.findOne.mockResolvedValue(null);
      await expect(service.exigerAccesContenu('appr-1', 'form-1', contexte)).rejects.toThrow(
        new ForbiddenException('Vous n’êtes pas inscrit à cette formation.'),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCES_RESSOURCE_REFUSE', resultat: 'Échec' }),
      );
      expect(mockFormationRepo.findOneOrFail).not.toHaveBeenCalled();
    });
  });

  describe('monEspace — ressources du cours (US-FORM-05)', () => {
    it('range les ressources par module, dans l’ordre, avec le lecteur vidéo et le domaine', async () => {
      const espaceSans = await service.monEspace('appr-1', 'form-1', contexte);
      const [premier, second] = espaceSans.modules;
      mockRessourceRepo.find.mockResolvedValueOnce([
        {
          id: 'r-1',
          moduleId: premier.id,
          ordre: 1,
          nature: 'LIEN',
          titre: 'Vidéo',
          description: null,
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          plateforme: 'YOUTUBE',
          videoId: 'dQw4w9WgXcQ',
          debutSecondes: 90,
        },
        {
          id: 'r-2',
          moduleId: second.id,
          ordre: 1,
          nature: 'LIEN',
          titre: 'Doc',
          description: 'Référence',
          url: 'https://www.rfc-editor.org/rfc/rfc7519',
          plateforme: 'WEB',
          videoId: null,
          debutSecondes: null,
        },
      ]);
      const espace = await service.monEspace('appr-1', 'form-1', contexte);
      expect(mockRessourceRepo.find).toHaveBeenLastCalledWith({
        where: { moduleId: expect.anything() },
        order: { ordre: 'ASC' },
      });
      expect(espace.modules[0].ressources).toEqual([
        expect.objectContaining({
          id: 'r-1',
          videoId: 'dQw4w9WgXcQ',
          debutSecondes: 90,
          domaine: 'youtube.com',
        }),
      ]);
      expect(espace.modules[1].ressources).toEqual([
        expect.objectContaining({ id: 'r-2', plateforme: 'WEB', domaine: 'rfc-editor.org' }),
      ]);
      expect(espace.modules[0].ressources[0]).not.toHaveProperty('ajoutePar');
    });
  });

  describe('monEspace', () => {
    it('renvoie formation, inscription et modules triés avec leurs QCM et mon avancement', async () => {
      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(espace.inscription).toMatchObject({ statut: 'EN_COURS', tauxAvancement: 25 });
      expect(espace.formation).toMatchObject({ id: 'form-1', statut: StatutFormation.FERMEE });
      expect(espace.modules.map((m) => [m.titre, m.avancement])).toEqual([
        ['Intro', 'COMPLETE'],
        ['Docker', 'A_FAIRE'],
        ['Bilan', 'SANS_EVALUATION'],
      ]);
      expect(espace.modules[1].qcms.map((q) => [q.titre, q.avancement])).toEqual([
        ['Quiz Docker 1', 'ECHOUE'],
        ['Quiz Docker 2', 'A_FAIRE'],
      ]);
      expect(mockAuditService.record).not.toHaveBeenCalled();
    });

    it('ne demande que les QCM PUBLIÉS, et seulement mes tentatives', async () => {
      await service.monEspace('appr-1', 'form-1', contexte);

      expect(mockQcmRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ statut: StatutQcm.PUBLIE }),
        }),
      );
      expect(mockTentativeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ apprenantId: 'appr-1' }) }),
      );
    });

    it('n’expose aucune donnée sensible d’un QCM (identité, avancement, fenêtre, durée et tentatives)', async () => {
      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(Object.keys(espace.modules[0].qcms[0]).sort()).toEqual(
        [
          'avancement',
          'dateFermeture',
          'dateOuverture',
          'description',
          'dureeMaxMinutes',
          'fenetre',
          'id',
          'nbTentativesMax',
          'nbTentativesPassees',
          'surveillanceWebcam',
          'tentativeEnCoursId',
          'titre',
        ].sort(),
      );
    });

    it('donne la durée, le nombre de tentatives et la tentative à reprendre (US-QCM-05)', async () => {
      mockQcmRepo.find.mockResolvedValue([
        {
          id: 'qcm-1',
          moduleId: 'mod-1',
          titre: 'Quiz intro',
          description: null,
          configuration: {
            dateOuverture: new Date(Date.now() - 86_400_000),
            dateFermeture: new Date(Date.now() + 86_400_000),
            dureeMaxMinutes: 45,
            nbTentativesMax: 3,
          },
        },
      ]);
      mockTentativeRepo.find.mockResolvedValue([
        {
          id: 't-notee',
          qcmId: 'qcm-1',
          statut: StatutTentative.NOTEE,
          estReussie: false,
          dateLimite: new Date(Date.now() - 3_600_000),
        },
        {
          id: 't-en-cours',
          qcmId: 'qcm-1',
          statut: StatutTentative.EN_COURS,
          estReussie: null,
          dateLimite: new Date(Date.now() + 600_000),
        },
      ]);

      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(espace.modules[0].qcms[0]).toMatchObject({
        dureeMaxMinutes: 45,
        nbTentativesMax: 3,
        nbTentativesPassees: 2,
        tentativeEnCoursId: 't-en-cours',
      });
    });

    it('donne les dates et l’état de la fenêtre d’un QCM configuré', async () => {
      const ouverture = new Date(Date.now() + 86_400_000);
      const fermeture = new Date(Date.now() + 2 * 86_400_000);
      mockQcmRepo.find.mockResolvedValue([
        {
          id: 'qcm-1',
          moduleId: 'mod-1',
          titre: 'Quiz intro',
          description: null,
          configuration: { dateOuverture: ouverture, dateFermeture: fermeture },
        },
      ]);

      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(espace.modules[0].qcms[0]).toMatchObject({
        dateOuverture: ouverture,
        dateFermeture: fermeture,
        fenetre: 'A_VENIR',
      });
    });

    it('une inscription TERMINEE garde l’accès', async () => {
      mockInscriptionRepo.findOne.mockResolvedValue(inscription(StatutInscription.TERMINEE));

      await expect(service.monEspace('appr-1', 'form-1', contexte)).resolves.toBeDefined();
    });

    it('sans module : pas de requête sur les QCM ni sur les tentatives', async () => {
      mockFormationRepo.findOneOrFail.mockResolvedValue({ ...formation, modules: [] });

      const espace = await service.monEspace('appr-1', 'form-1', contexte);

      expect(espace.modules).toEqual([]);
      expect(mockQcmRepo.find).not.toHaveBeenCalled();
      expect(mockTentativeRepo.find).not.toHaveBeenCalled();
      expect(mockAtelierRepo.find).not.toHaveBeenCalled();
    });

    it('403 et refus tracé si l’apprenant n’est pas inscrit', async () => {
      mockInscriptionRepo.findOne.mockResolvedValue(null);

      await expect(service.monEspace('appr-1', 'form-1', contexte)).rejects.toThrow(
        new ForbiddenException('Vous n’êtes pas inscrit à cette formation.'),
      );
      expect(mockFormationRepo.findOneOrFail).not.toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACCES_RESSOURCE_REFUSE',
          acteur: 'appr-1',
          cible: 'form-1',
          resultat: 'Échec',
          detailsAvantApres: expect.objectContaining({
            ressource: 'inscription',
            motif: 'NON_INSCRIT',
            route: '/api/formations/form-1/mon-espace',
          }),
        }),
      );
    });

    it('403 « suspendue » et refus tracé si l’inscription est suspendue', async () => {
      mockInscriptionRepo.findOne.mockResolvedValue(inscription(StatutInscription.SUSPENDUE));

      await expect(service.monEspace('appr-1', 'form-1', contexte)).rejects.toThrow(
        /suspendue : contactez un administrateur/,
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          detailsAvantApres: expect.objectContaining({ motif: 'INSCRIPTION_SUSPENDUE' }),
        }),
      );
    });

    it('un échec d’audit ne change pas le refus', async () => {
      mockInscriptionRepo.findOne.mockResolvedValue(null);
      mockAuditService.record.mockRejectedValueOnce(new Error('base indisponible'));

      await expect(service.monEspace('appr-1', 'form-1', contexte)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('tentativeAReprendre', () => {
    const maintenant = new Date('2026-11-02T10:00:00Z');

    it('renvoie la tentative EN_COURS encore dans son échéance', () => {
      expect(
        tentativeAReprendre(
          [
            {
              id: 'a',
              statut: StatutTentative.NOTEE,
              dateLimite: new Date('2026-11-02T11:00:00Z'),
            },
            {
              id: 'b',
              statut: StatutTentative.EN_COURS,
              dateLimite: new Date('2026-11-02T10:00:01Z'),
            },
          ],
          maintenant,
        ),
      ).toBe('b');
    });

    it('null pour une tentative EN_COURS échue (échéance = maintenant incluse) ou sans tentative', () => {
      expect(
        tentativeAReprendre(
          [{ id: 'b', statut: StatutTentative.EN_COURS, dateLimite: maintenant }],
          maintenant,
        ),
      ).toBeNull();
      expect(tentativeAReprendre([], maintenant)).toBeNull();
    });
  });

  describe('avancementQcm', () => {
    const t = (
      statut: StatutTentative,
      estReussie: boolean | null,
    ): { statut: StatutTentative; estReussie: boolean | null } => ({ statut, estReussie });

    it.each([
      ['aucune tentative', [], 'A_FAIRE'],
      ['une tentative en cours', [t(StatutTentative.EN_COURS, null)], 'EN_COURS'],
      ['soumise, pas encore notée', [t(StatutTentative.SOUMISE, null)], 'EN_COURS'],
      [
        'notées en échec',
        [t(StatutTentative.NOTEE, false), t(StatutTentative.NOTEE, false)],
        'ECHOUE',
      ],
      [
        'un échec puis une réussite',
        [t(StatutTentative.NOTEE, false), t(StatutTentative.NOTEE, true)],
        'REUSSI',
      ],
      [
        'réussie puis une nouvelle en cours',
        [t(StatutTentative.NOTEE, true), t(StatutTentative.EN_COURS, null)],
        'REUSSI',
      ],
    ])('%s -> %s', (_cas, tentatives, attendu) => {
      expect(avancementQcm(tentatives)).toBe(attendu);
    });
  });

  describe('etatFenetre', () => {
    const ouverture = new Date('2026-11-02T08:00:00Z');
    const fermeture = new Date('2026-11-02T18:00:00Z');
    it.each([
      ['avant l’ouverture', '2026-11-02T07:59:59Z', 'A_VENIR'],
      ['à l’ouverture exacte', '2026-11-02T08:00:00Z', 'OUVERTE'],
      ['pendant', '2026-11-02T12:00:00Z', 'OUVERTE'],
      ['à la fermeture exacte', '2026-11-02T18:00:00Z', 'FERMEE'],
    ])('%s -> %s', (_cas, instant, attendu) => {
      expect(etatFenetre(ouverture, fermeture, new Date(instant))).toBe(attendu);
    });
  });

  describe('avancementModule', () => {
    it.each([
      [[], 'SANS_EVALUATION'],
      [['REUSSI', 'REUSSI'], 'COMPLETE'],
      [['REUSSI', 'ECHOUE'], 'A_FAIRE'],
      [['A_FAIRE'], 'A_FAIRE'],
    ] as const)('%j -> %s', (avancements, attendu) => {
      expect(avancementModule([...avancements])).toBe(attendu);
    });
  });
});
