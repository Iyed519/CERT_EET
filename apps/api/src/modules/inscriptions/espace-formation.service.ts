import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';

/** Où en est l'apprenant sur un QCM, d'après SES tentatives. */
export type AvancementQcm = 'A_FAIRE' | 'EN_COURS' | 'REUSSI' | 'ECHOUE';

/** Où en est l'apprenant sur un module, d'après ses QCM publiés. */
export type AvancementModule = 'SANS_EVALUATION' | 'A_FAIRE' | 'COMPLETE';

/** Où en est la fenêtre d'ouverture d'un QCM publié (US-QCM-04). */
export type EtatFenetre = 'A_VENIR' | 'OUVERTE' | 'FERMEE';

/** Contexte de la requête, pour tracer un refus. */
export interface ContexteAcces {
  adresseIp: string | null;
  methode: string;
  route: string;
}

/**
 * « Mon espace » d'une formation (US-INSC-04, DS-09 étapes 1 et 2).
 *
 * Ne contient JAMAIS les questions, options ni la configuration d'un QCM :
 * seulement de quoi choisir une évaluation (anti-fraude, NF3). De la
 * configuration, seules les dates de la fenêtre d'ouverture sortent
 * (US-QCM-04) : l'apprenant doit savoir quand passer l'évaluation.
 */
export interface EspaceFormationVue {
  formation: {
    id: string;
    titre: string;
    description: string | null;
    objectifs: string | null;
    prerequis: string | null;
    dateDebut: string | null;
    dateFin: string | null;
    dureeHeures: number | null;
    statut: StatutFormation;
    noteMinCertification: number;
  };
  inscription: {
    id: string;
    statut: StatutInscription;
    dateInscription: Date;
    dateEcheance: string | null;
    tauxAvancement: number;
  };
  modules: Array<{
    id: string;
    titre: string;
    ordre: number;
    description: string | null;
    avancement: AvancementModule;
    qcms: Array<{
      id: string;
      titre: string;
      description: string | null;
      avancement: AvancementQcm;
      dateOuverture: Date | null;
      dateFermeture: Date | null;
      fenetre: EtatFenetre | null;
    }>;
  }>;
}

const MESSAGE_NON_INSCRIT = 'Vous n’êtes pas inscrit à cette formation.';
const MESSAGE_SUSPENDUE =
  'Votre inscription à cette formation est suspendue : contactez un administrateur.';

/**
 * Accès d'un apprenant au contenu d'une formation (US-INSC-04, DS-09).
 *
 * C'est l'INSCRIPTION qui ouvre l'accès : EN_COURS ou TERMINEE (une formation
 * achevée reste consultable). Sans inscription, ou si elle est SUSPENDUE :
 * 403 et refus tracé (ACCES_RESSOURCE_REFUSE, comme le garde d'US-AUTH-16).
 */
@Injectable()
export class EspaceFormationService {
  private readonly logger = new Logger(EspaceFormationService.name);

  constructor(
    @InjectRepository(Inscription)
    private readonly inscriptionRepository: Repository<Inscription>,
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Construit l'espace de l'apprenant pour une formation.
   *
   *   1. inscription (apprenant, formation) : absente -> 403 ; SUSPENDUE ->
   *      403 avec le message qui renvoie vers un administrateur. Une formation
   *      inconnue donne le même 403 qu'une formation où l'on n'est pas
   *      inscrit : son existence n'est pas révélée ;
   *   2. formation et modules triés par ordre — quel que soit le statut de la
   *      formation : la fermeture arrête les inscriptions, pas le cours ;
   *   3. QCM PUBLIÉS de ces modules (jamais les brouillons), colonnes
   *      d'affichage seulement, plus les dates de leur fenêtre d'ouverture
   *      et son état (à venir, ouverte, fermée — US-QCM-04) ;
   *   4. MES tentatives sur ces QCM -> avancement de chaque QCM, puis de
   *      chaque module.
   *
   * Lecture seule : le taux d'avancement renvoyé est celui ENREGISTRÉ sur
   * l'inscription ; il est recalculé après la notation d'une tentative
   * (US-QCM-08), pas à chaque consultation.
   */
  async monEspace(
    apprenantId: string,
    formationId: string,
    contexte: ContexteAcces,
  ): Promise<EspaceFormationVue> {
    const inscription = await this.inscriptionRepository.findOne({
      where: { apprenantId, formationId },
    });
    if (!inscription) {
      await this.journaliserRefus(apprenantId, formationId, 'NON_INSCRIT', contexte);
      throw new ForbiddenException(MESSAGE_NON_INSCRIT);
    }
    if (inscription.statut === StatutInscription.SUSPENDUE) {
      await this.journaliserRefus(apprenantId, formationId, 'INSCRIPTION_SUSPENDUE', contexte);
      throw new ForbiddenException(MESSAGE_SUSPENDUE);
    }

    const formation = await this.formationRepository.findOneOrFail({
      where: { id: formationId },
      relations: { modules: true },
      order: { modules: { ordre: 'ASC' } },
    });
    const modules = formation.modules ?? [];

    const qcms =
      modules.length === 0
        ? []
        : await this.qcmRepository.find({
            where: { moduleId: In(modules.map((m) => m.id)), statut: StatutQcm.PUBLIE },
            relations: { configuration: true },
            select: {
              id: true,
              moduleId: true,
              titre: true,
              description: true,
              configuration: { id: true, dateOuverture: true, dateFermeture: true },
            },
            order: { createdAt: 'ASC' },
          });

    const tentatives =
      qcms.length === 0
        ? []
        : await this.tentativeRepository.find({
            where: { apprenantId, qcmId: In(qcms.map((q) => q.id)) },
            select: { id: true, qcmId: true, statut: true, estReussie: true },
          });

    return {
      formation: {
        id: formation.id,
        titre: formation.titre,
        description: formation.description,
        objectifs: formation.objectifs,
        prerequis: formation.prerequis,
        dateDebut: formation.dateDebut,
        dateFin: formation.dateFin,
        dureeHeures: formation.dureeHeures,
        statut: formation.statut,
        noteMinCertification: formation.noteMinCertification,
      },
      inscription: {
        id: inscription.id,
        statut: inscription.statut,
        dateInscription: inscription.dateInscription,
        dateEcheance: inscription.dateEcheance,
        tauxAvancement: inscription.tauxAvancement,
      },
      modules: modules.map((module) => this.versModule(module, qcms, tentatives, new Date())),
    };
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  private versModule(
    module: ModuleFormation,
    qcms: Qcm[],
    tentatives: TentativeQcm[],
    maintenant: Date,
  ): EspaceFormationVue['modules'][number] {
    const qcmsDuModule = qcms
      .filter((q) => q.moduleId === module.id)
      .map((q) => ({
        id: q.id,
        titre: q.titre,
        description: q.description,
        avancement: avancementQcm(tentatives.filter((t) => t.qcmId === q.id)),
        dateOuverture: q.configuration?.dateOuverture ?? null,
        dateFermeture: q.configuration?.dateFermeture ?? null,
        fenetre: q.configuration
          ? etatFenetre(q.configuration.dateOuverture, q.configuration.dateFermeture, maintenant)
          : null,
      }));
    return {
      id: module.id,
      titre: module.titre,
      ordre: module.ordre,
      description: module.description,
      avancement: avancementModule(qcmsDuModule.map((q) => q.avancement)),
      qcms: qcmsDuModule,
    };
  }

  /**
   * Trace un accès refusé — même action que le garde d'US-AUTH-16, avec la
   * ressource `inscription` et le motif. Un échec d'écriture d'audit est
   * journalisé mais ne change pas la réponse (le 403 part quand même).
   */
  private async journaliserRefus(
    apprenantId: string,
    formationId: string,
    motif: 'NON_INSCRIT' | 'INSCRIPTION_SUSPENDUE',
    contexte: ContexteAcces,
  ): Promise<void> {
    try {
      await this.auditService.record({
        action: 'ACCES_RESSOURCE_REFUSE',
        acteur: apprenantId,
        cible: formationId,
        adresseIp: contexte.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: {
          ressource: 'inscription',
          ressourceId: formationId,
          motif,
          methode: contexte.methode,
          route: contexte.route,
        },
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Audit du refus d'accès impossible (formation ${formationId}) : ${detail}`);
    }
  }
}

/**
 * Avancement d'un QCM d'après les tentatives de l'apprenant :
 *  - une tentative réussie -> REUSSI (même si d'autres ont échoué) ;
 *  - une tentative en cours, ou soumise mais pas encore notée -> EN_COURS ;
 *  - des tentatives, toutes notées en échec -> ECHOUE ;
 *  - aucune tentative -> A_FAIRE.
 */
export function avancementQcm(
  tentatives: Array<Pick<TentativeQcm, 'statut' | 'estReussie'>>,
): AvancementQcm {
  if (tentatives.length === 0) return 'A_FAIRE';
  if (tentatives.some((t) => t.estReussie === true)) return 'REUSSI';
  if (tentatives.some((t) => t.statut === StatutTentative.EN_COURS || t.estReussie === null)) {
    return 'EN_COURS';
  }
  return 'ECHOUE';
}

/**
 * Avancement d'un module : COMPLETE quand tous ses QCM publiés sont réussis,
 * A_FAIRE sinon, SANS_EVALUATION s'il n'en a aucun. Pas de verrouillage :
 * aucun document ne définit d'ordre imposé entre modules.
 */
export function avancementModule(avancements: AvancementQcm[]): AvancementModule {
  if (avancements.length === 0) return 'SANS_EVALUATION';
  return avancements.every((a) => a === 'REUSSI') ? 'COMPLETE' : 'A_FAIRE';
}

/**
 * État de la fenêtre d'ouverture à un instant donné (US-QCM-04) : avant
 * l'ouverture -> A_VENIR ; de l'ouverture (incluse) à la fermeture (exclue)
 * -> OUVERTE ; ensuite -> FERMEE. Purement informatif : le démarrage d'une
 * tentative est revérifié par le serveur (US-QCM-05).
 */
export function etatFenetre(
  ouverture: Date | string,
  fermeture: Date | string,
  maintenant: Date,
): EtatFenetre {
  const t = maintenant.getTime();
  if (t < new Date(ouverture).getTime()) return 'A_VENIR';
  if (t < new Date(fermeture).getTime()) return 'OUVERTE';
  return 'FERMEE';
}
