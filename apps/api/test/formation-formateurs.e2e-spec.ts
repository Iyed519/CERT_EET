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
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';

/**
 * Tests d'intégration US-FORM-03 — Affecter un formateur à une formation.
 *
 * Couvre de bout en bout, sur l'application réelle (base, Redis, guards) :
 *  - contrôle d'accès : 401 sans jeton, 403 pour un apprenant ET pour un
 *    formateur (il ne peut pas s'affecter lui-même) ;
 *  - validation : identifiants mal formés, corps vide, champ non autorisé ;
 *  - refus métier : formation ou utilisateur inconnu, compte sans le rôle
 *    Formateur, compte non actif, formation archivée, double affectation (y
 *    compris deux requêtes simultanées) ;
 *  - nominal : affectation enregistrée avec son auteur, email, audit ;
 *    plusieurs formateurs par formation (ADR-11) ; liste ; retrait.
 *
 * MailService est REMPLACÉ par un faux, comme dans register.e2e-spec.ts :
 * aucun serveur SMTP en test ni en CI, et j'observe l'envoi par ses appels.
 *
 * Nettoyage rejouable (avant ET après) : formations (CASCADE affectations)
 * -> audit (bypass maintenance) -> utilisateurs. L'ordre compte : la clé
 * étrangère formateur_id est RESTRICT.
 */
describe('Formations — affectation des formateurs (e2e) — US-FORM-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let formationRepository: Repository<Formation>;
  let affectationRepository: Repository<AffectationFormateur>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const mailMock = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendAffectationFormateurEmail: jest.fn().mockResolvedValue(undefined),
  };

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre (E2E-DM, E2E-FORM01,
  // E2E-MODULES) : les suites tournent en parallèle et nettoient par LIKE.
  const MARQUEUR = 'E2E-AFFECT';
  const EMAIL_ADMIN = 'e2e-affect-admin@cert-eet.local';
  const EMAIL_FORMATEUR = 'e2e-affect-form1@cert-eet.local';
  const EMAIL_FORMATEUR_2 = 'e2e-affect-form2@cert-eet.local';
  const EMAIL_FORMATEUR_INACTIF = 'e2e-affect-inactif@cert-eet.local';
  const EMAIL_APPRENANT = 'e2e-affect-appr@cert-eet.local';
  const ALL_EMAILS = [
    EMAIL_ADMIN,
    EMAIL_FORMATEUR,
    EMAIL_FORMATEUR_2,
    EMAIL_FORMATEUR_INACTIF,
    EMAIL_APPRENANT,
  ];
  const UUID_INCONNU = '11111111-1111-4111-8111-111111111111';

  let adminId: string;
  let formateurId: string;
  let formateur2Id: string;
  let formateurInactifId: string;
  let apprenantId: string;
  let tokenAdmin: string;
  let tokenFormateur: string;
  let tokenApprenant: string;
  let formationId: string;
  let fermeeId: string;
  let archiveeId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const appel = (methode: 'post' | 'delete' | 'get', chemin: string, token: string): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const base = (id: string = formationId): string => `/admin/formations/${id}/formateurs`;

  const affectationsEnBase = (id: string): Promise<number> =>
    affectationRepository.countBy({ formationId: id });

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

    await formationRepository.delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...formations.map((f) => f.id), ...utilisateurs.map((u) => u.id)]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mailMock)
      .compile();

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
    affectationRepository = dataSource.getRepository(AffectationFormateur);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const [admin, formateur, formateur2, inactif, apprenant] = await userRepository.save(
      [
        { email: EMAIL_ADMIN, role: Role.ADMINISTRATEUR, statut: StatutCompte.ACTIF },
        {
          email: EMAIL_FORMATEUR,
          role: Role.FORMATEUR,
          statut: StatutCompte.ACTIF,
          nom: 'Ben Salah',
          prenom: 'Amine',
        },
        { email: EMAIL_FORMATEUR_2, role: Role.FORMATEUR, statut: StatutCompte.ACTIF },
        { email: EMAIL_FORMATEUR_INACTIF, role: Role.FORMATEUR, statut: StatutCompte.DESACTIVE },
        { email: EMAIL_APPRENANT, role: Role.APPRENANT, statut: StatutCompte.ACTIF },
      ].map((u) => userRepository.create({ ...u, motDePasseHash })),
    );
    adminId = admin.id;
    formateurId = formateur.id;
    formateur2Id = formateur2.id;
    formateurInactifId = inactif.id;
    apprenantId = apprenant.id;
    tokenAdmin = await login(EMAIL_ADMIN);
    tokenFormateur = await login(EMAIL_FORMATEUR);
    tokenApprenant = await login(EMAIL_APPRENANT);

    const [ouverte, fermee, archivee] = await formationRepository.save(
      [
        { titre: `${MARQUEUR} DevOps`, statut: StatutFormation.OUVERTE },
        { titre: `${MARQUEUR} formation fermée`, statut: StatutFormation.FERMEE },
        { titre: `${MARQUEUR} formation archivée`, statut: StatutFormation.ARCHIVEE },
      ].map((f) => formationRepository.create({ ...f, capaciteMax: 20, noteMinCertification: 60 })),
    );
    formationId = ouverte.id;
    fermeeId = fermee.id;
    archiveeId = archivee.id;
  });

  afterAll(async () => {
    await nettoyer();
    // Aucun reliquat : ni formation, ni affectation, ni compte de test.
    expect(await formationRepository.countBy({ titre: Like(`${MARQUEUR}%`) })).toBe(0);
    expect(
      await affectationRepository.countBy({
        formateurId: In([formateurId, formateur2Id, formateurInactifId]),
      }),
    ).toBe(0);
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Refus — rien ne doit être écrit
  // ===================================================================

  describe('Contrôle d’accès et validation', () => {
    it('401 sans jeton sur les trois routes', async () => {
      const serveur = request(app.getHttpServer());
      await serveur.post(`/api${base()}`).send({ formateurId }).expect(401);
      await serveur.get(`/api${base()}`).expect(401);
      await serveur.delete(`/api${base()}/${formateurId}`).expect(401);
    });

    it('403 pour un apprenant sur les trois routes', async () => {
      await appel('post', base(), tokenApprenant).send({ formateurId }).expect(403);
      await appel('get', base(), tokenApprenant).expect(403);
      await appel('delete', `${base()}/${formateurId}`, tokenApprenant).expect(403);
    });

    it('403 pour un formateur : il ne peut pas s’affecter lui-même', async () => {
      await appel('post', base(), tokenFormateur).send({ formateurId }).expect(403);
      await appel('get', base(), tokenFormateur).expect(403);
    });

    it('400 sur un identifiant de formation ou de formateur mal formé', async () => {
      await appel('post', '/admin/formations/pas-un-uuid/formateurs', tokenAdmin)
        .send({ formateurId })
        .expect(400);
      await appel('get', '/admin/formations/pas-un-uuid/formateurs', tokenAdmin).expect(400);
      await appel('delete', `${base()}/pas-un-uuid`, tokenAdmin).expect(400);

      const res = await appel('post', base(), tokenAdmin)
        .send({ formateurId: 'pas-un-uuid' })
        .expect(400);
      expect(res.body.message).toContain('formateurId doit être un UUID.');
    });

    it('400 sur un corps vide ou un champ non autorisé', async () => {
      await appel('post', base(), tokenAdmin).send({}).expect(400);
      // L'auteur de l'affectation vient du jeton : le client ne peut pas l'imposer.
      await appel('post', base(), tokenAdmin)
        .send({ formateurId, affectePar: apprenantId })
        .expect(400);
    });

    it('404 sur une formation inconnue ou un utilisateur inconnu', async () => {
      await appel('post', base(UUID_INCONNU), tokenAdmin).send({ formateurId }).expect(404);
      await appel('get', base(UUID_INCONNU), tokenAdmin).expect(404);
      await appel('delete', `${base(UUID_INCONNU)}/${formateurId}`, tokenAdmin).expect(404);

      const res = await appel('post', base(), tokenAdmin)
        .send({ formateurId: UUID_INCONNU })
        .expect(404);
      expect(res.body.message).toBe('Utilisateur introuvable.');
    });

    it('400 si l’utilisateur n’a pas le rôle Formateur (critère d’erreur de la story)', async () => {
      const apprenant = await appel('post', base(), tokenAdmin)
        .send({ formateurId: apprenantId })
        .expect(400);
      expect(apprenant.body.message).toBe(
        'Seul un utilisateur ayant le rôle Formateur peut être affecté à une formation.',
      );
      // Un administrateur n'est pas un formateur non plus.
      await appel('post', base(), tokenAdmin).send({ formateurId: adminId }).expect(400);
    });

    it('400 si le compte formateur n’est pas actif', async () => {
      const res = await appel('post', base(), tokenAdmin)
        .send({ formateurId: formateurInactifId })
        .expect(400);
      expect(res.body.message).toContain('pas actif');
    });

    it('409 sur une formation archivée', async () => {
      await appel('post', base(archiveeId), tokenAdmin).send({ formateurId }).expect(409);
    });

    it('404 au retrait d’un formateur qui n’est pas affecté', async () => {
      await appel('delete', `${base()}/${formateurId}`, tokenAdmin).expect(404);
    });

    it('n’a rien écrit, rien envoyé et rien tracé après les requêtes refusées', async () => {
      expect(
        await affectationRepository.countBy({
          formationId: In([formationId, fermeeId, archiveeId]),
        }),
      ).toBe(0);
      expect(mailMock.sendAffectationFormateurEmail).not.toHaveBeenCalled();
      expect(
        await auditLogRepository.countBy({
          action: In(['FORMATEUR_AFFECTE', 'FORMATEUR_RETIRE']),
          userId: adminId,
        }),
      ).toBe(0);
    });
  });

  // ===================================================================
  //  Nominal
  // ===================================================================

  describe('Affecter, lister, retirer', () => {
    it('201 affecte le formateur, le prévient par email et trace l’action', async () => {
      const res = await appel('post', base(), tokenAdmin).send({ formateurId }).expect(201);

      expect(res.body).toMatchObject({
        id: formateurId,
        email: EMAIL_FORMATEUR,
        nom: 'Ben Salah',
        prenom: 'Amine',
        role: Role.FORMATEUR,
        statut: StatutCompte.ACTIF,
      });
      expect(typeof res.body.affecteLe).toBe('string');
      expect(res.body).not.toHaveProperty('motDePasseHash');

      // La ligne porte l'administrateur du jeton comme auteur.
      const enBase = await affectationRepository.findOneByOrFail({ formationId, formateurId });
      expect(enBase.affectePar).toBe(adminId);

      expect(mailMock.sendAffectationFormateurEmail).toHaveBeenCalledTimes(1);
      expect(mailMock.sendAffectationFormateurEmail).toHaveBeenCalledWith(EMAIL_FORMATEUR, {
        prenom: 'Amine',
        titreFormation: `${MARQUEUR} DevOps`,
      });

      const audits = await auditLogRepository.find({
        where: { action: 'FORMATEUR_AFFECTE', cible: formationId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].userId).toBe(adminId);
      expect(audits[0].resultat).toBe('Succès');
      expect(audits[0].detailsAvantApres).toEqual({
        formateurId,
        formateurEmail: EMAIL_FORMATEUR,
        formationTitre: `${MARQUEUR} DevOps`,
        notificationEnvoyee: true,
      });
    });

    it('409 si le formateur est déjà affecté, sans second email ni second audit', async () => {
      const res = await appel('post', base(), tokenAdmin).send({ formateurId }).expect(409);
      expect(res.body.message).toBe('Ce formateur est déjà affecté à cette formation.');

      expect(await affectationsEnBase(formationId)).toBe(1);
      expect(mailMock.sendAffectationFormateurEmail).toHaveBeenCalledTimes(1);
      expect(
        await auditLogRepository.countBy({ action: 'FORMATEUR_AFFECTE', cible: formationId }),
      ).toBe(1);
    });

    it('accepte plusieurs formateurs sur une même formation (ADR-11)', async () => {
      await appel('post', base(), tokenAdmin).send({ formateurId: formateur2Id }).expect(201);
      expect(await affectationsEnBase(formationId)).toBe(2);
    });

    it('deux affectations simultanées identiques : une seule passe, l’autre reçoit 409', async () => {
      mailMock.sendAffectationFormateurEmail.mockClear();

      const reponses = await Promise.all([
        appel('post', base(fermeeId), tokenAdmin).send({ formateurId: formateur2Id }),
        appel('post', base(fermeeId), tokenAdmin).send({ formateurId: formateur2Id }),
      ]);

      expect(reponses.map((r) => r.status).sort()).toEqual([201, 409]);
      // Une formation fermée accepte encore une affectation (seul l'archivage fige).
      expect(await affectationsEnBase(fermeeId)).toBe(1);
      expect(mailMock.sendAffectationFormateurEmail).toHaveBeenCalledTimes(1);
    });

    it('201 même si l’email échoue : l’affectation reste, l’audit le signale', async () => {
      mailMock.sendAffectationFormateurEmail.mockRejectedValueOnce(
        new Error('connect ECONNREFUSED'),
      );

      await appel('post', base(fermeeId), tokenAdmin).send({ formateurId }).expect(201);

      expect(await affectationsEnBase(fermeeId)).toBe(2);
      const audits = await auditLogRepository.find({
        where: { action: 'FORMATEUR_AFFECTE', cible: fermeeId },
      });
      expect(audits.map((a) => a.detailsAvantApres?.notificationEnvoyee).sort()).toEqual([
        false,
        true,
      ]);
    });

    it('200 liste les formateurs affectés, du plus ancien au plus récent', async () => {
      const res = await appel('get', base(), tokenAdmin).expect(200);

      expect(res.body.map((f: { id: string }) => f.id)).toEqual([formateurId, formateur2Id]);
      expect(Object.keys(res.body[0]).sort()).toEqual(
        ['affecteLe', 'email', 'id', 'nom', 'prenom', 'role', 'statut'].sort(),
      );
      // Une formation archivée reste consultable, et vide ici.
      const archivee = await appel('get', base(archiveeId), tokenAdmin).expect(200);
      expect(archivee.body).toEqual([]);
    });

    it('la liste montre le rôle actuel d’un formateur rétrogradé, qui reste retirable', async () => {
      await userRepository.update({ id: formateur2Id }, { role: Role.APPRENANT });

      const res = await appel('get', base(), tokenAdmin).expect(200);
      expect(res.body.find((f: { id: string }) => f.id === formateur2Id).role).toBe(Role.APPRENANT);

      await appel('delete', `${base()}/${formateur2Id}`, tokenAdmin).expect(204);
      expect(await affectationsEnBase(formationId)).toBe(1);

      // Rétrogradé, il ne peut plus être affecté de nouveau.
      await appel('post', base(), tokenAdmin).send({ formateurId: formateur2Id }).expect(400);
    });

    it('204 retire le formateur et trace l’action', async () => {
      const res = await appel('delete', `${base()}/${formateurId}`, tokenAdmin).expect(204);
      expect(res.body).toEqual({});

      expect(await affectationsEnBase(formationId)).toBe(0);
      const audits = await auditLogRepository.find({
        where: { action: 'FORMATEUR_RETIRE', cible: formationId },
        order: { horodatage: 'DESC' },
      });
      expect(audits).toHaveLength(2);
      expect(audits[0].userId).toBe(adminId);
      expect(audits[0].detailsAvantApres).toEqual({
        formateurId,
        formateurEmail: EMAIL_FORMATEUR,
        formationTitre: `${MARQUEUR} DevOps`,
      });

      // Second retrait : il n'est plus affecté.
      await appel('delete', `${base()}/${formateurId}`, tokenAdmin).expect(404);
      // Le compte, lui, n'a pas été touché.
      expect(await userRepository.countBy({ id: formateurId })).toBe(1);
    });

    it('201 permet de réaffecter un formateur retiré', async () => {
      await appel('post', base(), tokenAdmin).send({ formateurId }).expect(201);
      expect(await affectationsEnBase(formationId)).toBe(1);
    });

    it('409 au retrait sur une formation archivée : l’affectation est figée', async () => {
      await affectationRepository.save(
        affectationRepository.create({ formationId: archiveeId, formateurId, affectePar: adminId }),
      );

      await appel('delete', `${base(archiveeId)}/${formateurId}`, tokenAdmin).expect(409);
      expect(await affectationsEnBase(archiveeId)).toBe(1);
    });
  });
});
