import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { ConfigurationAntiFraude } from '../src/database/entities/configuration-anti-fraude.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Option } from '../src/database/entities/option.entity';
import { QcmQuestion } from '../src/database/entities/qcm-question.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { Question } from '../src/database/entities/question.entity';
import { TentativeQcm } from '../src/database/entities/tentative-qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { AffichageResultats } from '../src/database/enums/affichage-resultats.enum';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutQcm } from '../src/database/enums/statut-qcm.enum';
import { StatutTentative } from '../src/database/enums/statut-tentative.enum';
import { TypeQuestion } from '../src/database/enums/type-question.enum';
import { REDIS_CLIENT } from '../src/redis/redis.constants';

/**
 * Tests d'intégration US-QCM-10 — Bloquer les sessions multiples.
 *
 * Une « session » = une connexion (famille du refresh token, claim `sid`).
 * Deux connexions du même apprenant simulent deux appareils. Couvre, sur
 * l'application réelle et la vraie base :
 *  - `sid` présent dans l'access token à la connexion, conservé au refresh,
 *    différent d'une connexion à l'autre ;
 *  - appareil 1 démarre ; appareil 2 : démarrer, consulter, répondre,
 *    soumettre -> 409 `session_active_ailleurs`, audit
 *    SESSION_MULTIPLE_REFUSEE ; appareil 1 continue normalement (même après
 *    un refresh) ; miroir Redis `session_qcm:{apprenantId}:{qcmId}` ;
 *  - déconnexion de l'appareil 1 -> l'appareil 2 reprend la tentative ;
 *  - blocage désactivé -> les deux appareils passent ;
 *  - course : deux démarrages simultanés de deux sessions (chevauchement
 *    forcé) -> UNE tentative, un 201 et un 409.
 *
 * Nettoyage rejouable (avant ET après), ordre des clés RESTRICT : tentatives
 * -> inscriptions -> QCM -> questions -> formations -> audit (bypass
 * maintenance, par compte et par tentative) -> comptes.
 */
describe('Bloquer les sessions multiples (e2e) — US-QCM-10', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let tentativeRepository: Repository<TentativeQcm>;
  let dataSource: DataSource;
  let redis: Redis;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (… E2E-REPONSE, E2E-NOTATION,
  // E2E-CORRIGE), et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-SESSION';
  const EMAIL_APPRENANT = 'e2e-session-appr@cert-eet.local';
  const EMAIL_COURSE = 'e2e-session-course@cert-eet.local';
  const EMAILS = [EMAIL_APPRENANT, EMAIL_COURSE];
  const H = 3_600_000;
  const MESSAGE = 'Vous passez déjà ce QCM sur un autre appareil.';

  let apprenantId: string;
  let courseId: string;
  const qcm: Record<string, string> = {};

  interface Appareil {
    token: string;
    cookie: string;
    sid: string;
  }

  /** Charge utile d'un JWT, sans vérification (la signature est testée ailleurs). */
  const claims = (jwt: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;

  const cookieDe = (res: request.Response): string =>
    (res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refreshToken='))!
      .split(';')[0];

  /** Une connexion = un appareil = une session. */
  const connecter = async (email: string): Promise<Appareil> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    const token = res.body.accessToken as string;
    return { token, cookie: cookieDe(res), sid: claims(token).sid as string };
  };

  const demarrer = (qcmId: string, a: Appareil): request.Test =>
    request(app.getHttpServer())
      .post(`/api/qcm/${qcmId}/tentatives`)
      .set('Authorization', `Bearer ${a.token}`);

  const consulter = (id: string, a: Appareil): request.Test =>
    request(app.getHttpServer())
      .get(`/api/tentatives/${id}`)
      .set('Authorization', `Bearer ${a.token}`);

  const repondre = (
    id: string,
    questionId: string,
    optionIds: string[],
    a: Appareil,
  ): request.Test =>
    request(app.getHttpServer())
      .put(`/api/tentatives/${id}/reponses/${questionId}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ optionIds });

  const soumettre = (id: string, a: Appareil): request.Test =>
    request(app.getHttpServer())
      .post(`/api/tentatives/${id}/soumettre`)
      .set('Authorization', `Bearer ${a.token}`);

  const refusSession = (res: request.Response): void => {
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: MESSAGE, raison: 'session_active_ailleurs' });
  };

  const refusAudites = (tentativeId: string): Promise<AuditLog[]> =>
    auditLogRepository.find({
      where: { action: 'SESSION_MULTIPLE_REFUSEE', cible: tentativeId },
      order: { horodatage: 'ASC' },
    });

  const purgeAudit = async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        ids,
      ]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  const nettoyer = async (): Promise<void> => {
    const formations = await dataSource.getRepository(Formation).find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(EMAILS) },
      select: { id: true },
    });
    const utilisateurIds = utilisateurs.map((u) => u.id);
    let tentativeIds: string[] = [];
    if (utilisateurIds.length > 0) {
      const tentatives = await tentativeRepository.find({
        where: { apprenantId: In(utilisateurIds) },
        select: { id: true, apprenantId: true, qcmId: true },
      });
      tentativeIds = tentatives.map((t) => t.id);
      const cles = tentatives.flatMap((t) => [
        `timer:${t.id}`,
        `session_qcm:${t.apprenantId}:${t.qcmId}`,
      ]);
      if (cles.length > 0) await redis.del(...cles);
      await tentativeRepository.delete({ apprenantId: In(utilisateurIds) });
      await dataSource.getRepository(Inscription).delete({ apprenantId: In(utilisateurIds) });
    }
    await dataSource.getRepository(Qcm).delete({ titre: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Question).delete({ enonce: Like(`${MARQUEUR}%`) });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurIds, ...tentativeIds]);
    await userRepository.delete({ email: In(EMAILS) });
  };

  /** QCM publié à une question QCU, ouvert, blocage au choix. */
  const creerQcm = async (cle: string, moduleId: string, blocage: boolean): Promise<void> => {
    const cree = await dataSource
      .getRepository(Qcm)
      .save({ moduleId, titre: `${MARQUEUR} ${cle}`, statut: StatutQcm.PUBLIE });
    const question = await dataSource
      .getRepository(Question)
      .save({ enonce: `${MARQUEUR} ${cle} question`, type: TypeQuestion.QCU, ponderation: 1 });
    await dataSource.getRepository(Option).save(
      ['Alpha', 'Bravo'].map((texte, j) => ({
        questionId: question.id,
        texte,
        ordre: j + 1,
        estCorrecte: j === 0,
      })),
    );
    await dataSource
      .getRepository(QcmQuestion)
      .save({ qcmId: cree.id, questionId: question.id, ordre: 1 });
    await dataSource.getRepository(ConfigurationAntiFraude).save({
      qcmId: cree.id,
      dureeMaxMinutes: 30,
      dateOuverture: new Date(Date.now() - 24 * H),
      dateFermeture: new Date(Date.now() + 10 * 24 * H),
      nbTentativesMax: 3,
      delaiEntreTentatives: 0,
      affichageResultats: AffichageResultats.DIFFERE,
      scoreMinValidation: 60,
      ponderationFormation: 10,
      blocageSessionsMultiples: blocage,
    });
    qcm[cle] = cree.id;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    tentativeRepository = moduleRef.get<Repository<TentativeQcm>>(getRepositoryToken(TentativeQcm));
    dataSource = moduleRef.get(DataSource, { strict: false });
    auditLogRepository = dataSource.getRepository(AuditLog);
    redis = moduleRef.get<Redis>(REDIS_CLIENT);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [apprenant, course] = await userRepository.save(
      EMAILS.map((email) =>
        userRepository.create({
          email,
          role: Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
        }),
      ),
    );
    apprenantId = apprenant.id;
    courseId = course.id;

    const formation = await dataSource.getRepository(Formation).save({
      titre: `${MARQUEUR} Kubernetes`,
      statut: StatutFormation.OUVERTE,
      capaciteMax: 20,
      noteMinCertification: 70,
    });
    const module = await dataSource
      .getRepository(ModuleFormation)
      .save({ formationId: formation.id, titre: 'Pods', ordre: 1 });
    await creerQcm('bloque', module.id, true);
    await creerQcm('deconnexion', module.id, true);
    await creerQcm('libre', module.id, false);
    await creerQcm('course', module.id, true);
    await dataSource.getRepository(Inscription).save([
      { apprenantId, formationId: formation.id },
      { apprenantId: courseId, formationId: formation.id },
    ]);
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  describe('claim `sid` (D2)', () => {
    it('présent à la connexion, conservé au refresh, propre à chaque connexion', async () => {
      const a1 = await connecter(EMAIL_APPRENANT);
      const a2 = await connecter(EMAIL_APPRENANT);
      expect(a1.sid).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(a2.sid).not.toBe(a1.sid);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', a1.cookie)
        .expect(200);
      const apres = claims(res.body.accessToken as string);
      expect(apres.sid).toBe(a1.sid);
      expect(apres.jti).not.toBe(claims(a1.token).jti);
    });
  });

  describe('blocage actif', () => {
    let appareil1: Appareil;
    let appareil2: Appareil;
    let tentativeId: string;

    beforeAll(async () => {
      appareil1 = await connecter(EMAIL_APPRENANT);
      appareil2 = await connecter(EMAIL_APPRENANT);
    });

    it('appareil 1 démarre : la tentative est détenue par sa session, miroir Redis posé', async () => {
      const res = await demarrer(qcm.bloque, appareil1).expect(201);
      tentativeId = res.body.id as string;
      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(ligne.sessionId).toBe(appareil1.sid);
      expect(await redis.get(`session_qcm:${apprenantId}:${qcm.bloque}`)).toBe(appareil1.sid);
      const pttl = await redis.pttl(`session_qcm:${apprenantId}:${qcm.bloque}`);
      expect(pttl).toBeGreaterThan(25 * 60_000);
      expect(pttl).toBeLessThanOrEqual(30 * 60_000);
    });

    it('appareil 2 : démarrer, consulter, répondre, soumettre -> 409, chaque refus tracé', async () => {
      const lecture = await consulter(tentativeId, appareil1).expect(200);
      const question = lecture.body.questions[0] as { id: string; options: Array<{ id: string }> };

      refusSession(await demarrer(qcm.bloque, appareil2));
      refusSession(await consulter(tentativeId, appareil2));
      refusSession(await repondre(tentativeId, question.id, [question.options[0].id], appareil2));
      refusSession(await soumettre(tentativeId, appareil2));

      const refus = await refusAudites(tentativeId);
      expect(refus).toHaveLength(4);
      for (const ligne of refus) {
        expect(ligne).toMatchObject({ userId: apprenantId, resultat: 'Échec' });
        expect(ligne.detailsAvantApres).toMatchObject({
          qcmId: qcm.bloque,
          raison: 'session_active_ailleurs',
        });
      }
      // Rien n'a bougé : toujours EN_COURS, toujours à l'appareil 1, aucune réponse.
      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(ligne).toMatchObject({ statut: StatutTentative.EN_COURS, sessionId: appareil1.sid });
      expect(await tentativeRepository.countBy({ apprenantId, qcmId: qcm.bloque })).toBe(1);
    });

    it('appareil 1 continue normalement, même après un refresh (même session)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', appareil1.cookie)
        .expect(200);
      appareil1 = { ...appareil1, token: res.body.accessToken as string, cookie: cookieDe(res) };

      await demarrer(qcm.bloque, appareil1).expect(200);
      const lecture = await consulter(tentativeId, appareil1).expect(200);
      const question = lecture.body.questions[0] as { id: string; options: Array<{ id: string }> };
      await repondre(tentativeId, question.id, [question.options[0].id], appareil1).expect(200);
      const soumise = await soumettre(tentativeId, appareil1).expect(200);
      expect(soumise.body.statut).toBe(StatutTentative.NOTEE);
      // Miroir supprimé à la clôture.
      expect(await redis.exists(`session_qcm:${apprenantId}:${qcm.bloque}`)).toBe(0);
    });

    it('tentative terminée : consultable depuis l’appareil 2', async () => {
      await consulter(tentativeId, appareil2).expect(200);
    });
  });

  describe('déconnexion de la session détentrice (D6)', () => {
    it('le verrou tombe : l’appareil 2 reprend la tentative et la détient', async () => {
      const appareil1 = await connecter(EMAIL_APPRENANT);
      const appareil2 = await connecter(EMAIL_APPRENANT);
      const depart = await demarrer(qcm.deconnexion, appareil1).expect(201);
      const tentativeId = depart.body.id as string;
      refusSession(await demarrer(qcm.deconnexion, appareil2));

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${appareil1.token}`)
        .set('Cookie', appareil1.cookie)
        .expect(200);

      const reprise = await demarrer(qcm.deconnexion, appareil2).expect(200);
      expect(reprise.body).toMatchObject({ id: tentativeId, reprise: true });
      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(ligne.sessionId).toBe(appareil2.sid);
      expect(await redis.get(`session_qcm:${apprenantId}:${qcm.deconnexion}`)).toBe(appareil2.sid);

      // Une nouvelle connexion (appareil 3) est à son tour bloquée.
      const appareil3 = await connecter(EMAIL_APPRENANT);
      refusSession(await consulter(tentativeId, appareil3));
      await consulter(tentativeId, appareil2).expect(200);
    });
  });

  describe('blocage désactivé (D7)', () => {
    it('les deux appareils passent ; la session de création reste enregistrée', async () => {
      const appareil1 = await connecter(EMAIL_APPRENANT);
      const appareil2 = await connecter(EMAIL_APPRENANT);
      const depart = await demarrer(qcm.libre, appareil1).expect(201);
      const tentativeId = depart.body.id as string;

      await demarrer(qcm.libre, appareil2).expect(200);
      const lecture = await consulter(tentativeId, appareil2).expect(200);
      const question = lecture.body.questions[0] as { id: string; options: Array<{ id: string }> };
      await repondre(tentativeId, question.id, [question.options[1].id], appareil2).expect(200);
      await consulter(tentativeId, appareil1).expect(200);

      const ligne = await tentativeRepository.findOneByOrFail({ id: tentativeId });
      expect(ligne.sessionId).toBe(appareil1.sid);
      expect(await refusAudites(tentativeId)).toHaveLength(0);
    });
  });

  it('course : deux sessions démarrent ensemble -> une tentative, un 201 et un 409', async () => {
    const appareil1 = await connecter(EMAIL_COURSE);
    const appareil2 = await connecter(EMAIL_COURSE);

    // Chevauchement forcé : la table est bloquée en écriture pendant ~1 s,
    // les deux démarrages sont en vol en même temps.
    const bloqueur = dataSource.createQueryRunner();
    await bloqueur.connect();
    await bloqueur.startTransaction();
    let reponses: request.Response[];
    try {
      await bloqueur.query('LOCK TABLE tentatives_qcm IN SHARE ROW EXCLUSIVE MODE');
      const enVol = Promise.all(
        [appareil1, appareil2].map((a) => demarrer(qcm.course, a).then((r) => r)),
      );
      await new Promise((fin) => setTimeout(fin, 1000));
      await bloqueur.commitTransaction();
      reponses = await enVol;
    } finally {
      if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
      await bloqueur.release();
    }

    expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
    const perdante = reponses.find((r) => r.status === 409) as request.Response;
    expect(perdante.body.raison).toBe('session_active_ailleurs');
    expect(await tentativeRepository.countBy({ apprenantId: courseId, qcmId: qcm.course })).toBe(1);
    const gagnante = reponses.find((r) => r.status === 201) as request.Response;
    expect(await refusAudites(gagnante.body.id as string)).toHaveLength(1);
  });
});
