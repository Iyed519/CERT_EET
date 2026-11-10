import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
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

/**
 * Tests d'intégration US-ATEL-05 — Remplacer son livrable, sur l'application
 * réelle ET un vrai stockage S3 (MinIO en CI ; serveur compatible en local).
 *
 * Couvre :
 *  - accès : 401 ; 403 formateur ; 403 apprenant non inscrit (tracé) ; 404
 *    atelier inconnu ; 404 aucun livrable déposé ;
 *  - remplacement : version + 1, hash recalculé (SHA-256 des nouveaux
 *    fichiers), fichiers, commentaire et liens remplacés, date de soumission
 *    avancée ; NOUVEAUX objets présents dans le stockage, ANCIENS retirés ;
 *    audit LIVRABLE_REMPLACE (versions et hash avant / après) ; deuxième
 *    remplacement -> version 3 ;
 *  - 400 fichier invalide : rien ne change (version, objets) ;
 *  - 409 après la date limite, même pendant la tolérance ; 409 une fois la
 *    correction ouverte par le formateur (EN_CORRECTION) ;
 *  - concurrence : 6 remplacements simultanés -> chaque succès ajoute UNE
 *    version (une trace chacun), les autres -> 409 ; le stockage ne garde que
 *    les objets de la version enregistrée ;
 *  - correction ouverte pendant des remplacements simultanés : jamais un
 *    remplacement après l'ouverture (verrou de la ligne).
 *
 * Marqueur `E2E-REMPLACE` (titres) ; emails `e2e-remplace-…`.
 */
describe('Remplacer son livrable (e2e) — US-ATEL-05', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let dataSource: DataSource;

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  });
  const BUCKET = process.env.S3_BUCKET_LIVRABLES ?? 'livrables';

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  const MARQUEUR = 'E2E-REMPLACE';
  const email = (cle: string): string => `e2e-remplace-${cle}@cert-eet.local`;
  const CLES = ['admin', 'formateur', 'a', 'b', 'c', 'd', 'libre'];
  const ALL_EMAILS = CLES.map(email);
  const INCONNU = '66666666-6666-4666-8666-666666666666';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const at = { P: '', C: '' };

  const PDF1 = Buffer.from('%PDF-1.7\nVersion 1 du rapport\n%%EOF\n');
  const PDF2 = Buffer.from('%PDF-1.7\nVersion 2 du rapport, corrigée\n%%EOF\n');
  const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0, 0]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
  /** Hash de traçabilité (US-ATEL-04) : SHA-256 seul, ou SHA-256 des SHA-256 triés. */
  const hashDe = (...b: Buffer[]): string =>
    b.length === 1
      ? sha(b[0])
      : createHash('sha256').update(b.map(sha).sort().join('\n'), 'utf8').digest('hex');

  const login = async (e: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: e, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };
  const api = (
    methode: 'get' | 'post' | 'patch' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);
  const deposer = (atelierId: string, cle: string): request.Test =>
    api('post', `/ateliers/${atelierId}/livrable`, tokens[cle]);
  const remplacer = (atelierId: string, cle: string): request.Test =>
    api('put', `/ateliers/${atelierId}/livrable`, tokens[cle]);
  const sql = async <T = Record<string, unknown>>(
    texte: string,
    params: unknown[] = [],
  ): Promise<T[]> => (await dataSource.query(texte, params)) as T[];
  const objetsDe = async (apprenantId: string): Promise<string[]> => {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `livrables/${apprenantId}/` }),
    );
    return (res.Contents ?? []).map((o) => o.Key as string).sort();
  };
  const livrableDe = async (
    cle: string,
    atelierId = at.P,
  ): Promise<{ id: string; version: number; statut: string; hash: string; date: Date }> =>
    (
      await sql<{ id: string; version: number; statut: string; hash: string; date: Date }>(
        `SELECT id, version, statut::text AS statut, hash_tracabilite AS hash, date_soumission AS date
           FROM livrables WHERE apprenant_id = $1 AND atelier_id = $2`,
        [ids[cle], atelierId],
      )
    )[0];
  const clesEnBase = async (livrableId: string): Promise<string[]> =>
    (
      await sql<{ cle: string }>(
        `SELECT cle_stockage AS cle FROM fichiers_livrables WHERE livrable_id = $1 ORDER BY cle_stockage`,
        [livrableId],
      )
    ).map((x) => x.cle);

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    for (const id of uids) {
      const cles = await objetsDe(id).catch(() => [] as string[]);
      if (cles.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: { Objects: cles.map((Key) => ({ Key })) },
          }),
        );
      }
    }
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const ateliers = (
      await sql<{ id: string }>(
        `SELECT a.id FROM ateliers a JOIN modules m ON m.id = a.module_id WHERE m.formation_id = ANY($1)`,
        [formations],
      )
    ).map((a) => a.id);
    const livrables = (
      await sql<{ id: string }>(`SELECT id FROM livrables WHERE atelier_id = ANY($1)`, [ateliers])
    ).map((l) => l.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1) OR cible = ANY($2)`, [
        uids,
        [...uids, ...formations, ...ateliers, ...livrables],
      ]);
      await qr.query(`DELETE FROM livrables WHERE id = ANY($1)`, [livrables]);
      await qr.query(`DELETE FROM inscriptions WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM ateliers WHERE id = ANY($1)`, [ateliers]);
      await qr.query(`DELETE FROM modules WHERE formation_id = ANY($1)`, [formations]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
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

  /** Atelier avec grille validée, publié, date limite dans 30 jours, tolérance 12 h. */
  const atelierPublie = async (moduleId: string, titre: string): Promise<string> => {
    const [{ futur }] = await sql<{ futur: Date }>(`SELECT now() + interval '30 days' AS futur`);
    const tf = tokens.formateur;
    const res = await api('post', `/modules/${moduleId}/ateliers`, tf)
      .send({
        titre: `${MARQUEUR} ${titre}`,
        enonce: 'Livrez le rapport en PDF et, au besoin, une archive du code.',
        dateLimite: new Date(futur).toISOString(),
        typesLivrables: ['pdf', 'zip'],
        tailleMaxMo: 1,
        nbMaxFichiers: 2,
        toleranceRetardHeures: 12,
      })
      .expect(201);
    const id = res.body.id as string;
    await api('post', `/ateliers/${id}/grille/criteres`, tf)
      .send({ intitule: 'Qualité', ponderation: 100 })
      .expect(201);
    await api('post', `/ateliers/${id}/grille/valider`, tf).expect(200);
    await api('patch', `/ateliers/${id}/publier`, tf).expect(200);
    return id;
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
    };
    for (const cle of CLES) {
      const u = await userRepository.save(
        userRepository.create({
          email: email(cle),
          role: roles[cle] ?? Role.APPRENANT,
          motDePasseHash,
          statut: StatutCompte.ACTIF,
          prenom: cle.toUpperCase(),
          nom: 'Remplace',
          profilComplet: true,
        }),
      );
      ids[cle] = u.id;
      tokens[cle] = await login(email(cle));
    }
    const [{ id: formationId }] = await sql<{ id: string }>(
      `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
       VALUES ($1, 'OUVERTE', 20, 60) RETURNING id`,
      [`${MARQUEUR} Back-end`],
    );
    await sql(
      `INSERT INTO formation_formateurs (formation_id, formateur_id, affecte_par) VALUES ($1, $2, $3)`,
      [formationId, ids.formateur, ids.admin],
    );
    await sql(
      `INSERT INTO inscriptions (apprenant_id, formation_id)
       SELECT unnest($1::uuid[]), $2`,
      [[ids.a, ids.b, ids.c, ids.d], formationId],
    );
    const [{ id: moduleId }] = await sql<{ id: string }>(
      `INSERT INTO modules (formation_id, titre, ordre) VALUES ($1, 'API REST', 1) RETURNING id`,
      [formationId],
    );
    at.P = await atelierPublie(moduleId, 'Projet API');
    at.C = await atelierPublie(moduleId, 'Bientôt clos');
    for (const cle of ['a', 'b', 'c', 'd']) {
      await deposer(at.P, cle).attach('fichiers', PDF1, 'v1.pdf').expect(201);
    }
    await deposer(at.C, 'a').attach('fichiers', PDF1, 'v1.pdf').expect(201);
  }, 120_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  describe('Accès', () => {
    it('401 ; 403 formateur ; 403 non inscrit tracé ; 404 atelier inconnu ; 404 aucun livrable', async () => {
      await request(app.getHttpServer())
        .put(`/api/ateliers/${at.P}/livrable`)
        .attach('fichiers', PDF2, 'v2.pdf')
        .expect(401);
      await remplacer(at.P, 'formateur').attach('fichiers', PDF2, 'v2.pdf').expect(403);
      await remplacer(at.P, 'libre').attach('fichiers', PDF2, 'v2.pdf').expect(403);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE user_id = $1 AND resultat <> 'Succès'`,
        [ids.libre],
      );
      expect(n).toBeGreaterThanOrEqual(1);
      await remplacer(INCONNU, 'a').attach('fichiers', PDF2, 'v2.pdf').expect(404);
      // c n'a rien déposé sur l'atelier C.
      await remplacer(at.C, 'c')
        .attach('fichiers', PDF2, 'v2.pdf')
        .expect(404)
        .expect((r) => expect(r.body.message).toMatch(/déposez-en un d’abord/));
    });
  });

  describe('Remplacement', () => {
    it('version + 1, hash recalculé, fichiers remplacés ; anciens objets retirés ; audit', async () => {
      const avant = await livrableDe('a');
      const anciennes = await clesEnBase(avant.id);
      expect(avant.version).toBe(1);
      const res = await remplacer(at.P, 'a')
        .field('commentaire', 'Version corrigée')
        .field('liens', 'https://github.com/exemple/projet')
        .attach('fichiers', PDF2, 'v2.pdf')
        .attach('fichiers', ZIP, 'code.zip')
        .expect(200);
      expect(res.body).toMatchObject({
        id: avant.id,
        version: 2,
        statut: 'SOUMIS',
        enRetard: false,
        commentaire: 'Version corrigée',
        liens: ['https://github.com/exemple/projet'],
        hashTracabilite: hashDe(PDF2, ZIP),
      });
      expect(res.body.fichiers.map((f: { nomOriginal: string }) => f.nomOriginal)).toEqual([
        'v2.pdf',
        'code.zip',
      ]);
      expect(res.body.fichiers[0].sha256).toBe(sha(PDF2));
      const apres = await livrableDe('a');
      expect(new Date(apres.date).getTime()).toBeGreaterThan(new Date(avant.date).getTime());
      const nouvelles = await clesEnBase(avant.id);
      expect(nouvelles).toHaveLength(2);
      expect(nouvelles.every((k) => /\/v2-[0-9a-f-]{36}\//.test(k))).toBe(true);
      const stockage = await objetsDe(ids.a);
      for (const k of nouvelles) expect(stockage).toContain(k);
      for (const k of anciennes) expect(stockage).not.toContain(k);
      const traces = await sql<{ d: Record<string, unknown> }>(
        `SELECT details_avant_apres AS d FROM audit_logs WHERE action = 'LIVRABLE_REMPLACE' AND cible = $1`,
        [avant.id],
      );
      expect(traces).toHaveLength(1);
      expect(traces[0].d).toMatchObject({
        avant: { version: 1, hashTracabilite: avant.hash },
        apres: { version: 2, hashTracabilite: hashDe(PDF2, ZIP) },
        nbFichiers: 2,
      });
      // Un second remplacement donne la version 3.
      await remplacer(at.P, 'a').attach('fichiers', PDF1, 'v3.pdf').expect(200);
      expect((await livrableDe('a')).version).toBe(3);
      expect(await objetsDe(ids.a)).toHaveLength(2); // v3 (P) + v1 (C)
    });

    it('400 fichier invalide : rien ne change', async () => {
      const avant = await livrableDe('b');
      const objets = await objetsDe(ids.b);
      await remplacer(at.P, 'b').attach('fichiers', PNG, 'image.png').expect(400);
      await remplacer(at.P, 'b').expect(400);
      expect(await livrableDe('b')).toEqual(avant);
      expect(await objetsDe(ids.b)).toEqual(objets);
    });
  });

  describe('Refus d’état et de temps', () => {
    it('409 après la date limite, même pendant la tolérance', async () => {
      await sql(`UPDATE ateliers SET date_limite = now() - interval '1 hour' WHERE id = $1`, [
        at.C,
      ]);
      await remplacer(at.C, 'a')
        .attach('fichiers', PDF2, 'v2.pdf')
        .expect(409)
        .expect((r) => expect(r.body.message).toMatch(/date limite est passée/));
      expect((await livrableDe('a', at.C)).version).toBe(1);
    });

    it('409 une fois la correction ouverte par le formateur', async () => {
      const l = await livrableDe('b');
      await api('patch', `/livrables/${l.id}/ouvrir`, tokens.formateur).expect(200);
      await remplacer(at.P, 'b')
        .attach('fichiers', PDF2, 'v2.pdf')
        .expect(409)
        .expect((r) => expect(r.body.message).toMatch(/en cours de correction/));
      expect((await livrableDe('b')).version).toBe(1);
    });
  });

  describe('Concurrence', () => {
    it('6 remplacements simultanés : version + 1 par succès, 409 sinon ; stockage = base', async () => {
      const avant = await livrableDe('c');
      const codes = (
        await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            remplacer(at.P, 'c').attach(
              'fichiers',
              Buffer.from(`%PDF-1.7\nessai ${i}\n%%EOF\n`),
              `essai-${i}.pdf`,
            ),
          ),
        )
      ).map((r) => r.status);
      // Une demande qui part après le COMMIT d'une autre remplace la version
      // suivante (légitime) ; une demande qui a lu une version dépassée -> 409.
      const reussis = codes.filter((c) => c === 200).length;
      expect(reussis).toBeGreaterThanOrEqual(1);
      expect(reussis + codes.filter((c) => c === 409).length).toBe(6);
      const apres = await livrableDe('c');
      expect(apres.version).toBe(avant.version + reussis);
      const [{ n }] = await sql<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'LIVRABLE_REMPLACE' AND cible = $1`,
        [apres.id],
      );
      expect(n).toBe(reussis);
      expect(await objetsDe(ids.c)).toEqual(await clesEnBase(apres.id));
    });

    it('ouverture de la correction pendant des remplacements : jamais un remplacement après', async () => {
      const l = await livrableDe('d');
      const [ouverture, ...remplacements] = await Promise.all([
        api('patch', `/livrables/${l.id}/ouvrir`, tokens.formateur),
        ...Array.from({ length: 4 }, () => remplacer(at.P, 'd').attach('fichiers', PDF2, 'v2.pdf')),
      ]);
      expect(ouverture.status).toBe(200);
      const fin = await livrableDe('d');
      expect(fin.statut).toBe('EN_CORRECTION');
      const reussis = remplacements.filter((r) => r.status === 200).length;
      expect(reussis).toBeLessThanOrEqual(1);
      expect(fin.version).toBe(1 + reussis);
      expect(remplacements.every((r) => [200, 409].includes(r.status))).toBe(true);
      // Stockage et base concordent : aucun objet orphelin, aucun fichier perdu.
      expect(await objetsDe(ids.d)).toEqual(await clesEnBase(l.id));
    });
  });
});
