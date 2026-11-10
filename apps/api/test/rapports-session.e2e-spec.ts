import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import {
  MESSAGE_LIMITE_RAPPORTS,
  MESSAGE_RAPPORT_INTROUVABLE,
  MESSAGE_RAPPORT_NON_PRET,
  RapportsService,
} from '../src/modules/rapports/rapports.service';
import { StockageService } from '../src/stockage/stockage.service';

/**
 * Tests d'intégration US-RPT-01 — Exporter un rapport de session (DS-14 P3),
 * sur l'application réelle (PostgreSQL, Redis / BullMQ, stockage S3).
 *
 * Couvre :
 *  - accès : 401 ; 403 apprenant ; 403 formateur non affecté + audit
 *    ACCES_RESSOURCE_REFUSE ; 404 formation inconnue ; 400 format, portée,
 *    identifiants, champ inconnu, paramètre hors portée ; 404 apprenant non
 *    inscrit, module d'une autre formation ;
 *  - génération asynchrone : 202 EN_ATTENTE, worker -> PRET ; CSV global
 *    (BOM, `;`, liste blanche, formule neutralisée), PDF individuel, CSV par
 *    module (meilleure note) ; empreinte SHA-256 du fichier ; audit
 *    RAPPORT_DEMANDE / RAPPORT_GENERE / RAPPORT_TELECHARGE ;
 *  - isolation : un autre utilisateur reçoit 404 (statut, fichier), « Mes
 *    rapports » ne montre que les siens ; 409 tant que le rapport n'est pas
 *    prêt ; échec définitif -> ECHEC, audit RAPPORT_ECHEC ;
 *  - concurrence : 8 demandes simultanées -> 5 × 202, 3 × 429 ; 4 exécutions
 *    simultanées du worker pour un rapport -> un seul fichier, une trace.
 *
 * Marqueur `E2E-RPT01` (titres) ; emails `e2e-rpt01-…`.
 */
describe('Rapports de session (e2e) — US-RPT-01', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-RPT01';
  const EMAIL = {
    admin: 'e2e-rpt01-admin@cert-eet.local',
    formateur: 'e2e-rpt01-form@cert-eet.local',
    autre: 'e2e-rpt01-autre@cert-eet.local',
    rafale: 'e2e-rpt01-rafale@cert-eet.local',
    a: 'e2e-rpt01-a@cert-eet.local',
    b: 'e2e-rpt01-b@cert-eet.local',
    c: 'e2e-rpt01-c@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const INCONNU = '77777777-7777-4777-8777-777777777777';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const get = (url: string, token = tokens.formateur): request.Test =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
  const post = (url: string, body: object, token = tokens.formateur): request.Test =>
    request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const binaire = (res: request.Response, fin: (e: Error | null, b: Buffer) => void): void => {
    const morceaux: Buffer[] = [];
    res.on('data', (m: Buffer) => morceaux.push(m));
    res.on('end', () => fin(null, Buffer.concat(morceaux)));
  };
  const telecharger = (id: string, token = tokens.formateur): request.Test =>
    get(`/api/rapports/${id}/fichier`, token).buffer(true).parse(binaire);

  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const un = async (texte: string, params: unknown[] = []): Promise<string> =>
    (await sql<{ id: string }>(texte, params))[0].id;

  const traces = async (action: string, cible: string): Promise<number> =>
    (
      await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = $1 AND cible = $2`,
        [action, cible],
      )
    )[0].n;

  /** Attend la fin de la génération (PRET ou ECHEC), 20 s au plus. */
  const attendre = async (id: string, token = tokens.formateur): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 80; i += 1) {
      const res = await get(`/api/rapports/${id}`, token).expect(200);
      if (res.body.statut === 'PRET' || res.body.statut === 'ECHEC') return res.body;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Rapport ${id} toujours en attente.`);
  };

  const url = (formation = ids.f): string => `/api/formateur/formations/${formation}/rapports`;

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const rapports = await sql<{ id: string; cle_stockage: string | null }>(
      `SELECT id, cle_stockage FROM rapports WHERE demandeur_id = ANY($1) OR formation_id = ANY($2)`,
      [uids, formations],
    );
    const cles = rapports.map((r) => r.cle_stockage).filter((c): c is string => !!c);
    if (cles.length) await moduleRef.get(StockageService).supprimer(cles);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...rapports.map((r) => r.id)],
      ]);
      await qr.query(`DELETE FROM rapports WHERE id = ANY($1)`, [rapports.map((r) => r.id)]);
      await qr.query(
        `DELETE FROM corrections WHERE livrable_id IN (SELECT id FROM livrables WHERE apprenant_id = ANY($1))`,
        [uids],
      );
      await qr.query(`DELETE FROM livrables WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM tentatives_qcm WHERE apprenant_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
      for (const table of ['ateliers', 'qcm']) {
        await qr.query(
          `DELETE FROM ${table} WHERE module_id IN (SELECT id FROM modules WHERE formation_id = ANY($1))`,
          [formations],
        );
      }
      await qr.query(`DELETE FROM modules WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formations WHERE id = ANY($1)`, [formations]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
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
    await app.listen(0);
    userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    dataSource = moduleRef.get(DataSource, { strict: false });

    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<string, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      rafale: Role.FORMATEUR,
    };
    const prenoms: Record<string, string> = { a: 'Amel', b: '=HYPERLINK("x")', c: 'Chiraz' };
    for (const cle of Object.keys(EMAIL) as Array<keyof typeof EMAIL>) {
      const u = await userRepository.save(
        userRepository.create({
          email: EMAIL[cle],
          role: roles[cle] ?? Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: prenoms[cle] ?? cle.toUpperCase(),
          nom: `Rapport${cle.toUpperCase()}`,
        }),
      );
      ids[cle] = u.id;
      if (cle in roles || cle === 'a') tokens[cle] = await login(EMAIL[cle]);
    }
    const formation = (titre: string): Promise<string> =>
      un(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`],
      );
    ids.f = await formation('Back-end');
    ids.g = await formation('Autre');
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id)
       VALUES ($1, $2), ($3, $4), ($1, $5)`,
      [ids.f, ids.formateur, ids.g, ids.autre, ids.rafale],
    );
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription)
       VALUES ($1, $3, 'EN_COURS', now() - interval '10 days'),
              ($2, $3, 'EN_COURS', now() - interval '10 days')`,
      [ids.a, ids.b, ids.f],
    );
    await sql(`INSERT INTO inscriptions (apprenant_id, formation_id) VALUES ($1, $2)`, [
      ids.c,
      ids.g,
    ]);
    ids.m1 = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module 1', 1) RETURNING id`,
      [ids.f],
    );
    ids.mg = await un(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'Module G', 1) RETURNING id`,
      [ids.g],
    );
    ids.q1 = await un(
      `INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'PUBLIE') RETURNING id`,
      [ids.m1, `${MARQUEUR} QCM 1`],
    );
    await un(`INSERT INTO qcm (module_id, titre, statut) VALUES ($1, $2, 'BROUILLON') RETURNING id`, [
      ids.m1,
      `${MARQUEUR} QCM brouillon`,
    ]);
    const tentative = (apprenant: string, score: number, jours: number): Promise<unknown[]> =>
      sql(
        `INSERT INTO tentatives_qcm (apprenant_id, qcm_id, date_debut, date_limite, date_fin,
           duree_effective, score, est_reussie, statut)
         VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '30 minutes',
           now() - make_interval(days => $3) + interval '12 minutes', 720, $4::numeric, $4::numeric >= 60, 'NOTEE')`,
        [apprenant, ids.q1, jours, score],
      );
    await tentative(ids.a, 45, 3);
    await tentative(ids.a, 82.5, 2);
    await tentative(ids.b, 30, 2);
    ids.at1 = await un(
      `INSERT INTO ateliers (module_id, titre, enonce, date_limite, types_livrables, statut)
       VALUES ($1, $2, 'Énoncé de l’atelier (test).', now() - interval '1 day', '{pdf}', 'PUBLIE')
       RETURNING id`,
      [ids.m1, `${MARQUEUR} Atelier 1`],
    );
    const livrable = await un(
      `INSERT INTO livrables (id, atelier_id, apprenant_id, statut, date_soumission, hash_tracabilite)
       VALUES (uuid_generate_v4(), $1, $2, 'NOTE', now() - interval '3 days', $3) RETURNING id`,
      [ids.at1, ids.b, 'b'.repeat(64)],
    );
    await sql(
      `INSERT INTO corrections (livrable_id, correcteur_id, statut, date_ouverture, score_total,
         commentaire_general, date_finalisation)
       VALUES ($1, $2, 'TERMINEE', now() - interval '2 days', 91, 'Bien.', now() - interval '2 days')`,
      [livrable, ids.formateur],
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès et validation', () => {
    it('401 ; 403 apprenant ; 404 formation inconnue ; 400 identifiant', async () => {
      await request(app.getHttpServer())
        .post(url())
        .send({ format: 'CSV', portee: 'GLOBAL' })
        .expect(401);
      await post(url(), { format: 'CSV', portee: 'GLOBAL' }, tokens.a).expect(403);
      await get('/api/rapports', tokens.a).expect(403);
      await post(url(INCONNU), { format: 'CSV', portee: 'GLOBAL' }).expect(404);
      await post('/api/formateur/formations/pas-un-uuid/rapports', {
        format: 'CSV',
        portee: 'GLOBAL',
      }).expect(400);
      await get('/api/rapports/pas-un-uuid').expect(400);
    });

    it('403 formateur non affecté, tracé ACCES_RESSOURCE_REFUSE', async () => {
      await post(url(), { format: 'CSV', portee: 'GLOBAL' }, tokens.autre).expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs
          WHERE action = 'ACCES_RESSOURCE_REFUSE' AND user_id = $1`,
        [ids.autre],
      );
      expect(n).toBeGreaterThanOrEqual(1);
    });

    it('400 : format, portée, champ inconnu, paramètre manquant ou hors portée', async () => {
      await post(url(), { format: 'XLSX', portee: 'GLOBAL' }).expect(400);
      await post(url(), { format: 'CSV', portee: 'TOUT' }).expect(400);
      await post(url(), { format: 'CSV', portee: 'GLOBAL', periode: 'x' }).expect(400);
      await post(url(), { format: 'CSV', portee: 'INDIVIDUEL' }).expect(400);
      await post(url(), { format: 'CSV', portee: 'MODULE', moduleId: 'abc' }).expect(400);
      await post(url(), { format: 'CSV', portee: 'GLOBAL', apprenantId: ids.a }).expect(400);
      await post(url(), { format: 'CSV', portee: 'GLOBAL', moduleId: ids.m1 }).expect(400);
    });

    it('404 : apprenant non inscrit, module d’une autre formation ; rien d’enregistré', async () => {
      await post(url(), { format: 'PDF', portee: 'INDIVIDUEL', apprenantId: ids.c }).expect(404);
      await post(url(), { format: 'PDF', portee: 'MODULE', moduleId: ids.mg }).expect(404);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM rapports WHERE demandeur_id = $1`,
        [ids.formateur],
      );
      expect(n).toBe(0);
    });
  });

  describe('Génération asynchrone et téléchargement', () => {
    it('CSV global : 202, PRET, BOM, liste blanche, formule neutralisée, empreinte, audit', async () => {
      const res = await post(url(), { format: 'CSV', portee: 'GLOBAL' }).expect(202);
      expect(res.body).toMatchObject({ type: 'SESSION', format: 'CSV', statut: 'EN_ATTENTE' });
      ids.rGlobal = res.body.id;
      const fin = await attendre(ids.rGlobal);
      expect(fin.statut).toBe('PRET');
      expect(fin.nomFichier).toMatch(/^rapport-e2e-rpt01-back-end-global-\d{4}-\d{2}-\d{2}\.csv$/);

      const f = await telecharger(ids.rGlobal).expect(200);
      expect(f.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(f.headers['content-disposition']).toBe(`attachment; filename="${fin.nomFichier}"`);
      const tampon = f.body as Buffer;
      expect(createHash('sha256').update(tampon).digest('hex')).toBe(fin.empreinteSha256);
      expect(tampon.length).toBe(fin.tailleOctets);
      const texte = tampon.toString('utf8');
      expect(texte.charCodeAt(0)).toBe(0xfeff);
      const lignes = texte.slice(1).trimEnd().split('\r\n');
      expect(lignes[0].split(';').slice(0, 4)).toEqual(['nom', 'prenom', 'email', 'statut_inscription']);
      expect(lignes).toHaveLength(3);
      expect(texte).toContain(EMAIL.a);
      expect(texte).toContain(`"'=HYPERLINK(""x"")"`);
      expect(texte).not.toContain(EMAIL.c);
      expect(texte).not.toMatch(/\$2[aby]\$/);

      expect(await traces('RAPPORT_DEMANDE', ids.rGlobal)).toBe(1);
      expect(await traces('RAPPORT_GENERE', ids.rGlobal)).toBe(1);
      expect(await traces('RAPPORT_TELECHARGE', ids.rGlobal)).toBe(1);
    });

    it('PDF individuel : PRET, document PDF', async () => {
      const res = await post(url(), {
        format: 'PDF',
        portee: 'INDIVIDUEL',
        apprenantId: ids.a,
      }).expect(202);
      ids.rIndividuel = res.body.id;
      expect(res.body.parametres).toEqual({ portee: 'INDIVIDUEL', apprenantId: ids.a });
      const fin = await attendre(ids.rIndividuel);
      expect(fin.statut).toBe('PRET');
      const f = await telecharger(ids.rIndividuel).expect(200);
      expect(f.headers['content-type']).toBe('application/pdf');
      expect((f.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('CSV par module : une colonne par évaluation publiée, meilleure note', async () => {
      const res = await post(url(), { format: 'CSV', portee: 'MODULE', moduleId: ids.m1 }).expect(
        202,
      );
      ids.rModule = res.body.id;
      expect((await attendre(ids.rModule)).statut).toBe('PRET');
      const texte = ((await telecharger(ids.rModule).expect(200)).body as Buffer)
        .toString('utf8')
        .slice(1);
      const [entete, ...lignes] = texte.trimEnd().split('\r\n').map((l) => l.split(';'));
      expect(entete).toEqual([
        'nom',
        'prenom',
        'email',
        'statut_inscription',
        `QCM ${MARQUEUR} QCM 1`,
        `ATELIER ${MARQUEUR} Atelier 1`,
      ]);
      const parEmail = Object.fromEntries(lignes.map((l) => [l[2], l.slice(4)]));
      expect(parEmail[EMAIL.a]).toEqual(['82,5', '']);
      expect(parEmail[EMAIL.b]).toEqual(['30', '91']);
    });

    it('administrateur : peut demander, rapport à son nom', async () => {
      const res = await post(url(), { format: 'CSV', portee: 'GLOBAL' }, tokens.admin).expect(202);
      ids.rAdmin = res.body.id;
      expect((await attendre(ids.rAdmin, tokens.admin)).statut).toBe('PRET');
    });
  });

  describe('Isolation et états', () => {
    it('un autre utilisateur reçoit 404 (statut, fichier) ; listes séparées', async () => {
      for (const token of [tokens.autre, tokens.admin]) {
        const r = await get(`/api/rapports/${ids.rGlobal}`, token).expect(404);
        expect(r.body.message).toBe(MESSAGE_RAPPORT_INTROUVABLE);
        await telecharger(ids.rGlobal, token).expect(404);
      }
      await get(`/api/rapports/${INCONNU}`).expect(404);
      const mes = await get('/api/rapports').expect(200);
      const mesIds = (mes.body as Array<{ id: string }>).map((r) => r.id);
      expect(mesIds).toEqual(expect.arrayContaining([ids.rGlobal, ids.rIndividuel, ids.rModule]));
      expect(mesIds).not.toContain(ids.rAdmin);
      const filtre = await get(`/api/rapports?formationId=${ids.g}`).expect(200);
      expect(filtre.body).toEqual([]);
      await get('/api/rapports?formationId=abc').expect(400);
    });

    it('409 tant que le rapport n’est pas prêt ; échec définitif -> ECHEC, tracé', async () => {
      const id = await un(
        `INSERT INTO rapports (type, format, demandeur_id, formation_id, parametres)
         VALUES ('SESSION', 'CSV', $1, $2, '{"portee": "GLOBAL"}') RETURNING id`,
        [ids.formateur, ids.f],
      );
      const r = await telecharger(id).expect(409);
      expect(JSON.parse((r.body as Buffer).toString()).message).toBe(MESSAGE_RAPPORT_NON_PRET);
      await moduleRef.get(RapportsService).echecDefinitif(id, new Error('Panne simulée.'));
      const fin = await get(`/api/rapports/${id}`).expect(200);
      expect(fin.body).toMatchObject({ statut: 'ECHEC', derniereErreur: 'Panne simulée.' });
      expect(await traces('RAPPORT_ECHEC', id)).toBe(1);
      await telecharger(id).expect(409);
      // Un rapport terminé n'est plus repris par le worker.
      await moduleRef.get(RapportsService).generer(id);
      expect((await get(`/api/rapports/${id}`).expect(200)).body.statut).toBe('ECHEC');
    });
  });

  describe('Concurrence', () => {
    it('8 demandes simultanées : 5 × 202, 3 × 429, 5 rapports', async () => {
      const reponses = await Promise.all(
        Array.from({ length: 8 }, () =>
          post(url(), { format: 'CSV', portee: 'GLOBAL' }, tokens.rafale),
        ),
      );
      const codes = reponses.map((r) => r.status).sort();
      expect(codes).toEqual([202, 202, 202, 202, 202, 429, 429, 429]);
      expect(reponses.find((r) => r.status === 429)?.body.message).toBe(MESSAGE_LIMITE_RAPPORTS);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM rapports WHERE demandeur_id = $1`,
        [ids.rafale],
      );
      expect(n).toBe(5);
    });

    it('4 exécutions simultanées du worker : un seul fichier, une trace', async () => {
      const id = await un(
        `INSERT INTO rapports (type, format, demandeur_id, formation_id, parametres)
         VALUES ('SESSION', 'PDF', $1, $2, '{"portee": "GLOBAL"}') RETURNING id`,
        [ids.formateur, ids.f],
      );
      const service = moduleRef.get(RapportsService);
      await Promise.all(Array.from({ length: 4 }, () => service.generer(id)));
      const [l] = await sql<{ statut: string; nb_tentatives: number }>(
        `SELECT statut::text AS statut, nb_tentatives FROM rapports WHERE id = $1`,
        [id],
      );
      expect(l).toEqual({ statut: 'PRET', nb_tentatives: 1 });
      expect(await traces('RAPPORT_GENERE', id)).toBe(1);
    });
  });
});
