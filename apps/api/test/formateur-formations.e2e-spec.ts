import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AffectationFormateur } from '../src/database/entities/affectation-formateur.entity';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { Qcm } from '../src/database/entities/qcm.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { AutorisationRessourceService } from '../src/modules/formations/autorisation/autorisation-ressource.service';

/**
 * Tests d'intégration US-AUTH-16 — Autorisation par ressource et espace
 * formateur « Mes formations ».
 *
 * Couvre de bout en bout, sur l'application réelle :
 *  - la liste : 401, 403 (apprenant, administrateur), uniquement SES
 *    formations, tous statuts ;
 *  - le détail, protégé par @FormateurDeLaFormation : formateur affecté
 *    (200, même fermée), formateur non affecté (403 + audit
 *    ACCES_RESSOURCE_REFUSE), administrateur (200, sans audit), formation
 *    inconnue (404), identifiant mal formé (400), apprenant (403) ;
 *  - le retrait de l'affectation coupe l'accès immédiatement ;
 *  - le chemin QCM -> module -> formation, sur la vraie base (aucune route QCM
 *    n'existe encore : j'appelle directement le service du garde).
 *
 * Nettoyage rejouable (avant ET après) : QCM -> formations (CASCADE modules et
 * affectations) -> audit (bypass maintenance) -> utilisateurs.
 */
describe('Espace formateur — autorisation par ressource (e2e) — US-AUTH-16', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let formationRepository: Repository<Formation>;
  let moduleRepository: Repository<ModuleFormation>;
  let qcmRepository: Repository<Qcm>;
  let affectationRepository: Repository<AffectationFormateur>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (E2E-AFFECT, E2E-DM,
  // E2E-FORM01, E2E-MODULES) : les suites tournent en parallèle.
  const MARQUEUR = 'E2E-AUTH16';
  const EMAIL_ADMIN = 'e2e-auth16-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-auth16-form1@cert-eet.local';
  const EMAIL_AUTRE_FORMATEUR = 'e2e-auth16-form2@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-auth16-appr@cert-eet.local';
  const ALL_EMAILS = [EMAIL_ADMIN, EMAIL_FORMATEUR, EMAIL_AUTRE_FORMATEUR, EMAIL_APPRENANT];
  const UUID_INCONNU = '11111111-1111-4111-8111-111111111111';

  let adminId: string;
  let formateurId: string;
  let autreFormateurId: string;
  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenAutreFormateur: string;
  let tokenApprenant: string;
  let ouverteId: string;
  let fermeeId: string;
  let archiveeId: string;
  let etrangereId: string;
  let moduleId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const lire = (chemin: string, token: string): request.Test =>
    request(app.getHttpServer())
      .get(`/api/formateur/formations${chemin}`)
      .set('Authorization', `Bearer ${token}`);

  const refus = (formationId: string): Promise<AuditLog[]> =>
    auditLogRepository.find({
      where: { action: 'ACCES_RESSOURCE_REFUSE', cible: formationId },
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
    const formations = await formationRepository.find({
      where: { titre: Like(`${MARQUEUR}%`) },
      select: { id: true },
    });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });

    await qcmRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await formationRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurs.map((u) => u.id)]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
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
    moduleRepository = dataSource.getRepository(ModuleFormation);
    qcmRepository = dataSource.getRepository(Qcm);
    affectationRepository = dataSource.getRepository(AffectationFormateur);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur, autre] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR },
        { email: EMAIL_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_AUTRE_FORMATEUR, role: Role.FORMATEUR },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT },
      ].map((u) => userRepository.create({ ...u, motDePasseHash, statut: StatutCompte.ACTIF })),
    );
    adminId = admin.id;
    formateurId = formateur.id;
    autreFormateurId = autre.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenAutreFormateur = await login(EMAIL_AUTRE_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const [ouverte, fermee, archivee, etrangere] = await formationRepository.save(
      [
        { titre: `${MARQUEUR} DevOps`, statut: StatutFormation.OUVERTE },
        { titre: `${MARQUEUR} Sécurité`, statut: StatutFormation.FERMEE },
        { titre: `${MARQUEUR} Ancienne`, statut: StatutFormation.ARCHIVEE },
        { titre: `${MARQUEUR} Étrangère`, statut: StatutFormation.OUVERTE },
      ].map((f) => formationRepository.create({ ...f, capaciteMax: 20, noteMinCertification: 60 })),
    );
    ouverteId = ouverte.id;
    fermeeId = fermee.id;
    archiveeId = archivee.id;
    etrangereId = etrangere.id;

    const [intro] = await moduleRepository.save([
      moduleRepository.create({ formationId: fermeeId, titre: 'Introduction', ordre: 1 }),
      moduleRepository.create({ formationId: fermeeId, titre: 'OWASP', ordre: 2 }),
    ]);
    moduleId = intro.id;

    // Le formateur est affecté à trois formations ; « Étrangère » est à un autre.
    await affectationRepository.save(
      [
        { formationId: ouverteId, formateurId },
        { formationId: fermeeId, formateurId },
        { formationId: archiveeId, formateurId },
        { formationId: etrangereId, formateurId: autreFormateurId },
      ].map((a) => affectationRepository.create({ ...a, affectePar: adminId })),
    );
  });

  afterAll(async () => {
    await nettoyer();
    expect(await formationRepository.countBy({ titre: Like(`${MARQUEUR}%`) })).toBe(0);
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  « Mes formations »
  // ===================================================================

  describe('Lister mes formations', () => {
    it('401 sans jeton ; 403 pour un apprenant et pour un administrateur', async () => {
      await request(app.getHttpServer()).get('/api/formateur/formations').expect(401);
      await lire('', tokenApprenant).expect(403);
      await lire('', tokenAdmin).expect(403);
    });

    it('renvoie uniquement SES formations, tous statuts, avec la date d’affectation', async () => {
      const res = await lire('', tokenFormateur).expect(200);

      const ids = res.body.map((f: { id: string }) => f.id);
      expect(ids.sort()).toEqual([ouverteId, fermeeId, archiveeId].sort());
      expect(ids).not.toContain(etrangereId);
      expect(res.body.map((f: { statut: string }) => f.statut).sort()).toEqual(
        [StatutFormation.ARCHIVEE, StatutFormation.FERMEE, StatutFormation.OUVERTE].sort(),
      );
      expect(typeof res.body[0].affecteLe).toBe('string');
    });

    it('le catalogue public, lui, reste limité aux formations ouvertes', async () => {
      await request(app.getHttpServer())
        .get(`/api/formations/${fermeeId}`)
        .set('Authorization', `Bearer ${tokenFormateur}`)
        .expect(404);
    });
  });

  // ===================================================================
  //  Détail, protégé par @FormateurDeLaFormation
  // ===================================================================

  describe('Consulter une de mes formations', () => {
    it('200 pour le formateur affecté, même sur une formation fermée, avec les modules', async () => {
      const res = await lire(`/${fermeeId}`, tokenFormateur).expect(200);

      expect(res.body).toMatchObject({ id: fermeeId, statut: StatutFormation.FERMEE });
      expect(res.body.modules.map((m: { titre: string }) => m.titre)).toEqual([
        'Introduction',
        'OWASP',
      ]);
    });

    it('403 pour un formateur non affecté, et l’accès refusé est tracé', async () => {
      const res = await lire(`/${etrangereId}`, tokenFormateur).expect(403);
      expect(res.body.message).toBe('Accès refusé : vous n’êtes pas affecté à cette formation.');

      const audits = await refus(etrangereId);
      expect(audits).toHaveLength(1);
      expect(audits[0].userId).toBe(formateurId);
      expect(audits[0].resultat).toBe('Échec');
      expect(audits[0].detailsAvantApres).toMatchObject({
        ressource: 'formation',
        ressourceId: etrangereId,
        methode: 'GET',
      });
    });

    it('200 pour un administrateur sur n’importe quelle formation, sans audit de refus', async () => {
      await lire(`/${etrangereId}`, tokenAdmin).expect(200);
      await lire(`/${archiveeId}`, tokenAdmin).expect(200);
      expect(await refus(archiveeId)).toHaveLength(0);
    });

    it('403 pour un apprenant, avant même le contrôle d’affectation', async () => {
      await lire(`/${ouverteId}`, tokenApprenant).expect(403);
      expect(await refus(ouverteId)).toHaveLength(0);
    });

    it('404 sur une formation inconnue, 400 sur un identifiant mal formé — sans audit', async () => {
      await lire(`/${UUID_INCONNU}`, tokenFormateur).expect(404);
      await lire('/pas-un-uuid', tokenFormateur).expect(400);
      expect(await refus(UUID_INCONNU)).toHaveLength(0);
    });

    it('retirer l’affectation coupe l’accès immédiatement', async () => {
      await lire(`/${ouverteId}`, tokenFormateur).expect(200);

      await affectationRepository.delete({ formationId: ouverteId, formateurId });

      await lire(`/${ouverteId}`, tokenFormateur).expect(403);
      const liste = await lire('', tokenFormateur).expect(200);
      expect(liste.body.map((f: { id: string }) => f.id)).not.toContain(ouverteId);
    });

    it('chacun ne voit que les siennes : l’autre formateur est refusé chez le premier', async () => {
      await lire(`/${etrangereId}`, tokenAutreFormateur).expect(200);
      await lire(`/${fermeeId}`, tokenAutreFormateur).expect(403);
    });
  });

  // ===================================================================
  //  Chemins de remontée vers la formation, sur la vraie base
  // ===================================================================

  describe('Remonter d’une ressource à sa formation', () => {
    it('formation, module et QCM mènent à la bonne formation ; inconnu -> null', async () => {
      const service = moduleRef.get(AutorisationRessourceService);
      const [qcm] = await qcmRepository.save([
        qcmRepository.create({ moduleId, titre: `${MARQUEUR} QCM` }),
      ]);

      expect(await service.formationDe('formation', fermeeId)).toBe(fermeeId);
      expect(await service.formationDe('module', moduleId)).toBe(fermeeId);
      expect(await service.formationDe('qcm', qcm.id)).toBe(fermeeId);
      expect(await service.formationDe('formation', UUID_INCONNU)).toBeNull();
      expect(await service.formationDe('module', UUID_INCONNU)).toBeNull();
      expect(await service.formationDe('qcm', UUID_INCONNU)).toBeNull();

      expect(await service.estAffecte(fermeeId, formateurId)).toBe(true);
      expect(await service.estAffecte(fermeeId, autreFormateurId)).toBe(false);
    });
  });
});
