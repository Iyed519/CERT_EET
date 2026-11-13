import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { FormatRapport, StatutRapport, TypeRapport } from '../../database/enums/rapport.enum';
import { MailService } from '../../mail/mail.service';
import { StockageService } from '../../stockage/stockage.service';
import { AuditService } from '../audit/audit.service';
import { SuiviFormationService } from '../pilotage/suivi-formation.service';
import { TableauDeBordService } from '../pilotage/tableau-de-bord.service';
import { FileRapportsService } from './file-rapports.service';
import {
  BilanFormation,
  CertificatRegistre,
  ContenuInstitutionnel,
  LIBELLES_MODELE,
  ModeleInstitutionnel,
  csvInstitutionnel,
  libellePeriode,
  nomFichierInstitutionnel,
  pdfInstitutionnel,
} from './rapport-institutionnel';
import {
  ContenuSession,
  DonneesModule,
  EvaluationModule,
  PorteeRapport,
  csvSession,
  nomFichier,
  pdfSession,
} from './rapport-session';
import {
  InscritModule,
  NoteEvaluation,
  assemblerModule,
  cleStockageRapport,
  limiteAtteinte,
  typeMime,
} from './rapports.regles';
import { QuestionTiree } from '../../database/entities/tentative-qcm.entity';
import { AnalysePointsFaiblesService } from '../assistance-ia/analyse-points-faibles/analyse-points-faibles.service';
import {
  AtelierAnalyse,
  QuestionAnalysee,
  ResultatAnalyse,
  verdictDe,
} from '../assistance-ia/analyse-points-faibles/analyse-points-faibles.regles';
import { construireLignesRapport } from '../tentatives/rapport/rapport-tentative.regles';
import { nombre } from './rapport-format';
import { TentativeCorrectionService } from '../tentatives/tentative-correction.service';

export const MESSAGE_RAPPORT_INTROUVABLE = 'Rapport introuvable.';
export const MESSAGE_RAPPORT_NON_PRET =
  'Ce rapport n’est pas encore prêt (ou sa génération a échoué).';
export const MESSAGE_LIMITE_RAPPORTS =
  'Trop de demandes de rapports : au plus 5 par minute. Réessayez dans un instant.';
export const MESSAGE_STOCKAGE_INDISPONIBLE =
  'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.';

/** Paramètres d'un rapport de session, conservés en `jsonb`. */
export interface ParametresSession {
  portee: PorteeRapport;
  apprenantId?: string;
  moduleId?: string;
}

/** US-RPT-02 — Paramètres d'un rapport institutionnel (période résolue). */
export interface ParametresInstitutionnel {
  modele: ModeleInstitutionnel;
  du: string;
  au: string;
}

/** Un rapport tel que le voit son demandeur. */
export interface RapportVue {
  id: string;
  type: TypeRapport;
  format: FormatRapport;
  statut: StatutRapport;
  parametres: Record<string, unknown>;
  formation: { id: string; titre: string } | null;
  /**
   * US-RPT-03 — Sur qui porte le rapport : nom de l'apprenant (portée
   * INDIVIDUEL) ou titre du module (portée MODULE) ; null sinon.
   */
  cible: string | null;
  nomFichier: string | null;
  tailleOctets: number | null;
  empreinteSha256: string | null;
  derniereErreur: string | null;
  dateDemande: Date;
  dateFin: Date | null;
}

interface LigneRapport {
  id: string;
  cible: string | null;
  type: TypeRapport;
  format: FormatRapport;
  statut: StatutRapport;
  parametres: Record<string, unknown>;
  formation_id: string | null;
  titre: string | null;
  nom_fichier: string | null;
  taille_octets: number | null;
  empreinte_sha256: string | null;
  derniere_erreur: string | null;
  date_demande: Date;
  date_fin: Date | null;
  demandeur_id: string;
  cle_stockage: string | null;
}

const SELECT_RAPPORT = `
  SELECT r.id, r.type::text AS type, r.format::text AS format, r.statut::text AS statut,
         r.parametres, r.formation_id, f.titre, r.nom_fichier, r.taille_octets,
         r.empreinte_sha256, r.derniere_erreur, r.date_demande, r.date_fin,
         r.demandeur_id, r.cle_stockage,
         CASE r.parametres->>'portee'
           WHEN 'INDIVIDUEL' THEN COALESCE(NULLIF(trim(concat_ws(' ', ua.prenom, ua.nom)), ''), ua.email)
           WHEN 'MODULE' THEN mo.titre
         END AS cible
    FROM rapports r LEFT JOIN formations f ON f.id = r.formation_id
    LEFT JOIN users ua
      ON r.parametres->>'portee' = 'INDIVIDUEL' AND ua.id::text = r.parametres->>'apprenantId'
    LEFT JOIN modules mo
      ON r.parametres->>'portee' = 'MODULE' AND mo.id::text = r.parametres->>'moduleId'`;

/**
 * US-RPT-01 — Rapports de session exportés (DS-14 P3).
 *
 * - Demande : contrôle des paramètres (apprenant inscrit, module de la
 *   formation), limite de 5 demandes par minute et par demandeur (verrou
 *   consultatif : des demandes simultanées ne la dépassent pas), insertion
 *   EN_ATTENTE, travail ajouté à la file, audit RAPPORT_DEMANDE -> 202.
 * - Génération (worker) : prise EN_ATTENTE -> EN_COURS par un UPDATE
 *   conditionnel (un seul worker par rapport), contenu PUR (CSV / PDF),
 *   dépôt dans le stockage, PRET + empreinte, audit RAPPORT_GENERE, email.
 * - Téléchargement : demandeur SEUL (un autre reçoit 404, comme pour un
 *   rapport inconnu), rapport PRET (409 sinon), audit RAPPORT_TELECHARGE.
 */
@Injectable()
export class RapportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RapportsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly file: FileRapportsService,
    private readonly stockageService: StockageService,
    private readonly suiviService: SuiviFormationService,
    private readonly tableauDeBord: TableauDeBordService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly correctionService: TentativeCorrectionService,
    private readonly analyseService: AnalysePointsFaiblesService,
  ) {}

  onApplicationBootstrap(): void {
    this.file.demarrerWorker({
      generer: (id) => this.generer(id),
      echecDefinitif: (id, erreur) => this.echecDefinitif(id, erreur),
    });
  }

  /** Demande d'un rapport de session (formateur affecté ou administrateur). */
  async demanderSession(
    demandeurId: string,
    formationId: string,
    demande: { format: FormatRapport } & ParametresSession,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<RapportVue> {
    const parametres = await this.verifierParametres(formationId, demande);
    const id = await this.inserer(
      demandeurId,
      TypeRapport.SESSION,
      demande.format,
      formationId,
      parametres,
    );
    await this.file.ajouter(id);
    await this.auditService.record({
      action: 'RAPPORT_DEMANDE',
      acteur: demandeurId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        type: TypeRapport.SESSION,
        format: demande.format,
        formationId,
        ...parametres,
      },
    });
    return this.monRapport(demandeurId, id);
  }

  /**
   * US-RPT-02 — Demande d'un rapport institutionnel (administrateur) : la
   * période est résolue et validée ici (400 si invalide), puis conservée
   * telle quelle dans les paramètres (rapport reproductible).
   */
  async demanderInstitutionnel(
    demandeurId: string,
    demande: { format: FormatRapport; modele: ModeleInstitutionnel; du?: string; au?: string },
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<RapportVue> {
    const periode = this.tableauDeBord.periode(demande.du, demande.au);
    const parametres: ParametresInstitutionnel = {
      modele: demande.modele,
      du: periode.du,
      au: periode.au,
    };
    const id = await this.inserer(
      demandeurId,
      TypeRapport.INSTITUTIONNEL,
      demande.format,
      null,
      parametres,
    );
    await this.file.ajouter(id);
    await this.auditService.record({
      action: 'RAPPORT_DEMANDE',
      acteur: demandeurId,
      cible: id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        type: TypeRapport.INSTITUTIONNEL,
        format: demande.format,
        ...parametres,
      },
    });
    return this.monRapport(demandeurId, id);
  }

  /**
   * Insertion EN_ATTENTE sous verrou consultatif du demandeur : au plus
   * 5 demandes par minute, même simultanées (429 au-delà).
   */
  private async inserer(
    demandeurId: string,
    type: TypeRapport,
    format: FormatRapport,
    formationId: string | null,
    parametres: object,
  ): Promise<string> {
    return this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext('rapports:' || $1))`, [demandeurId]);
      const [{ n }] = (await m.query(
        `SELECT count(*)::int AS n FROM rapports
          WHERE demandeur_id = $1 AND date_demande > now() - interval '1 minute'`,
        [demandeurId],
      )) as Array<{ n: number }>;
      if (limiteAtteinte(n)) {
        throw new HttpException(MESSAGE_LIMITE_RAPPORTS, HttpStatus.TOO_MANY_REQUESTS);
      }
      const [ligne] = (await m.query(
        `INSERT INTO rapports (type, format, demandeur_id, formation_id, parametres)
         VALUES ($1::rapports_type_enum, $2::rapports_format_enum, $3, $4, $5::jsonb)
         RETURNING id`,
        [type, format, demandeurId, formationId, JSON.stringify(parametres)],
      )) as Array<{ id: string }>;
      return ligne.id;
    });
  }

  /** « Mes rapports » : les 50 plus récents du demandeur. */
  async mesRapports(demandeurId: string, formationId?: string): Promise<RapportVue[]> {
    const lignes = (await this.dataSource.query(
      `${SELECT_RAPPORT}
        WHERE r.demandeur_id = $1 AND ($2::uuid IS NULL OR r.formation_id = $2)
        ORDER BY r.date_demande DESC, r.id
        LIMIT 50`,
      [demandeurId, formationId ?? null],
    )) as LigneRapport[];
    return lignes.map(vue);
  }

  /** Un rapport du demandeur ; 404 s'il est inconnu ou d'un autre. */
  async monRapport(demandeurId: string, rapportId: string): Promise<RapportVue> {
    return vue(await this.ligneDuDemandeur(demandeurId, rapportId));
  }

  /** Le fichier d'un rapport PRET, en flux, pour son seul demandeur. */
  async fichier(
    demandeurId: string,
    rapportId: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<{ flux: Readable; taille: number | null; nomFichier: string; type: string }> {
    const l = await this.ligneDuDemandeur(demandeurId, rapportId);
    if (l.statut !== StatutRapport.PRET || !l.cle_stockage || !l.nom_fichier) {
      throw new ConflictException(MESSAGE_RAPPORT_NON_PRET);
    }
    let objet;
    try {
      objet = await this.stockageService.lire(l.cle_stockage);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Lecture du rapport ${rapportId} impossible : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_INDISPONIBLE);
    }
    await this.auditService.record({
      action: 'RAPPORT_TELECHARGE',
      acteur: demandeurId,
      cible: rapportId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: null,
    });
    return {
      flux: objet.flux,
      taille: objet.taille,
      nomFichier: l.nom_fichier,
      type: typeMime(l.format),
    };
  }

  /**
   * Worker : produit le fichier d'un rapport. Prise EN_ATTENTE -> EN_COURS
   * par un UPDATE conditionnel : deux exécutions simultanées -> une seule
   * produit le fichier. Une erreur remet le rapport EN_ATTENTE (reprise par
   * BullMQ) puis est relancée.
   */
  async generer(rapportId: string, maintenant: Date = new Date()): Promise<void> {
    const [prises] = (await this.dataSource.query(
      `UPDATE rapports SET statut = 'EN_COURS', nb_tentatives = nb_tentatives + 1
        WHERE id = $1 AND statut = 'EN_ATTENTE'
      RETURNING type::text AS type, format::text AS format, demandeur_id, formation_id,
                parametres`,
      [rapportId],
    )) as [
      Array<{
        type: TypeRapport;
        format: FormatRapport;
        demandeur_id: string;
        formation_id: string | null;
        parametres: ParametresSession | ParametresInstitutionnel;
      }>,
      number,
    ];
    const ligne = prises[0];
    if (!ligne) return;

    let produit: { titre: string; nom: string; taille: number; empreinte: string };
    try {
      produit = await this.produire(rapportId, ligne, maintenant);
    } catch (erreur) {
      const detail = (erreur instanceof Error ? erreur.message : String(erreur)).slice(0, 1000);
      await this.dataSource.query(
        `UPDATE rapports SET statut = 'EN_ATTENTE', derniere_erreur = $2
          WHERE id = $1 AND statut = 'EN_COURS'`,
        [rapportId, detail],
      );
      throw erreur;
    }
    await this.auditService.record({
      action: 'RAPPORT_GENERE',
      acteur: null,
      cible: rapportId,
      adresseIp: null,
      resultat: 'Succès',
      detailsAvantApres: { tailleOctets: produit.taille, empreinteSha256: produit.empreinte },
    });
    await this.notifier(ligne.demandeur_id, produit.titre, produit.nom, true);
  }

  /** Contenu, fichier, dépôt, puis PRET (dans cet ordre). */
  private async produire(
    rapportId: string,
    ligne: {
      type: TypeRapport;
      format: FormatRapport;
      formation_id: string | null;
      parametres: ParametresSession | ParametresInstitutionnel;
    },
    maintenant: Date,
  ): Promise<{ titre: string; nom: string; taille: number; empreinte: string }> {
    let titre: string;
    let nom: string;
    let tampon: Buffer;
    if (ligne.type === TypeRapport.INSTITUTIONNEL) {
      const p = ligne.parametres as ParametresInstitutionnel;
      const contenu = await this.contenuInstitutionnel(p);
      titre = `${LIBELLES_MODELE[p.modele]} (${libellePeriode(p)})`;
      nom = nomFichierInstitutionnel(p.modele, p, ligne.format);
      tampon =
        ligne.format === FormatRapport.PDF
          ? await pdfInstitutionnel(contenu, maintenant)
          : Buffer.from(csvInstitutionnel(contenu), 'utf8');
    } else {
      const p = ligne.parametres as ParametresSession;
      const contenu = await this.contenu(ligne.formation_id as string, p);
      // US-IA-10 : PDF individuel -> analyse des points faibles par l'IA (un échec
      // de l'IA ne fait pas échouer le rapport : la section en donne la cause).
      if (contenu.portee === 'INDIVIDUEL' && ligne.format === FormatRapport.PDF) {
        contenu.analyseIa = await this.analyseApprenant(
          ligne.formation_id as string,
          p.apprenantId as string,
          contenu.formation.titre,
        );
      }
      titre = contenu.portee === 'GLOBAL' ? contenu.suivi.formation.titre : contenu.formation.titre;
      nom = nomFichier(titre, p.portee, ligne.format, maintenant);
      tampon =
        ligne.format === FormatRapport.PDF
          ? await pdfSession(contenu, maintenant)
          : Buffer.from(csvSession(contenu), 'utf8');
    }
    const empreinte = createHash('sha256').update(tampon).digest('hex');
    const cle = cleStockageRapport(rapportId, nom);
    await this.stockageService.deposerTampon(cle, tampon, typeMime(ligne.format), empreinte);
    await this.dataSource.query(
      `UPDATE rapports
          SET statut = 'PRET', nom_fichier = $2, cle_stockage = $3, taille_octets = $4,
              empreinte_sha256 = $5, date_fin = now(), derniere_erreur = NULL
        WHERE id = $1 AND statut = 'EN_COURS'`,
      [rapportId, nom, cle, tampon.length, empreinte],
    );
    return { titre, nom, taille: tampon.length, empreinte };
  }

  /** Après le dernier essai : ECHEC, erreur conservée, audit, email. */
  async echecDefinitif(rapportId: string, erreur: unknown): Promise<void> {
    const detail = (erreur instanceof Error ? erreur.message : String(erreur)).slice(0, 1000);
    const [lignes] = (await this.dataSource.query(
      `UPDATE rapports SET statut = 'ECHEC', derniere_erreur = $2, date_fin = now()
        WHERE id = $1 AND statut IN ('EN_ATTENTE', 'EN_COURS')
      RETURNING demandeur_id, formation_id`,
      [rapportId, detail],
    )) as [Array<{ demandeur_id: string; formation_id: string | null }>, number];
    const l = lignes[0];
    if (!l) return;
    await this.auditService.record({
      action: 'RAPPORT_ECHEC',
      acteur: null,
      cible: rapportId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { erreur: detail },
    });
    const [f] = (await this.dataSource.query(`SELECT titre FROM formations WHERE id = $1`, [
      l.formation_id,
    ])) as Array<{ titre: string }>;
    await this.notifier(l.demandeur_id, f?.titre ?? 'formation', null, false);
  }

  /** US-RPT-02 — Données agrégées sur la période (jours inclus, Tunis). */
  private async contenuInstitutionnel(p: ParametresInstitutionnel): Promise<ContenuInstitutionnel> {
    const periode = { du: p.du, au: p.au };
    if (p.modele === 'SYNTHESE') {
      return { modele: 'SYNTHESE', periode, tdb: await this.tableauDeBord.global(p.du, p.au) };
    }
    const debut = `(($1::date)::timestamp AT TIME ZONE 'Africa/Tunis')`;
    const fin = `((($2::date) + 1)::timestamp AT TIME ZONE 'Africa/Tunis')`;
    const dans = (c: string): string => `${c} >= ${debut} AND ${c} < ${fin}`;
    if (p.modele === 'FORMATIONS') {
      const lignes = (await this.dataSource.query(
        `SELECT f.titre, f.statut::text AS statut,
                (SELECT count(*)::int FROM inscriptions i WHERE i.formation_id = f.id) AS inscrits,
                (SELECT count(*)::int FROM inscriptions i
                  WHERE i.formation_id = f.id AND ${dans('i.date_inscription')}) AS "nouvellesInscriptions",
                (SELECT count(*)::int FROM inscriptions i
                  WHERE i.formation_id = f.id AND i.statut = 'TERMINEE') AS terminees,
                (SELECT count(*)::int FROM inscriptions i
                  WHERE i.formation_id = f.id AND i.statut = 'SUSPENDUE') AS suspendues,
                t.notees AS "tentativesNotees", t.reussies AS "tentativesReussies",
                t.score AS "scoreMoyen",
                c.finalisees AS "correctionsFinalisees", c.note AS "noteMoyenneAteliers",
                (SELECT count(*)::int FROM certificats x
                  WHERE x.formation_id = f.id AND ${dans('x.date_emission')}) AS "certificatsEmis",
                (SELECT count(*)::int FROM certificats x
                  WHERE x.formation_id = f.id AND x.date_revocation IS NOT NULL
                    AND ${dans('x.date_revocation')}) AS "certificatsRevoques"
           FROM formations f
           CROSS JOIN LATERAL (
             SELECT count(*)::int AS notees,
                    count(*) FILTER (WHERE tq.est_reussie)::int AS reussies,
                    round(avg(tq.score)::numeric, 2)::float AS score
               FROM tentatives_qcm tq JOIN qcm q ON q.id = tq.qcm_id
               JOIN modules m ON m.id = q.module_id
              WHERE m.formation_id = f.id AND tq.statut = 'NOTEE' AND ${dans('tq.date_fin')}) t
           CROSS JOIN LATERAL (
             SELECT count(*)::int AS finalisees, round(avg(co.score_total)::numeric, 2)::float AS note
               FROM corrections co JOIN livrables l ON l.id = co.livrable_id
               JOIN ateliers a ON a.id = l.atelier_id JOIN modules m ON m.id = a.module_id
              WHERE m.formation_id = f.id AND co.statut = 'TERMINEE'
                AND ${dans('co.date_finalisation')}) c
          ORDER BY f.titre COLLATE "C", f.id`,
        [p.du, p.au],
      )) as BilanFormation[];
      return { modele: 'FORMATIONS', periode, formations: lignes };
    }
    const certificats = (await this.dataSource.query(
      `SELECT x.id,
              COALESCE(NULLIF(trim(concat_ws(' ', u.prenom, u.nom)), ''), u.email) AS titulaire,
              u.email, f.titre AS formation, x.score_final::float AS "scoreFinal", x.mention,
              x.statut::text AS statut, x.date_emission AS "dateEmission",
              (SELECT count(*)::int FROM audit_logs a
                WHERE a.action = 'CERTIFICAT_VERIFIE' AND a.cible = x.id::text) AS consultations
         FROM certificats x
         JOIN users u ON u.id = x.apprenant_id
         JOIN formations f ON f.id = x.formation_id
        WHERE ${dans('x.date_emission')}
        ORDER BY x.date_emission, x.id`,
      [p.du, p.au],
    )) as CertificatRegistre[];
    return { modele: 'CERTIFICATS', periode, certificats };
  }

  /** Contrôle des paramètres d'un rapport de session (400 / 404). */
  private async verifierParametres(
    formationId: string,
    d: ParametresSession,
  ): Promise<ParametresSession> {
    if (d.portee !== 'INDIVIDUEL' && d.apprenantId !== undefined) {
      throw new BadRequestException('apprenantId n’est accepté que pour la portée INDIVIDUEL.');
    }
    if (d.portee !== 'MODULE' && d.moduleId !== undefined) {
      throw new BadRequestException('moduleId n’est accepté que pour la portée MODULE.');
    }
    if (d.portee === 'INDIVIDUEL') {
      const [i] = (await this.dataSource.query(
        `SELECT 1 FROM inscriptions WHERE formation_id = $1 AND apprenant_id = $2`,
        [formationId, d.apprenantId],
      )) as unknown[];
      if (!i) throw new NotFoundException('Apprenant non inscrit à cette formation.');
      return { portee: 'INDIVIDUEL', apprenantId: d.apprenantId };
    }
    if (d.portee === 'MODULE') {
      const [mod] = (await this.dataSource.query(
        `SELECT 1 FROM modules WHERE id = $1 AND formation_id = $2`,
        [d.moduleId, formationId],
      )) as unknown[];
      if (!mod) throw new NotFoundException('Module introuvable dans cette formation.');
      return { portee: 'MODULE', moduleId: d.moduleId };
    }
    return { portee: 'GLOBAL' };
  }

  /** Données du rapport, relues au moment de la génération. */
  private async contenu(formationId: string, p: ParametresSession): Promise<ContenuSession> {
    if (p.portee === 'GLOBAL') {
      return { portee: 'GLOBAL', suivi: await this.suiviService.suivi(formationId) };
    }
    const [formation] = (await this.dataSource.query(`SELECT titre FROM formations WHERE id = $1`, [
      formationId,
    ])) as Array<{ titre: string }>;
    if (!formation) throw new NotFoundException('Formation introuvable.');
    if (p.portee === 'INDIVIDUEL') {
      return {
        portee: 'INDIVIDUEL',
        formation,
        fiche: await this.suiviService.fiche(formationId, p.apprenantId as string),
      };
    }
    return {
      portee: 'MODULE',
      formation,
      donnees: await this.donneesModule(formationId, p.moduleId as string),
    };
  }

  /**
   * US-IA-10 — Analyse des points faibles d'un apprenant sur la formation :
   * dernière tentative notée de chaque QCM (avec corrigé : le lecteur est le
   * formateur affecté ou l'administrateur) et livrables notés (note,
   * commentaire général du formateur). Aucune identité envoyée (D8).
   */
  private async analyseApprenant(
    formationId: string,
    apprenantId: string,
    formationTitre: string,
  ): Promise<ResultatAnalyse> {
    const tentatives = (await this.dataSource.query(
      `SELECT DISTINCT ON (t.qcm_id) t.id, t.plan_tirage AS "planTirage", t.score::float AS score,
              t.est_reussie AS "estReussie", q.titre, q.module_id AS "moduleId",
              c.score_min_validation::float AS seuil
         FROM tentatives_qcm t
         JOIN qcm q ON q.id = t.qcm_id
         JOIN modules m ON m.id = q.module_id
         LEFT JOIN config_anti_fraude c ON c.qcm_id = q.id
        WHERE m.formation_id = $1 AND t.apprenant_id = $2 AND t.statut = 'NOTEE'
        ORDER BY t.qcm_id, t.date_debut DESC, t.id DESC`,
      [formationId, apprenantId],
    )) as Array<{
      id: string;
      planTirage: QuestionTiree[] | null;
      score: number | null;
      estReussie: boolean | null;
      titre: string;
      moduleId: string;
      seuil: number | null;
    }>;
    const ateliers = (await this.dataSource.query(
      `SELECT DISTINCT ON (a.id) a.titre, c.score_total::float AS note, c.commentaire_general AS commentaire
         FROM livrables l
         JOIN ateliers a ON a.id = l.atelier_id
         JOIN modules m ON m.id = a.module_id
         JOIN corrections c ON c.livrable_id = l.id AND c.statut = 'TERMINEE'
        WHERE m.formation_id = $1 AND l.apprenant_id = $2
        ORDER BY a.id, l.version DESC`,
      [formationId, apprenantId],
    )) as AtelierAnalyse[];

    const questions: QuestionAnalysee[] = [];
    const contextes: string[] = [];
    for (const t of tentatives) {
      const lignes = construireLignesRapport(
        await this.correctionService.lireCorrection(
          this.dataSource.manager,
          t.id,
          t.planTirage ?? [],
        ),
        true,
      );
      for (const l of lignes) {
        questions.push({
          numero: questions.length + 1,
          evaluation: t.titre,
          enonce: l.enonce,
          type: l.type,
          niveau: l.niveau,
          verdict: verdictDe(l),
          reponseApprenant: l.optionsCochees,
          bonnesReponses: l.bonnesReponses,
          explication: l.explication,
        });
      }
      contextes.push(
        `« ${t.titre} » : ${nombre(t.score ?? 0)} / 100` +
          `${t.seuil === null ? '' : ` (seuil ${nombre(t.seuil)})`} — ${t.estReussie ? 'réussi' : 'échoué'}`,
      );
    }
    if (tentatives.length === 0 && ateliers.length === 0) {
      return {
        statut: 'INDISPONIBLE',
        message: 'aucune évaluation notée pour cet apprenant : rien à analyser pour l’instant.',
      };
    }
    return this.analyseService.analyser(
      {
        formation: formationTitre,
        contexte:
          contextes.length > 0
            ? `Dernière tentative notée de chaque QCM : ${contextes.join(' ; ')}.`
            : 'Aucun QCM noté ; ateliers seulement.',
        avecCorrige: true,
        questions,
        ateliers,
      },
      [...new Set(tentatives.map((t) => t.moduleId))],
    );
  }

  private async donneesModule(formationId: string, moduleId: string): Promise<DonneesModule> {
    const [module] = (await this.dataSource.query(
      `SELECT id, titre, ordre FROM modules WHERE id = $1 AND formation_id = $2`,
      [moduleId, formationId],
    )) as Array<{ id: string; titre: string; ordre: number }>;
    if (!module) throw new NotFoundException('Module introuvable dans cette formation.');
    const [evaluations, inscrits, notes] = await Promise.all([
      this.dataSource.query(
        `SELECT e.id, e.type, e.titre
           FROM (SELECT id, 'QCM' AS type, titre FROM qcm WHERE module_id = $1 AND statut = 'PUBLIE'
                 UNION ALL
                 SELECT id, 'ATELIER' AS type, titre FROM ateliers
                  WHERE module_id = $1 AND statut = 'PUBLIE') e
          ORDER BY e.type DESC, e.titre COLLATE "C", e.id`,
        [moduleId],
      ) as Promise<EvaluationModule[]>,
      this.dataSource.query(
        `SELECT u.id, u.prenom, u.nom, u.email, i.statut::text AS statut
           FROM inscriptions i JOIN users u ON u.id = i.apprenant_id
          WHERE i.formation_id = $1
          ORDER BY u.nom COLLATE "C" NULLS LAST, u.prenom COLLATE "C" NULLS LAST, u.email COLLATE "C"`,
        [formationId],
      ) as Promise<InscritModule[]>,
      this.dataSource.query(
        `SELECT t.apprenant_id AS "apprenantId", t.qcm_id AS "evaluationId", max(t.score)::float AS note
           FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
          WHERE q.module_id = $1 AND q.statut = 'PUBLIE' AND t.statut = 'NOTEE' AND t.score IS NOT NULL
          GROUP BY 1, 2
         UNION ALL
         SELECT l.apprenant_id, l.atelier_id, max(c.score_total)::float
           FROM livrables l
           JOIN ateliers a ON a.id = l.atelier_id
           JOIN corrections c ON c.livrable_id = l.id AND c.statut = 'TERMINEE'
          WHERE a.module_id = $1 AND a.statut = 'PUBLIE'
          GROUP BY 1, 2`,
        [moduleId],
      ) as Promise<NoteEvaluation[]>,
    ]);
    return assemblerModule(module, evaluations, inscrits, notes);
  }

  private async ligneDuDemandeur(demandeurId: string, rapportId: string): Promise<LigneRapport> {
    const [l] = (await this.dataSource.query(`${SELECT_RAPPORT} WHERE r.id = $1`, [
      rapportId,
    ])) as LigneRapport[];
    if (!l || l.demandeur_id !== demandeurId) {
      throw new NotFoundException(MESSAGE_RAPPORT_INTROUVABLE);
    }
    return l;
  }

  /** Email de fin au demandeur ; un échec d'envoi est journalisé, jamais bloquant. */
  private async notifier(
    demandeurId: string,
    titreFormation: string,
    nom: string | null,
    reussi: boolean,
  ): Promise<void> {
    try {
      const [u] = (await this.dataSource.query(`SELECT email, prenom FROM users WHERE id = $1`, [
        demandeurId,
      ])) as Array<{ email: string; prenom: string | null }>;
      if (!u) return;
      await this.mailService.sendRapportPretEmail(u.email, {
        prenom: u.prenom,
        titreFormation,
        nomFichier: nom,
        reussi,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Email de rapport non envoyé (${demandeurId}) : ${detail}`);
    }
  }
}

function vue(l: LigneRapport): RapportVue {
  return {
    id: l.id,
    type: l.type,
    format: l.format,
    statut: l.statut,
    parametres: l.parametres,
    formation: l.formation_id ? { id: l.formation_id, titre: l.titre ?? '' } : null,
    cible: l.cible ?? null,
    nomFichier: l.nom_fichier,
    tailleOctets: l.taille_octets,
    empreinteSha256: l.empreinte_sha256,
    derniereErreur: l.derniere_erreur,
    dateDemande: l.date_demande,
    dateFin: l.date_fin,
  };
}
