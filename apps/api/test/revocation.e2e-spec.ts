import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { StockageService } from '../src/stockage/stockage.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-CERT-06 — Révoquer un certificat (DS-07), sur
 * l'application réelle : vrais PostgreSQL, Redis (file et worker) et S3.
 *
 * Couvre :
 *  - accès : 401 sans jeton, 403 formateur et apprenant ;
 *  - entrée : identifiant, motif, description, case d'irréversibilité, champ
 *    inconnu -> 400 ; mot de passe faux -> 401 tracé, rien de changé ;
 *    inconnu -> 404 ; en préparation -> 409 ;
 *  - révocation : ACTIF -> REVOQUE (motif, description, auteur, date de
 *    PostgreSQL) ; PDF, clé et empreinte conservés ; audit
 *    CERTIFICAT_REVOQUE ; email au titulaire (catégorie du motif) ; effet
 *    IMMÉDIAT sur la vérification publique (« Révoqué » + date, sans motif),
 *    sur le téléchargement (409) et sur « Mes certificats » ;
 *  - irréversible : deuxième révocation -> 409 ; aucune modification SQL ;
 *  - concurrence forcée : deux révocations simultanées -> une 200, une 409,
 *    un seul audit, un seul email.
 *
 * Nettoyage rejouable (avant ET après) : certificats (objets S3, lignes,
 * audit) -> formations -> audit -> utilisateurs.
 */
describe('Révocation d’un certificat (e2e) — US-CERT-06', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  let emailRevocation: jest.SpyInstance;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-REVOC';
  const EMAIL = {
    admin: 'e2e-revoc-admin@cert-eet.local',
    formateur: 'e2e-revoc-form@cert-eet.local',
    a: 'e2e-revoc-a@cert-eet.local',
    b: 'e2e-revoc-b@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const INCONNU = '88888888-8888-4888-8888-888888888888';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const cert: Record<string, string> = {};
  let formationId: string;

  const CORPS = {
    motif: 'FRAUDE',
    description: 'Usurpation d’identité constatée lors de l’examen.',
    confirmationIrreversible: true,
    motDePasseAdmin: MOT_DE_PASSE,
  };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const revoquer = (id: string, token: string, corps: object = CORPS): request.Test =>
    request(app.getHttpServer())
      .post(`/api/admin/certificats/${id}/revoquer`)
      .set('Authorization', `Bearer ${token}`)
      .send(corps);

  const ligne = async (id: string): Promise<Record<string, unknown>> => {
    const [l] = (await dataSource.query('SELECT * FROM certificats WHERE id = $1', [id])) as Array<
      Record<string, unknown>
    >;
    return l;
  };

  const attendreActif = async (id: string): Promise<void> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      if ((await ligne(id))?.statut === 'ACTIF') return;
      if (Date.now() > fin) throw new Error(`Certificat ${id} non émis`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const purgeAudit = async (cibles: string[]): Promise<void> => {
    if (cibles.length === 0) return;
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE user_id::text = ANY($1) OR cible = ANY($1)', [
        cibles,
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
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await purgerCertificats(dataSource, MARQUEUR);
    const lignes = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit([...lignes.map((f) => f.id), ...utilisateurs.map((u) => u.id)]);
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
    const mail = moduleRef.get(MailService);
    jest.spyOn(mail, 'sendCertificatEmisEmail').mockResolvedValue(undefined);
    emailRevocation = jest.spyOn(mail, 'sendCertificatRevoqueEmail').mockResolvedValue(undefined);

    // La vérification publique est limitée par IP (US-CERT-05) : compteurs à zéro.
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
    await redis.del('limite:verification:127.0.0.1', 'limite:verification:::1');
    redis.disconnect();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      a: Role.APPRENANT,
      b: Role.APPRENANT,
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle],
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: 'Test',
          nom: cle,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }
    const repo = dataSource.getRepository(Formation);
    formationId = (
      await repo.save(
        repo.create({
          titre: `${MARQUEUR} Développement back-end`,
          statut: StatutFormation.OUVERTE,
          capaciteMax: 20,
          noteMinCertification: 60,
        }),
      )
    ).id;
    const seconde = (
      await repo.save(
        repo.create({
          titre: `${MARQUEUR} DevOps`,
          statut: StatutFormation.OUVERTE,
          capaciteMax: 20,
          noteMinCertification: 60,
        }),
      )
    ).id;
    const certificats = moduleRef.get(CertificatsService);
    cert.a = (await certificats.demanderEmission(ids.a, formationId, 84)).certificatId;
    cert.b = (await certificats.demanderEmission(ids.b, formationId, 66)).certificatId;
    await attendreActif(cert.a);
    await attendreActif(cert.b);
    // En préparation : une ligne sans travail (comme après un échec définitif).
    const [attente] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
         date_emission, nb_tentatives, derniere_erreur)
       VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now(), 3, 'S3 en panne') RETURNING id`,
      [ids.a, seconde],
    )) as Array<{ id: string }>;
    cert.attente = attente.id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et entrée', () => {
    it('401 sans jeton ; 403 formateur et apprenant', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/certificats/${cert.a}/revoquer`)
        .send(CORPS)
        .expect(401);
      await revoquer(cert.a, tokens.formateur).expect(403);
      await revoquer(cert.a, tokens.a).expect(403);
    });

    it.each([
      ['identifiant mal formé', 'pas-un-uuid', {}],
      ['motif inconnu', null, { motif: 'AUTRE' }],
      ['description trop courte', null, { description: '  court  ' }],
      ['case non cochée', null, { confirmationIrreversible: false }],
      ['case absente', null, { confirmationIrreversible: undefined }],
      ['mot de passe vide', null, { motDePasseAdmin: '' }],
      ['champ inconnu', null, { motifPublic: 'x' }],
    ])('400 : %s', async (_cas, id, modif) => {
      await revoquer(id ?? cert.a, tokens.admin, { ...CORPS, ...modif }).expect(400);
      expect((await ligne(cert.a)).statut).toBe('ACTIF');
    });

    it('400 : messages en français', async () => {
      const res = await revoquer(cert.a, tokens.admin, {
        ...CORPS,
        description: 'court',
        confirmationIrreversible: false,
      }).expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'La description doit compter entre 10 et 2 000 caractères.',
          'Confirmez que la révocation est irréversible.',
        ]),
      );
    });

    it('401 : mot de passe faux — tracé, rien de changé, aucun email', async () => {
      const res = await revoquer(cert.a, tokens.admin, {
        ...CORPS,
        motDePasseAdmin: 'Faux123!',
      }).expect(401);
      expect(res.body.message).toBe('Mot de passe administrateur invalide.');
      expect((await ligne(cert.a)).statut).toBe('ACTIF');
      expect(
        await auditLogRepository.countBy({ action: 'CERTIFICAT_REVOCATION_REFUSEE', cible: cert.a }),
      ).toBe(1);
      expect(emailRevocation).not.toHaveBeenCalled();
    });

    it('404 inconnu ; 409 en préparation', async () => {
      await revoquer(INCONNU, tokens.admin).expect(404);
      const res = await revoquer(cert.attente, tokens.admin).expect(409);
      expect(res.body.message).toBe(
        'Seul un certificat émis (actif) peut être révoqué : celui-ci est encore en préparation.',
      );
      expect((await ligne(cert.attente)).statut).toBe('EN_ATTENTE_GENERATION');
    });
  });

  describe('Révocation', () => {
    it('200 : REVOQUE, motif, auteur, date ; PDF et empreinte conservés ; audit ; email', async () => {
      const avant = await ligne(cert.a);
      const res = await revoquer(cert.a, tokens.admin).expect(200);
      expect(res.body).toMatchObject({
        id: cert.a,
        statut: 'REVOQUE',
        empreinteSha256: avant.empreinte_sha256,
        revocation: {
          date: expect.any(String),
          motif: 'FRAUDE',
          description: CORPS.description,
          revoquePar: ids.admin,
        },
      });
      const apres = await ligne(cert.a);
      expect(apres).toMatchObject({
        statut: 'REVOQUE',
        motif_revocation: 'FRAUDE',
        description_revocation: CORPS.description,
        revoque_par: ids.admin,
        cle_stockage: avant.cle_stockage,
        empreinte_sha256: avant.empreinte_sha256,
        score_final: avant.score_final,
      });
      const [{ ecart }] = (await dataSource.query(
        'SELECT abs(extract(epoch FROM now() - date_revocation)) AS ecart FROM certificats WHERE id = $1',
        [cert.a],
      )) as Array<{ ecart: number }>;
      expect(Number(ecart)).toBeLessThan(10);
      // L'objet PDF est toujours dans le stockage.
      const lu = await moduleRef.get(StockageService).lire(apres.cle_stockage as string);
      lu.flux.resume();

      const traces = await auditLogRepository.find({
        where: { action: 'CERTIFICAT_REVOQUE', cible: cert.a },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].userId).toBe(ids.admin);
      expect(traces[0].detailsAvantApres).toEqual({
        avant: { statut: 'ACTIF' },
        apres: { statut: 'REVOQUE', motif: 'FRAUDE' },
      });
      expect(emailRevocation).toHaveBeenCalledTimes(1);
      expect(emailRevocation).toHaveBeenCalledWith(EMAIL.a, {
        prenom: 'Test',
        titreFormation: `${MARQUEUR} Développement back-end`,
        motif: 'Fraude avérée',
        dateRevocation: expect.any(Date),
      });
    });

    it('effet immédiat : vérification publique « Révoqué » + date, sans motif', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/verification/${cert.a}`)
        .expect(200);
      expect(res.body).toMatchObject({ verdict: 'REVOQUE', dateRevocation: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toMatch(/FRAUDE|Usurpation/);
      await request(app.getHttpServer()).get(`/api/verification/${cert.a}/pdf`).expect(404);
    });

    it('effet immédiat : le titulaire ne télécharge plus ; sa liste montre la révocation', async () => {
      await request(app.getHttpServer())
        .get(`/api/mes-certificats/${cert.a}/pdf`)
        .set('Authorization', `Bearer ${tokens.a}`)
        .expect(409);
      const liste = await request(app.getHttpServer())
        .get('/api/mes-certificats')
        .set('Authorization', `Bearer ${tokens.a}`)
        .expect(200);
      const revoque = (liste.body as Array<Record<string, unknown>>).find((c) => c.id === cert.a);
      expect(revoque).toMatchObject({
        statut: 'REVOQUE',
        revocation: { date: expect.any(String), motif: 'FRAUDE' },
      });
      expect(JSON.stringify(liste.body)).not.toContain('Usurpation');
    });

    it('irréversible : deuxième révocation -> 409 ; aucune modification SQL', async () => {
      const res = await revoquer(cert.a, tokens.admin, {
        ...CORPS,
        motif: 'ERREUR_ADMIN',
      }).expect(409);
      expect(res.body.message).toBe(
        'Ce certificat est déjà révoqué : la révocation est définitive.',
      );
      for (const sql of [
        "UPDATE certificats SET statut = 'ACTIF' WHERE id = $1",
        "UPDATE certificats SET description_revocation = 'Autre description' WHERE id = $1",
        'UPDATE certificats SET date_revocation = now() WHERE id = $1',
      ]) {
        await expect(dataSource.query(sql, [cert.a])).rejects.toThrow('irréversible');
      }
      expect((await ligne(cert.a)).motif_revocation).toBe('FRAUDE');
      expect(emailRevocation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux révocations simultanées : une 200, une 409, un audit, un email', async () => {
      emailRevocation.mockClear();
      // Je tiens le verrou de la ligne : les deux requêtes passent le mot de
      // passe puis attendent sur leur SELECT … FOR UPDATE ; libérées, la
      // seconde relit REVOQUE.
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('SELECT id FROM certificats WHERE id = $1 FOR UPDATE', [cert.b]);
        const enCours = [
          revoquer(cert.b, tokens.admin).then((r) => r.status),
          revoquer(cert.b, tokens.admin, { ...CORPS, motif: 'DISCIPLINAIRE' }).then(
            (r) => r.status,
          ),
        ];
        const fin = Date.now() + 15_000;
        for (;;) {
          const [{ n }] = (await dataSource.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock' AND query ILIKE '%certificats%'
                AND pid <> pg_backend_pid()`,
          )) as Array<{ n: number }>;
          if (n >= 2) break;
          if (Date.now() > fin) {
            const activite = await dataSource.query(
              "SELECT wait_event_type, wait_event, state, left(query, 200) AS q FROM pg_stat_activity WHERE datname = current_database()",
            );
            throw new Error(`Les deux révocations n’attendent pas le verrou : ${JSON.stringify(activite)}`);
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        await bloqueur.commitTransaction();
        statuts = await Promise.all(enCours);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(statuts.sort()).toEqual([200, 409]);
      expect((await ligne(cert.b)).statut).toBe('REVOQUE');
      expect(await auditLogRepository.countBy({ action: 'CERTIFICAT_REVOQUE', cible: cert.b })).toBe(
        1,
      );
      expect(emailRevocation).toHaveBeenCalledTimes(1);
    }, 30_000);
  });
});
