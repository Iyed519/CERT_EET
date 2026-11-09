import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Correction } from '../../database/entities/correction.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { StatutCorrection } from '../../database/enums/statut-correction.enum';
import { StatutLivrable } from '../../database/enums/statut-livrable.enum';
import { AuditService } from '../audit/audit.service';
import { ContexteAcces, EspaceFormationService } from '../inscriptions/espace-formation.service';
import { etatDepot, EtatDepot } from './atelier.regles';
import { AteliersService } from './ateliers.service';
import { CritereVue, GrillesService } from './grille/grilles.service';
import { contribution } from './livrables/correction.regles';
import { LivrablesService, LivrableVue } from './livrables/livrables.service';

/** La note d'un critère, telle que l'apprenant la lit (US-ATEL-08). */
export interface NoteFeedbackVue {
  critereId: string;
  ordre: number;
  intitule: string;
  ponderation: number;
  niveau: number;
  libelleNiveau: string;
  pointsPct: number;
  contribution: number;
  commentaire: string | null;
}

/**
 * Le feedback d'un livrable NOTÉ (US-ATEL-08, DS-03 partie 2) : note globale,
 * détail par critère dans l'ordre de la grille, commentaire général. Jamais
 * renseigné tant que la correction est en cours (aucune note partielle).
 */
export interface FeedbackVue {
  scoreFinal: number;
  commentaireGeneral: string;
  dateFinalisation: Date;
  correcteur: { prenom: string | null; nom: string | null };
  criteres: NoteFeedbackVue[];
}

/** Fiche d'un atelier publié, pour un apprenant inscrit (liste blanche). */
export interface AtelierApprenantVue {
  id: string;
  formationId: string;
  formationTitre: string;
  moduleId: string;
  moduleTitre: string;
  titre: string;
  enonce: string;
  competencesVisees: string | null;
  dateLimite: Date;
  toleranceRetardHeures: number;
  typesLivrables: string[];
  tailleMaxMo: number;
  nbMaxFichiers: number;
  etatDepot: EtatDepot;
  grille: { totalPonderations: number; criteres: CritereVue[] };
  /**
   * US-ATEL-04 — mon livrable pour cet atelier, ou null si rien n'est déposé ;
   * US-ATEL-08 — avec son feedback une fois noté (null avant).
   */
  monLivrable: (LivrableVue & { feedback: FeedbackVue | null }) | null;
}

export const MESSAGE_ATELIER_INTROUVABLE = 'Atelier introuvable.';

/**
 * Ateliers côté APPRENANT (US-ATEL-03 : « rendu visible aux apprenants
 * inscrits » ; UC4 Apprenant étape 1 : énoncé, consignes, grille visible).
 *
 * Règles :
 *  - seul un atelier PUBLIÉ existe pour l'apprenant : un identifiant inconnu
 *    et un brouillon donnent le même 404 (un brouillon n'est jamais révélé) ;
 *  - l'accès suit l'inscription, comme « Mon espace » : EN_COURS ou TERMINEE ;
 *    absente ou SUSPENDUE -> 403 tracé (EspaceFormationService) ;
 *  - réponse en liste blanche : ni formateur, ni horodatages internes ;
 *    l'état du dépôt se calcule à l'heure de PostgreSQL ;
 *  - US-ATEL-08 : un livrable NOTÉ porte son feedback (score, détail par
 *    critère, commentaire général) ; EN_CORRECTION, rien que le statut. La
 *    PREMIÈRE ouverture d'un feedback est enregistrée (consultations_feedback,
 *    badge « Nouveau feedback » de « Mon espace ») et tracée FEEDBACK_CONSULTE.
 */
@Injectable()
export class AteliersApprenantService {
  constructor(
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    private readonly ateliersService: AteliersService,
    private readonly grillesService: GrillesService,
    private readonly espaceFormationService: EspaceFormationService,
    private readonly livrablesService: LivrablesService,
    private readonly dataSource: DataSource,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  async fiche(
    apprenantId: string,
    atelierId: string,
    contexte: ContexteAcces,
  ): Promise<AtelierApprenantVue> {
    const atelier = await this.atelierRepository.findOne({
      where: { id: atelierId, statut: StatutAtelier.PUBLIE },
      relations: { module: { formation: true } },
    });
    if (!atelier) {
      throw new NotFoundException(MESSAGE_ATELIER_INTROUVABLE);
    }
    await this.espaceFormationService.exigerAccesContenu(
      apprenantId,
      atelier.module.formationId,
      contexte,
    );

    const criteres = await this.grillesService.criteresDeLAtelier(atelierId);
    const maintenant = await this.ateliersService.maintenant(this.atelierRepository.manager);
    return {
      id: atelier.id,
      formationId: atelier.module.formationId,
      formationTitre: atelier.module.formation.titre,
      moduleId: atelier.moduleId,
      moduleTitre: atelier.module.titre,
      titre: atelier.titre,
      enonce: atelier.enonce,
      competencesVisees: atelier.competencesVisees,
      dateLimite: atelier.dateLimite,
      toleranceRetardHeures: atelier.toleranceRetardHeures,
      typesLivrables: atelier.typesLivrables,
      tailleMaxMo: atelier.tailleMaxMo,
      nbMaxFichiers: atelier.nbMaxFichiers,
      etatDepot: etatDepot(atelier.dateLimite, atelier.toleranceRetardHeures, maintenant),
      grille: {
        totalPonderations: criteres.reduce((total, c) => total + c.ponderation, 0),
        criteres,
      },
      monLivrable: await this.monLivrableAvecFeedback(apprenantId, atelierId, criteres, contexte),
    };
  }

  /** Mon livrable ; s'il est NOTÉ, son feedback (et la première consultation). */
  private async monLivrableAvecFeedback(
    apprenantId: string,
    atelierId: string,
    criteres: readonly CritereVue[],
    contexte: ContexteAcces,
  ): Promise<AtelierApprenantVue['monLivrable']> {
    const livrable = await this.livrablesService.monLivrable(apprenantId, atelierId);
    if (!livrable) return null;
    if (livrable.statut !== StatutLivrable.NOTE) return { ...livrable, feedback: null };

    const correction = await this.dataSource.manager.findOne(Correction, {
      where: { livrableId: livrable.id, statut: StatutCorrection.TERMINEE },
      relations: { correcteur: true, notes: { niveau: true } },
    });
    if (
      !correction ||
      correction.scoreTotal === null ||
      correction.commentaireGeneral === null ||
      correction.dateFinalisation === null
    ) {
      return { ...livrable, feedback: null };
    }
    const notes = new Map((correction.notes ?? []).map((n) => [n.critereId, n]));
    const feedback: FeedbackVue = {
      scoreFinal: correction.scoreTotal,
      commentaireGeneral: correction.commentaireGeneral,
      dateFinalisation: correction.dateFinalisation,
      correcteur: {
        prenom: correction.correcteur?.prenom ?? null,
        nom: correction.correcteur?.nom ?? null,
      },
      criteres: criteres.flatMap((c) => {
        const n = notes.get(c.id);
        if (!n) return [];
        return [
          {
            critereId: c.id,
            ordre: c.ordre,
            intitule: c.intitule,
            ponderation: c.ponderation,
            niveau: n.niveau?.ordre ?? 0,
            libelleNiveau: n.niveau?.libelle ?? '',
            pointsPct: n.pointsPct,
            contribution: contribution(n.pointsPct, c.ponderation),
            commentaire: n.commentaire,
          },
        ];
      }),
    };

    // Première consultation : une seule ligne, même si deux onglets s'ouvrent
    // en même temps (clé primaire + ON CONFLICT DO NOTHING).
    const inseres = (await this.dataSource.query(
      `INSERT INTO consultations_feedback (livrable_id) VALUES ($1)
       ON CONFLICT (livrable_id) DO NOTHING RETURNING livrable_id`,
      [livrable.id],
    )) as unknown[];
    if (inseres.length > 0) {
      await this.auditService.record({
        action: 'FEEDBACK_CONSULTE',
        acteur: apprenantId,
        cible: livrable.id,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: { atelierId, scoreFinal: feedback.scoreFinal },
      });
    }
    return { ...livrable, feedback };
  }
}
