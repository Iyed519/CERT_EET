import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Like, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { Formation } from '../src/database/entities/formation.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { MailService } from '../src/mail/mail.service';
import { CertificatsService } from '../src/modules/certificats/certificats.service';
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-DASH-02 — Superviser les certificats (DS-16 P3), sur
 * l'application réelle (PostgreSQL, Redis et worker, S3).
 *
 * Couvre :
 *  - accès : 401 sans jeton, 403 formateur et apprenant (liste et fiche) ;
 *  - liste : titulaire, formation, score, statut, empreinte et nombre de
 *    consultations publiques (zéro sans vérification) ; filtre de statut
 *    (seuls les certificats de ce statut) ; recherche par email, nom, titre
 *    de formation, identifiant ; jokers LIKE neutralisés ; 400 statut inconnu
 *    ou recherche trop longue ;
 *  - fiche : empreinte SHA-256, consultations (total, valides, refusées,
 *    dernières : date et verdict, sans adresse IP), historique ordonné
 *    (demande, émission, révocation) sans les vérifications ; 404 inconnu ;
 *    400 identifiant mal formé ;
 *  - relance / révocation renvoient aussi le compteur ;
 *  - concurrence : 8 vérifications publiques simultanées -> compteur = 8.
 *
 * Marqueur `E2E-DASH02` (titres de formation) ; emails `e2e-dash02-…`.
 */
describe('Supervision des certificats (e2e) — US-DASH-02', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-DASH02';
  const EMAIL = {
    admin: 'e2e-dash02-admin@cert-eet.local',
    formateur: 'e2e-dash02-form@cert-eet.local',
    a: 'e2e-dash02-a_1@cert-eet.local',
    b: 'e2e-dash02-ab1@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const cert: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const get = (url: string, token = tokens.admin): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  type Ligne = { id: string; consultations: { total: number; derniere: string | null } };
  const ligneDe = (liste: Ligne[], id: string): Ligne | undefined => liste.find((c) => c.id === id);

  const statut = async (id: string): Promise<string> => {
    const [l] = (await dataSource.query('SELECT statut FROM certificats WHERE id = $1', [
      id,
    ])) as Array<{ statut: string }>;
    return l?.statut;
  };

  const attendreActif = async (id: string): Promise<void> => {
    const fin = Date.now() + 20_000;
    while ((await statut(id)) !== 'ACTIF') {
      if (Date.now() > fin) throw new Error(`Certificat ${id} non émis`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  const remettreLimite = async (): Promise<void> => {
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT ?? 6379),
    });
    await redis.del('limite:verification:127.0.0.1', 'limite:verification:::1');
    redis.disconnect();
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
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
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
    dataSource = moduleRef.get(DataSource, { strict: false });
    const mail = moduleRef.get(MailService);
    jest.spyOn(mail, 'sendCertificatEmisEmail').mockResolvedValue(undefined);
    jest.spyOn(mail, 'sendCertificatRevoqueEmail').mockResolvedValue(undefined);
    await remettreLimite();

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const profils: Record<keyof typeof EMAIL, [Role, string, string]> = {
      admin: [Role.ADMINISTRATEUR, 'Inès', 'Superviseur'],
      formateur: [Role.FORMATEUR, 'Sami', 'Formateur'],
      a: [Role.APPRENANT, 'Yasmine', 'Trabelsi-Dashdeux'],
      b: [Role.APPRENANT, 'Karim', 'Mansour'],
    };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const [role, prenom, nom] = profils[cle];
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom,
          nom,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(EMAIL[cle]);
    }
    const repo = dataSource.getRepository(Formation);
    const nouvelle = async (titre: string): Promise<string> =>
      (
        await repo.save(
          repo.create({
            titre: `${MARQUEUR} ${titre}`,
            statut: StatutFormation.OUVERTE,
            capaciteMax: 20,
            noteMinCertification: 60,
          }),
        )
      ).id;
    const backend = await nouvelle('Développement back-end');
    const devops = await nouvelle('DevOps 100%');
    const certificats = moduleRef.get(CertificatsService);
    cert.a = (await certificats.demanderEmission(ids.a, backend, 84)).certificatId;
    cert.b = (await certificats.demanderEmission(ids.b, devops, 66)).certificatId;
    await attendreActif(cert.a);
    await attendreActif(cert.b);
    const [attente] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
         date_emission, nb_tentatives, derniere_erreur)
       VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now(), 3, 'S3 en panne') RETURNING id`,
      [ids.a, devops],
    )) as Array<{ id: string }>;
    cert.attente = attente.id;
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await nettoyer();
    await remettreLimite();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et entrée', () => {
    it('401 sans jeton ; 403 formateur et apprenant (liste et fiche)', async () => {
      await request(app.getHttpServer()).get('/api/admin/certificats').expect(401);
      await request(app.getHttpServer()).get(`/api/admin/certificats/${cert.a}`).expect(401);
      for (const role of ['formateur', 'a']) {
        await get('/api/admin/certificats', tokens[role]).expect(403);
        await get(`/api/admin/certificats/${cert.a}`, tokens[role]).expect(403);
      }
    });

    it('400 : statut inconnu, recherche trop longue, identifiant mal formé ; 404 inconnu', async () => {
      await get('/api/admin/certificats?statut=VALIDE').expect(400);
      await get(`/api/admin/certificats?recherche=${'x'.repeat(256)}`).expect(400);
      await get('/api/admin/certificats/pas-un-uuid').expect(400);
      const res = await get(`/api/admin/certificats/${INCONNU}`).expect(404);
      expect(res.body.message).toBe('Certificat introuvable.');
    });
  });

  describe('Liste', () => {
    it('colonnes attendues ; zéro consultation sans vérification', async () => {
      const res = await get(`/api/admin/certificats?recherche=${MARQUEUR}`).expect(200);
      const a = res.body.find((c: { id: string }) => c.id === cert.a);
      expect(a).toMatchObject({
        id: cert.a,
        statut: 'ACTIF',
        scoreFinal: 84,
        apprenant: { id: ids.a, prenom: 'Yasmine', nom: 'Trabelsi-Dashdeux', email: EMAIL.a },
        formation: { titre: `${MARQUEUR} Développement back-end` },
        consultations: { total: 0, derniere: null },
      });
      expect(a.empreinteSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body).toHaveLength(3);
    });

    it('filtre de statut : seuls les certificats de ce statut', async () => {
      const res = await get(
        `/api/admin/certificats?statut=EN_ATTENTE_GENERATION&recherche=${MARQUEUR}`,
      ).expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([cert.attente]);
      for (const c of res.body) expect(c.statut).toBe('EN_ATTENTE_GENERATION');
    });

    it('recherche : nom sans casse, email, titre, identifiant exact', async () => {
      const parNom = await get('/api/admin/certificats?recherche=TRABELSI-DASHDEUX').expect(200);
      expect(parNom.body.map((c: { id: string }) => c.id).sort()).toEqual(
        [cert.a, cert.attente].sort(),
      );
      const parEmail = await get(`/api/admin/certificats?recherche=${EMAIL.b}`).expect(200);
      expect(parEmail.body.map((c: { id: string }) => c.id)).toEqual([cert.b]);
      const parTitre = await get(
        `/api/admin/certificats?recherche=${encodeURIComponent('back-end')}&statut=ACTIF`,
      ).expect(200);
      expect(parTitre.body.map((c: { id: string }) => c.id)).toContain(cert.a);
      expect(parTitre.body.map((c: { id: string }) => c.id)).not.toContain(cert.b);
      const parId = await get(`/api/admin/certificats?recherche=${cert.b}`).expect(200);
      expect(parId.body.map((c: { id: string }) => c.id)).toEqual([cert.b]);
    });

    it('recherche : « _ » et « % » sont des caractères, pas des jokers', async () => {
      const souligne = await get('/api/admin/certificats?recherche=dash02-a_1').expect(200);
      expect(
        souligne.body.map((c: { apprenant: { email: string } }) => c.apprenant.email),
      ).not.toContain(EMAIL.b);
      expect(souligne.body.length).toBeGreaterThan(0);
      const pourcent = await get(
        `/api/admin/certificats?recherche=${encodeURIComponent('DevOps 100%')}`,
      ).expect(200);
      expect(pourcent.body.map((c: { id: string }) => c.id).sort()).toEqual(
        [cert.b, cert.attente].sort(),
      );
      // Non échappé, « 100_ » trouverait « 100% » ; échappé, il ne trouve rien.
      const rien = await get('/api/admin/certificats?recherche=100_').expect(200);
      expect(rien.body).toHaveLength(0);
    });
  });

  describe('Consultations et fiche', () => {
    it('concurrence : 8 vérifications publiques simultanées -> compteur = 8', async () => {
      await remettreLimite();
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app.getHttpServer()).get(`/api/verification/${cert.a}`),
        ),
      );
      for (const r of reponses) expect(r.status).toBe(200);
      const res = await get(`/api/admin/certificats?recherche=${MARQUEUR}`).expect(200);
      expect(ligneDe(res.body, cert.a)?.consultations.total).toBe(8);
      expect(ligneDe(res.body, cert.a)?.consultations.derniere).not.toBeNull();
      expect(ligneDe(res.body, cert.b)?.consultations.total).toBe(0);
    });

    it('révocation : la réponse porte le compteur ; la vérification devient « refusée »', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/admin/certificats/${cert.a}/revoquer`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({
          motif: 'FRAUDE',
          description: 'Usurpation d’identité constatée lors de l’examen.',
          confirmationIrreversible: true,
          motDePasseAdmin: MOT_DE_PASSE,
        })
        .expect(200);
      expect(res.body.statut).toBe('REVOQUE');
      expect(res.body.consultations.total).toBe(8);
      await request(app.getHttpServer()).get(`/api/verification/${cert.a}`).expect(200);
    });

    it('fiche : empreinte, consultations (sans IP), historique ordonné sans vérifications', async () => {
      const res = await get(`/api/admin/certificats/${cert.a}`).expect(200);
      const fiche = res.body;
      expect(fiche.certificat.id).toBe(cert.a);
      expect(fiche.certificat.empreinteSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(fiche.certificat.consultations.total).toBe(9);
      expect(fiche.consultations).toMatchObject({ total: 9, valides: 8, refusees: 1 });
      expect(fiche.consultationsRecentes).toHaveLength(9);
      expect(fiche.consultationsRecentes[0].verdict).toBe('REVOQUE');
      expect(fiche.consultationsRecentes[1].verdict).toBe('VALIDE');
      for (const c of fiche.consultationsRecentes) {
        expect(Object.keys(c).sort()).toEqual(['horodatage', 'verdict']);
      }
      const actions = fiche.historique.map((e: { action: string }) => e.action);
      expect(actions).not.toContain('CERTIFICAT_VERIFIE');
      expect(actions.indexOf('CERTIFICAT_DEMANDE')).toBeLessThan(
        actions.indexOf('CERTIFICAT_EMIS'),
      );
      expect(actions.indexOf('CERTIFICAT_EMIS')).toBeLessThan(
        actions.indexOf('CERTIFICAT_REVOQUE'),
      );
      const revocation = fiche.historique.find(
        (e: { action: string }) => e.action === 'CERTIFICAT_REVOQUE',
      );
      expect(revocation.acteur).toEqual({
        id: ids.admin,
        email: EMAIL.admin,
        prenom: 'Inès',
        nom: 'Superviseur',
      });
      expect(JSON.stringify(fiche)).not.toMatch(/motDePasse|cleStockage|adresse_?ip/i);
    });

    it('fiche d un certificat en préparation : sans empreinte, zéro consultation', async () => {
      const res = await get(`/api/admin/certificats/${cert.attente}`).expect(200);
      expect(res.body.certificat.empreinteSha256).toBeNull();
      expect(res.body.consultations).toEqual({ total: 0, valides: 0, refusees: 0, derniere: null });
      expect(res.body.consultationsRecentes).toEqual([]);
    });

    it('relance : la réponse porte aussi le compteur', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/admin/certificats/${cert.attente}/relancer`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(res.body.consultations).toEqual({ total: 0, derniere: null });
      await attendreActif(cert.attente);
    });
  });
});
