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
import { Inscription } from '../src/database/entities/inscription.entity';
import { ModuleFormation } from '../src/database/entities/module-formation.entity';
import { RessourceModule } from '../src/database/entities/ressource-module.entity';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { StatutFormation } from '../src/database/enums/statut-formation.enum';
import { StatutInscription } from '../src/database/enums/statut-inscription.enum';
import {
  MESSAGE_TROP_DE_RESSOURCES,
  MESSAGE_URL_INVALIDE,
  MESSAGE_VIDEO_INTROUVABLE,
} from '../src/modules/ressources/ressource.regles';

/**
 * Tests d'intégration US-FORM-05 — Ressources de module : liens (révision
 * v1.5 du Backlog), sur l'application réelle.
 *
 * Couvre : ajout (YouTube avec début, Vimeo, page web), liste ordonnée,
 * modification, réordonnancement, suppression, audit ; « Mon espace » de
 * l'apprenant inscrit (EN_COURS et TERMINEE) avec les ressources par module ;
 * refus 400 (adresse, titre, champ), 403 (formateur non affecté tracé,
 * apprenant sur les routes formateur, non-inscrit et suspendu sur son
 * espace), 404, 409 (formation archivée, 51e ressource) ; garanties en base ;
 * concurrence FORCÉE : deux ajouts simultanés -> deux rangs distincts, jamais
 * de 500.
 *
 * Nettoyage rejouable (avant ET après) : inscriptions -> formations (CASCADE
 * modules et ressources) -> audit -> utilisateurs.
 */
describe('Ressources de module — liens (e2e) — US-FORM-05', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let ressourceRepository: Repository<RessourceModule>;
  let dataSource: DataSource;

  const MOT_DE_PASSE = 'MotDePasseTest123!';
  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-RESSLIEN';
  const EMAIL = {
    admin: 'e2e-resslien-admin@cert-eet.local',
    formateur: 'e2e-resslien-form@cert-eet.local',
    autre: 'e2e-resslien-autre@cert-eet.local',
    apprenant: 'e2e-resslien-appr@cert-eet.local',
    termine: 'e2e-resslien-fini@cert-eet.local',
    suspendu: 'e2e-resslien-susp@cert-eet.local',
    libre: 'e2e-resslien-libre@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const UUID_INCONNU = '88888888-8888-4888-8888-888888888888';
  const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s';

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let formationId: string;
  /** M1, M2 : modules de la formation ouverte ; A : module d'une formation archivée ; P : module « plein ». */
  const mod = { M1: '', M2: '', A: '', P: '' };

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: MOT_DE_PASSE })
      .expect(200);
    return res.body.accessToken as string;
  };

  const api = (
    methode: 'get' | 'post' | 'patch' | 'put' | 'delete',
    chemin: string,
    token: string,
  ): request.Test =>
    request(app.getHttpServer())[methode](`/api${chemin}`).set('Authorization', `Bearer ${token}`);

  const ajouter = (
    module: string,
    corps: Record<string, unknown>,
    token = tokens.formateur,
  ): request.Test => api('post', `/modules/${module}/ressources/liens`, token).send(corps);

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
    const formations = await dataSource
      .getRepository(Formation)
      .find({ where: { titre: Like(`${MARQUEUR}%`) }, select: { id: true } });
    const formationIds = formations.map((f) => f.id);
    const ressources =
      formationIds.length === 0
        ? []
        : ((await dataSource.query(
            `SELECT r.id FROM ressources_module r JOIN modules m ON m.id = r.module_id
              WHERE m.formation_id = ANY($1)`,
            [formationIds],
          )) as Array<{ id: string }>);
    if (formationIds.length > 0) {
      await dataSource.getRepository(Inscription).delete({ formationId: In(formationIds) });
    }
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    const utilisateurs = await userRepository.find({
      where: { email: In(ALL_EMAILS) },
      select: { id: true },
    });
    await purgeAudit(
      [
        ...formationIds,
        ...ressources.map((r) => r.id),
        ...formations.map((f) => f.id),
        ...utilisateurs.map((u) => u.id),
        mod.M1,
        mod.M2,
      ].filter(Boolean),
    );
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
    ressourceRepository = dataSource.getRepository(RessourceModule);

    await nettoyer();

    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 12);
    const roles: Record<keyof typeof EMAIL, Role> = {
      admin: Role.ADMINISTRATEUR,
      formateur: Role.FORMATEUR,
      autre: Role.FORMATEUR,
      apprenant: Role.APPRENANT,
      termine: Role.APPRENANT,
      suspendu: Role.APPRENANT,
      libre: Role.APPRENANT,
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

    const formationRepo = dataSource.getRepository(Formation);
    const moduleRepo = dataSource.getRepository(ModuleFormation);
    const affectationRepo = dataSource.getRepository(AffectationFormateur);
    const creer = async (titre: string, statut: StatutFormation): Promise<string> => {
      const f = await formationRepo.save(
        formationRepo.create({ titre, statut, capaciteMax: 20, noteMinCertification: 60 }),
      );
      await affectationRepo.save(
        affectationRepo.create({
          formationId: f.id,
          formateurId: ids.formateur,
          affectePar: ids.admin,
        }),
      );
      return f.id;
    };
    formationId = await creer(`${MARQUEUR} Back-end`, StatutFormation.OUVERTE);
    mod.M1 = (await moduleRepo.save(moduleRepo.create({ formationId, titre: 'JWT', ordre: 1 }))).id;
    mod.M2 = (
      await moduleRepo.save(moduleRepo.create({ formationId, titre: 'Docker', ordre: 2 }))
    ).id;
    mod.P = (
      await moduleRepo.save(moduleRepo.create({ formationId, titre: 'Plein', ordre: 3 }))
    ).id;
    const archivee = await creer(`${MARQUEUR} Archivée`, StatutFormation.ARCHIVEE);
    mod.A = (
      await moduleRepo.save(moduleRepo.create({ formationId: archivee, titre: 'X', ordre: 1 }))
    ).id;

    const inscriptionRepo = dataSource.getRepository(Inscription);
    await inscriptionRepo.save(
      [
        { apprenantId: ids.apprenant },
        { apprenantId: ids.termine, statut: StatutInscription.TERMINEE },
        { apprenantId: ids.suspendu, statut: StatutInscription.SUSPENDUE },
      ].map((i) => inscriptionRepo.create({ ...i, formationId })),
    );
  }, 90_000);

  afterAll(async () => {
    await nettoyer();
    expect(await userRepository.countBy({ email: In(ALL_EMAILS) })).toBe(0);
    await app.close();
  });

  // ===================================================================
  //  Formateur
  // ===================================================================

  describe('Formateur : ajouter, lister, modifier, réordonner, retirer', () => {
    const r = { youtube: '', vimeo: '', web: '' };

    it('201 : vidéo YouTube (identifiant + début), Vimeo, page web — dans l’ordre d’ajout', async () => {
      const yt = await ajouter(mod.M1, {
        titre: '  Les jetons   JWT ',
        url: YOUTUBE,
        description: 'Dix minutes pour comprendre.',
      }).expect(201);
      expect(yt.body).toEqual({
        id: expect.any(String),
        ordre: 1,
        nature: 'LIEN',
        titre: 'Les jetons JWT',
        description: 'Dix minutes pour comprendre.',
        url: YOUTUBE,
        plateforme: 'YOUTUBE',
        videoId: 'dQw4w9WgXcQ',
        debutSecondes: 90,
        domaine: 'youtube.com',
      });
      r.youtube = yt.body.id as string;
      const vi = await ajouter(mod.M1, {
        titre: 'Vimeo',
        url: 'https://vimeo.com/76979871',
      }).expect(201);
      expect(vi.body).toEqual(
        expect.objectContaining({ ordre: 2, plateforme: 'VIMEO', videoId: '76979871' }),
      );
      r.vimeo = vi.body.id as string;
      const web = await ajouter(mod.M1, {
        titre: 'RFC 7519',
        url: 'https://www.rfc-editor.org/rfc/rfc7519',
      }).expect(201);
      expect(web.body).toEqual(
        expect.objectContaining({
          ordre: 3,
          plateforme: 'WEB',
          videoId: null,
          domaine: 'rfc-editor.org',
        }),
      );
      r.web = web.body.id as string;
      expect(
        await auditLogRepository.countBy({
          action: 'RESSOURCE_AJOUTEE',
          cible: In(Object.values(r)),
        }),
      ).toBe(3);

      const liste = await api('get', `/modules/${mod.M1}/ressources`, tokens.formateur).expect(200);
      expect((liste.body as Array<{ id: string }>).map((x) => x.id)).toEqual([
        r.youtube,
        r.vimeo,
        r.web,
      ]);
      await api('get', `/modules/${mod.M1}/ressources`, tokens.admin).expect(200);
    });

    it('PATCH : titre et adresse (réanalysée) ; 400 sans champ ou titre vide', async () => {
      const res = await api('patch', `/ressources/${r.vimeo}`, tokens.formateur)
        .send({ titre: 'Démo Docker', url: 'https://youtu.be/aaaaaaaaaaa?t=5' })
        .expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          titre: 'Démo Docker',
          plateforme: 'YOUTUBE',
          videoId: 'aaaaaaaaaaa',
          debutSecondes: 5,
        }),
      );
      await api('patch', `/ressources/${r.vimeo}`, tokens.formateur)
        .send({ description: '' })
        .expect(200);
      await api('patch', `/ressources/${r.vimeo}`, tokens.formateur).send({}).expect(400);
      await api('patch', `/ressources/${r.vimeo}`, tokens.formateur)
        .send({ titre: '   ' })
        .expect(400);
      expect(
        await auditLogRepository.countBy({ action: 'RESSOURCE_MODIFIEE', cible: r.vimeo }),
      ).toBe(2);
    });

    it('PUT ordre : permutation complète ; 400 incomplète, en double ou étrangère', async () => {
      const res = await api('put', `/modules/${mod.M1}/ressources/ordre`, tokens.formateur)
        .send({ ids: [r.web, r.youtube, r.vimeo] })
        .expect(200);
      expect(
        (res.body as Array<{ id: string; ordre: number }>).map((x) => [x.id, x.ordre]),
      ).toEqual([
        [r.web, 1],
        [r.youtube, 2],
        [r.vimeo, 3],
      ]);
      for (const ids_ of [
        [r.web, r.youtube],
        [r.web, r.web, r.vimeo],
        [r.web, r.youtube, UUID_INCONNU],
      ]) {
        await api('put', `/modules/${mod.M1}/ressources/ordre`, tokens.formateur)
          .send({ ids: ids_ })
          .expect(400);
      }
    });

    it('DELETE : 204, puis 404', async () => {
      const temp = await ajouter(mod.M2, {
        titre: 'Temporaire',
        url: 'https://exemple.tn/x',
      }).expect(201);
      await api('delete', `/ressources/${temp.body.id}`, tokens.formateur).expect(204);
      expect(await ressourceRepository.countBy({ id: temp.body.id as string })).toBe(0);
      expect(
        await auditLogRepository.countBy({
          action: 'RESSOURCE_SUPPRIMEE',
          cible: temp.body.id as string,
        }),
      ).toBe(1);
      await api('delete', `/ressources/${temp.body.id}`, tokens.formateur).expect(404);
    });
  });

  // ===================================================================
  //  Apprenant
  // ===================================================================

  describe('Apprenant : « Mon espace »', () => {
    beforeAll(async () => {
      await ajouter(mod.M2, {
        titre: 'Docker en vidéo',
        url: 'https://youtu.be/bbbbbbbbbbb',
      }).expect(201);
    });

    it.each(['apprenant', 'termine'])(
      'inscrit (%s) : ressources par module, dans l’ordre',
      async (cle) => {
        const res = await api('get', `/formations/${formationId}/mon-espace`, tokens[cle]).expect(
          200,
        );
        const [m1, m2, m3] = res.body.modules as Array<{
          ressources: Array<Record<string, unknown>>;
        }>;
        expect(m1.ressources.map((x) => x.titre)).toEqual([
          'RFC 7519',
          'Les jetons JWT',
          'Démo Docker',
        ]);
        expect(m2.ressources).toEqual([
          expect.objectContaining({
            titre: 'Docker en vidéo',
            plateforme: 'YOUTUBE',
            videoId: 'bbbbbbbbbbb',
          }),
        ]);
        expect(m3.ressources).toEqual([]);
        expect(Object.keys(m1.ressources[0]).sort()).toEqual([
          'debutSecondes',
          'description',
          'domaine',
          'id',
          'nature',
          'ordre',
          'plateforme',
          'titre',
          'url',
          'videoId',
        ]);
      },
    );

    it('403 : non inscrit et suspendu (tracés) ; apprenant sur les routes formateur', async () => {
      await api('get', `/formations/${formationId}/mon-espace`, tokens.libre).expect(403);
      await api('get', `/formations/${formationId}/mon-espace`, tokens.suspendu).expect(403);
      await api('get', `/modules/${mod.M1}/ressources`, tokens.apprenant).expect(403);
      await ajouter(mod.M1, { titre: 'x', url: 'https://exemple.tn' }, tokens.apprenant).expect(
        403,
      );
    });
  });

  // ===================================================================
  //  Refus
  // ===================================================================

  describe('Refus (rien n’est créé)', () => {
    let avant: number;
    beforeAll(async () => {
      avant = await ressourceRepository.count();
    });
    afterAll(async () => {
      expect(await ressourceRepository.count()).toBe(avant);
    });

    it.each([
      ['javascript:', { titre: 'x', url: 'javascript:alert(1)' }, MESSAGE_URL_INVALIDE],
      ['ftp', { titre: 'x', url: 'ftp://exemple.tn/a' }, MESSAGE_URL_INVALIDE],
      [
        'vidéo YouTube sans identifiant',
        { titre: 'x', url: 'https://www.youtube.com/watch?v=court' },
        MESSAGE_VIDEO_INTROUVABLE,
      ],
    ])('400 : %s', async (_l, corps, message) => {
      const res = await ajouter(mod.M1, corps).expect(400);
      expect(res.body.message).toBe(message);
    });

    it.each([
      ['identifiants', { titre: 'x', url: 'https://moi:secret@exemple.tn' }],
      ['titre absent', { url: 'https://exemple.tn' }],
      ['titre trop long', { titre: 't'.repeat(201), url: 'https://exemple.tn' }],
      [
        'description trop longue',
        { titre: 'x', url: 'https://exemple.tn', description: 'd'.repeat(501) },
      ],
      ['champ inconnu', { titre: 'x', url: 'https://exemple.tn', nature: 'FICHIER' }],
    ])('400 : %s', async (_l, corps) => {
      await ajouter(mod.M1, corps).expect(400);
    });

    it('403 formateur non affecté (tracé) ; 404 module ou ressource inconnus ; 400 identifiant', async () => {
      const refus = await auditLogRepository.countBy({
        action: 'ACCES_RESSOURCE_REFUSE',
        userId: ids.autre,
      });
      await ajouter(mod.M1, { titre: 'x', url: 'https://exemple.tn' }, tokens.autre).expect(403);
      await api('get', `/modules/${mod.M1}/ressources`, tokens.autre).expect(403);
      expect(
        await auditLogRepository.countBy({ action: 'ACCES_RESSOURCE_REFUSE', userId: ids.autre }),
      ).toBe(refus + 2);
      await ajouter(UUID_INCONNU, { titre: 'x', url: 'https://exemple.tn' }, tokens.admin).expect(
        404,
      );
      await api('patch', `/ressources/${UUID_INCONNU}`, tokens.formateur)
        .send({ titre: 'x' })
        .expect(404);
      await api('delete', '/ressources/pas-un-uuid', tokens.formateur).expect(400);
    });

    it('409 : formation archivée', async () => {
      await ajouter(mod.A, { titre: 'x', url: 'https://exemple.tn' }).expect(409);
    });

    it('409 : 50 ressources au plus par module', async () => {
      await dataSource.query(
        `INSERT INTO ressources_module (module_id, ordre, nature, titre, url, plateforme, ajoute_par)
         SELECT $1, n, 'LIEN', 'Lien ' || n, 'https://exemple.tn/' || n, 'WEB', $2
           FROM generate_series(1, 50) AS n`,
        [mod.P, ids.formateur],
      );
      avant += 50;
      const res = await ajouter(mod.P, { titre: 'x', url: 'https://exemple.tn' }).expect(409);
      expect(res.body.message).toBe(MESSAGE_TROP_DE_RESSOURCES);
    });
  });

  // ===================================================================
  //  Garanties en base
  // ===================================================================

  describe('Garanties en base', () => {
    const inserer = (valeurs: string): Promise<unknown> =>
      dataSource.query(
        `INSERT INTO ressources_module (module_id, ordre, nature, titre, url, plateforme, video_id, ajoute_par)
         VALUES ($1, 99, ${valeurs}, $2)`,
        [mod.M2, ids.formateur],
      );

    it('adresse http(s), identifiant vidéo au bon format, page web sans vidéo', async () => {
      await expect(inserer(`'LIEN', 'x', 'javascript:alert(1)', 'WEB', NULL`)).rejects.toThrow(
        /CHK_ressources_lien/,
      );
      await expect(
        inserer(`'LIEN', 'x', 'https://youtu.be/x', 'YOUTUBE', 'court'`),
      ).rejects.toThrow(/CHK_ressources_video/);
      await expect(
        inserer(`'LIEN', 'x', 'https://exemple.tn', 'WEB', 'dQw4w9WgXcQ'`),
      ).rejects.toThrow(/CHK_ressources_video/);
      await expect(inserer(`'FICHIER', 'x', 'https://exemple.tn', 'WEB', NULL`)).rejects.toThrow(
        /CHK_ressources_lien/,
      );
      await expect(inserer(`'LIEN', '  ', 'https://exemple.tn', 'WEB', NULL`)).rejects.toThrow(
        /CHK_ressources_titre/,
      );
    });
  });

  // ===================================================================
  //  Concurrence
  // ===================================================================

  describe('Concurrence (chevauchement forcé)', () => {
    it('deux ajouts simultanés dans le même module : deux rangs distincts, jamais de 500', async () => {
      // Le verrou de la ligne du module fait attendre les deux ajouts ; ils
      // passent ensuite l'un APRÈS l'autre (verrou du module dans le
      // service) et calculent chacun le rang suivant. Sans ce verrou, les deux
      // liraient le même maximum et le second buterait sur l'UNIQUE (500).
      const max = async (): Promise<number> =>
        (
          (await dataSource.query(
            'SELECT coalesce(max(ordre), 0)::int AS m FROM ressources_module WHERE module_id = $1',
            [mod.M2],
          )) as Array<{ m: number }>
        )[0].m;
      const avant = await max();
      const bloqueur = dataSource.createQueryRunner();
      await bloqueur.connect();
      await bloqueur.startTransaction();
      let statuts: number[];
      try {
        await bloqueur.query('SELECT id FROM modules WHERE id = $1 FOR UPDATE', [mod.M2]);
        const a = ajouter(mod.M2, { titre: 'A', url: 'https://exemple.tn/a' }).then((x) => x);
        const b = ajouter(mod.M2, { titre: 'B', url: 'https://exemple.tn/b' }).then((x) => x);
        await new Promise((r) => setTimeout(r, 1000));
        await bloqueur.commitTransaction();
        statuts = (await Promise.all([a, b])).map((x) => x.status);
      } finally {
        if (bloqueur.isTransactionActive) await bloqueur.rollbackTransaction();
        await bloqueur.release();
      }
      expect(statuts).toEqual([201, 201]);
      expect(await max()).toBe(avant + 2);
    }, 30_000);
  });
});
