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
 * E2E-FORM07 — US-FORM-07 : un formateur demande à enseigner une formation
 * existante ; l'administrateur accepte (affectation créée dans la même
 * transaction) ou refuse avec motif ; le formateur annule.
 *
 * Vérifie : accès par rôle, validations (motif, formation archivée, déjà
 * affecté, déjà en attente), formateur qui enseigne déjà d'autres formations,
 * listes et filtres, annulation (la sienne seulement), acceptation et refus
 * (emails, audit), décisions sur une demande traitée, concurrence forcée
 * (création ×6, décisions croisées ×6), compteur du tableau de bord.
 */
describe('E2E-FORM07 — Demandes d’affectation (US-FORM-07)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let mail: jest.SpyInstance;

  const MARQUEUR = 'E2E-FORM07';
  const MOT_DE_PASSE = 'Form07Passe123';
  const MOTIF = 'J’enseigne ce sujet depuis trois ans en entreprise.';
  const EMAIL = {
    admin: 'e2e-form07-admin@cert-eet.local',
    f1: 'e2e-form07-f1@cert-eet.local',
    f2: 'e2e-form07-f2@cert-eet.local',
    a: 'e2e-form07-a@cert-eet.local',
  };
  const ALL_EMAILS = Object.values(EMAIL);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const sql = async <T = Record<string, unknown>>(texte: string, params: unknown[] = []): Promise<T[]> =>
    (await dataSource.query(texte, params)) as T[];
  const http = (): request.SuperTest<request.Test> =>
    request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  const demander = (formationId: string, token = tokens.f1, motif = MOTIF): request.Test =>
    http().post('/api/formateur/demandes-affectation').set('Authorization', `Bearer ${token}`).send({ formationId, motif });
  const decider = (id: string, action: 'accepter' | 'refuser', corps: Record<string, unknown> = {}, token = tokens.admin): request.Test =>
    http().patch(`/api/admin/demandes-affectation/${id}/${action}`).set('Authorization', `Bearer ${token}`).send(corps);
  const annuler = (id: string, token = tokens.f1): request.Test =>
    http().patch(`/api/formateur/demandes-affectation/${id}/annuler`).set('Authorization', `Bearer ${token}`);
  const audits = async (action: string): Promise<Array<{ user_id: string; cible: string; details: Record<string, unknown> }>> =>
    sql(
      `SELECT user_id, cible, details_avant_apres AS details FROM audit_logs
        WHERE action = $1 AND user_id = ANY($2) ORDER BY horodatage`,
      [action, Object.values(ids)],
    );

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
      await qr.query(`DELETE FROM demandes_affectation WHERE formation_id = ANY($1) OR formateur_id = ANY($2)`, [formations, uids]);
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

  const formation = async (titre: string, statut = 'OUVERTE'): Promise<string> =>
    (
      await sql<{ id: string }>(
        `INSERT INTO formations (titre, statut, capacite_max, note_min_certification)
         VALUES ($1, $2, 20, 60) RETURNING id`,
        [`${MARQUEUR} ${titre}`, statut],
      )
    )[0].id;

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
    mail = jest.spyOn(moduleRef.get(MailService), 'sendDecisionDemandeAffectationEmail').mockResolvedValue();
    await nettoyer();
    const motDePasseHash = await bcrypt.hash(MOT_DE_PASSE, 4);
    const roles: Record<string, Role> = { admin: Role.ADMINISTRATEUR, f1: Role.FORMATEUR, f2: Role.FORMATEUR, a: Role.APPRENANT };
    for (const [cle, email] of Object.entries(EMAIL)) {
      const u = await userRepository.save(
        userRepository.create({ email, role: roles[cle], motDePasseHash, statut: StatutCompte.ACTIF, prenom: cle, nom: 'Form07' }),
      );
      ids[cle] = u.id;
      tokens[cle] = (await http().post('/api/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200)).body.accessToken as string;
    }
    ids.enseignee = await formation('Déjà enseignée');
    ids.ouverte = await formation('Ouverte');
    ids.fermee = await formation('Fermée', 'FERMEE');
    ids.archivee = await formation('Archivée', 'ARCHIVEE');
    // f1 enseigne déjà une formation : il peut quand même en demander d'autres.
    await sql(`INSERT INTO formation_formateurs (formation_id, formateur_id) VALUES ($1, $2)`, [ids.enseignee, ids.f1]);
  }, 60_000);

  afterAll(async () => {
    await nettoyer();
    await app.close();
  });

  beforeEach(() => mail.mockClear());

  it('accès : 401 sans jeton ; apprenant et administrateur refusés côté formateur ; formateur refusé côté administrateur', async () => {
    await http().get('/api/formateur/demandes-affectation').expect(401);
    await demander(ids.ouverte, tokens.a).expect(403);
    await demander(ids.ouverte, tokens.admin).expect(403);
    await http().get('/api/admin/demandes-affectation').set('Authorization', `Bearer ${tokens.f1}`).expect(403);
  });

  it('formations disponibles : non archivées, sans celles qu’il enseigne', async () => {
    const res = await http()
      .get('/api/formateur/demandes-affectation/formations-disponibles')
      .set('Authorization', `Bearer ${tokens.f1}`)
      .expect(200);
    const miennes = (res.body as Array<{ id: string }>).map((f) => f.id);
    expect(miennes).toEqual(expect.arrayContaining([ids.ouverte, ids.fermee]));
    expect(miennes).not.toContain(ids.archivee);
    expect(miennes).not.toContain(ids.enseignee);
  });

  it('validations : motif trop court ou trop long, formation inconnue, archivée, déjà enseignée, champ inconnu', async () => {
    await demander(ids.ouverte, tokens.f1, 'court').expect(400);
    await demander(ids.ouverte, tokens.f1, '          neuf     ').expect(400);
    await demander(ids.ouverte, tokens.f1, 'x'.repeat(1001)).expect(400);
    await demander('00000000-0000-4000-8000-000000000000').expect(404);
    await demander('pas-un-uuid').expect(400);
    await demander(ids.archivee).expect(400);
    await demander(ids.enseignee).expect(409);
    await http()
      .post('/api/formateur/demandes-affectation')
      .set('Authorization', `Bearer ${tokens.f1}`)
      .send({ formationId: ids.ouverte, motif: MOTIF, statut: 'ACCEPTEE' })
      .expect(400);
    expect(await sql(`SELECT 1 FROM demandes_affectation WHERE formateur_id = $1`, [ids.f1])).toHaveLength(0);
  });

  it('création : EN_ATTENTE, motif nettoyé, audit ; une seule en attente par formation ; visible dans « mes demandes »', async () => {
    const res = await demander(ids.ouverte, tokens.f1, `  ${MOTIF}  `).expect(201);
    expect(res.body).toMatchObject({ statut: 'EN_ATTENTE', motif: MOTIF, motifRefus: null, traiteLe: null, formation: { id: ids.ouverte, statut: 'OUVERTE' } });
    await demander(ids.ouverte).expect(409);
    const mes = await http().get('/api/formateur/demandes-affectation').set('Authorization', `Bearer ${tokens.f1}`).expect(200);
    expect(mes.body.map((d: { id: string }) => d.id)).toEqual([res.body.id]);
    const autre = await http().get('/api/formateur/demandes-affectation').set('Authorization', `Bearer ${tokens.f2}`).expect(200);
    expect(autre.body).toEqual([]);
    const dispo = await http().get('/api/formateur/demandes-affectation/formations-disponibles').set('Authorization', `Bearer ${tokens.f1}`).expect(200);
    expect(dispo.body.find((f: { id: string }) => f.id === ids.ouverte).demandeEnAttente).toBe(true);
    const [a] = await audits('DEMANDE_AFFECTATION_CREEE');
    expect(a).toMatchObject({ user_id: ids.f1, cible: ids.ouverte, details: { demandeId: res.body.id } });
  });

  it('annulation : la sienne seulement (404 pour un autre), puis 409 ; une nouvelle demande redevient possible', async () => {
    const [{ id }] = await sql<{ id: string }>(`SELECT id FROM demandes_affectation WHERE formateur_id = $1 AND statut = 'EN_ATTENTE'`, [ids.f1]);
    await annuler(id, tokens.f2).expect(404);
    const res = await annuler(id).expect(200);
    expect(res.body.statut).toBe('ANNULEE');
    expect(res.body.traiteLe).not.toBeNull();
    await annuler(id).expect(409);
    await decider(id, 'accepter').expect(409);
    expect((await audits('DEMANDE_AFFECTATION_ANNULEE')).map((x) => x.details.demandeId)).toEqual([id]);
    await demander(ids.ouverte).expect(201);
  });

  it('acceptation : affectation créée, statut ACCEPTEE, email, audit ; la formation apparaît dans « mes formations »', async () => {
    const [{ id }] = await sql<{ id: string }>(`SELECT id FROM demandes_affectation WHERE formateur_id = $1 AND statut = 'EN_ATTENTE'`, [ids.f1]);
    const res = await decider(id, 'accepter').expect(200);
    expect(res.body).toMatchObject({ statut: 'ACCEPTEE', traitePar: ids.admin, formateur: { id: ids.f1, email: EMAIL.f1 } });
    expect(await sql(`SELECT 1 FROM formation_formateurs WHERE formation_id = $1 AND formateur_id = $2`, [ids.ouverte, ids.f1])).toHaveLength(1);
    expect(mail).toHaveBeenCalledWith(EMAIL.f1, expect.objectContaining({ acceptee: true, formationId: ids.ouverte, titreFormation: `${MARQUEUR} Ouverte` }));
    const [a] = await audits('DEMANDE_AFFECTATION_ACCEPTEE');
    expect(a).toMatchObject({ user_id: ids.admin, cible: ids.ouverte, details: { demandeId: id, affectationCreee: true, notificationEnvoyee: true } });
    const formations = await http().get('/api/formateur/formations').set('Authorization', `Bearer ${tokens.f1}`).expect(200);
    expect(formations.body.map((f: { id: string }) => f.id)).toContain(ids.ouverte);
    await decider(id, 'accepter').expect(409);
    await decider(id, 'refuser', { motif: 'Trop tard pour refuser.' }).expect(409);
    await demander(ids.ouverte).expect(409); // désormais affecté
  });

  it('refus : motif obligatoire (10–1000), statut REFUSEE, email avec motif, audit, aucune affectation', async () => {
    const { body } = await demander(ids.fermee, tokens.f2).expect(201);
    await decider(body.id, 'refuser', {}).expect(400);
    await decider(body.id, 'refuser', { motif: 'non' }).expect(400);
    const res = await decider(body.id, 'refuser', { motif: '  Équipe déjà complète pour cette session.  ' }).expect(200);
    expect(res.body).toMatchObject({ statut: 'REFUSEE', motifRefus: 'Équipe déjà complète pour cette session.' });
    expect(mail).toHaveBeenCalledWith(EMAIL.f2, expect.objectContaining({ acceptee: false, motifRefus: 'Équipe déjà complète pour cette session.' }));
    expect(await sql(`SELECT 1 FROM formation_formateurs WHERE formation_id = $1 AND formateur_id = $2`, [ids.fermee, ids.f2])).toHaveLength(0);
    expect((await audits('DEMANDE_AFFECTATION_REFUSEE')).map((x) => x.details.demandeId)).toEqual([body.id]);
    await decider('00000000-0000-4000-8000-000000000000', 'refuser', { motif: 'Motif suffisamment long.' }).expect(404);
  });

  it('email en échec : la décision reste enregistrée (notificationEnvoyee = false)', async () => {
    const { body } = await demander(ids.fermee, tokens.f2).expect(201);
    mail.mockRejectedValueOnce(new Error('SMTP indisponible'));
    await decider(body.id, 'accepter').expect(200);
    const derniere = (await audits('DEMANDE_AFFECTATION_ACCEPTEE')).pop();
    expect(derniere?.details).toMatchObject({ demandeId: body.id, notificationEnvoyee: false });
  });

  it('acceptation refusée si la formation a été archivée ou si le demandeur n’est plus formateur actif', async () => {
    const f = await formation('Bientôt archivée');
    const { body } = await demander(f).expect(201);
    await sql(`UPDATE formations SET statut = 'ARCHIVEE' WHERE id = $1`, [f]);
    await decider(body.id, 'accepter').expect(409);
    await sql(`UPDATE formations SET statut = 'OUVERTE' WHERE id = $1`, [f]);
    await sql(`UPDATE users SET statut = 'DESACTIVE' WHERE id = $1`, [ids.f1]);
    try {
      await decider(body.id, 'accepter').expect(409);
    } finally {
      await sql(`UPDATE users SET statut = 'ACTIF' WHERE id = $1`, [ids.f1]);
    }
    expect((await sql<{ statut: string }>(`SELECT statut FROM demandes_affectation WHERE id = $1`, [body.id]))[0].statut).toBe('EN_ATTENTE');
    expect(await sql(`SELECT 1 FROM formation_formateurs WHERE formation_id = $1`, [f])).toHaveLength(0);
  });

  it('liste administrateur : filtre par statut, pagination, identité du demandeur ; statut inconnu -> 400', async () => {
    const tout = await http().get('/api/admin/demandes-affectation?limit=100').set('Authorization', `Bearer ${tokens.admin}`).expect(200);
    const miennes = tout.body.items.filter((d: { formation: { titre: string } }) => d.formation.titre.startsWith(MARQUEUR));
    expect(miennes.length).toBeGreaterThanOrEqual(5);
    const refusees = await http().get('/api/admin/demandes-affectation?statut=REFUSEE&limit=100').set('Authorization', `Bearer ${tokens.admin}`).expect(200);
    expect(refusees.body.items.every((d: { statut: string }) => d.statut === 'REFUSEE')).toBe(true);
    const page = await http().get('/api/admin/demandes-affectation?limit=1&page=2').set('Authorization', `Bearer ${tokens.admin}`).expect(200);
    expect(page.body).toMatchObject({ page: 2, limit: 1 });
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBeGreaterThanOrEqual(5);
    await http().get('/api/admin/demandes-affectation?statut=PERDUE').set('Authorization', `Bearer ${tokens.admin}`).expect(400);
  });

  it('concurrence forcée : 6 créations simultanées -> une seule demande, les autres 409', async () => {
    const f = await formation('Course création');
    const reponses = await Promise.all(Array.from({ length: 6 }, () => demander(f, tokens.f2)));
    expect(reponses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await sql(`SELECT 1 FROM demandes_affectation WHERE formation_id = $1`, [f])).toHaveLength(1);
  });

  it('concurrence forcée : accepter ×3, refuser ×2 et annuler en même temps -> une seule décision, une seule affectation', async () => {
    const f = await formation('Course décision');
    const { body } = await demander(f, tokens.f2).expect(201);
    const reponses = await Promise.all([
      decider(body.id, 'accepter'),
      decider(body.id, 'refuser', { motif: 'Refus concurrent de test.' }),
      decider(body.id, 'accepter'),
      annuler(body.id, tokens.f2),
      decider(body.id, 'refuser', { motif: 'Refus concurrent de test.' }),
      decider(body.id, 'accepter'),
    ]);
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(reponses.filter((r) => r.status === 409)).toHaveLength(5);
    const [{ statut }] = await sql<{ statut: string }>(`SELECT statut FROM demandes_affectation WHERE id = $1`, [body.id]);
    const affectations = await sql(`SELECT 1 FROM formation_formateurs WHERE formation_id = $1`, [f]);
    expect(affectations).toHaveLength(statut === 'ACCEPTEE' ? 1 : 0);
  });

  it('tableau de bord administrateur : compteur des demandes d’affectation en attente', async () => {
    const avant = (await http().get('/api/admin/tableau-de-bord').set('Authorization', `Bearer ${tokens.admin}`).expect(200)).body;
    const f = await formation('Compteur');
    await demander(f, tokens.f2).expect(201);
    const apres = (await http().get('/api/admin/tableau-de-bord').set('Authorization', `Bearer ${tokens.admin}`).expect(200)).body;
    expect(apres.demandesEnAttente.affectation).toBe(avant.demandesEnAttente.affectation + 1);
  });
});
