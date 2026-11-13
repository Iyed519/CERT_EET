import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QuestionTiree } from '../../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../../database/enums/affichage-resultats.enum';
import { Role } from '../../../database/enums/role.enum';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { AnalysePointsFaiblesService } from '../../assistance-ia/analyse-points-faibles/analyse-points-faibles.service';
import { entreeAnalyseTentative } from '../../assistance-ia/analyse-points-faibles/analyse-points-faibles.regles';
import { AuditService } from '../../audit/audit.service';
import { LIBELLES_EVENEMENT, TypeEvenement } from '../../surveillance/surveillance.regles';
import { EtatCorrection } from '../tentative-correction.regles';
import { TentativeCorrectionService } from '../tentative-correction.service';
import { dateHeureTunis, genererPdfRapport } from './rapport-tentative-pdf';
import {
  clotureDe,
  construireLignesRapport,
  corrigeInclus,
  MESSAGE_RAPPORT_INTROUVABLE,
  MESSAGE_RAPPORT_NON_NOTEE,
  nomFichierRapport,
  phraseCorrigeAbsent,
  pointsARevoir,
  RAISON_RAPPORT_NON_NOTEE,
  rapportDisponible,
  reussiteParNiveau,
  syntheseRapport,
} from './rapport-tentative.regles';

/** Le rapport produit : le document et son nom de fichier. */
export interface RapportPdf {
  pdf: Buffer;
  nomFichier: string;
}

/** Qui demande le rapport. */
export interface DemandeurRapport {
  id: string;
  role: Role;
  adresseIp: string | null;
}

/** Ce que je lis de la tentative figée, en une requête (en-tête du rapport). */
interface TentativeLue {
  id: string;
  apprenantId: string;
  qcmId: string;
  statut: StatutTentative;
  dateDebut: Date;
  dateLimite: Date;
  dateFin: Date | null;
  dureeEffective: number | null;
  score: number | null;
  estReussie: boolean | null;
  planTirage: QuestionTiree[] | null;
  numero: number;
  qcmTitre: string;
  moduleId: string;
  moduleTitre: string;
  formationTitre: string;
  prenom: string | null;
  nom: string | null;
  email: string;
  affichageResultats: AffichageResultats;
  dateFermeture: Date;
  nbTentativesMax: number;
  scoreMinValidation: number;
}

/**
 * US-QCM-13 — Rapport PDF détaillé d'une tentative notée.
 *
 * Généré À LA DEMANDE, de façon synchrone (un document court ; aucune file),
 * jamais stocké. Lecture seule de la tentative figée : score, réussite,
 * juste / faux et points sont ceux que la notation a écrits (US-QCM-08),
 * jamais recalculés. Corrigé : pour l'apprenant, la décision est celle de
 * `GET /tentatives/:id/correction` (`TentativeCorrectionService.etat`) ; le
 * formateur affecté (garde de formation) et l'administrateur le voient
 * toujours. Chaque téléchargement est journalisé (RAPPORT_QCM_TELECHARGE :
 * acteur = demandeur, cible = apprenant).
 */
@Injectable()
export class RapportTentativeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly correctionService: TentativeCorrectionService,
    private readonly auditService: AuditService,
    private readonly analyseService: AnalysePointsFaiblesService,
  ) {}

  /** L'apprenant, pour SA tentative : celle d'un autre donne le même 404 qu'une inconnue. */
  async pourApprenant(demandeur: DemandeurRapport, tentativeId: string): Promise<RapportPdf> {
    const tentative = await this.lire(`t.id = $1 AND t.apprenant_id = $2`, [
      tentativeId,
      demandeur.id,
    ]);
    return this.produire(demandeur, tentative);
  }

  /**
   * Le formateur affecté (vérifié par le garde sur `qcmId`) ou l'administrateur,
   * pour une tentative de CE QCM ; une tentative d'un autre QCM donne 404.
   */
  async pourFormateur(
    demandeur: DemandeurRapport,
    qcmId: string,
    tentativeId: string,
  ): Promise<RapportPdf> {
    const tentative = await this.lire(`t.id = $1 AND t.qcm_id = $2`, [tentativeId, qcmId]);
    return this.produire(demandeur, tentative);
  }

  private async produire(
    demandeur: DemandeurRapport,
    tentative: TentativeLue | null,
  ): Promise<RapportPdf> {
    if (!tentative) throw new NotFoundException(MESSAGE_RAPPORT_INTROUVABLE);
    if (!rapportDisponible(tentative.statut)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: MESSAGE_RAPPORT_NON_NOTEE,
        raison: RAISON_RAPPORT_NON_NOTEE,
      });
    }

    const [{ maintenant }] = (await this.dataSource.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;
    // Même décision que la route du corrigé : une seule règle (US-QCM-09).
    const etat: EtatCorrection | null =
      demandeur.role === Role.APPRENANT
        ? await this.correctionService.etat(
            tentative,
            {
              affichageResultats: tentative.affichageResultats,
              dateFermeture: tentative.dateFermeture,
              nbTentativesMax: tentative.nbTentativesMax,
            },
            maintenant,
          )
        : null;
    const avecCorrige = corrigeInclus(demandeur.role, etat);

    const questions = await this.correctionService.lireCorrection(
      this.dataSource.manager,
      tentative.id,
      tentative.planTirage ?? [],
    );
    const lignes = construireLignesRapport(
      questions,
      avecCorrige,
      await this.niveaux(questions.map((q) => q.id)),
    );

    // US-IA-10 : analyse des points faibles par l'IA (conservée par tentative) ;
    // sans corrigé, aucune bonne réponse ne part au modèle.
    const analyseIa = await this.analyseService.pourTentative(
      tentative.id,
      entreeAnalyseTentative({
        formation: tentative.formationTitre,
        module: tentative.moduleTitre,
        qcm: tentative.qcmTitre,
        numero: tentative.numero,
        nbTentativesMax: tentative.nbTentativesMax,
        score: tentative.score ?? 0,
        scoreMinValidation: tentative.scoreMinValidation,
        estReussie: tentative.estReussie === true,
        avecCorrige,
        lignes,
      }),
      [tentative.moduleId],
    );

    // US-QCM-15 : alertes de la surveillance par IA, pour le formateur et l'admin.
    const alertesSurveillance =
      demandeur.role === Role.APPRENANT
        ? null
        : (
            (await this.dataSource.query(
              `SELECT type, detecte_le AS "detecteLe", statut FROM evenements_surveillance
                WHERE tentative_id = $1 ORDER BY detecte_le, id`,
              [tentative.id],
            )) as Array<{ type: TypeEvenement; detecteLe: Date; statut: string }>
          ).map((a) => ({
            libelle: LIBELLES_EVENEMENT[a.type] ?? a.type,
            detecteLe: new Date(a.detecteLe),
            examinee: a.statut === 'EXAMINE',
          }));

    const pdf = await genererPdfRapport({
      tentativeId: tentative.id,
      formationTitre: tentative.formationTitre,
      moduleTitre: tentative.moduleTitre,
      qcmTitre: tentative.qcmTitre,
      apprenant: { prenom: tentative.prenom, nom: tentative.nom, email: tentative.email },
      numero: tentative.numero,
      nbTentativesMax: tentative.nbTentativesMax,
      dateDebut: tentative.dateDebut,
      dateFin: tentative.dateFin,
      dureeSecondes: tentative.dureeEffective,
      cloture: clotureDe(tentative.dateFin, tentative.dateLimite),
      score: tentative.score ?? 0,
      scoreMinValidation: tentative.scoreMinValidation,
      estReussie: tentative.estReussie === true,
      synthese: syntheseRapport(lignes),
      lignes,
      aRevoir: pointsARevoir(lignes),
      parNiveau: reussiteParNiveau(lignes),
      analyseIa,
      alertesSurveillance,
      corrigeAbsent:
        avecCorrige || etat === null ? null : phraseCorrigeAbsent(etat, dateHeureTunis),
      dateGeneration: new Date(maintenant),
    });

    // Après la génération : un échec d'audit fait échouer la requête (aucun
    // téléchargement non tracé).
    await this.auditService.record({
      action: 'RAPPORT_QCM_TELECHARGE',
      acteur: demandeur.id,
      cible: tentative.apprenantId,
      adresseIp: demandeur.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        tentativeId: tentative.id,
        qcmId: tentative.qcmId,
        role: demandeur.role,
        corrigeInclus: avecCorrige,
        score: tentative.score,
        analyseIa: analyseIa.statut === 'OK' ? analyseIa.source : 'INDISPONIBLE',
      },
    });

    return { pdf, nomFichier: nomFichierRapport(tentative.qcmTitre, tentative.numero) };
  }

  /**
   * Niveau de difficulté de chaque question (saisi par le formateur), pour la
   * réussite par niveau. Lu à part : la vue du corrigé (US-QCM-09) reste inchangée.
   */
  private async niveaux(questionIds: string[]): Promise<Map<string, string | null>> {
    if (questionIds.length === 0) return new Map();
    const lignes = (await this.dataSource.query(
      `SELECT id, niveau_difficulte AS niveau FROM questions WHERE id = ANY($1::uuid[])`,
      [questionIds],
    )) as Array<{ id: string; niveau: string | null }>;
    return new Map(lignes.map((l) => [l.id, l.niveau]));
  }

  /**
   * La tentative et tout l'en-tête en une requête. Le rang est calculé sur
   * TOUTES les tentatives de l'apprenant sur ce QCM, dans l'ordre de
   * l'historique (US-QCM-11 : date de début, puis identifiant).
   */
  private async lire(condition: string, params: unknown[]): Promise<TentativeLue | null> {
    const [ligne] = (await this.dataSource.query(
      `SELECT t.id, t.apprenant_id AS "apprenantId", t.qcm_id AS "qcmId", t.statut::text AS statut,
              t.date_debut AS "dateDebut", t.date_limite AS "dateLimite", t.date_fin AS "dateFin",
              t.duree_effective AS "dureeEffective", t.score::float AS score,
              t.est_reussie AS "estReussie", t.plan_tirage AS "planTirage",
              (SELECT count(*) FROM tentatives_qcm x
                WHERE x.apprenant_id = t.apprenant_id AND x.qcm_id = t.qcm_id
                  AND (x.date_debut, x.id) <= (t.date_debut, t.id))::int AS numero,
              q.titre AS "qcmTitre", m.id AS "moduleId", m.titre AS "moduleTitre", f.titre AS "formationTitre",
              u.prenom, u.nom, u.email,
              c.affichage_resultats::text AS "affichageResultats",
              c.date_fermeture AS "dateFermeture", c.nb_tentatives_max AS "nbTentativesMax",
              c.score_min_validation::float AS "scoreMinValidation"
         FROM tentatives_qcm t
         JOIN qcm q ON q.id = t.qcm_id
         JOIN modules m ON m.id = q.module_id
         JOIN formations f ON f.id = m.formation_id
         JOIN users u ON u.id = t.apprenant_id
         JOIN config_anti_fraude c ON c.qcm_id = t.qcm_id
        WHERE ${condition}`,
      params,
    )) as TentativeLue[];
    return ligne ?? null;
  }
}
