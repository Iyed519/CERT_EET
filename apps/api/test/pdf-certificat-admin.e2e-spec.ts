import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StockageService } from '../src/stockage/stockage.service';

/**
 * E2E-CERT09 — US-CERT-09 : l'administrateur ouvre le PDF de tout certificat
 * généré depuis le panneau de supervision.
 *
 * Vérifie : accès (401, 403 apprenant et formateur), PDF identique à celui de
 * l'apprenant (empreinte SHA-256), affichage en ligne, certificat révoqué et
 * expiré consultables, certificat pas encore généré (409), inconnu (404),
 * identifiant mal formé (400), consultation journalisée, et 5 consultations
 * simultanées toutes servies et journalisées.
 */
describe('E2E-CERT09 — PDF d’un certificat pour l’administrateur (US-CERT-09)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  const MARQUEUR = 'E2E-CERT09';
  const MOT_DE_PASSE = 'Cert09Passe123';
  const EMAIL = {
    admin: 'e2e-cert09-admin@cert-eet.local',
    formateur: 'e2e-cert09-formateur@cert-eet.local',
    a: 'e2e-cert09-a@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const PDF = Buffer.from('%PDF-1.4\n% certificat de test E2E-CERT09\n%%EOF\n', 'latin1');
  const EMPREINTE = createHash('sha256').update(PDF).digest('hex');
  /** Une clé de stockage par certificat (unicité en base), même contenu. */
  const cle = (n: number): string => `certificats/${MARQUEUR}-${n}.pdf`;

  const sql = async <T = Record<string, unknown>>(texte: string, params: unknown[] = []): Promise<T[]> =>
    (await dataSource.query(texte, params)) as T[];
  const binaire = (res: request.Response, fin: (e: Error | null, b: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };
  const pdf = (id: string, token = tokens.admin): request.Test =>
    request(app.getHttpServer())
      .get(`/api/admin/certificats/${id}/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaire);
  const consultations = async (id: string): Promise<number> =>
    (
      await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'CERTIFICAT_PDF_CONSULTE_ADMIN' AND cible = $1`,
        [id],
      )
    )[0].n;

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const certificats = (
      await sql<{ id: string }>(`SELECT id FROM certificats WHERE formation_id = ANY($1)`, [formations])
    ).map((c) => c.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [uids, certificats]);
      await qr.query(`DELETE FROM certificats WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formations WHERE id = ANY($1)`, [formations]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
    await sql(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [uids]);
    await userRepository.delete({ email: In(ALL_EMAILS) });
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });
    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 4);
    const roles: Record<string, Role> = { admin: Role.ADMINISTRATEUR, formateur: Role.FORMATEUR, a: Role.APPRENANT };
    for (const [cle, email] of Object.entries(EMAIL)) {
      const u = await userRepository.save(
        userRepository.create({ email, role: roles[cle], motDePasseHash, statut: StatutCompte.ACTIF, prenom: cle, nom: 'Cert09' }),
      );
      ids[cle] = u.id;
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200);
      tokens[cle] = res.body.accessToken as string;
    }
    for (let n = 1; n <= 3; n++) {
      await moduleRef.get(StockageService).deposerTampon(cle(n), PDF, 'application/pdf', EMPREINTE);
    }
    const formation = async (titre: string): Promise<string> =>
      (
        await sql<{ id: string }>(
          `INSERT INTO formations (titre, statut, capacite_max, note_min_certification) VALUES ($1, 'FERMEE', 10, 60) RETURNING id`,
          [`${MARQUEUR} ${titre}`],
        )
      )[0].id;
    let rang = 0;
    const certificat = async (titre: string, statut: string, extra = ''): Promise<string> =>
      (
        await sql<{ id: string }>(
          `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur,
             date_emission, date_generation, cle_stockage, empreinte_sha256 ${extra ? ', date_revocation, motif_revocation, description_revocation, revoque_par' : ''})
           VALUES ($1, $2, $3::certificats_statut_enum, 80, 'Bien', 'ESPRIT Entreprise', now(),
                   CASE WHEN $3::text = 'EN_ATTENTE_GENERATION' THEN NULL ELSE now() END,
                   CASE WHEN $3::text = 'EN_ATTENTE_GENERATION' THEN NULL ELSE $4 END,
                   CASE WHEN $3::text = 'EN_ATTENTE_GENERATION' THEN NULL ELSE $5 END
                   ${extra ? ", now(), 'ERREUR_ADMIN', 'Erreur de saisie de la note finale.', $6" : ''})
           RETURNING id`,
          extra
            ? [ids.a, await formation(titre), statut, cle(++rang), EMPREINTE, ids.admin]
            : [ids.a, await formation(titre), statut, cle(++rang), EMPREINTE],
        )
      )[0].id;
    ids.actif = await certificat('Actif', 'ACTIF');
    ids.expire = await certificat('Expiré', 'EXPIRE');
    ids.revoque = await certificat('Révoqué', 'REVOQUE', 'revocation');
    ids.attente = await certificat('En attente', 'EN_ATTENTE_GENERATION');
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  it('accès : 401 sans jeton ; 403 apprenant (même titulaire) et formateur', async () => {
    await request(app.getHttpServer()).get(`/api/admin/certificats/${ids.actif}/pdf`).expect(401);
    await pdf(ids.actif, tokens.a).expect(403);
    await pdf(ids.actif, tokens.formateur).expect(403);
  });

  it('certificat actif : le PDF de l’apprenant, affiché en ligne, consultation journalisée', async () => {
    const res = await pdf(ids.actif).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline; filename="certificat-e2e-cert09-actif.pdf"');
    expect(createHash('sha256').update(res.body as Buffer).digest('hex')).toBe(EMPREINTE);
    const [trace] = await sql<{ user_id: string; details: Record<string, unknown> }>(
      `SELECT user_id, details_avant_apres AS details FROM audit_logs WHERE action = 'CERTIFICAT_PDF_CONSULTE_ADMIN' AND cible = $1`,
      [ids.actif],
    );
    expect(trace).toEqual({ user_id: ids.admin, details: { statut: 'ACTIF', empreinteSha256: EMPREINTE } });
  });

  it('certificats révoqué et expiré : consultables par l’administrateur', async () => {
    await pdf(ids.revoque).expect(200);
    await pdf(ids.expire).expect(200);
    expect(await consultations(ids.revoque)).toBe(1);
    expect(await consultations(ids.expire)).toBe(1);
  });

  it('pas encore généré : 409 ; inconnu : 404 ; mal formé : 400 ; rien de journalisé', async () => {
    await pdf(ids.attente).expect(409);
    await pdf('88888888-8888-4888-8888-888888888888').expect(404);
    await pdf('pas-un-uuid').expect(400);
    expect(await consultations(ids.attente)).toBe(0);
  });

  it('concurrence : 5 consultations simultanées, toutes servies et journalisées', async () => {
    const avant = await consultations(ids.actif);
    const reponses = await Promise.all(Array.from({ length: 5 }, () => pdf(ids.actif)));
    expect(reponses.every((r) => r.status === 200 && (r.body as Buffer).equals(PDF))).toBe(true);
    expect(await consultations(ids.actif)).toBe(avant + 5);
  });
});
