import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { Inscription } from '../../database/entities/inscription.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';
import {
  calculerDateLimite,
  verifierDelai,
  verifierFenetre,
  verifierQuota,
} from './tentative-demarrage.regles';
import { TentativeDemarrageService } from './tentative-demarrage.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';
import { TentativeNotationService } from './tentative-notation.service';
import { TentativeSessionService } from './tentative-session.service';
import { TentativeTirageService } from './tentative-tirage.service';

/**
 * Tests unitaires du démarrage d'une tentative (US-QCM-05).
 *
 * Règles pures : chaque refus avec son motif et son message, les bornes de
 * la fenêtre et du délai, l'échéance plafonnée à la fermeture. Service :
 * ordre des contrôles, reprise, clôture d'une tentative expirée, audit des
 * succès et des refus, course perdue (23505) traitée comme une reprise. Le
 * verrou et la concurrence réelle sont couverts par les tests e2e.
 */
describe('Démarrage d’une tentative', () => {
  const H = 3_600_000;
  const OUVERTURE = new Date('2026-11-02T08:00:00Z');
  const FERMETURE = new Date('2026-11-02T18:00:00Z');
  const MAINTENANT = new Date('2026-11-02T10:00:00Z');

  describe('verifierFenetre — [ouverture, fermeture)', () => {
    it('accepte l’instant d’ouverture exact (borne incluse)', () => {
      expect(verifierFenetre(OUVERTURE, OUVERTURE, FERMETURE)).toBeNull();
      expect(verifierFenetre(MAINTENANT, OUVERTURE, FERMETURE)).toBeNull();
    });

    it('refuse avant l’ouverture, avec la date d’ouverture comme réouverture', () => {
      expect(verifierFenetre(new Date(OUVERTURE.getTime() - 1), OUVERTURE, FERMETURE)).toEqual({
        raison: 'hors_fenetre',
        message: 'Ce QCM n’est pas encore ouvert.',
        dateReouverture: OUVERTURE,
      });
    });

    it('refuse à l’instant de fermeture exact (borne exclue), sans réouverture', () => {
      expect(verifierFenetre(FERMETURE, OUVERTURE, FERMETURE)).toEqual({
        raison: 'hors_fenetre',
        message: 'Ce QCM est fermé : sa fenêtre d’ouverture est passée.',
        dateReouverture: null,
      });
    });
  });

  describe('verifierQuota — toutes les tentatives comptent', () => {
    it('accepte tant qu’il reste une tentative', () => {
      expect(verifierQuota(0, 1)).toBeNull();
      expect(verifierQuota(2, 3)).toBeNull();
    });

    it.each([
      [1, 1, 'Vous avez utilisé votre tentative autorisée pour ce QCM.'],
      [3, 3, 'Vous avez utilisé vos 3 tentatives autorisées pour ce QCM.'],
    ])('refuse à %i tentative(s) sur %i', (passees, max, message) => {
      expect(verifierQuota(passees, max)).toEqual({
        raison: 'tentatives_epuisees',
        message,
        dateReouverture: null,
      });
    });
  });

  describe('verifierDelai — depuis la fin de la précédente', () => {
    const finie = { dateDebut: new Date(MAINTENANT.getTime() - 3 * H), dateFin: MAINTENANT };

    it('ignore la règle sans tentative précédente ou avec un délai de 0', () => {
      expect(verifierDelai(MAINTENANT, null, 24, FERMETURE)).toBeNull();
      expect(verifierDelai(MAINTENANT, finie, 0, FERMETURE)).toBeNull();
    });

    it('accepte à l’instant exact où le délai est écoulé', () => {
      const plusTard = new Date(MAINTENANT.getTime() + 2 * H);
      expect(verifierDelai(plusTard, finie, 2, FERMETURE)).toBeNull();
    });

    it('refuse avant la fin du délai, avec la date de réouverture', () => {
      const presque = new Date(MAINTENANT.getTime() + 2 * H - 1);
      expect(verifierDelai(presque, finie, 2, FERMETURE)).toEqual({
        raison: 'delai_non_respecte',
        message: 'Un délai de 2 h est imposé entre deux tentatives.',
        dateReouverture: new Date(MAINTENANT.getTime() + 2 * H),
      });
    });

    it('mesure depuis le début quand la précédente n’a pas de fin', () => {
      const sansFin = { dateDebut: new Date(MAINTENANT.getTime() - H), dateFin: null };
      expect(verifierDelai(MAINTENANT, sansFin, 2, FERMETURE)?.dateReouverture).toEqual(
        new Date(MAINTENANT.getTime() + H),
      );
    });

    it('sans date si la réouverture tombe à la fermeture ou après', () => {
      expect(verifierDelai(MAINTENANT, finie, 24, FERMETURE)).toEqual({
        raison: 'delai_non_respecte',
        message: 'Un délai de 24 h est imposé entre deux tentatives : le QCM sera fermé d’ici là.',
        dateReouverture: null,
      });
    });
  });

  describe('calculerDateLimite — min(début + durée, fermeture)', () => {
    it('début + durée quand la fenêtre le permet', () => {
      expect(calculerDateLimite(MAINTENANT, 30, FERMETURE)).toEqual(
        new Date('2026-11-02T10:30:00Z'),
      );
    });

    it('plafonnée à la fermeture', () => {
      const tard = new Date('2026-11-02T17:50:00Z');
      expect(calculerDateLimite(tard, 30, FERMETURE)).toEqual(FERMETURE);
    });
  });

  describe('TentativeDemarrageService', () => {
    const APPRENANT = 'a0000000-0000-4000-8000-000000000001';
    const QCM_ID = 'c0000000-0000-4000-8000-000000000001';
    const FORMATION_ID = 'f0000000-0000-4000-8000-000000000001';
    const INSCRIPTION_ID = 'i0000000-0000-4000-8000-000000000001';
    const CONTEXTE = { adresseIp: '127.0.0.1', methode: 'POST', route: '/api/qcm/x/tentatives' };

    let service: TentativeDemarrageService;
    let qcmRepository: { findOne: jest.Mock };
    let inscriptionRepository: { findOne: jest.Mock };
    let session: {
      controler: jest.Mock;
      armerMiroir: jest.Mock;
      effacerMiroir: jest.Mock;
      refuser: jest.Mock;
    };
    const SESSION = 's0000000-0000-4000-8000-000000000001';
    let auditService: { record: jest.Mock };
    let tirageService: { tirer: jest.Mock };
    let minuterie: { armer: jest.Mock; effacer: jest.Mock };
    let notation: { noterSansEchec: jest.Mock };
    const PLAN = [{ questionId: 'q1', optionIds: ['o2', 'o1'] }];
    let dataSource: { transaction: jest.Mock };
    let manager: {
      findOne: jest.Mock;
      findOneOrFail: jest.Mock;
      countBy: jest.Mock;
      query: jest.Mock;
      update: jest.Mock;
      save: jest.Mock;
      create: jest.Mock;
    };

    // État simulé de la base, lu par le faux EntityManager.
    let inscriptionVerrouillee: Partial<Inscription> | null;
    let enCours: TentativeQcm | null;
    let precedente: Partial<TentativeQcm> | null;
    let nbTentatives: number;

    const configuration = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
      dureeMaxMinutes: 30,
      dateOuverture: OUVERTURE,
      dateFermeture: FERMETURE,
      nbTentativesMax: 2,
      delaiEntreTentatives: 0,
      blocageSessionsMultiples: false,
      ...surcharge,
    });

    const qcmPublie = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
      id: QCM_ID,
      statut: StatutQcm.PUBLIE,
      module: { formationId: FORMATION_ID },
      configuration: configuration(),
      ...surcharge,
    });

    const tentative = (surcharge: Partial<TentativeQcm> = {}): TentativeQcm =>
      ({
        id: 't0000000-0000-4000-8000-000000000001',
        apprenantId: APPRENANT,
        qcmId: QCM_ID,
        statut: StatutTentative.EN_COURS,
        dateDebut: new Date(MAINTENANT.getTime() - 10 * 60_000),
        dateLimite: new Date(MAINTENANT.getTime() + 20 * 60_000),
        dateFin: null,
        dureeEffective: null,
        ...surcharge,
      }) as TentativeQcm;

    const demarrer = (): ReturnType<TentativeDemarrageService['demarrer']> =>
      service.demarrer(APPRENANT, QCM_ID, SESSION, CONTEXTE);

    beforeEach(async () => {
      inscriptionVerrouillee = { id: INSCRIPTION_ID, statut: StatutInscription.EN_COURS };
      enCours = null;
      precedente = null;
      nbTentatives = 0;

      manager = {
        findOne: jest.fn((entite: unknown, options: { where: Record<string, unknown> }) => {
          if (entite === Inscription) return Promise.resolve(inscriptionVerrouillee);
          if (options.where.statut === StatutTentative.EN_COURS) return Promise.resolve(enCours);
          return Promise.resolve(precedente);
        }),
        findOneOrFail: jest.fn(),
        countBy: jest.fn(() => Promise.resolve(nbTentatives)),
        query: jest.fn().mockResolvedValue([{ maintenant: MAINTENANT }]),
        update: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entite: unknown, valeurs: Partial<TentativeQcm>) => ({ ...valeurs })),
        save: jest.fn((_entite: unknown, valeurs: Partial<TentativeQcm>) =>
          Promise.resolve({ id: 'nouvelle', ...valeurs }),
        ),
      };
      qcmRepository = { findOne: jest.fn().mockResolvedValue(qcmPublie()) };
      inscriptionRepository = {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: INSCRIPTION_ID, statut: StatutInscription.EN_COURS }),
      };
      session = {
        controler: jest.fn().mockResolvedValue('autorisee'),
        armerMiroir: jest.fn().mockResolvedValue(undefined),
        effacerMiroir: jest.fn().mockResolvedValue(undefined),
        refuser: jest.fn().mockRejectedValue(new ConflictException('session')),
      };
      auditService = { record: jest.fn().mockResolvedValue(undefined) };
      tirageService = { tirer: jest.fn().mockResolvedValue(PLAN) };
      notation = { noterSansEchec: jest.fn().mockResolvedValue(null) };
      minuterie = {
        armer: jest.fn().mockResolvedValue(undefined),
        effacer: jest.fn().mockResolvedValue(undefined),
      };
      dataSource = {
        transaction: jest.fn((travail: (m: typeof manager) => Promise<unknown>) =>
          travail(manager),
        ),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          TentativeDemarrageService,
          { provide: DataSource, useValue: dataSource },
          { provide: getRepositoryToken(Qcm), useValue: qcmRepository },
          { provide: getRepositoryToken(Inscription), useValue: inscriptionRepository },
          { provide: TentativeSessionService, useValue: session },
          { provide: AuditService, useValue: auditService },
          { provide: TentativeTirageService, useValue: tirageService },
          { provide: TentativeMinuterieService, useValue: minuterie },
          { provide: TentativeNotationService, useValue: notation },
        ],
      }).compile();
      service = moduleRef.get(TentativeDemarrageService);
    });

    describe('404 — le QCM n’est pas révélé', () => {
      it.each([
        ['inconnu', null],
        ['brouillon', qcmPublie({ statut: StatutQcm.BROUILLON })],
        ['non publié', qcmPublie({ statut: StatutQcm.NON_PUBLIE })],
        ['publié sans configuration', qcmPublie({ configuration: null })],
      ])('QCM %s -> 404 sans transaction', async (_cas, qcm) => {
        qcmRepository.findOne.mockResolvedValue(qcm);
        await expect(demarrer()).rejects.toThrow(new NotFoundException('QCM introuvable.'));
        expect(dataSource.transaction).not.toHaveBeenCalled();
      });
    });

    it('US-FORM-02 : formation archivée -> 409, sans transaction', async () => {
      qcmRepository.findOne.mockResolvedValue(
        qcmPublie({ module: { formationId: FORMATION_ID, formation: { statut: 'ARCHIVEE' } } }),
      );
      await expect(demarrer()).rejects.toThrow(
        new ConflictException('Cette formation est archivée : son parcours est figé.'),
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('US-FORM-02 : formation fermée -> le démarrage reste possible pour les inscrits', async () => {
      qcmRepository.findOne.mockResolvedValue(
        qcmPublie({ module: { formationId: FORMATION_ID, formation: { statut: 'FERMEE' } } }),
      );
      await demarrer().catch(() => undefined);
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    describe('403 — l’inscription EN_COURS ouvre le démarrage', () => {
      it.each([
        ['absente', null, 'NON_INSCRIT', 'Vous n’êtes pas inscrit à cette formation.'],
        [
          'suspendue',
          { statut: StatutInscription.SUSPENDUE },
          'INSCRIPTION_SUSPENDUE',
          'Votre inscription à cette formation est suspendue : contactez un administrateur.',
        ],
        [
          'terminée',
          { statut: StatutInscription.TERMINEE },
          'INSCRIPTION_TERMINEE',
          'Votre formation est terminée : vous ne pouvez plus démarrer d’évaluation.',
        ],
      ])('inscription %s -> 403 tracé', async (_cas, inscription, motif, message) => {
        inscriptionRepository.findOne.mockResolvedValue(inscription);

        await expect(demarrer()).rejects.toThrow(new ForbiddenException(message));
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'ACCES_RESSOURCE_REFUSE',
            acteur: APPRENANT,
            cible: FORMATION_ID,
            resultat: 'Échec',
            detailsAvantApres: expect.objectContaining({ ressource: 'inscription', motif }),
          }),
        );
        expect(dataSource.transaction).not.toHaveBeenCalled();
      });
    });

    describe('201 — création', () => {
      it('crée la tentative EN_COURS à l’heure de la base, échéance plafonnée, audit', async () => {
        nbTentatives = 0;
        const vue = await demarrer();

        expect(manager.findOne).toHaveBeenCalledWith(
          Inscription,
          expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
        );
        expect(manager.query).toHaveBeenCalledWith('SELECT now() AS maintenant');
        expect(manager.save).toHaveBeenCalledWith(
          TentativeQcm,
          expect.objectContaining({
            apprenantId: APPRENANT,
            qcmId: QCM_ID,
            statut: StatutTentative.EN_COURS,
            dateDebut: MAINTENANT,
            dateLimite: new Date('2026-11-02T10:30:00Z'),
            planTirage: PLAN,
            // US-QCM-10 : la session de la requête détient la tentative.
            sessionId: SESSION,
          }),
        );
        // Tirage dans la transaction de création, avec la configuration du QCM (US-QCM-06).
        expect(tirageService.tirer).toHaveBeenCalledWith(
          manager,
          QCM_ID,
          expect.objectContaining({ nbTentativesMax: 2 }),
        );
        expect(vue).toEqual({
          id: 'nouvelle',
          qcmId: QCM_ID,
          statut: StatutTentative.EN_COURS,
          dateDebut: MAINTENANT,
          dateLimite: new Date('2026-11-02T10:30:00Z'),
          dureeMaxMinutes: 30,
          numero: 1,
          nbTentativesMax: 2,
          tentativesRestantes: 1,
          reprise: false,
        });
        expect(auditService.record).toHaveBeenCalledTimes(1);
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TENTATIVE_DEMARREE',
            cible: 'nouvelle',
            resultat: 'Succès',
            detailsAvantApres: expect.objectContaining({ qcmId: QCM_ID, numero: 1 }),
          }),
        );
        // Minuterie Redis posée à l'échéance de la tentative (US-QCM-07, D1).
        expect(minuterie.armer).toHaveBeenCalledWith('nouvelle', new Date('2026-11-02T10:30:00Z'));
        expect(minuterie.effacer).not.toHaveBeenCalled();
        // Miroir Redis du verrou de session, à la même échéance (US-QCM-10, D3).
        expect(session.armerMiroir).toHaveBeenCalledWith(
          APPRENANT,
          QCM_ID,
          SESSION,
          new Date('2026-11-02T10:30:00Z'),
        );
        // Une création ne passe pas par le contrôle de session.
        expect(session.controler).not.toHaveBeenCalled();
      });

      it('la seconde tentative, délai écoulé, porte le numéro 2', async () => {
        qcmRepository.findOne.mockResolvedValue(
          qcmPublie({ configuration: configuration({ delaiEntreTentatives: 1 }) }),
        );
        nbTentatives = 1;
        precedente = {
          dateDebut: new Date(MAINTENANT.getTime() - 2 * H),
          dateFin: new Date(MAINTENANT.getTime() - H),
        };

        const vue = await demarrer();
        expect(vue).toMatchObject({ numero: 2, tentativesRestantes: 0, reprise: false });
      });
    });

    describe('200 — reprise d’une tentative EN_COURS valide', () => {
      it('renvoie la même tentative, sans écrire ni auditer', async () => {
        enCours = tentative();
        nbTentatives = 1;

        const vue = await demarrer();
        expect(vue).toMatchObject({ id: enCours.id, reprise: true, numero: 1 });
        expect(manager.save).not.toHaveBeenCalled();
        expect(tirageService.tirer).not.toHaveBeenCalled();
        expect(manager.update).not.toHaveBeenCalled();
        expect(auditService.record).not.toHaveBeenCalled();
        // Clé reposée à la même échéance (recréée si Redis l'a perdue), jamais rallongée.
        expect(minuterie.armer).toHaveBeenCalledWith(enCours.id, enCours.dateLimite);
      });

      it('reprend même hors quota : la reprise passe avant les autres règles', async () => {
        enCours = tentative();
        nbTentatives = 2;
        await expect(demarrer()).resolves.toMatchObject({ reprise: true, tentativesRestantes: 0 });
      });
    });

    describe('US-QCM-10 — verrou de session à la reprise', () => {
      it('contrôle la session sous le verrou de l’inscription, avec le paramètre du QCM', async () => {
        qcmRepository.findOne.mockResolvedValue(
          qcmPublie({ configuration: configuration({ blocageSessionsMultiples: true }) }),
        );
        enCours = tentative();
        nbTentatives = 1;

        await expect(demarrer()).resolves.toMatchObject({ reprise: true });
        expect(session.controler).toHaveBeenCalledWith(manager, enCours, SESSION, true);
      });

      it('autre session encore ouverte -> 409 session_active_ailleurs, rien créé', async () => {
        enCours = tentative();
        nbTentatives = 1;
        session.controler.mockResolvedValue('refusee');

        await expect(demarrer()).rejects.toThrow(ConflictException);
        expect(session.refuser).toHaveBeenCalledWith({
          apprenantId: APPRENANT,
          tentativeId: enCours.id,
          qcmId: QCM_ID,
          adresseIp: CONTEXTE.adresseIp,
          route: CONTEXTE.route,
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(minuterie.armer).not.toHaveBeenCalled();
        expect(auditService.record).not.toHaveBeenCalled();
      });

      it('session détentrice terminée -> adoptée, reprise normale', async () => {
        enCours = tentative();
        nbTentatives = 1;
        session.controler.mockImplementation((_m: unknown, t: TentativeQcm, s: string) => {
          t.sessionId = s;
          return Promise.resolve('adoptee');
        });

        await expect(demarrer()).resolves.toMatchObject({ reprise: true });
        expect(session.armerMiroir).toHaveBeenCalledWith(
          APPRENANT,
          QCM_ID,
          SESSION,
          enCours.dateLimite,
        );
      });
    });

    describe('tentative EN_COURS expirée (D11)', () => {
      it('la clôture ABANDONNEE_TIMER à son échéance, puis en crée une nouvelle', async () => {
        const echeance = new Date(MAINTENANT.getTime() - 60_000);
        enCours = tentative({
          dateDebut: new Date(echeance.getTime() - 30 * 60_000),
          dateLimite: echeance,
        });
        nbTentatives = 1;

        const vue = await demarrer();
        expect(manager.update).toHaveBeenCalledWith(
          TentativeQcm,
          { id: enCours.id },
          { statut: StatutTentative.ABANDONNEE_TIMER, dateFin: echeance, dureeEffective: 1800 },
        );
        expect(vue).toMatchObject({ reprise: false, numero: 2 });
        expect(auditService.record.mock.calls.map(([e]) => e.action)).toEqual([
          'TENTATIVE_EXPIREE',
          'TENTATIVE_DEMARREE',
        ]);
        // Clé de l'ancienne tentative supprimée, clé de la nouvelle posée.
        expect(minuterie.effacer).toHaveBeenCalledWith(enCours.id);
        expect(session.effacerMiroir).toHaveBeenCalledWith(APPRENANT, QCM_ID);
        expect(minuterie.armer).toHaveBeenCalledWith('nouvelle', expect.any(Date));
        // Réponses partielles de l'ancienne notées (US-QCM-08), une seule fois.
        expect(notation.noterSansEchec.mock.calls).toEqual([[enCours.id, APPRENANT]]);
      });

      it('la clôture est conservée même si le démarrage est ensuite refusé', async () => {
        enCours = tentative({ dateLimite: MAINTENANT });
        nbTentatives = 2;

        await expect(demarrer()).rejects.toThrow(ConflictException);
        expect(manager.update).toHaveBeenCalled();
        expect(minuterie.effacer).toHaveBeenCalledWith(enCours.id);
        expect(notation.noterSansEchec).toHaveBeenCalledWith(enCours.id, APPRENANT);
        // Refusé : aucune minuterie à poser.
        expect(minuterie.armer).not.toHaveBeenCalled();
        // Le refus est RENVOYÉ par la transaction, pas levé dedans : elle est validée.
        await expect(dataSource.transaction.mock.results[0].value).resolves.toMatchObject({
          issue: { type: 'refus' },
        });
        expect(auditService.record.mock.calls.map(([e]) => e.action)).toEqual([
          'TENTATIVE_EXPIREE',
          'TENTATIVE_DEMARREE',
        ]);
      });
    });

    describe('409 — refus avec motif précis, tracé', () => {
      const corps = async (): Promise<Record<string, unknown>> => {
        try {
          await demarrer();
        } catch (erreur) {
          expect(erreur).toBeInstanceOf(ConflictException);
          return (erreur as ConflictException).getResponse() as Record<string, unknown>;
        }
        throw new Error('409 attendu');
      };

      it('hors fenêtre : pas encore ouvert, avec la date d’ouverture', async () => {
        manager.query.mockResolvedValue([{ maintenant: new Date(OUVERTURE.getTime() - H) }]);
        expect(await corps()).toEqual({
          statusCode: 409,
          error: 'Conflict',
          message: 'Ce QCM n’est pas encore ouvert.',
          raison: 'hors_fenetre',
          dateReouverture: OUVERTURE,
        });
        expect(manager.save).not.toHaveBeenCalled();
        expect(tirageService.tirer).not.toHaveBeenCalled();
      });

      it('tentatives épuisées', async () => {
        nbTentatives = 2;
        expect(await corps()).toMatchObject({ raison: 'tentatives_epuisees' });
      });

      it('délai non respecté, avec la date de réouverture', async () => {
        qcmRepository.findOne.mockResolvedValue(
          qcmPublie({ configuration: configuration({ delaiEntreTentatives: 2 }) }),
        );
        nbTentatives = 1;
        precedente = { dateDebut: new Date(MAINTENANT.getTime() - H), dateFin: MAINTENANT };
        expect(await corps()).toMatchObject({
          raison: 'delai_non_respecte',
          dateReouverture: new Date(MAINTENANT.getTime() + 2 * H),
        });
      });

      it('la fenêtre est vérifiée AVANT le quota', async () => {
        manager.query.mockResolvedValue([{ maintenant: FERMETURE }]);
        nbTentatives = 2;
        expect(await corps()).toMatchObject({ raison: 'hors_fenetre' });
      });

      it('audit TENTATIVE_DEMARREE en échec, cible = le QCM', async () => {
        nbTentatives = 2;
        await corps();
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TENTATIVE_DEMARREE',
            cible: QCM_ID,
            resultat: 'Échec',
            detailsAvantApres: expect.objectContaining({
              raison: 'tentatives_epuisees',
              nbTentativesPassees: 2,
              nbTentativesMax: 2,
            }),
          }),
        );
      });

      it('un audit en panne ne change pas le 409', async () => {
        nbTentatives = 2;
        auditService.record.mockRejectedValue(new Error('base indisponible'));
        expect(await corps()).toMatchObject({ raison: 'tentatives_epuisees' });
      });
    });

    describe('concurrence', () => {
      it('inscription suspendue entre la lecture et le verrou -> 403', async () => {
        inscriptionVerrouillee = { id: INSCRIPTION_ID, statut: StatutInscription.SUSPENDUE };
        await expect(demarrer()).rejects.toThrow(ForbiddenException);
      });

      it('violation de l’index unique (23505) -> reprise de la tentative gagnante', async () => {
        dataSource.transaction.mockRejectedValueOnce(
          new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
        );
        manager.findOneOrFail.mockResolvedValue(tentative());
        nbTentatives = 1;

        await expect(demarrer()).resolves.toMatchObject({ reprise: true, numero: 1 });
        expect(auditService.record).not.toHaveBeenCalled();
        // La tentative gagnante est relue sous verrou et soumise au contrôle de session.
        expect(manager.findOneOrFail).toHaveBeenCalledWith(
          TentativeQcm,
          expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
        );
        expect(session.controler).toHaveBeenCalledWith(manager, expect.anything(), SESSION, false);
      });

      it('23505 puis gagnante détenue par une autre session ouverte -> 409 session', async () => {
        dataSource.transaction.mockRejectedValueOnce(
          new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' })),
        );
        manager.findOneOrFail.mockResolvedValue(tentative());
        session.controler.mockResolvedValue('refusee');

        await expect(demarrer()).rejects.toThrow(ConflictException);
        expect(session.refuser).toHaveBeenCalledWith(
          expect.objectContaining({ apprenantId: APPRENANT, qcmId: QCM_ID }),
        );
      });

      it('toute autre erreur de base remonte telle quelle', async () => {
        dataSource.transaction.mockRejectedValue(new Error('connexion perdue'));
        await expect(demarrer()).rejects.toThrow('connexion perdue');
      });
    });
  });
});
