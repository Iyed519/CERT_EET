import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import * as cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { User } from '../src/database/entities/user.entity';
import { Role } from '../src/database/enums/role.enum';
import { StatutCompte } from '../src/database/enums/statut-compte.enum';
import { MailService } from '../src/mail/mail.service';

/**
 * E2E-FORM08 — US-FORM-08 : un formateur propose une nouvelle formation.
 *
 * Vérifie : accès par rôle, validations (mêmes règles que la création
 * administrateur + motif), limite de 5 propositions ouvertes (et concurrence
 * forcée sur cette limite), acceptation (formation BROUILLON créée, proposant
 * affecté, hors catalogue, publiable), demande de modifications puis
 * resoumission (version + 1), refus avec motif, décisions concurrentes, emails,
 * audit et compteur du tableau de bord.
 */
describe('E2E-FORM08 — Propositions de formation (US-FORM-08)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let mail: jest.SpyInstance;

  const MARQUEUR = 'E2E-FORM08';
  const MOT_DE_PASSE = 'Form08Passe123';
  const EMAIL = {
    admin: 'e2e-form08-admin@cert-eet.local',
    f1: 'e2e-form08-f1@cert-eet.local',
    f2: 'e2e-form08-f2@cert-eet.local',
    a: 'e2e-form08-a@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const sql = async <T = Record<string, unknown>>(texte: string, params: unknown[] = []): Promise<T[]> =>
    (await dataSource.query(texte, params)) as T[];
  const http = (): request.SuperTest<request.Test> =>
    request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  const corps = (titre: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    titre: `${MARQUEUR} ${titre}`,
    description: 'Une formation pratique et certifiante.',
    objectifs: 'Déployer, superviser, sécuriser.',
    dureeHeures: 35,
    capaciteMax: 20,
    publicVise: 'Développeurs et administrateurs système.',
    motif: 'Forte demande des entreprises partenaires cette année.',
    ...extra,
  });
  const proposer = (c: Record<string, unknown>, token = tokens.f1): request.Test =>
    http().post('/api/formateur/propositions-formation').set('Authorization', `Bearer ${token}`).send(c);
  const decider = (id: string, action: string, body: Record<string, unknown> = {}, token = tokens.admin): request.Test =>
    http().patch(`/api/admin/propositions-formation/${id}/${action}`).set('Authorization', `Bearer ${token}`).send(body);
  const modifier = (id: string, c: Record<string, unknown>, token = tokens.f1): request.Test =>
    http().put(`/api/formateur/propositions-formation/${id}`).set('Authorization', `Bearer ${token}`).send(c);
  const audits = async (action: string, cible: string): Promise<Array<Record<string, unknown>>> =>
    sql(`SELECT user_id, details_avant_apres AS details FROM audit_logs WHERE action = $1 AND cible = $2`, [action, cible]);

  const nettoyer = async (): Promise<void> => {
    const uids = (
      await userRepository.find({ where: { email: In(ALL_EMAILS) }, select: { id: true } })
    ).map((u) => u.id);
    const formations = (
      await sql<{ id: string }>(`SELECT id FROM formations WHERE titre LIKE $1`, [`${MARQUEUR}%`])
    ).map((f) => f.id);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query("SET LOCAL app.audit_maintenance = 'on'");
      await qr.query(`DELETE FROM audit_logs WHERE user_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM propositions_formation WHERE formateur_id = ANY($1)`, [uids]);
      await qr.query(`DELETE FROM formation_formateurs WHERE formation_id = ANY($1)`, [formations]);
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
    mail = jest.spyOn(moduleRef.get(MailService), 'sendDecisionPropositionEmail').mockResolvedValue();
    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 4);
    const roles: Record<string, Role> = { admin: Role.ADMINISTRATEUR, f1: Role.FORMATEUR, f2: Role.FORMATEUR, a: Role.APPRENANT };
    for (const [cle, email] of Object.entries(EMAIL)) {
      const u = await userRepository.save(
        userRepository.create({ email, role: roles[cle], motDePasseHash, statut: StatutCompte.ACTIF, prenom: cle, nom: 'Form08' }),
      );
      ids[cle] = u.id;
      tokens[cle] = (await http().post('/api/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200)).body.accessToken as string;
    }
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  beforeEach(() => mail.mockClear());

  it('accès : 401 ; apprenant et administrateur ne proposent pas ; formateur ne décide pas', async () => {
    await http().post('/api/formateur/propositions-formation').send(corps('X')).expect(401);
    await proposer(corps('X'), tokens.a).expect(403);
    await proposer(corps('X'), tokens.admin).expect(403);
    await http().get('/api/admin/propositions-formation').set('Authorization', `Bearer ${tokens.f1}`).expect(403);
  });

  it('validations : mêmes règles que la création administrateur, motif 10–1000, champ inconnu refusé', async () => {
    await proposer(corps('X', { titre: '   ' })).expect(400);
    await proposer(corps('X', { titre: 'x'.repeat(256) })).expect(400);
    await proposer(corps('X', { capaciteMax: 0 })).expect(400);
    await proposer(corps('X', { capaciteMax: undefined })).expect(400);
    await proposer(corps('X', { dureeHeures: 10001 })).expect(400);
    await proposer(corps('X', { dureeHeures: 2.5 })).expect(400);
    await proposer(corps('X', { description: 'd'.repeat(5001) })).expect(400);
    await proposer(corps('X', { publicVise: 'p'.repeat(1001) })).expect(400);
    await proposer(corps('X', { motif: 'trop court' .slice(0, 9) })).expect(400);
    await proposer(corps('X', { motif: 'm'.repeat(1001) })).expect(400);
    await proposer(corps('X', { statut: 'ACCEPTEE' })).expect(400);
    expect(await sql(`SELECT 1 FROM propositions_formation WHERE formateur_id = $1`, [ids.f1])).toHaveLength(0);
  });

  it('création : EN_ATTENTE, version 1, champs nettoyés, audit ; visible dans « mes propositions » seulement', async () => {
    const res = await proposer(corps('Kubernetes', { titre: `  ${MARQUEUR} Kubernetes  `, description: '  ' })).expect(201);
    expect(res.body).toMatchObject({ titre: `${MARQUEUR} Kubernetes`, description: null, statut: 'EN_ATTENTE', version: 1, formationId: null });
    ids.p1 = res.body.id;
    const mes = await http().get('/api/formateur/propositions-formation').set('Authorization', `Bearer ${tokens.f1}`).expect(200);
    expect(mes.body.map((p: { id: string }) => p.id)).toEqual([ids.p1]);
    expect((await http().get('/api/formateur/propositions-formation').set('Authorization', `Bearer ${tokens.f2}`).expect(200)).body).toEqual([]);
    expect(await audits('PROPOSITION_FORMATION_CREEE', ids.p1)).toHaveLength(1);
  });

  it('demande de modifications : commentaire obligatoire, A_MODIFIER, email ; puis le formateur modifie et resoumet (version 2)', async () => {
    await decider(ids.p1, 'demander-modifications', {}).expect(400);
    await decider(ids.p1, 'demander-modifications', { commentaire: 'court' }).expect(400);
    const res = await decider(ids.p1, 'demander-modifications', { commentaire: 'Précisez les prérequis et la durée.' }).expect(200);
    expect(res.body).toMatchObject({ statut: 'A_MODIFIER', commentaireAdmin: 'Précisez les prérequis et la durée.', traitePar: ids.admin });
    expect(mail).toHaveBeenCalledWith(EMAIL.f1, expect.objectContaining({ decision: 'A_MODIFIER', commentaire: 'Précisez les prérequis et la durée.' }));
    await decider(ids.p1, 'accepter').expect(409); // attend le formateur
    await modifier(ids.p1, corps('Kubernetes'), tokens.f2).expect(404);
    const resoumise = await modifier(ids.p1, corps('Kubernetes en production', { dureeHeures: 42 })).expect(200);
    expect(resoumise.body).toMatchObject({ statut: 'EN_ATTENTE', version: 2, dureeHeures: 42, titre: `${MARQUEUR} Kubernetes en production` });
    expect(await audits('PROPOSITION_FORMATION_A_MODIFIER', ids.p1)).toHaveLength(1);
    expect(await audits('PROPOSITION_FORMATION_RESOUMISE', ids.p1)).toHaveLength(1);
  });

  it('acceptation : formation BROUILLON créée avec le proposant affecté, hors catalogue, publiable ; email, audit', async () => {
    const res = await decider(ids.p1, 'accepter').expect(200);
    expect(res.body.statut).toBe('ACCEPTEE');
    const formationId = res.body.formationId as string;
    const [f] = await sql<Record<string, unknown>>(`SELECT * FROM formations WHERE id = $1`, [formationId]);
    expect(f).toMatchObject({
      titre: `${MARQUEUR} Kubernetes en production`,
      statut: 'BROUILLON',
      duree_heures: 42,
      capacite_max: 20,
      description: 'Une formation pratique et certifiante.\n\nPublic visé : Développeurs et administrateurs système.',
    });
    const [aff] = await sql<{ formateur_id: string; affecte_par: string }>(`SELECT formateur_id, affecte_par FROM formation_formateurs WHERE formation_id = $1`, [formationId]);
    expect(aff).toEqual({ formateur_id: ids.f1, affecte_par: ids.admin });
    expect(mail).toHaveBeenCalledWith(EMAIL.f1, expect.objectContaining({ decision: 'ACCEPTEE', formationId }));
    expect((await audits('PROPOSITION_FORMATION_ACCEPTEE', ids.p1))[0].details).toMatchObject({ formationId, notificationEnvoyee: true });
    // Hors catalogue et sans inscription possible.
    const catalogue = await http().get('/api/formations?limit=100').set('Authorization', `Bearer ${tokens.a}`).expect(200);
    expect(catalogue.body.items.map((x: { id: string }) => x.id)).not.toContain(formationId);
    await http().post(`/api/formations/${formationId}/inscriptions`).set('Authorization', `Bearer ${tokens.a}`).expect((r) => expect([400, 404, 409]).toContain(r.status));
    // Dans « mes formations » du proposant ; l'administrateur la publie.
    const miennes = await http().get('/api/formateur/formations').set('Authorization', `Bearer ${tokens.f1}`).expect(200);
    expect(miennes.body.map((x: { id: string }) => x.id)).toContain(formationId);
    const impact = await http().get(`/api/admin/formations/${formationId}/cycle`).set('Authorization', `Bearer ${tokens.admin}`);
    expect(impact.status).toBe(200);
    expect(impact.body.transitionsPossibles).toEqual(['OUVERTE']);
    const pub = await http().post(`/api/admin/formations/${formationId}/statut`).set('Authorization', `Bearer ${tokens.admin}`).send({ statut: 'OUVERTE' });
    expect(pub.status).toBe(200);
    expect(await sql(`SELECT 1 FROM audit_logs WHERE action = 'FORMATION_PUBLIEE' AND cible = $1`, [formationId])).toHaveLength(1);
    // Décision finale : plus modifiable ni décidable.
    await modifier(ids.p1, corps('Encore')).expect(409);
    await decider(ids.p1, 'refuser', { commentaire: 'Trop tard pour refuser.' }).expect(409);
  });

  it('refus : motif obligatoire, REFUSEE, email, aucune formation créée', async () => {
    const { body } = await proposer(corps('Refusée'), tokens.f2).expect(201);
    await decider(body.id, 'refuser', { commentaire: 'non' }).expect(400);
    const res = await decider(body.id, 'refuser', { commentaire: 'Hors du périmètre de l’offre 2027.' }).expect(200);
    expect(res.body).toMatchObject({ statut: 'REFUSEE', commentaireAdmin: 'Hors du périmètre de l’offre 2027.', formationId: null });
    expect(mail).toHaveBeenCalledWith(EMAIL.f2, expect.objectContaining({ decision: 'REFUSEE' }));
    expect(await sql(`SELECT 1 FROM formations WHERE titre = $1`, [`${MARQUEUR} Refusée`])).toHaveLength(0);
    await modifier(body.id, corps('Refusée'), tokens.f2).expect(409);
  });

  it('limite : 5 propositions ouvertes au plus (en attente ou à modifier) ; une décision libère une place', async () => {
    const creees: string[] = [];
    for (let i = 0; i < 5; i++) creees.push((await proposer(corps(`Lot ${i}`), tokens.f2).expect(201)).body.id);
    await decider(creees[0], 'demander-modifications', { commentaire: 'Ajoutez un module d’introduction.' }).expect(200);
    await proposer(corps('Sixième'), tokens.f2).expect(409);
    await decider(creees[1], 'refuser', { commentaire: 'Doublon avec une formation existante.' }).expect(200);
    await proposer(corps('Sixième'), tokens.f2).expect(201);
    await proposer(corps('Septième'), tokens.f2).expect(409);
  });

  it('concurrence forcée : 8 propositions simultanées avec 2 places -> exactement 2 créées', async () => {
    await sql(`UPDATE propositions_formation SET statut = 'REFUSEE', commentaire_admin = 'Nettoyage de test.' WHERE formateur_id = $1 AND statut IN ('EN_ATTENTE', 'A_MODIFIER')`, [ids.f2]);
    for (let i = 0; i < 3; i++) await proposer(corps(`Base ${i}`), tokens.f2).expect(201);
    const reponses = await Promise.all(Array.from({ length: 8 }, (_, i) => proposer(corps(`Course ${i}`), tokens.f2)));
    expect(reponses.filter((r) => r.status === 201)).toHaveLength(2);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(6);
    const [{ n }] = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM propositions_formation WHERE formateur_id = $1 AND statut IN ('EN_ATTENTE', 'A_MODIFIER')`, [ids.f2]);
    expect(n).toBe(5);
  });

  it('concurrence forcée : accepter ×3, refuser et demander des modifications en même temps -> une seule issue, au plus une formation', async () => {
    const { body } = await proposer(corps('Décision concurrente')).expect(201);
    const reponses = await Promise.all([
      decider(body.id, 'accepter'),
      decider(body.id, 'refuser', { commentaire: 'Refus concurrent de test.' }),
      decider(body.id, 'accepter'),
      decider(body.id, 'demander-modifications', { commentaire: 'Modification concurrente.' }),
      decider(body.id, 'accepter'),
    ]);
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(4);
    const formations = await sql(`SELECT 1 FROM formations WHERE titre = $1`, [`${MARQUEUR} Décision concurrente`]);
    const [{ statut }] = await sql<{ statut: string }>(`SELECT statut FROM propositions_formation WHERE id = $1`, [body.id]);
    expect(formations).toHaveLength(statut === 'ACCEPTEE' ? 1 : 0);
  });

  it('liste administrateur : filtre ; formateur désactivé -> acceptation refusée ; compteur du tableau de bord', async () => {
    const enAttente = await http().get('/api/admin/propositions-formation?statut=EN_ATTENTE&limit=100').set('Authorization', `Bearer ${tokens.admin}`).expect(200);
    expect(enAttente.body.items.every((p: { statut: string }) => p.statut === 'EN_ATTENTE')).toBe(true);
    await http().get('/api/admin/propositions-formation?statut=AUTRE').set('Authorization', `Bearer ${tokens.admin}`).expect(400);
    const avant = (await http().get('/api/admin/tableau-de-bord').set('Authorization', `Bearer ${tokens.admin}`).expect(200)).body;
    const { body } = await proposer(corps('Compteur')).expect(201);
    const apres = (await http().get('/api/admin/tableau-de-bord').set('Authorization', `Bearer ${tokens.admin}`).expect(200)).body;
    expect(apres.demandesEnAttente.propositions).toBe(avant.demandesEnAttente.propositions + 1);
    await sql(`UPDATE users SET statut = 'DESACTIVE' WHERE id = $1`, [ids.f1]);
    try {
      await decider(body.id, 'accepter').expect(409);
    } finally {
      await sql(`UPDATE users SET statut = 'ACTIF' WHERE id = $1`, [ids.f1]);
    }
  });
});
