import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reponse } from '../../../database/entities/reponse.entity';
import { TentativeQcm } from '../../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { EtatCorrection, QuestionCorrigee } from '../tentative-correction.regles';
import { TentativeCorrectionService } from '../tentative-correction.service';
import { QuestionPresentee, TentativeTirageService } from '../tentative-tirage.service';
import {
  BORNES_HISTORIQUE,
  MESSAGE_TENTATIVE_INTROUVABLE,
  resultatVisible,
  selectionsDansLOrdre,
} from './historique.regles';

/** Une ligne de l'historique (apprenant ou formateur). */
export interface LigneHistorique {
  id: string;
  qcmId: string;
  qcmTitre: string;
  formationId: string;
  formationTitre: string;
  /** Rang de la tentative pour cet apprenant sur ce QCM (1 = la première). */
  numero: number;
  statut: StatutTentative;
  dateDebut: Date;
  dateFin: Date | null;
  /** Durée effective en secondes (écrite à la soumission ou à la clôture). */
  dureeSecondes: number | null;
  score: number | null;
  estReussie: boolean | null;
  nbQuestions: number;
  nbRepondues: number;
}

export interface LigneHistoriqueFormateur extends LigneHistorique {
  apprenant: { id: string; prenom: string | null; nom: string | null; email: string };
}

/** Détail pour l'apprenant : questions vues et options cochées, SANS juste / faux. */
export interface DetailHistoriqueApprenant extends LigneHistorique {
  questions: QuestionPresentee[];
  reponses: Record<string, string[]>;
  correction: EtatCorrection;
}

/** Détail pour le formateur : corrigé complet (bonnes réponses, points). */
export interface DetailHistoriqueFormateur extends LigneHistoriqueFormateur {
  questions: QuestionCorrigee[];
}

/** Vue apprenant : la ligne, sans le bloc « apprenant » (c'est lui). */
const sansApprenant = (ligne: LigneHistoriqueFormateur): LigneHistorique => {
  const vue: Partial<LigneHistoriqueFormateur> = { ...ligne };
  delete vue.apprenant;
  return vue as LigneHistorique;
};

const COLONNES = `
  t.id, t.qcm_id AS "qcmId", q.titre AS "qcmTitre", m.formation_id AS "formationId",
  f.titre AS "formationTitre",
  ROW_NUMBER() OVER (PARTITION BY t.apprenant_id, t.qcm_id ORDER BY t.date_debut, t.id)::int AS numero,
  t.statut::text AS statut, t.date_debut AS "dateDebut", t.date_fin AS "dateFin",
  t.duree_effective AS "dureeSecondes", t.score::float AS score, t.est_reussie AS "estReussie",
  COALESCE(jsonb_array_length(t.plan_tirage), 0)::int AS "nbQuestions",
  (SELECT count(*) FROM reponses r
    WHERE r.tentative_id = t.id
      AND EXISTS (SELECT 1 FROM reponse_options ro WHERE ro.reponse_id = r.id))::int AS "nbRepondues",
  json_build_object('id', u.id, 'prenom', u.prenom, 'nom', u.nom, 'email', u.email) AS apprenant`;
const JOINTURES = `
  FROM tentatives_qcm t
  JOIN qcm q ON q.id = t.qcm_id
  JOIN modules m ON m.id = q.module_id
  JOIN formations f ON f.id = m.formation_id
  JOIN users u ON u.id = t.apprenant_id`;

/**
 * US-QCM-11 — Historique complet et immuable des tentatives.
 *
 * Lecture seule (aucune écriture, aucune route de modification). L'apprenant
 * ne voit que les siennes (celle d'un autre = 404, comme une inconnue) ; le
 * formateur affecté voit celles de son QCM (garde de formation). Score et
 * réussite ne sortent qu'une fois la tentative NOTEE ; les bonnes réponses ne
 * sortent jamais côté apprenant (le corrigé garde sa route, US-QCM-09).
 */
@Injectable()
export class HistoriqueTentativesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    private readonly correctionService: TentativeCorrectionService,
    private readonly tirageService: TentativeTirageService,
  ) {}

  /** Mes tentatives (toutes, ou d'un QCM), les plus récentes d'abord. */
  async mesTentatives(apprenantId: string, qcmId?: string): Promise<LigneHistorique[]> {
    const lignes = await this.lire(`t.apprenant_id = $1 AND ($2::uuid IS NULL OR t.qcm_id = $2)`, [
      apprenantId,
      qcmId ?? null,
    ]);
    return lignes.map(sansApprenant);
  }

  /** Une de MES tentatives terminée : questions vues et mes choix ; état du corrigé. */
  async monDetail(apprenantId: string, tentativeId: string): Promise<DetailHistoriqueApprenant> {
    const [ligne] = await this.lire(`t.id = $1 AND t.apprenant_id = $2`, [
      tentativeId,
      apprenantId,
    ]);
    if (!ligne) throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    const tentative = await this.tentativeRepository.findOne({
      where: { id: tentativeId, apprenantId },
      relations: { qcm: { configuration: true } },
    });
    if (!tentative || !tentative.qcm.configuration) {
      throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    }
    const [{ maintenant }] = (await this.dataSource.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;
    const correction = await this.correctionService.etat(
      tentative,
      tentative.qcm.configuration,
      maintenant,
    );
    const vue = sansApprenant(ligne);
    // Une tentative EN COURS se consulte sur la page de passage (contrôle de
    // session, minuterie) : rien de son contenu ne sort ici.
    if (tentative.statut === StatutTentative.EN_COURS) {
      return { ...vue, questions: [], reponses: {}, correction };
    }
    const plan = tentative.planTirage ?? [];
    return {
      ...vue,
      questions: await this.tirageService.presenter(this.dataSource.manager, plan),
      reponses: selectionsDansLOrdre(plan, await this.cochees(tentativeId)),
      correction,
    };
  }

  /** Tentatives d'un QCM (toutes, ou d'un apprenant), les plus récentes d'abord. */
  async tentativesDuQcm(qcmId: string, apprenantId?: string): Promise<LigneHistoriqueFormateur[]> {
    return this.lire(`t.qcm_id = $1 AND ($2::uuid IS NULL OR t.apprenant_id = $2)`, [
      qcmId,
      apprenantId ?? null,
    ]);
  }

  /** Détail d'une tentative de ce QCM, corrigé compris (formateur). */
  async detailFormateur(qcmId: string, tentativeId: string): Promise<DetailHistoriqueFormateur> {
    const [ligne] = await this.lire(`t.id = $1 AND t.qcm_id = $2`, [tentativeId, qcmId]);
    if (!ligne) throw new NotFoundException(MESSAGE_TENTATIVE_INTROUVABLE);
    const tentative = await this.tentativeRepository.findOne({
      where: { id: tentativeId, qcmId },
      select: { id: true, planTirage: true },
    });
    const questions = await this.correctionService.lireCorrection(
      this.dataSource.manager,
      tentativeId,
      tentative?.planTirage ?? [],
    );
    return { ...ligne, questions };
  }

  /**
   * Lignes vérifiant `condition` ; le rang est calculé sur TOUTES les
   * tentatives du même apprenant sur le même QCM (d'où la sous-requête), pas
   * seulement sur les lignes retenues.
   */
  private async lire(condition: string, params: unknown[]): Promise<LigneHistoriqueFormateur[]> {
    const lignes = (await this.dataSource.query(
      `SELECT * FROM (SELECT ${COLONNES} ${JOINTURES}
          WHERE (t.apprenant_id, t.qcm_id) IN
                (SELECT t.apprenant_id, t.qcm_id ${JOINTURES} WHERE ${condition})) h
        WHERE h.id IN (SELECT t.id ${JOINTURES} WHERE ${condition})
        ORDER BY h."dateDebut" DESC, h.id DESC
        LIMIT ${BORNES_HISTORIQUE.lignesMax}`,
      params,
    )) as LigneHistoriqueFormateur[];
    return lignes.map((l) => ({
      ...l,
      score: resultatVisible(l.statut, l.score),
      estReussie: resultatVisible(l.statut, l.estReussie),
    }));
  }

  private async cochees(tentativeId: string): Promise<Map<string, Set<string>>> {
    const lignes = await this.dataSource.manager.find(Reponse, {
      where: { tentativeId },
      relations: { optionsSelectionnees: true },
      select: {
        id: true,
        questionId: true,
        optionsSelectionnees: { reponseId: true, optionId: true },
      },
    });
    return new Map(
      lignes.map((l) => [l.questionId, new Set(l.optionsSelectionnees.map((o) => o.optionId))]),
    );
  }
}
