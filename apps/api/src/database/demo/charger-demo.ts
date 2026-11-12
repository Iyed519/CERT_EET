import * as bcrypt from 'bcryptjs';
import { Queue } from 'bullmq';
import { DataSource, QueryRunner } from 'typeorm';
import { dataSourceOptions } from '../data-source';

/**
 * US-QUAL-01 — Jeu de démonstration, chargé par un script IDEMPOTENT.
 *
 * Usage (conteneur api en marche, migrations jouées) :
 *   npm run demo:charger
 *
 * Ce qui est créé (une seule fois ; relancer le script ne duplique rien et
 * remet seulement les mots de passe des comptes de démonstration) :
 *  - comptes de chaque rôle (mot de passe commun `Demo_Passe123!`), dont un
 *    apprenant protégé par MFA (secret TOTP fixe, documenté dans
 *    docs/GUIDE_DEMO.md) et un candidat au rôle de formateur ;
 *  - cinq formations dans plusieurs statuts (ouverte, fermée, archivée),
 *    modules, inscriptions (en cours, terminée, suspendue) ;
 *  - un QCM publié de cinq questions, passé POUR DE VRAI par les apprenants
 *    à travers l'api (tentatives notées par le serveur, réussites et échecs) ;
 *  - un atelier publié avec sa grille validée et deux livrables déposés par
 *    l'api (fichier PDF réel dans le stockage objet), à corriger en démo ;
 *  - des certificats générés par le worker (PDF réels, vérifiables) ;
 *  - des alertes de décrochage, une demande de rôle, une demande
 *    d'affectation et une proposition de formation en attente ;
 *  - un historique de connexions passées (journal d'audit) aux profils
 *    variés, pour que la prédiction du risque (IA) ait des signaux à lire.
 *
 * Seules les données SANS logique métier propre (comptes, formations,
 * contenu) sont écrites en SQL, dans une transaction ; tout ce qui a des
 * règles (passage de QCM, notation, dépôt de livrable, génération de
 * certificat) passe par l'api ou par sa file de travaux, comme en usage réel.
 */

const MOT_DE_PASSE = 'Demo_Passe123!';
/** Secret TOTP du compte MFA de démonstration (base32 ; valeur de démonstration). */
export const SECRET_MFA_DEMO = 'JBSWY3DPEHPK3PXP';
const API = (process.env.DEMO_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '');

type Role = 'ADMINISTRATEUR' | 'FORMATEUR' | 'APPRENANT';
interface Compte {
  cle: string;
  email: string;
  prenom: string;
  nom: string;
  role: Role;
  mfa?: boolean;
}

export const COMPTES: Compte[] = [
  { cle: 'admin', email: 'demo-admin@cert-eet.local', prenom: 'Amira', nom: 'Ben Salah', role: 'ADMINISTRATEUR' },
  { cle: 'formateur', email: 'demo-formateur@cert-eet.local', prenom: 'Karim', nom: 'Trabelsi', role: 'FORMATEUR' },
  { cle: 'formatrice', email: 'demo-formateur2@cert-eet.local', prenom: 'Leïla', nom: 'Haddad', role: 'FORMATEUR' },
  { cle: 'sana', email: 'demo-apprenant@cert-eet.local', prenom: 'Sana', nom: 'Gharbi', role: 'APPRENANT' },
  { cle: 'youssef', email: 'demo-apprenant2@cert-eet.local', prenom: 'Youssef', nom: 'Jlassi', role: 'APPRENANT' },
  { cle: 'mariem', email: 'demo-apprenant3@cert-eet.local', prenom: 'Mariem', nom: 'Ayari', role: 'APPRENANT' },
  { cle: 'ahmed', email: 'demo-apprenant4@cert-eet.local', prenom: 'Ahmed', nom: 'Mejri', role: 'APPRENANT' },
  { cle: 'candidat', email: 'demo-candidat@cert-eet.local', prenom: 'Nour', nom: 'Chebbi', role: 'APPRENANT' },
  { cle: 'securite', email: 'demo-securite@cert-eet.local', prenom: 'Yassine', nom: 'Mansouri', role: 'APPRENANT', mfa: true },
];

export const FORMATIONS = {
  web: 'Développement web full-stack (NestJS et Next.js)',
  devops: 'DevOps : Docker, CI/CD et Kubernetes',
  cyber: 'Cybersécurité opérationnelle (SOC)',
  bureautique: 'Bureautique avancée et Power BI',
  data: 'Data science avec Python',
};
const TITRE_QCM = 'QCM — Les bases de NestJS';
const TITRE_ATELIER = 'Atelier — API REST de réservation';

/** Cinq questions ; la première option est toujours la bonne (ordre mélangé à l'affichage). */
const QUESTIONS: Array<{ enonce: string; type: 'QCU' | 'VRAI_FAUX'; options: string[]; explication: string }> = [
  {
    enonce: 'Quel décorateur déclare un contrôleur NestJS ?',
    type: 'QCU',
    options: ['@Controller()', '@Injectable()', '@Module()', '@Entity()'],
    explication: '@Controller() associe une classe à un préfixe de routes.',
  },
  {
    enonce: 'Un service NestJS est injecté par le constructeur.',
    type: 'VRAI_FAUX',
    options: ['Vrai', 'Faux'],
    explication: 'L’injection de dépendances de Nest passe par le constructeur.',
  },
  {
    enonce: 'Quel élément valide automatiquement le corps d’une requête ?',
    type: 'QCU',
    options: ['ValidationPipe', 'Un intercepteur de journalisation', 'Un middleware CORS', 'Un garde de rôles'],
    explication: 'ValidationPipe applique les règles de class-validator des DTO.',
  },
  {
    enonce: 'Quel module relie NestJS à une base PostgreSQL dans ce projet ?',
    type: 'QCU',
    options: ['TypeOrmModule', 'HttpModule', 'ScheduleModule', 'CacheModule'],
    explication: 'TypeOrmModule.forRoot/forFeature donne accès aux dépôts.',
  },
  {
    enonce: 'Un garde (guard) s’exécute après le contrôleur.',
    type: 'VRAI_FAUX',
    options: ['Faux', 'Vrai'],
    explication: 'Les gardes décident AVANT le gestionnaire de route.',
  },
];

/** Plus petit PDF valide, déposé comme livrable (contrôle de contenu de l'api). */
const PDF_DEMO = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
);

const log = (m: string): void => console.log(`[démo] ${m}`);

async function un(qr: QueryRunner | DataSource, sql: string, p: unknown[] = []): Promise<string> {
  const lignes = (await qr.query(sql, p)) as Array<{ id: string }>;
  return lignes[0].id;
}

// ---------------------------------------------------------------------------
// 1. Comptes (créés ou remis à l'état de démonstration à chaque passage)
// ---------------------------------------------------------------------------
async function comptes(ds: DataSource): Promise<Record<string, string>> {
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const ids: Record<string, string> = {};
  for (const c of COMPTES) {
    ids[c.cle] = await un(
      ds,
      `INSERT INTO users (email, nom, prenom, mot_de_passe_hash, role, statut, profil_complet, mfa_active, mfa_secret)
       VALUES ($1, $2, $3, $4, $5, 'ACTIF', true, $6, $7)
       ON CONFLICT (email) DO UPDATE
         SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash, statut = 'ACTIF', role = EXCLUDED.role,
             profil_complet = true, nom = EXCLUDED.nom, prenom = EXCLUDED.prenom,
             mfa_active = EXCLUDED.mfa_active, mfa_secret = EXCLUDED.mfa_secret
       RETURNING id`,
      [c.email, c.nom, c.prenom, hash, c.role, Boolean(c.mfa), c.mfa ? SECRET_MFA_DEMO : null],
    );
  }
  log(`${COMPTES.length} comptes prêts (mot de passe : ${MOT_DE_PASSE}).`);
  return ids;
}

// ---------------------------------------------------------------------------
// 2. Structure (une seule fois, en une transaction)
// ---------------------------------------------------------------------------
async function structure(ds: DataSource, ids: Record<string, string>): Promise<void> {
  const [existe] = (await ds.query(`SELECT id FROM formations WHERE titre = $1`, [FORMATIONS.web])) as unknown[];
  if (existe) {
    log('Formations de démonstration déjà présentes : structure inchangée.');
    return;
  }
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const formation = (titre: string, statut: string, description: string, debut: number, fin: number, heures: number): Promise<string> =>
      un(
        qr,
        `INSERT INTO formations (titre, description, objectifs, statut, capacite_max, note_min_certification,
                                 duree_heures, date_debut, date_fin)
         VALUES ($1, $2, $3, $4, 25, 60, $5, current_date + $6::int, current_date + $7::int) RETURNING id`,
        [titre, description, 'Acquérir des compétences directement utilisables en entreprise.', statut, heures, debut, fin],
      );
    const f = {
      web: await formation(FORMATIONS.web, 'OUVERTE', 'Construire une application web complète : API NestJS, interface Next.js, PostgreSQL.', -30, 60, 40),
      devops: await formation(FORMATIONS.devops, 'FERMEE', 'Conteneuriser, automatiser les déploiements et exploiter un cluster.', -120, -20, 30),
      cyber: await formation(FORMATIONS.cyber, 'OUVERTE', 'Détecter, analyser et traiter les incidents de sécurité dans un SOC.', -10, 80, 35),
      bureautique: await formation(FORMATIONS.bureautique, 'ARCHIVEE', 'Excel avancé et tableaux de bord Power BI.', -300, -200, 20),
      data: await formation(FORMATIONS.data, 'OUVERTE', 'Préparer, analyser et modéliser des données avec pandas et scikit-learn.', 5, 90, 45),
    };
    const affecter = (formationId: string, formateur: string): Promise<unknown> =>
      qr.query(
        `INSERT INTO formation_formateurs (formation_id, formateur_id, affecte_par) VALUES ($1, $2, $3)`,
        [formationId, formateur, ids.admin],
      );
    await affecter(f.web, ids.formateur);
    await affecter(f.web, ids.formatrice);
    await affecter(f.devops, ids.formateur);
    await affecter(f.bureautique, ids.formateur);
    await affecter(f.cyber, ids.formatrice);
    await affecter(f.data, ids.formatrice);

    const module = (formationId: string, titre: string, ordre: number): Promise<string> =>
      un(qr, `INSERT INTO modules (formation_id, titre, ordre, description) VALUES ($1, $2, $3, $4) RETURNING id`, [
        formationId,
        titre,
        ordre,
        'Cours, démonstrations et exercices guidés.',
      ]);
    const m1 = await module(f.web, 'Module 1 — API REST avec NestJS', 1);
    const m2 = await module(f.web, 'Module 2 — Interfaces avec Next.js', 2);
    await module(f.devops, 'Module 1 — Docker et images', 1);
    await module(f.cyber, 'Module 1 — Fondamentaux du SOC', 1);
    await module(f.data, 'Module 1 — pandas', 1);

    const inscrire = (a: string, formationId: string, statut: string, joursAvant: number): Promise<unknown> =>
      qr.query(
        `INSERT INTO inscriptions (apprenant_id, formation_id, statut, date_inscription, taux_avancement)
         VALUES ($1, $2, $3, now() - make_interval(days => $4), $5)`,
        [a, formationId, statut, joursAvant, statut === 'TERMINEE' ? 100 : 40],
      );
    for (const a of ['sana', 'youssef', 'mariem', 'ahmed', 'securite']) await inscrire(ids[a], f.web, 'EN_COURS', 25);
    await inscrire(ids.sana, f.devops, 'TERMINEE', 110);
    await inscrire(ids.youssef, f.devops, 'TERMINEE', 110);
    await inscrire(ids.ahmed, f.devops, 'SUSPENDUE', 110);
    await inscrire(ids.mariem, f.bureautique, 'TERMINEE', 290);
    await inscrire(ids.sana, f.cyber, 'EN_COURS', 5);
    await qr.query(
      `UPDATE inscriptions SET motif_suspension = 'Absences répétées non justifiées.', date_suspension = now() - interval '30 days',
              suspendue_par = $1 WHERE apprenant_id = $2 AND formation_id = $3`,
      [ids.admin, ids.ahmed, f.devops],
    );
    // Ahmed n'est plus venu depuis longtemps (alerte d'inactivité).
    await qr.query(`UPDATE users SET derniere_connexion = now() - interval '21 days' WHERE id = $1`, [ids.ahmed]);

    // QCM publié (cinq questions), ouvert depuis hier pour trente jours.
    const qcm = await un(qr, `INSERT INTO qcm (module_id, titre, description, statut) VALUES ($1, $2, $3, 'PUBLIE') RETURNING id`, [
      m1,
      TITRE_QCM,
      'Vérifiez vos acquis sur les notions de base du module 1.',
    ]);
    for (const [i, q] of QUESTIONS.entries()) {
      const question = await un(
        qr,
        `INSERT INTO questions (enonce, type, ponderation, explication) VALUES ($1, $2, 1, $3) RETURNING id`,
        [q.enonce, q.type, q.explication],
      );
      for (const [j, texte] of q.options.entries()) {
        await qr.query(`INSERT INTO options (question_id, texte, est_correcte, ordre) VALUES ($1, $2, $3, $4)`, [
          question,
          texte,
          j === 0,
          j + 1,
        ]);
      }
      await qr.query(`INSERT INTO qcm_questions (qcm_id, question_id, ordre) VALUES ($1, $2, $3)`, [qcm, question, i + 1]);
    }
    await qr.query(
      `INSERT INTO config_anti_fraude (qcm_id, randomiser_questions, randomiser_options, duree_max_minutes,
         date_ouverture, date_fermeture, nb_tentatives_max, delai_entre_tentatives, affichage_resultats,
         score_min_validation, ponderation_formation)
       VALUES ($1, true, true, 20, now() - interval '1 day', now() + interval '30 days', 3, 0, 'IMMEDIAT', 60, 40)`,
      [qcm],
    );

    // Atelier publié, grille validée (quatre niveaux par critère).
    const atelier = await un(
      qr,
      `INSERT INTO ateliers (module_id, formateur_id, titre, enonce, competences_visees, date_limite, types_livrables,
                             taille_max_mo, nb_max_fichiers, statut)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days', '{pdf}', 10, 1, 'PUBLIE') RETURNING id`,
      [
        m2,
        ids.formateur,
        TITRE_ATELIER,
        'Concevez une API REST de réservation de salles (ressources, créneaux, conflits) et documentez-la en PDF.',
        'Conception d’API, validation des données, documentation.',
      ],
    );
    const grille = await un(qr, `INSERT INTO grilles (atelier_id, formateur_id, validee) VALUES ($1, $2, true) RETURNING id`, [
      atelier,
      ids.formateur,
    ]);
    for (const [ordre, intitule] of [
      [1, 'Conception de l’API'],
      [2, 'Qualité de la documentation'],
    ] as Array<[number, string]>) {
      const critere = await un(
        qr,
        `INSERT INTO criteres (grille_id, ordre, intitule, ponderation, description) VALUES ($1, $2, $3, 50, $4) RETURNING id`,
        [grille, ordre, intitule, 'Évalué sur le livrable PDF.'],
      );
      for (const [n, libelle, min, max] of [
        [1, 'Insuffisant', 0, 40],
        [2, 'Acceptable', 40, 60],
        [3, 'Bon', 60, 80],
        [4, 'Excellent', 80, 100],
      ] as Array<[number, string, number, number]>) {
        await qr.query(
          `INSERT INTO niveaux_performance (critere_id, ordre, libelle, points_min_pct, points_max_pct) VALUES ($1, $2, $3, $4, $5)`,
          [critere, n, libelle, min, max],
        );
      }
    }

    // Alertes de décrochage ouvertes.
    const alerte = (a: string, critere: string, suggestion: string): Promise<unknown> =>
      qr.query(
        `INSERT INTO alertes_decrochage (formation_id, apprenant_id, critere, statut, donnees, suggestion)
         VALUES ($1, $2, $3, 'OUVERTE', '{}'::jsonb, $4)`,
        [f.web, a, critere, suggestion],
      );
    await alerte(ids.ahmed, 'INACTIVITE', 'Aucune connexion depuis plus de 7 jours : prendre contact.');
    await alerte(ids.mariem, 'ECHECS_QCM', 'Échecs répétés au QCM : proposer une séance de rattrapage.');

    // Demandes en attente : rôle, affectation, proposition.
    await qr.query(`INSERT INTO demandes_role (user_id, role_demande, justification) VALUES ($1, 'FORMATEUR', $2)`, [
      ids.candidat,
      'Ingénieure DevOps depuis cinq ans, je souhaite animer le module Kubernetes.',
    ]);
    await qr.query(`INSERT INTO demandes_affectation (formation_id, formateur_id, motif) VALUES ($1, $2, $3)`, [
      f.devops,
      ids.formatrice,
      'J’anime des ateliers Docker en entreprise ; je peux prendre la prochaine session.',
    ]);
    await qr.query(
      `INSERT INTO propositions_formation (formateur_id, titre, description, objectifs, duree_heures, capacite_max, public_vise, motif)
       VALUES ($1, 'Kubernetes en production', 'Déployer et exploiter des applications sur Kubernetes.',
               'Helm, observabilité, sécurité des clusters.', 35, 18, 'Développeurs et administrateurs système.',
               'Les entreprises partenaires migrent vers Kubernetes cette année.')`,
      [ids.formatrice],
    );
    await qr.commitTransaction();
    log('Formations, modules, inscriptions, QCM, atelier, alertes et demandes créés.');
  } catch (erreur) {
    await qr.rollbackTransaction();
    throw erreur;
  } finally {
    await qr.release();
  }
}

// ---------------------------------------------------------------------------
// 3. Parcours réels par l'api (QCM, livrables)
// ---------------------------------------------------------------------------
async function connexion(email: string): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MOT_DE_PASSE }),
  });
  if (!r.ok) throw new Error(`Connexion ${email} impossible (${r.status}) : l'api est-elle démarrée ?`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function appel(jeton: string, chemin: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${jeton}`, ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${chemin} -> ${r.status} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}

/** Passe le QCM : `bonnes` premières questions justes, les autres fausses. */
async function passerQcm(ds: DataSource, email: string, qcmId: string, bonnes: number): Promise<void> {
  const jeton = await connexion(email);
  const tentative = (await appel(jeton, `/qcm/${qcmId}/tentatives`, { method: 'POST', body: '{}' })) as { id: string };
  const correctes = (await ds.query(
    `SELECT qq.ordre, o.question_id, o.id, o.est_correcte FROM qcm_questions qq JOIN options o ON o.question_id = qq.question_id
      WHERE qq.qcm_id = $1 ORDER BY qq.ordre, o.ordre`,
    [qcmId],
  )) as Array<{ ordre: number; question_id: string; id: string; est_correcte: boolean }>;
  const parQuestion = new Map<string, { ordre: number; bonne: string; mauvaise: string }>();
  for (const o of correctes) {
    const q = parQuestion.get(o.question_id) ?? { ordre: o.ordre, bonne: '', mauvaise: '' };
    if (o.est_correcte) q.bonne = o.id;
    else if (!q.mauvaise) q.mauvaise = o.id;
    parQuestion.set(o.question_id, q);
  }
  for (const [questionId, q] of parQuestion) {
    await appel(jeton, `/tentatives/${tentative.id}/reponses/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ optionIds: [q.ordre <= bonnes ? q.bonne : q.mauvaise] }),
    });
  }
  await appel(jeton, `/tentatives/${tentative.id}/soumettre`, { method: 'POST', body: '{}' });
}

async function parcours(ds: DataSource, ids: Record<string, string>): Promise<void> {
  const [qcm] = (await ds.query(`SELECT id FROM qcm WHERE titre = $1`, [TITRE_QCM])) as Array<{ id: string }>;
  const [{ n }] = (await ds.query(`SELECT count(*)::int AS n FROM tentatives_qcm WHERE qcm_id = $1`, [qcm.id])) as Array<{
    n: number;
  }>;
  if (n === 0) {
    await passerQcm(ds, 'demo-apprenant@cert-eet.local', qcm.id, 5); // 100 : réussi
    await passerQcm(ds, 'demo-apprenant2@cert-eet.local', qcm.id, 2); // 40 : échoué
    await passerQcm(ds, 'demo-apprenant2@cert-eet.local', qcm.id, 4); // 80 : réussi
    await passerQcm(ds, 'demo-apprenant3@cert-eet.local', qcm.id, 1); // 20 : échoué
    log('QCM passé par trois apprenants (4 tentatives notées par le serveur).');
  } else {
    log('Tentatives de QCM déjà présentes.');
  }
  const [atelier] = (await ds.query(`SELECT id FROM ateliers WHERE titre = $1`, [TITRE_ATELIER])) as Array<{ id: string }>;
  for (const email of ['demo-apprenant@cert-eet.local', 'demo-apprenant2@cert-eet.local']) {
    const [deja] = (await ds.query(
      `SELECT 1 FROM livrables l JOIN users u ON u.id = l.apprenant_id WHERE l.atelier_id = $1 AND u.email = $2`,
      [atelier.id, email],
    )) as unknown[];
    if (deja) continue;
    const jeton = await connexion(email);
    const formulaire = new FormData();
    formulaire.append('fichiers', new Blob([PDF_DEMO], { type: 'application/pdf' }), 'api-reservation.pdf');
    formulaire.append('commentaire', 'Conception de l’API et documentation des routes.');
    await appel(jeton, `/ateliers/${atelier.id}/livrable`, { method: 'POST', body: formulaire });
    log(`Livrable déposé pour ${email}.`);
  }
  void ids;
}

// ---------------------------------------------------------------------------
// 4. Certificats (générés par le worker de l'api : PDF réels)
// ---------------------------------------------------------------------------
async function certificats(ds: DataSource, ids: Record<string, string>): Promise<void> {
  const viser = [
    [ids.sana, FORMATIONS.devops, 92, 'Très bien'],
    [ids.youssef, FORMATIONS.devops, 74, 'Bien'],
    [ids.mariem, FORMATIONS.bureautique, 66, 'Assez bien'],
  ] as Array<[string, string, number, string]>;
  for (const [apprenant, titre, score, mention] of viser) {
    await ds.query(
      `INSERT INTO certificats (apprenant_id, formation_id, statut, score_final, mention, organisme_emetteur, date_emission)
       SELECT $1, f.id, 'EN_ATTENTE_GENERATION', $3, $4, 'ESPRIT Entreprise', now()
         FROM formations f
        WHERE f.titre = $2
          AND NOT EXISTS (SELECT 1 FROM certificats c WHERE c.apprenant_id = $1 AND c.formation_id = f.id)`,
      [apprenant, titre, score, mention],
    );
  }
  const enAttente = (await ds.query(
    `SELECT c.id FROM certificats c WHERE c.statut = 'EN_ATTENTE_GENERATION' AND c.apprenant_id = ANY($1)`,
    [[ids.sana, ids.youssef, ids.mariem]],
  )) as Array<{ id: string }>;
  if (enAttente.length === 0) {
    log('Certificats déjà générés.');
    return;
  }
  const file = new Queue('certificats', {
    connection: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) },
  });
  for (const c of enAttente) {
    await file.add(
      'generer-certificat',
      { certificatId: c.id },
      { jobId: `${c.id}-demo`, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 },
    );
  }
  await file.close();
  // Le worker de l'api les génère en quelques secondes.
  for (let i = 0; i < 30; i++) {
    const [{ n }] = (await ds.query(
      `SELECT count(*)::int AS n FROM certificats WHERE id = ANY($1) AND statut = 'ACTIF'`,
      [enAttente.map((c) => c.id)],
    )) as Array<{ n: number }>;
    if (n === enAttente.length) {
      log(`${n} certificat(s) générés (PDF dans le stockage objet).`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log('Certificats en file : le worker de l’api les générera (vérifier CERTIFICATS_WORKER=on).');
}

// ---------------------------------------------------------------------------
// 5. Historique de connexions (IA — prédiction du risque)
// ---------------------------------------------------------------------------
/**
 * Le modèle ne lit que ce qui précède le jour du calcul : les connexions du
 * jour (celles du script) ne comptent pas. J'ajoute donc des connexions
 * passées (jours avant aujourd'hui), aux profils variés : Sana régulière,
 * Yassine hebdomadaire, Youssef qui décroche depuis deux semaines, Mariem
 * presque absente ; Ahmed, sans aucune connexion, reste le cas le plus
 * risqué. Une seule fois (marqueur dans les détails).
 */
const HISTORIQUE: Record<string, number[]> = {
  sana: [24, 23, 21, 20, 18, 17, 15, 14, 12, 11, 9, 8, 7, 5, 4, 3, 2, 1],
  securite: [22, 15, 9, 8, 2],
  youssef: [24, 22, 21, 19, 17, 16, 15],
  mariem: [24, 23, 19],
};

async function historiqueActivite(ds: DataSource, ids: Record<string, string>): Promise<void> {
  const [deja] = (await ds.query(
    `SELECT 1 FROM audit_logs WHERE action = 'LOGIN' AND details_avant_apres->>'demo' = 'historique' LIMIT 1`,
  )) as unknown[];
  if (deja) {
    log('Historique de connexions déjà présent.');
    return;
  }
  let n = 0;
  for (const [cle, jours] of Object.entries(HISTORIQUE)) {
    for (const j of jours) {
      await ds.query(
        `INSERT INTO audit_logs (user_id, action, cible, resultat, details_avant_apres, horodatage)
         VALUES ($1::uuid, 'LOGIN', $1::text, 'Succès', '{"demo":"historique"}'::jsonb,
                 now() - make_interval(days => $2) - interval '2 hours')`,
        [ids[cle], j],
      );
      n += 1;
    }
  }
  log(`${n} connexions passées ajoutées (prédiction du risque).`);
}

async function charger(): Promise<void> {
  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();
  try {
    const ids = await comptes(ds);
    await structure(ds, ids);
    await parcours(ds, ids);
    await certificats(ds, ids);
    await historiqueActivite(ds, ids);
    log('Jeu de démonstration prêt. Guide : docs/GUIDE_DEMO.md');
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  charger().catch((erreur: unknown) => {
    console.error('[démo] Échec :', erreur instanceof Error ? erreur.message : erreur);
    process.exit(1);
  });
}
