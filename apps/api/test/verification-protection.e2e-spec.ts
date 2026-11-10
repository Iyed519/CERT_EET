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
import { purgerCertificats } from './outils/nettoyage-certificats';

/**
 * Tests d'intégration US-CERT-05 — Protection et minimisation de la page
 * publique de vérification (DS-05, NF sécurité), sur l'application réelle :
 * vrais PostgreSQL, Redis (compteurs) et S3.
 *
 * L'application de test fait confiance au proxy local (comme la production
 * derrière nginx) : chaque test présente sa propre IP de visiteur dans
 * X-Forwarded-For (plages de documentation 203.0.113.0/24, 198.51.100.0/24).
 * Limite abaissée à 5 requêtes par minute (VERIFICATION_LIMITE_PAR_MINUTE).
 *
 * Couvre :
 *  - limitation de débit par IP, commune aux deux routes publiques : la 6e
 *    requête -> 429, message français, Retry-After ; un seul audit
 *    VERIFICATION_LIMITE_ATTEINTE par fenêtre ; une autre IP n'est pas gênée ;
 *  - l'IP tracée est celle du visiteur (X-Forwarded-For), pas celle du proxy ;
 *  - en-têtes : jamais d'indexation ni de cache, aucun référent ;
 *  - minimisation : la réponse ne porte QUE les champs prévus ;
 *  - réponses uniformes : inconnu, mal formé, pas encore émis -> même 404.
 *
 * Nettoyage rejouable (avant ET après) : compteurs Redis des IP de test,
 * certificats (objets S3, lignes, audit), formations, audit, utilisateurs.
 */
describe('Protection de la vérification publique (e2e) — US-CERT-05', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let userRepository: Repository<User>;
  let auditLogRepository: Repository<AuditLog>;
  let dataSource: DataSource;
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT ?? 6379),
  });

  // Marqueur qui n'est le préfixe d'aucun autre et dont aucun n'est le préfixe.
  const MARQUEUR = 'E2E-PROTECT';
  const EMAIL = 'e2e-protect-a@cert-eet.local';
  const IP = {
    limite: '203.0.113.10',
    autre: '203.0.113.11',
    entetes: '198.51.100.20',
    uniforme: '198.51.100.21',
  };
  const INCONNU = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
  let certificatId: string;
  let enAttenteId: string;
  let apprenantId: string;

  const depuis = (ip: string, chemin: string): request.Test =>
    request(app.getHttpServer()).get(`/api/verification${chemin}`).set('X-Forwarded-For', ip);

  const viderCompteurs = async (): Promise<void> => {
    await redis.del(...Object.values(IP).map((ip) => `limite:verification:${ip}`));
  };

  const purgeAudit = async (): Promise<void> => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query('DELETE FROM audit_logs WHERE adresse_ip = ANY($1)', [Object.values(IP)]);
      await qr.commitTransaction();
    } catch (erreur) {
      await qr.rollbackTransaction();
      throw erreur;
    } finally {
      await qr.release();
    }
  };

  const nettoyer = async (): Promise<void> => {
    await viderCompteurs();
    await purgerCertificats(dataSource, MARQUEUR);
    await dataSource.getRepository(Formation).delete({ titre: Like(`${MARQUEUR}%`) });
    await purgeAudit();
    await userRepository.delete({ email: In([EMAIL]) });
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

  beforeAll(async () => {
    process.env.VERIFICATION_LIMITE_PAR_MINUTE = '5';
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Comme main.ts derrière nginx : le proxy local est de confiance.
    app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
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
    apprenantId = (
      await userRepository.save(
        userRepository.create({
          email: EMAIL,
          role: Role.APPRENANT,
          motDePasseHash: await bcrypt.hash('MotDePasseTest123!', 12),
          statut: StatutCompte.ACTIF,
          prenom: 'Inès',
          nom: 'Gharbi',
        }),
      )
    ).id;
    const repo = dataSource.getRepository(Formation);
    const formationId = (
      await repo.save(
        repo.create({
          titre: `${MARQUEUR} Back-end`,
          statut: StatutFormation.OUVERTE,
          capaciteMax: 20,
          noteMinCertification: 60,
        }),
      )
    ).id;
    certificatId = (
      await moduleRef.get(CertificatsService).demanderEmission(apprenantId, formationId, 74)
    ).certificatId;
    await attendreActif(certificatId);
    // Un certificat pas encore émis (comme après un échec définitif).
    const seconde = await repo.save(
      repo.create({
        titre: `${MARQUEUR} DevOps`,
        statut: StatutFormation.OUVERTE,
        capaciteMax: 20,
        noteMinCertification: 60,
      }),
    );
    const [ligne] = (await dataSource.query(
      `INSERT INTO certificats (apprenant_id, formation_id, score_final, mention, organisme_emetteur,
         date_emission, nb_tentatives, derniere_erreur)
       VALUES ($1, $2, 70, 'Bien', 'ESPRIT Entreprise', now(), 3, 'panne') RETURNING id`,
      [apprenantId, seconde.id],
    )) as Array<{ id: string }>;
    enAttenteId = ligne.id;
    await viderCompteurs();
  }, 90_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env.VERIFICATION_LIMITE_PAR_MINUTE;
    await nettoyer();
    expect(await userRepository.countBy({ email: EMAIL })).toBe(0);
    await app.close();
    redis.disconnect();
  });

  it('minimisation : uniquement les champs prévus ; IP du visiteur tracée', async () => {
    const res = await depuis(IP.entetes, `/${certificatId}`).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'certificatId',
        'dateEmission',
        'dateExpiration',
        'dateRevocation',
        'empreinteSha256',
        'formation',
        'integrite',
        'mention',
        'organismeEmetteur',
        'scoreFinal',
        'titulaire',
        'verdict',
      ].sort(),
    );
    expect(res.body.titulaire).toBe('Inès Gharbi');
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${EMAIL}|${apprenantId}`));
    const [trace] = await auditLogRepository.find({
      where: { action: 'CERTIFICAT_VERIFIE', cible: certificatId },
      order: { horodatage: 'DESC' },
      take: 1,
    });
    expect(trace.adresseIp).toBe(IP.entetes);
  });

  it('en-têtes : ni indexation, ni cache, ni référent (verdict et PDF)', async () => {
    for (const chemin of [`/${certificatId}`, `/${certificatId}/pdf`]) {
      const res = await depuis(IP.entetes, chemin).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    }
  });

  it('réponses uniformes : inconnu, mal formé, pas encore émis -> même 404', async () => {
    const reponses = [
      await depuis(IP.uniforme, `/${INCONNU}`).expect(404),
      await depuis(IP.uniforme, '/pas-un-uuid').expect(404),
      await depuis(IP.uniforme, `/${enAttenteId}`).expect(404),
    ];
    for (const r of reponses) expect(r.body).toEqual(reponses[0].body);
  });

  it('6e requête de la minute -> 429, Retry-After, un seul audit ; une autre IP passe', async () => {
    // Cinq requêtes autorisées, routes mêlées (le compteur est commun).
    await depuis(IP.limite, `/${certificatId}`).expect(200);
    await depuis(IP.limite, `/${INCONNU}`).expect(404);
    await depuis(IP.limite, `/${certificatId}/pdf`).expect(200);
    await depuis(IP.limite, `/${certificatId}`).expect(200);
    await depuis(IP.limite, '/pas-un-uuid').expect(404);

    const refus = await depuis(IP.limite, `/${certificatId}`).expect(429);
    expect(refus.body.message).toBe(
      'Trop de vérifications depuis votre connexion : réessayez dans une minute.',
    );
    const attente = Number(refus.headers['retry-after']);
    expect(attente).toBeGreaterThanOrEqual(1);
    expect(attente).toBeLessThanOrEqual(60);
    await depuis(IP.limite, `/${certificatId}/pdf`).expect(429);
    await depuis(IP.limite, `/${INCONNU}`).expect(429);

    const traces = await auditLogRepository.find({
      where: { action: 'VERIFICATION_LIMITE_ATTEINTE', adresseIp: IP.limite },
    });
    expect(traces).toHaveLength(1);
    expect(traces[0].userId).toBeNull();

    await depuis(IP.autre, `/${certificatId}`).expect(200);
  });
});
