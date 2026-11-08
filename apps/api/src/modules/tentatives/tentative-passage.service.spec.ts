import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Question } from '../../database/entities/question.entity';
import { Reponse } from '../../database/entities/reponse.entity';
import { ReponseOption } from '../../database/entities/reponse-option.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../database/enums/type-question.enum';
import { AuditService } from '../audit/audit.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { TentativeNotationService } from './tentative-notation.service';
import { TentativeSessionService } from './tentative-session.service';
import {
  MESSAGE_TEMPS_ECOULE,
  MESSAGE_TENTATIVE_INTROUVABLE,
  MESSAGE_TENTATIVE_TERMINEE,
} from './tentative-passage.regles';
import { TentativePassageService } from './tentative-passage.service';

/**
 * Tests unitaires de l'enregistrement d'une réponse et de la soumission
 * (US-QCM-07) : ordre des contrôles (404, 409 terminée, 409 temps écoulé avec
 * clôture VALIDÉE, 400), écriture idempotente, effacement par liste vide,
 * verrou et horloge lue après le verrou, audit, minuterie Redis. La
 * concurrence réelle est couverte par les tests e2e.
 */
describe('TentativePassageService', () => {
  const APPRENANT = 'appr-1';
  const TENTATIVE = 't-1';
  const MAINTENANT = new Date('2026-11-02T10:10:00Z');
  const DEBUT = new Date('2026-11-02T10:00:00Z');
  const LIMITE = new Date('2026-11-02T10:30:00Z');
  const SESSION = 's0000000-0000-4000-8000-000000000001';
  const AUTRE_SESSION = 's0000000-0000-4000-8000-000000000002';
  const CONTEXTE = { adresseIp: '127.0.0.1', sessionId: SESSION, route: '/api/tentatives/x' };
  const PLAN = [
    { questionId: 'q1', optionIds: ['c', 'a', 'b'] },
    { questionId: 'q2', optionIds: ['v', 'f'] },
  ];
  const ENREGISTREE_LE = new Date('2026-11-02T10:10:00.123Z');

  let service: TentativePassageService;
  let tentative: TentativeQcm | null;
  let types: Record<string, TypeQuestion>;
  let manager: {
    findOne: jest.Mock;
    query: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    insert: jest.Mock;
    countBy: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let auditService: { record: jest.Mock };
  let minuterie: { armer: jest.Mock; effacer: jest.Mock };
  let session: { controler: jest.Mock; effacerMiroir: jest.Mock; refuser: jest.Mock };
  let blocage: boolean;
  let notation: { noterSansEchec: jest.Mock };

  const enCours = (surcharge: Partial<TentativeQcm> = {}): TentativeQcm =>
    ({
      id: TENTATIVE,
      apprenantId: APPRENANT,
      qcmId: 'qcm-1',
      statut: StatutTentative.EN_COURS,
      dateDebut: DEBUT,
      dateLimite: LIMITE,
      dateFin: null,
      dureeEffective: null,
      planTirage: PLAN,
      sessionId: SESSION,
      ...surcharge,
    }) as TentativeQcm;

  beforeEach(async () => {
    tentative = enCours();
    blocage = true;
    types = { q1: TypeQuestion.QCM, q2: TypeQuestion.VRAI_FAUX };
    manager = {
      findOne: jest.fn((entite: unknown, options: { where: { id: string } }) => {
        if (entite === TentativeQcm) return Promise.resolve(tentative);
        if (entite === ConfigurationAntiFraude) {
          return Promise.resolve({ id: 'conf', blocageSessionsMultiples: blocage });
        }
        if (entite === Question) {
          const type = types[options.where.id];
          return Promise.resolve(type ? { id: options.where.id, type } : null);
        }
        return Promise.resolve(null);
      }),
      query: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('INSERT INTO reponses')
            ? [{ id: 'r-1', enregistreeLe: ENREGISTREE_LE }]
            : [{ maintenant: MAINTENANT }],
        ),
      ),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      countBy: jest.fn().mockResolvedValue(1),
    };
    dataSource = {
      transaction: jest.fn((travail: (m: typeof manager) => Promise<unknown>) => travail(manager)),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    minuterie = {
      armer: jest.fn().mockResolvedValue(undefined),
      effacer: jest.fn().mockResolvedValue(undefined),
    };
    session = {
      controler: jest.fn().mockResolvedValue('autorisee'),
      effacerMiroir: jest.fn().mockResolvedValue(undefined),
      refuser: jest.fn().mockRejectedValue(new ConflictException('session')),
    };
    // Notation (US-QCM-08) : 1 point sur 2 questions -> 50 %, réussie.
    notation = {
      noterSansEchec: jest.fn().mockResolvedValue({
        tentativeId: TENTATIVE,
        score: 50,
        estReussie: true,
        nbQuestions: 2,
        nbCorrectes: 1,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativePassageService,
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: auditService },
        { provide: TentativeMinuterieService, useValue: minuterie },
        { provide: TentativeNotationService, useValue: notation },
        { provide: TentativeSessionService, useValue: session },
      ],
    }).compile();
    service = moduleRef.get(TentativePassageService);
  });

  const enregistrer = (
    questionId: string,
    optionIds: string[],
  ): ReturnType<TentativePassageService['enregistrerReponse']> =>
    service.enregistrerReponse(APPRENANT, TENTATIVE, questionId, optionIds, CONTEXTE);

  /** Corps de l'exception levée (statut HTTP vérifié par la classe). */
  const corpsErreur = async (
    promesse: Promise<unknown>,
    classe: new (...args: never[]) => Error,
  ): Promise<Record<string, unknown>> => {
    try {
      await promesse;
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(classe);
      return (erreur as ConflictException).getResponse() as Record<string, unknown>;
    }
    throw new Error('exception attendue');
  };

  describe('contrôles communs (enregistrement et soumission)', () => {
    it.each([
      ['enregistrement', (): Promise<unknown> => enregistrer('q1', ['a'])],
      ['soumission', (): Promise<unknown> => service.soumettre(APPRENANT, TENTATIVE, CONTEXTE)],
    ])('%s : verrouille MA tentative, lit l’heure APRÈS le verrou', async (_cas, appel) => {
      await appel();
      expect(manager.findOne).toHaveBeenCalledWith(TentativeQcm, {
        where: { id: TENTATIVE, apprenantId: APPRENANT },
        lock: { mode: 'pessimistic_write' },
      });
      expect(manager.query).toHaveBeenCalledWith('SELECT clock_timestamp() AS maintenant');
      const ordreVerrou = manager.findOne.mock.invocationCallOrder[0];
      const ordreHorloge = manager.query.mock.invocationCallOrder[0];
      expect(ordreVerrou).toBeLessThan(ordreHorloge);
    });

    it.each([
      ['enregistrement', (): Promise<unknown> => enregistrer('q1', ['a'])],
      ['soumission', (): Promise<unknown> => service.soumettre(APPRENANT, TENTATIVE, CONTEXTE)],
    ])('%s : 404 pour une tentative inconnue ou d’un autre apprenant', async (_cas, appel) => {
      tentative = null;
      await expect(appel()).rejects.toThrow(new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE));
      expect(manager.update).not.toHaveBeenCalled();
    });

    it.each([StatutTentative.SOUMISE, StatutTentative.ABANDONNEE_TIMER, StatutTentative.NOTEE])(
      '409 « terminée » pour une tentative %s, sans rien écrire',
      async (statut) => {
        tentative = enCours({ statut });
        expect(await corpsErreur(enregistrer('q1', ['a']), ConflictException)).toMatchObject({
          message: MESSAGE_TENTATIVE_TERMINEE,
          raison: 'tentative_terminee',
          statut,
        });
        await expect(service.soumettre(APPRENANT, TENTATIVE, CONTEXTE)).rejects.toThrow(
          ConflictException,
        );
        expect(manager.update).not.toHaveBeenCalled();
        expect(manager.insert).not.toHaveBeenCalled();
        expect(auditService.record).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['enregistrement', 'sauvegarde', (): Promise<unknown> => enregistrer('q1', ['a'])],
      [
        'soumission',
        'soumission',
        (): Promise<unknown> => service.soumettre(APPRENANT, TENTATIVE, CONTEXTE),
      ],
    ])(
      '%s à l’échéance exacte : clôture VALIDÉE, audit, clé supprimée, 409 temps_ecoule',
      async (_cas, declencheur, appel) => {
        tentative = enCours({ dateLimite: MAINTENANT, dateDebut: DEBUT });

        expect(await corpsErreur(appel(), ConflictException)).toMatchObject({
          message: MESSAGE_TEMPS_ECOULE,
          raison: 'temps_ecoule',
          statut: StatutTentative.ABANDONNEE_TIMER,
          dateLimite: MAINTENANT,
        });
        expect(manager.update).toHaveBeenCalledWith(
          TentativeQcm,
          { id: TENTATIVE },
          { statut: StatutTentative.ABANDONNEE_TIMER, dateFin: MAINTENANT, dureeEffective: 600 },
        );
        // Le refus est RENVOYÉ par la transaction (pas levé dedans) : la clôture est validée.
        await expect(dataSource.transaction.mock.results[0].value).resolves.toMatchObject({
          type: 'expiree',
        });
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'TENTATIVE_EXPIREE',
            acteur: APPRENANT,
            cible: TENTATIVE,
            detailsAvantApres: expect.objectContaining({
              cause: `echeance_depassee_a_la_${declencheur}`,
            }),
          }),
        );
        expect(minuterie.effacer).toHaveBeenCalledWith(TENTATIVE);
        // Réponses partielles notées avant le 409 (US-QCM-08, ET-02).
        expect(notation.noterSansEchec).toHaveBeenCalledWith(TENTATIVE, APPRENANT);
        // Aucune réponse écrite après l'échéance.
        expect(manager.insert).not.toHaveBeenCalled();
      },
    );

    it('un audit de clôture en panne ne change pas le 409', async () => {
      tentative = enCours({ dateLimite: MAINTENANT });
      auditService.record.mockRejectedValue(new Error('audit indisponible'));
      expect(await corpsErreur(enregistrer('q1', ['a']), ConflictException)).toMatchObject({
        raison: 'temps_ecoule',
      });
    });
  });

  describe('enregistrerReponse', () => {
    it('enregistre (insertion ou mise à jour unique), remplace les options, ordre du tirage', async () => {
      const vue = await enregistrer('q1', ['b', 'c']);

      const [sql, parametres] = manager.query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('ON CONFLICT (tentative_id, question_id)');
      expect(parametres).toEqual([TENTATIVE, 'q1']);
      expect(manager.delete).toHaveBeenCalledWith(ReponseOption, { reponseId: 'r-1' });
      expect(manager.insert).toHaveBeenCalledWith(ReponseOption, [
        { reponseId: 'r-1', optionId: 'c' },
        { reponseId: 'r-1', optionId: 'b' },
      ]);
      expect(vue).toEqual({
        questionId: 'q1',
        optionIds: ['c', 'b'],
        enregistreeLe: ENREGISTREE_LE,
        maintenant: MAINTENANT,
        dateLimite: LIMITE,
      });
      // Miroir Redis reposé à la même échéance ; aucune écriture de statut, aucun audit.
      expect(minuterie.armer).toHaveBeenCalledWith(TENTATIVE, LIMITE);
      expect(manager.update).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('une liste vide efface la réponse (D13)', async () => {
      const vue = await enregistrer('q2', []);
      expect(manager.delete).toHaveBeenCalledWith(Reponse, {
        tentativeId: TENTATIVE,
        questionId: 'q2',
      });
      expect(manager.insert).not.toHaveBeenCalled();
      expect(vue).toMatchObject({ questionId: 'q2', optionIds: [], enregistreeLe: null });
    });

    it.each([
      ['question hors du tirage', 'q3', ['a'], 'question_hors_tirage'],
      ['option d’une autre question', 'q1', ['v'], 'option_hors_question'],
      ['deux options sur un Vrai/Faux', 'q2', ['v', 'f'], 'une_seule_option'],
    ])('400 — %s, rien n’est écrit', async (_cas, questionId, options, raison) => {
      expect(
        await corpsErreur(enregistrer(questionId, options), BadRequestException),
      ).toMatchObject({ statusCode: 400, raison });
      expect(manager.insert).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
      expect(minuterie.armer).not.toHaveBeenCalled();
    });

    it('400 — question du tirage supprimée du contenu', async () => {
      delete types.q1;
      expect(await corpsErreur(enregistrer('q1', ['a']), BadRequestException)).toMatchObject({
        raison: 'question_hors_tirage',
      });
    });

    it('400 — tentative sans tirage (créée avant US-QCM-06, jamais consultée)', async () => {
      tentative = enCours({ planTirage: null });
      await expect(enregistrer('q1', ['a'])).rejects.toThrow(BadRequestException);
    });

    it('400 — type de question non répondu par options (D14)', async () => {
      types.q1 = TypeQuestion.REPONSE_COURTE;
      expect(await corpsErreur(enregistrer('q1', []), BadRequestException)).toMatchObject({
        raison: 'type_non_pris_en_charge',
      });
    });
  });

  describe('soumettre', () => {
    it('SOUMISE à l’heure de la base, audit QCM_SOUMIS, clé supprimée, puis notée (US-QCM-08)', async () => {
      manager.countBy.mockResolvedValue(1);
      const vue = await service.soumettre(APPRENANT, TENTATIVE, CONTEXTE);

      expect(manager.update).toHaveBeenCalledWith(
        TentativeQcm,
        { id: TENTATIVE },
        { statut: StatutTentative.SOUMISE, dateFin: MAINTENANT, dureeEffective: 600 },
      );
      expect(manager.countBy).toHaveBeenCalledWith(Reponse, { tentativeId: TENTATIVE });
      expect(vue).toEqual({
        id: TENTATIVE,
        qcmId: 'qcm-1',
        statut: StatutTentative.NOTEE,
        score: 50,
        estReussie: true,
        dateDebut: DEBUT,
        dateLimite: LIMITE,
        dateFin: MAINTENANT,
        dureeEffective: 600,
        nbQuestions: 2,
        nbReponses: 1,
      });
      expect(auditService.record).toHaveBeenCalledWith({
        action: 'QCM_SOUMIS',
        acteur: APPRENANT,
        cible: TENTATIVE,
        adresseIp: '127.0.0.1',
        resultat: 'Succès',
        detailsAvantApres: {
          qcmId: 'qcm-1',
          statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.SOUMISE },
          dateFin: MAINTENANT,
          dureeEffective: 600,
          nbQuestions: 2,
          nbReponses: 1,
        },
      });
      expect(minuterie.effacer).toHaveBeenCalledWith(TENTATIVE);
      expect(session.effacerMiroir).toHaveBeenCalledWith(APPRENANT, 'qcm-1');
      // Notée APRÈS la soumission validée et tracée, par l'apprenant.
      expect(notation.noterSansEchec).toHaveBeenCalledWith(TENTATIVE, APPRENANT);
      expect(notation.noterSansEchec.mock.invocationCallOrder[0]).toBeGreaterThan(
        auditService.record.mock.invocationCallOrder[0],
      );
    });

    it('notation en échec : la soumission tient, SOUMISE sans score (le rattrapage la notera)', async () => {
      notation.noterSansEchec.mockResolvedValue(null);
      const vue = await service.soumettre(APPRENANT, TENTATIVE, CONTEXTE);
      expect(vue).toMatchObject({ statut: StatutTentative.SOUMISE, score: null, estReussie: null });
    });

    it('un audit QCM_SOUMIS en panne remonte : une soumission non tracée ne passe pas inaperçue', async () => {
      auditService.record.mockRejectedValue(new Error('audit indisponible'));
      await expect(service.soumettre(APPRENANT, TENTATIVE, CONTEXTE)).rejects.toThrow(
        'audit indisponible',
      );
    });
  });

  describe('US-QCM-10 — verrou de session', () => {
    it('même session : aucun contrôle, aucune lecture de configuration', async () => {
      await enregistrer('q1', ['a']);
      expect(session.controler).not.toHaveBeenCalled();
      expect(manager.findOne).not.toHaveBeenCalledWith(ConfigurationAntiFraude, expect.anything());
    });

    it.each([
      ['sauvegarde', (): Promise<unknown> => enregistrer('q1', ['a'])],
      ['soumission', (): Promise<unknown> => service.soumettre(APPRENANT, TENTATIVE, CONTEXTE)],
    ])('%s depuis une autre session ouverte -> 409, rien écrit, refus tracé', async (_l, appel) => {
      tentative = enCours({ sessionId: AUTRE_SESSION });
      session.controler.mockResolvedValue('refusee');

      await expect(appel()).rejects.toThrow(ConflictException);
      expect(session.controler).toHaveBeenCalledWith(manager, tentative, SESSION, true);
      expect(session.refuser).toHaveBeenCalledWith({
        apprenantId: APPRENANT,
        tentativeId: TENTATIVE,
        qcmId: 'qcm-1',
        adresseIp: '127.0.0.1',
        route: CONTEXTE.route,
      });
      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
      expect(notation.noterSansEchec).not.toHaveBeenCalled();
    });

    it('blocage désactivé : le paramètre du QCM est transmis au contrôle', async () => {
      tentative = enCours({ sessionId: AUTRE_SESSION });
      blocage = false;
      await enregistrer('q1', ['a']);
      expect(session.controler).toHaveBeenCalledWith(manager, tentative, SESSION, false);
    });

    it('échéance atteinte : la clôture passe avant la session (409 temps_ecoule)', async () => {
      tentative = enCours({
        sessionId: AUTRE_SESSION,
        dateLimite: new Date(MAINTENANT.getTime() - 1),
      });
      expect(await corpsErreur(enregistrer('q1', ['a']), ConflictException)).toMatchObject({
        raison: 'temps_ecoule',
      });
      expect(session.controler).not.toHaveBeenCalled();
      expect(session.effacerMiroir).toHaveBeenCalledWith(APPRENANT, 'qcm-1');
    });
  });
});
