import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MESSAGE_IA_DEMONSTRATION } from '../src/modules/assistance-ia/llm/etat-ia.controller';

/**
 * Tests d'intégration US-IA-09 — État du fournisseur d'IA (GET /assistance-ia/etat)
 * et choix du fournisseur, sur l'application réelle.
 *
 * Couvre :
 *  - accès : 401 sans jeton ; 403 apprenant ; 200 formateur et administrateur ;
 *  - champs exacts `{ fournisseur, modele, reel, message }`, jamais de clé ;
 *  - fournisseur factice demandé (environnement e2e) : mode démonstration ;
 *  - les autres configurations (non configuré, clé qui prime) sont dans
 *    etat-ia-configurations.e2e-spec.ts (une application par configuration) ;
 *  - concurrence : 12 lectures simultanées, toutes identiques.
 *
 * Emails `e2e-etatia-…`.
 */
describe('État du fournisseur d’IA (e2e) — US-IA-09', () => {
  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const email = (cle: string): string => `e2e-etatia-${cle}@cert-eet.local`;
  const CLES: [string, Role][] = [
    ['admin', Role.ADMINISTRATEUR],
    ['formateur', Role.FORMATEUR],
    ['apprenant', Role.APPRENANT],
  ];
  const ALL_EMAILS = CLES.map(([c]) => email(c));
  const tokens: Record<string, string> = {};

  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const demarrer = async (): Promise<[INestApplication, TestingModule]> => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const a = ref.createNestApplication();
    a.setGlobalPrefix('api', { exclude: ['health'] });
    await a.listen(0);
    return [a, ref];
  };
  const login = async (a: INestApplication, e: string): Promise<string> =>
    (
      await request(a.getHttpServer())
        .post('/api/auth/login')
        .send({ email: e, password: MOT_DE_PASSE })
        .expect(200)
    ).body.accessToken as string;
  const lire = (a: INestApplication, token: string): request.Test =>
    request(a.getHttpServer())
      .get('/api/assistance-ia/etat')
      .set('Authorization', `Bearer ${token}`);

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        uids,
      ]);
      await qr.query(`DELETE FROM refresh_tokens WHERE user_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM users WHERE id = ANY($1)`, [uids]);
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  };

  beforeAll(async () => {
    [app, moduleRef] = await demarrer();
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });
    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    for (const [cle, role] of CLES) {
      await userRepository.save(
        userRepository.create({
          email: email(cle),
          role,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle,
          nom: 'EtatIa',
          profilComplet: true,
        }),
      );
      tokens[cle] = await login(app, email(cle));
    }
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  it('401 sans jeton ; 403 apprenant ; 200 formateur et administrateur', async () => {
    await request(app.getHttpServer()).get('/api/assistance-ia/etat').expect(401);
    await lire(app, tokens.apprenant).expect(403);
    await lire(app, tokens.formateur).expect(200);
    await lire(app, tokens.admin).expect(200);
  });

  it('factice demandé (environnement e2e) : mode démonstration, champs exacts', async () => {
    const { body } = await lire(app, tokens.formateur).expect(200);
    expect(Object.keys(body).sort()).toEqual(['fournisseur', 'message', 'modele', 'reel']);
    expect(body).toEqual({
      fournisseur: 'factice',
      modele: 'factice',
      reel: false,
      message: MESSAGE_IA_DEMONSTRATION,
    });
  });

  it('12 lectures simultanées : toutes identiques', async () => {
    const reponses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        lire(app, i % 2 ? tokens.admin : tokens.formateur).expect(200),
      ),
    );
    const premiere = JSON.stringify(reponses[0].body);
    for (const r of reponses) expect(JSON.stringify(r.body)).toBe(premiere);
  });
});
