import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Atelier } from '../../database/entities/atelier.entity';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { Livrable } from '../../database/entities/livrable.entity';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutAtelier } from '../../database/enums/statut-atelier.enum';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { StatutLivrable } from '../../database/enums/statut-livrable.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { etatDepot, EtatDepot } from '../ateliers/atelier.regles';
import { AuditService } from '../audit/audit.service';
import { EligibiliteService } from '../certificats/eligibilite.service';
import { RessourceVue, versVueRessource } from '../ressources/ressources.service';

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
 * configuration ne sortent que ce que l'apprenant doit savoir AVANT de
 * démarrer : les dates de la fenêtre (US-QCM-04), la durée et le nombre de
 * tentatives autorisées (US-QCM-05, décision D13). Le serveur revérifie tout
 * au démarrage ; ces valeurs ne servent qu'à l'affichage.
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
      dureeMaxMinutes: number | null;
      nbTentativesMax: number | null;
      // Toutes mes tentatives sur ce QCM, quel que soit leur statut (D6).
      nbTentativesPassees: number;
      // Ma tentative EN_COURS encore dans son échéance, à reprendre ; sinon null.
      tentativeEnCoursId: string | null;
      // US-QCM-12 — le formateur a activé la surveillance webcam (consentement
      // demandé au démarrage).
      surveillanceWebcam: boolean;
    }>;
    // US-ATEL-03 — ateliers PUBLIÉS du module (jamais les brouillons), sans énoncé.
    ateliers: Array<{
      id: string;
      titre: string;
      dateLimite: Date;
      toleranceRetardHeures: number;
      typesLivrables: string[];
      etatDepot: EtatDepot;
      // US-ATEL-04 — statut de MON livrable (null : rien déposé).
      statutMonLivrable: StatutLivrable | null;
      // US-ATEL-08 — livrable noté dont je n'ai pas encore ouvert le feedback.
      nouveauFeedback: boolean;
    }>;
    // US-FORM-05 — ressources du cours (liens, vidéos), dans l'ordre du formateur.
    ressources: RessourceVue[];
  }>;
  /**
   * US-ATEL-09 — où en est ma certification : évaluations validées / requises,
   * raison si je ne suis pas encore éligible, et mon certificat s'il a été
   * demandé (statut seulement).
   */
  certification: {
    eligible: boolean;
    raison: string | null;
    validees: number;
    requises: number;
    certificat: { id: string; statut: StatutCertificat } | null;
  };
}

// Exportés : le démarrage d'une tentative (US-QCM-05) refuse avec les mêmes mots.
export const MESSAGE_NON_INSCRIT = 'Vous n’êtes pas inscrit à cette formation.';
export const MESSAGE_SUSPENDUE =
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
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    @InjectRepository(Livrable)
    private readonly livrableRepository: Repository<Livrable>,
    @InjectRepository(RessourceModule)
    private readonly ressourceRepository: Repository<RessourceModule>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
    private readonly eligibiliteService: EligibiliteService,
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
   *      chaque module ;
   *   (US-FORM-05 : ressources du cours de chaque module, dans l'ordre.)
   *   5. ateliers PUBLIÉS de ces modules (US-ATEL-03), sans énoncé, avec
   *      l'état du dépôt (ouvert, en retard, clos) à l'heure de PostgreSQL.
   *      Ils ne comptent pas (encore) dans l'avancement du module : c'est la
   *      note d'un livrable qui le fera (US-ATEL-07).
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
    const inscription = await this.exigerAccesContenu(apprenantId, formationId, contexte);

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
              configuration: {
                id: true,
                dateOuverture: true,
                dateFermeture: true,
                dureeMaxMinutes: true,
                nbTentativesMax: true,
                proctoringWebcam: true,
              },
            },
            order: { createdAt: 'ASC' },
          });

    const tentatives =
      qcms.length === 0
        ? []
        : await this.tentativeRepository.find({
            where: { apprenantId, qcmId: In(qcms.map((q) => q.id)) },
            select: { id: true, qcmId: true, statut: true, estReussie: true, dateLimite: true },
          });

    const ateliers =
      modules.length === 0
        ? []
        : await this.atelierRepository.find({
            where: { moduleId: In(modules.map((m) => m.id)), statut: StatutAtelier.PUBLIE },
            select: {
              id: true,
              moduleId: true,
              titre: true,
              dateLimite: true,
              toleranceRetardHeures: true,
              typesLivrables: true,
            },
            order: { dateLimite: 'ASC', id: 'ASC' },
          });
    const ressources =
      modules.length === 0
        ? []
        : await this.ressourceRepository.find({
            where: { moduleId: In(modules.map((m) => m.id)) },
            order: { ordre: 'ASC' },
          });
    const mesLivrables =
      ateliers.length === 0
        ? []
        : await this.livrableRepository.find({
            where: { apprenantId, atelierId: In(ateliers.map((a) => a.id)) },
            select: { id: true, atelierId: true, statut: true },
          });
    const notes = mesLivrables.filter((l) => l.statut === StatutLivrable.NOTE).map((l) => l.id);
    const consultes = new Set(
      notes.length === 0
        ? []
        : (
            (await this.livrableRepository.query(
              'SELECT livrable_id FROM consultations_feedback WHERE livrable_id = ANY($1)',
              [notes],
            )) as Array<{ livrable_id: string }>
          ).map((c) => c.livrable_id),
    );
    const maintenantBase = ateliers.length === 0 ? new Date() : await this.maintenantPostgres();
    const verdict = await this.eligibiliteService.evaluer(apprenantId, formationId);
    const [certificat] = (await this.livrableRepository.query(
      // US-CERT-08 : le certificat COURANT (celui qu'aucune réémission ne remplace).
      `SELECT c.id, c.statut FROM certificats c
        WHERE c.apprenant_id = $1 AND c.formation_id = $2
          AND NOT EXISTS (SELECT 1 FROM certificats n WHERE n.remplace_certificat_id = c.id)`,
      [apprenantId, formationId],
    )) as Array<{ id: string; statut: StatutCertificat }>;

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
      modules: modules.map((module) => ({
        ...this.versModule(module, qcms, tentatives, new Date()),
        ateliers: ateliers
          .filter((a) => a.moduleId === module.id)
          .map((a) => ({
            id: a.id,
            titre: a.titre,
            dateLimite: a.dateLimite,
            toleranceRetardHeures: a.toleranceRetardHeures,
            typesLivrables: a.typesLivrables,
            etatDepot: etatDepot(a.dateLimite, a.toleranceRetardHeures, maintenantBase),
            statutMonLivrable: mesLivrables.find((l) => l.atelierId === a.id)?.statut ?? null,
            nouveauFeedback: mesLivrables.some(
              (l) =>
                l.atelierId === a.id && l.statut === StatutLivrable.NOTE && !consultes.has(l.id),
            ),
          })),
        ressources: ressources.filter((r) => r.moduleId === module.id).map(versVueRessource),
      })),
      certification: {
        eligible: verdict.eligible,
        raison: verdict.raison,
        validees: verdict.validees,
        requises: verdict.requises,
        certificat: certificat ? { id: certificat.id, statut: certificat.statut } : null,
      },
    };
  }

  /**
   * L'inscription ouvre l'accès au CONTENU d'une formation (espace, fiche d'un
   * atelier) : EN_COURS ou TERMINEE. Absente -> 403 ; SUSPENDUE -> 403 avec
   * le message qui renvoie vers un administrateur. Chaque refus est tracé
   * (ACCES_RESSOURCE_REFUSE). Public : la fiche d'un atelier côté apprenant
   * (US-ATEL-03) applique exactement la même règle.
   */
  async exigerAccesContenu(
    apprenantId: string,
    formationId: string,
    contexte: ContexteAcces,
  ): Promise<Inscription> {
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
    return inscription;
  }

  /** L'heure de PostgreSQL (une seule horloge pour l'état des dépôts). */
  private async maintenantPostgres(): Promise<Date> {
    const [{ maintenant }] = (await this.atelierRepository.query(
      'SELECT now() AS maintenant',
    )) as Array<{ maintenant: Date }>;
    return new Date(maintenant);
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  private versModule(
    module: ModuleFormation,
    qcms: Qcm[],
    tentatives: TentativeQcm[],
    maintenant: Date,
  ): Omit<EspaceFormationVue['modules'][number], 'ateliers' | 'ressources'> {
    const qcmsDuModule = qcms
      .filter((q) => q.moduleId === module.id)
      .map((q) => {
        const mesTentatives = tentatives.filter((t) => t.qcmId === q.id);
        return {
          id: q.id,
          titre: q.titre,
          description: q.description,
          avancement: avancementQcm(mesTentatives),
          dateOuverture: q.configuration?.dateOuverture ?? null,
          dateFermeture: q.configuration?.dateFermeture ?? null,
          fenetre: q.configuration
            ? etatFenetre(q.configuration.dateOuverture, q.configuration.dateFermeture, maintenant)
            : null,
          dureeMaxMinutes: q.configuration?.dureeMaxMinutes ?? null,
          nbTentativesMax: q.configuration?.nbTentativesMax ?? null,
          nbTentativesPassees: mesTentatives.length,
          tentativeEnCoursId: tentativeAReprendre(mesTentatives, maintenant),
          surveillanceWebcam: q.configuration?.proctoringWebcam ?? false,
        };
      });
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
 * Tentative EN_COURS encore dans son échéance : « Reprendre » y mène
 * directement. Une tentative EN_COURS dont l'échéance est passée n'est pas
 * proposée : le prochain démarrage la clôture (US-QCM-05, D11).
 */
export function tentativeAReprendre(
  tentatives: Array<Pick<TentativeQcm, 'id' | 'statut' | 'dateLimite'>>,
  maintenant: Date,
): string | null {
  const enCours = tentatives.find(
    (t) =>
      t.statut === StatutTentative.EN_COURS &&
      new Date(t.dateLimite).getTime() > maintenant.getTime(),
  );
  return enCours?.id ?? null;
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
