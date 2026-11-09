import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { AuditLog } from '../src/database/entities/audit-log.entity';
import { Formation } from '../src/database/entities/formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-CERT-03 — Consulter et télécharger son certificat
 * (UC Apprenant), sur l'application réelle : vrais PostgreSQL, Redis (file
 * et worker) et S3.
 *
 * Couvre :
 *  - liste de MES certificats : statut, score, mention ; empreinte SHA-256 et
 *    lien public seulement une fois émis ; jamais la clé de stockage ; chacun
 *    ne voit que les siens ;
 *  - téléchargement : le PDF exact (SHA-256 = empreinte stockée), nom de
 *    fichier, audit CERTIFICAT_TELECHARGE ;
 *  - refus : certificat d'un autre apprenant ou inconnu -> 404 (même
 *    réponse), en préparation ou révoqué -> 409, 400, 401, 403 (formateur,
 *    administrateur).
 *
 * Nettoyage rejouable (avant ET après) : certificats (objets S3, lignes,
 * audit) -> formations -> audit -> utilisateurs.
 */
describe('Mes certificats (e2e) — US-CERT-03', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-MESCERT';
  const EMAIL = {
    admin: 'e2e-mescert-admin@cert-eet.local',
    formateur: 'e2e-mescert-form@cert-eet.local',
    a: 'e2e-mescert-a@cert-eet.local',
    b: 'e2e-mescert-b@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const formations: Record<string, string> = {};
  const cert: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (chemin: string, token: string): request.Test =>
    request(app.getHttpServer()).get(`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const binaire = (res: request.Response, fin: (e: Error | null, corps: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };

  const attendreActif = async (id: string): Promise<void> => {
    const fin = Date.now() + 20_000;
    for (;;) {
      const [c] = (await dataSource.query('SELECT statut FROM certificats WHERE id = $1', [
        id,
      ])) as Array<{ statut: string }>;
      if (c?.statut === 'ACTIF') return;
      if (Date.now() > fin) throw new Error(`Certificat ${id} : ${c?.statut}`);
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
    jest.spyOn(moduleRef.get(MailService), 'sendCertificatEmisEmail').mockResolvedValue(undefined);

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
    for (const [cle, titre] of [
      ['principale', 'Développement back-end'],
      ['seconde', 'DevOps'],
    ]) {
      formations[cle] = (
        await repo.save(
          repo.create({
            titre: `${MARQUEUR} ${titre}`,
            statut: StatutFormation.OUVERTE,
            capaciteMax: 20,
            noteMinCertification: 60,
          }),
        )
      ).id;
    }
    const certificats = moduleRef.get(CertificatsService);
    cert.a = (await certificats.demanderEmission(ids.a, formations.principale, 84)).certificatId;
    cert.b = (await certificats.demanderEmission(ids.b, formations.principale, 66)).certificatId;
    await attendreActif(cert.a);
    await attendreActif(cert.b);
    // En préparation : une ligne sans travail (comme après un échec définitif).
    const [ligne] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
         date_emission, nb_tentatives, derniere_erreur)
       VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now() + interval '1 minute', 3, 'S3 en panne')
       RETURNING id`,
      [ids.a, formations.seconde],
    )) as Array<{ id: string }>;
    cert.attente = ligne.id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Liste', () => {
    it('mes certificats seulement, plus récents d’abord, en liste blanche', async () => {
      const res = await api('/mes-certificats', tokens.a).expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([cert.attente, cert.a]);
      const [attente, actif] = res.body;
      expect(actif).toEqual({
        id: cert.a,
        formation: { id: formations.principale, titre: `${MARQUEUR} Développement back-end` },
        statut: 'ACTIF',
        scoreFinal: 84,
        mention: 'Très bien',
        organismeEmetteur: 'ESPRIT Entreprise',
        dateEmission: expect.any(String),
        dateGeneration: expect.any(String),
        empreinteSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        urlVerification: `${process.env.APP_BASE_URL}/verifier/${cert.a}`,
        revocation: null,
      });
      expect(attente).toMatchObject({
        statut: 'EN_ATTENTE_GENERATION',
        empreinteSha256: null,
        urlVerification: null,
        dateGeneration: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /certificats\/|cleStockage|derniereErreur|S3 en panne/,
      );
      const deB = await api('/mes-certificats', tokens.b).expect(200);
      expect(deB.body.map((c: { id: string }) => c.id)).toEqual([cert.b]);
    });

    it('401 sans jeton ; 403 formateur et administrateur', async () => {
      await request(app.getHttpServer()).get('/api/mes-certificats').expect(401);
      await api('/mes-certificats', tokens.formateur).expect(403);
      await api('/mes-certificats', tokens.admin).expect(403);
    });
  });

  describe('Téléchargement', () => {
    it('200 : le PDF exact (SHA-256 = empreinte), nom de fichier, tracé', async () => {
      const res = await api(`/mes-certificats/${cert.a}/pdf`, tokens.a)
        .buffer(true)
        .parse(binaire)
        .expect(200);
      const pdf = res.body as Buffer;
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="certificat-e2e-mescert-developpement-back-end.pdf"',
      );
      const [{ empreinte_sha256: empreinte }] = (await dataSource.query(
        'SELECT empreinte_sha256 FROM certificats WHERE id = $1',
        [cert.a],
      )) as Array<{ empreinte_sha256: string }>;
      expect(createHash('sha256').update(pdf).digest('hex')).toBe(empreinte);
      const traces = await auditLogRepository.find({
        where: { action: 'CERTIFICAT_TELECHARGE', cible: cert.a },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].userId).toBe(ids.a);
    });

    it('certificat d’un autre apprenant ou inconnu : même 404', async () => {
      const autre = await api(`/mes-certificats/${cert.b}/pdf`, tokens.a).expect(404);
      const inconnu = await api(
        '/mes-certificats/88888888-8888-4888-8888-888888888888/pdf',
        tokens.a,
      ).expect(404);
      expect(autre.body).toEqual(inconnu.body);
      await api('/mes-certificats/pas-un-uuid/pdf', tokens.a).expect(400);
      await api(`/mes-certificats/${cert.a}/pdf`, tokens.admin).expect(403);
    });

    it('en préparation -> 409 ; révoqué -> 409', async () => {
      const attente = await api(`/mes-certificats/${cert.attente}/pdf`, tokens.a).expect(409);
      expect(attente.body.message).toBe(
        'Votre certificat est en cours d’émission : il sera téléchargeable dans quelques instants.',
      );
      await dataSource.query(
        `UPDATE certificats SET statut = 'REVOQUE', date_revocation = now(),
           motif_revocation = 'ERREUR_ADMIN', description_revocation = 'Révocation de test (e2e).',
           revoque_par = apprenant_id WHERE id = $1`,
        [cert.b],
      );
      const revoque = await api(`/mes-certificats/${cert.b}/pdf`, tokens.b).expect(409);
      expect(revoque.body.message).toBe(
        'Ce certificat a été révoqué : il n’est plus téléchargeable.',
      );
      const liste = await api('/mes-certificats', tokens.b).expect(200);
      expect(liste.body[0]).toMatchObject({
        statut: 'REVOQUE',
        revocation: { date: expect.any(String), motif: 'ERREUR_ADMIN' },
        empreinteSha256: expect.any(String),
      });
    });
  });
});
