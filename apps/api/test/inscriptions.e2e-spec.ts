import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { Inscription } from '../src/database/entities/inscription.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import { InscriptionsService } from '../src/modules/inscriptions/inscriptions.service';

/**
 * Tests d'intégration US-INSC-01 — S'inscrire à une formation.
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - l'inscription nominale (201, EN_COURS, échéance = date de fin, audit
 *    INSCRIPTION_CREEE) puis « Mes inscriptions » ;
 *  - les refus : 401, 403 (formateur, administrateur), 400 (identifiant),
 *    404 (inconnue, fermée, archivée), 409 (déjà inscrit, inscription
 *    suspendue, formation complète) — sans écriture ni audit ;
 *  - la concurrence : deux inscriptions simultanées sur la dernière place
 *    (une seule passe), puis une rafale de huit inscriptions sur trois places
 *    (trois passent, jamais plus) ;
 *  - le catalogue : places restantes et statut d'inscription de l'apprenant.
 *
 * Nettoyage rejouable (avant ET après). Les clés étrangères des inscriptions
 * sont en RESTRICT : inscriptions -> formations -> audit (bypass
 * maintenance) -> utilisateurs.
 */
describe('Inscription à une formation (e2e) — US-INSC-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let formationRepository: Repository<Formation>;
  let inscriptionRepository: Repository<Inscription>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (E2E-AFFECT, E2E-AUTH16,
  // E2E-DM, E2E-FORM01, E2E-MODULES) : les suites tournent en parallèle.
  const MARQUEUR = 'E2E-INSC01';
  const EMAIL_ADMIN = 'e2e-insc01-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-insc01-form@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-insc01-appr1@cert-eet.local';
  const EMAIL_APPRENANT_2 = 'e2e-insc01-appr2@cert-eet.local';
  const EMAIL_APPRENANT_3 = 'e2e-insc01-appr3@cert-eet.local';
  const ALL_EMAILS = [
    EMAIL_ADMIN,
    EMAIL_FORMATEUR,
    EMAIL_APPRENANT,
    EMAIL_APPRENANT_2,
    EMAIL_APPRENANT_3,
  ];
  // Apprenants de la rafale : créés en base, jamais connectés (appel direct
  // du service).
  const EMAILS_RAFALE = Array.from(
    { length: 8 },
    (_, i) => `e2e-insc01-rafale${i + 1}@cert-eet.local`,
  );
  const ALL_EMAILS_ET_RAFALE = [...ALL_EMAILS, ...EMAILS_RAFALE];
  const UUID_INCONNU = '22222222-2222-4222-8222-222222222222';

  let apprenantId: string;
  let apprenant2Id: string;
  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenApprenant: string;
  let tokenApprenant2: string;
  let tokenApprenant3: string;
  let ouverteId: string;
  let fermeeId: string;
  let archiveeId: string;
  let pleineId: string;
  let derniereId: string;
  let suspendueId: string;
  let rafaleFormationId: string;
  let rafaleIds: string[];

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const inscrire = (formationId: string, token: string): request.Test =>
    request(app.getHttpServer())
      .post(`/api/formations/${formationId}/inscriptions`)
      .set('Authorization', `Bearer ${token}`);

  const audits = (formationId: string): Promise<AuditLog[]> =>
    auditLogRepository.find({ where: { action: 'INSCRIPTION_CREEE', cible: formationId } });

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
    const formations = await formationRepository.find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS_ET_RAFALE) },
      select: { id: true },
    });
    const formationIds = formations.map((f) => f.id);
    const utilisateurIds = utilisateurs.map((u) => u.id);

    if (formationIds.length > 0) {
      await inscriptionRepository.delete({ formationId: In(formationIds) });
    }
    if (utilisateurIds.length > 0) {
      await inscriptionRepository.delete({ apprenantId: In(utilisateurIds) });
    }
    await formationRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formationIds, ...utilisateurIds]);
    await userRepository.delete({ email: In(ALL_EMAILS_ET_RAFALE) });
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
    auditLogRepository = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
    dataSource = moduleRef.get(DataSource, { strict: false });
    formationRepository = dataSource.getRepository(Formation);
    inscriptionRepository = dataSource.getRepository(Inscription);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [, , apprenant, apprenant2] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT, prenom: 'Sarra' },
        { email: EMAIL_APPRENANT_2, role: Role.APPRENANT },
        { email: EMAIL_APPRENANT_3, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    apprenantId = apprenant.id;
    apprenant2Id = apprenant2.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);
    tokenApprenant2 = await login(EMAIL_APPRENANT_2);
    tokenApprenant3 = await login(EMAIL_APPRENANT_3);

    const [ouverte, fermee, archivee, pleine, derniere, suspendue, rafale] =
      await formationRepository.save(
        [
          { titre: `${MARQUEUR} DevOps`, capaciteMax: 20, dateFin: '2026-12-18' },
          { titre: `${MARQUEUR} Fermée`, statut: StatutFormation.FERMEE },
          { titre: `${MARQUEUR} Archivée`, statut: StatutFormation.ARCHIVEE },
          { titre: `${MARQUEUR} Pleine`, capaciteMax: 1 },
          { titre: `${MARQUEUR} Dernière place`, capaciteMax: 1 },
          { titre: `${MARQUEUR} Suspendue`, capaciteMax: 5 },
          { titre: `${MARQUEUR} Rafale`, capaciteMax: 3 },
        ].map((f) =>
          formationRepository.create({
            capaciteMax: 10,
            noteMinCertification: 60,
            statut: StatutFormation.OUVERTE,
            ...f,
          }),
        ),
      );
    ouverteId = ouverte.id;
    fermeeId = fermee.id;
    archiveeId = archivee.id;
    pleineId = pleine.id;
    derniereId = derniere.id;
    suspendueId = suspendue.id;
    rafaleFormationId = rafale.id;

    const rafaleUsers = await userRepository.save(
      EMAILS_RAFALE.map((email) =>
        userRepository.create({
          email,
          role: Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
        }),
      ),
    );
    rafaleIds = rafaleUsers.map((u) => u.id);

    // « Pleine » : son unique place est prise par l'apprenant 2.
    // « Suspendue » : l'apprenant 1 y a une inscription suspendue (DS-11).
    await inscriptionRepository.save([
      inscriptionRepository.create({ apprenantId: apprenant2Id, formationId: pleineId }),
      inscriptionRepository.create({
        apprenantId,
        formationId: suspendueId,
        statut: StatutInscription.SUSPENDUE,
      }),
    ]);
  });

  afterAll(async () => {
    await nettoyer();
    expect(await formationRepository.countBy({ titre: Like(`${MARQUEUR}%`) })).toBe(0);
    expect(await userRepository.countBy({ email: In(ALL_EMAILS_ET_RAFALE) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Inscription
  // ===================================================================

  describe('S’inscrire', () => {
    it('201 : inscription EN_COURS, échéance = date de fin, tracée', async () => {
      const res = await inscrire(ouverteId, tokenApprenant).expect(201);

      expect(res.body).toMatchObject({
        statut: StatutInscription.EN_COURS,
        dateEcheance: '2026-12-18',
        tauxAvancement: 0,
        formation: { id: ouverteId, titre: `${MARQUEUR} DevOps` },
      });

      const enBase = await inscriptionRepository.findOneByOrFail({ id: res.body.id });
      expect(enBase).toMatchObject({ apprenantId, formationId: ouverteId });

      const traces = await audits(ouverteId);
      expect(traces).toHaveLength(1);
      expect(traces[0].userId).toBe(apprenantId);
      expect(traces[0].resultat).toBe('Succès');
      expect(traces[0].detailsAvantApres).toMatchObject({
        inscriptionId: res.body.id,
        placesRestantes: 19,
      });
    });

    it('409 si l’apprenant est déjà inscrit, sans seconde ligne', async () => {
      const res = await inscrire(ouverteId, tokenApprenant).expect(409);
      expect(res.body.message).toBe('Vous êtes déjà inscrit à cette formation.');

      expect(await inscriptionRepository.countBy({ apprenantId, formationId: ouverteId })).toBe(1);
      expect(await audits(ouverteId)).toHaveLength(1);
    });

    it('409 « Formation complète » quand il ne reste aucune place', async () => {
      const res = await inscrire(pleineId, tokenApprenant).expect(409);
      expect(res.body.message).toBe('Formation complète : il ne reste aucune place.');

      expect(await inscriptionRepository.countBy({ formationId: pleineId })).toBe(1);
      expect(await audits(pleineId)).toHaveLength(0);
    });

    it('409 qui renvoie vers un administrateur si l’inscription est suspendue', async () => {
      const res = await inscrire(suspendueId, tokenApprenant).expect(409);
      expect(res.body.message).toMatch(/suspendue : contactez un administrateur/);

      const inscription = await inscriptionRepository.findOneByOrFail({
        apprenantId,
        formationId: suspendueId,
      });
      expect(inscription.statut).toBe(StatutInscription.SUSPENDUE);
    });

    it('404 pour une formation fermée, archivée ou inconnue', async () => {
      for (const id of [fermeeId, archiveeId, UUID_INCONNU]) {
        const res = await inscrire(id, tokenApprenant).expect(404);
        expect(res.body.message).toBe('Formation introuvable.');
      }
      expect(await inscriptionRepository.countBy({ formationId: In([fermeeId, archiveeId]) })).toBe(
        0,
      );
    });

    it('400 pour un identifiant mal formé', async () => {
      await inscrire('pas-un-uuid', tokenApprenant).expect(400);
    });

    it('401 sans jeton ; 403 pour un formateur et pour un administrateur', async () => {
      await request(app.getHttpServer())
        .post(`/api/formations/${ouverteId}/inscriptions`)
        .expect(401);
      await inscrire(ouverteId, tokenFormateur).expect(403);
      await inscrire(ouverteId, tokenAdmin).expect(403);
    });

    it('dernière place disputée : une seule inscription passe, la capacité tient', async () => {
      const reponses = await Promise.all([
        inscrire(derniereId, tokenApprenant2),
        inscrire(derniereId, tokenApprenant3),
      ]);

      expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
      const refus = reponses.find((r) => r.status === 409);
      expect(refus?.body.message).toBe('Formation complète : il ne reste aucune place.');
      expect(await inscriptionRepository.countBy({ formationId: derniereId })).toBe(1);
    });

    it('rafale d’inscriptions simultanées : jamais plus d’inscrits que de places', async () => {
      // Appel direct du service, sans HTTP : les transactions partent vraiment
      // en même temps sur des connexions distinctes du pool. Sans le verrou
      // sur la formation, plusieurs comptent la même place libre.
      const service = moduleRef.get(InscriptionsService);
      const resultats = await Promise.allSettled(
        rafaleIds.map((id) => service.inscrire(id, rafaleFormationId, { adresseIp: null })),
      );

      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      for (const echec of resultats.filter((r) => r.status === 'rejected')) {
        expect((echec as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      }
      expect(await inscriptionRepository.countBy({ formationId: rafaleFormationId })).toBe(3);
    });
  });

  // ===================================================================
  //  Mes inscriptions
  // ===================================================================

  describe('Mes inscriptions', () => {
    it('renvoie mes inscriptions, suspendue comprise, la plus récente d’abord', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/mes-inscriptions')
        .set('Authorization', `Bearer ${tokenApprenant}`)
        .expect(200);

      expect(
        res.body.map((i: { formation: { id: string }; statut: string }) => [
          i.formation.id,
          i.statut,
        ]),
      ).toEqual([
        [ouverteId, StatutInscription.EN_COURS],
        [suspendueId, StatutInscription.SUSPENDUE],
      ]);
    });

    it('401 sans jeton ; 403 pour un formateur', async () => {
      await request(app.getHttpServer()).get('/api/mes-inscriptions').expect(401);
      await request(app.getHttpServer())
        .get('/api/mes-inscriptions')
        .set('Authorization', `Bearer ${tokenFormateur}`)
        .expect(403);
    });
  });

  // ===================================================================
  //  Catalogue : places restantes et statut d'inscription
  // ===================================================================

  describe('Catalogue', () => {
    it('le détail indique les places restantes et mon inscription', async () => {
      const lire = (id: string, token: string): request.Test =>
        request(app.getHttpServer())
          .get(`/api/formations/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

      expect((await lire(ouverteId, tokenApprenant)).body).toMatchObject({
        placesRestantes: 19,
        statutInscription: StatutInscription.EN_COURS,
      });
      // Une inscription suspendue ne prend pas de place.
      expect((await lire(suspendueId, tokenApprenant)).body).toMatchObject({
        placesRestantes: 5,
        statutInscription: StatutInscription.SUSPENDUE,
      });
      expect((await lire(pleineId, tokenApprenant)).body).toMatchObject({
        placesRestantes: 0,
        statutInscription: null,
      });
      // L'administrateur voit les places, jamais de statut personnel.
      expect((await lire(ouverteId, tokenAdmin)).body).toMatchObject({
        placesRestantes: 19,
        statutInscription: null,
      });
    });

    it('la liste porte les mêmes informations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/formations?limit=100')
        .set('Authorization', `Bearer ${tokenApprenant2}`)
        .expect(200);

      const pleine = res.body.items.find((f: { id: string }) => f.id === pleineId);
      expect(pleine).toMatchObject({
        placesRestantes: 0,
        statutInscription: StatutInscription.EN_COURS,
      });
    });
  });
});
