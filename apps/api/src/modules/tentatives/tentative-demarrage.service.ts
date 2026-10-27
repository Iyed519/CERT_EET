import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_NON_INSCRIT, MESSAGE_SUSPENDUE } from '../inscriptions/espace-formation.service';
import {
  RefusDemarrage,
  calculerDateLimite,
  verifierDelai,
  verifierFenetre,
  verifierQuota,
} from './tentative-demarrage.regles';

/** Contexte de la requête, pour l'audit (succès comme refus). */
export interface ContexteDemarrage {
  adresseIp: string | null;
  methode: string;
  route: string;
}

/**
 * Tentative renvoyée à l'apprenant au démarrage. Aucune question ici : elles
 * arrivent avec US-QCM-06 (tirage figé dans `planTirage`, sans `estCorrecte`).
 */
export interface TentativeDemarreeVue {
  id: string;
  qcmId: string;
  statut: StatutTentative;
  dateDebut: Date;
  dateLimite: Date;
  dureeMaxMinutes: number;
  // Rang de cette tentative parmi celles de l'apprenant sur ce QCM (1, 2, …).
  numero: number;
  nbTentativesMax: number;
  tentativesRestantes: number;
  // true : tentative EN_COURS reprise (rechargement, second onglet) — HTTP 200.
  reprise: boolean;
}

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

const MESSAGE_QCM_INTROUVABLE = 'QCM introuvable.';
const MESSAGE_TERMINEE =
  'Votre formation est terminée : vous ne pouvez plus démarrer d’évaluation.';

const MS_PAR_SECONDE = 1000;

/** Issue de la transaction : la décision est prise dedans, les effets après. */
type Issue =
  | { type: 'creee'; tentative: TentativeQcm; numero: number }
  | { type: 'reprise'; tentative: TentativeQcm; numero: number }
  | { type: 'refus'; refus: RefusDemarrage; nbTentativesPassees: number };

interface Bilan {
  issue: Issue;
  // Tentative EN_COURS dont l'échéance était dépassée, clôturée au passage (D11).
  expiree: TentativeQcm | null;
}

/**
 * Démarrage d'une tentative de QCM par un apprenant (US-QCM-05, DS-02
 * étape 1, DS-09 étape 3A). Toutes les règles sont appliquées par le
 * SERVEUR ; le navigateur n'en décide aucune (F1).
 */
@Injectable()
export class TentativeDemarrageService {
  private readonly logger = new Logger(TentativeDemarrageService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    @InjectRepository(Inscription)
    private readonly inscriptionRepository: Repository<Inscription>,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Démarre (ou reprend) une tentative, dans cet ordre :
   *   1. QCM inconnu, non PUBLIÉ ou sans configuration -> 404 : un apprenant
   *      n'apprend pas qu'un brouillon existe ;
   *   2. inscription à la formation du QCM : absente, SUSPENDUE ou TERMINEE
   *      -> 403, refus tracé ACCES_RESSOURCE_REFUSE (mêmes messages que
   *      « Mon espace » — décision D7 : seule une inscription EN_COURS permet
   *      de DÉMARRER) ;
   *   3. dans UNE transaction, la ligne d'inscription VERROUILLÉE (deux
   *      démarrages du même apprenant passent l'un après l'autre) et
   *      l'instant lu dans PostgreSQL (D12) :
   *        a. tentative EN_COURS encore valide -> REPRISE, 200 (D3) ;
   *           échéance dépassée -> clôturée ABANDONNEE_TIMER (D11) ;
   *        b. fenêtre [ouverture, fermeture) (D9) ;
   *        c. quota, toutes tentatives confondues (D6) ;
   *        d. délai depuis la tentative précédente (D6) ;
   *        e. création EN_COURS, échéance = min(début + durée, fermeture) (D5) ;
   *   4. après la transaction : audit (TENTATIVE_DEMARREE succès ou échec,
   *      D8/D10 ; TENTATIVE_EXPIREE pour une clôture), puis la réponse ou le
   *      409 avec son motif précis (D2).
   *
   * L'index unique partiel « une seule EN_COURS par (apprenant, QCM) » reste
   * le dernier rempart : sa violation (23505) est traitée comme une reprise.
   */
  async demarrer(
    apprenantId: string,
    qcmId: string,
    contexte: ContexteDemarrage,
  ): Promise<TentativeDemarreeVue> {
    const qcm = await this.qcmRepository.findOne({
      where: { id: qcmId },
      relations: { module: true, configuration: true },
    });
    if (!qcm || qcm.statut !== StatutQcm.PUBLIE || !qcm.configuration) {
      throw new NotFoundException(MESSAGE_QCM_INTROUVABLE);
    }
    const configuration = qcm.configuration;
    const formationId = qcm.module.formationId;

    const inscription = await this.exigerInscriptionActive(apprenantId, formationId, contexte);

    let bilan: Bilan;
    try {
      bilan = await this.dataSource.transaction((manager) =>
        this.deciderEnTransaction(manager, inscription.id, apprenantId, qcmId, configuration),
      );
    } catch (erreur) {
      if (!this.estViolationUnicite(erreur)) {
        throw erreur;
      }
      // Un démarrage concurrent a créé la tentative entre-temps : je la reprends.
      bilan = { issue: await this.lireTentativeEnCours(apprenantId, qcmId), expiree: null };
    }

    if (bilan.expiree) {
      await this.journaliser({
        action: 'TENTATIVE_EXPIREE',
        acteur: apprenantId,
        cible: bilan.expiree.id,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: {
          qcmId,
          statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.ABANDONNEE_TIMER },
          dateLimite: bilan.expiree.dateLimite,
          cause: 'echeance_depassee_au_demarrage_suivant',
        },
      });
    }

    const { issue } = bilan;
    if (issue.type === 'refus') {
      await this.journaliser({
        action: 'TENTATIVE_DEMARREE',
        acteur: apprenantId,
        cible: qcmId,
        adresseIp: contexte.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: {
          raison: issue.refus.raison,
          dateReouverture: issue.refus.dateReouverture,
          nbTentativesPassees: issue.nbTentativesPassees,
          nbTentativesMax: configuration.nbTentativesMax,
          methode: contexte.methode,
          route: contexte.route,
        },
      });
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: issue.refus.message,
        raison: issue.refus.raison,
        dateReouverture: issue.refus.dateReouverture,
      });
    }

    if (issue.type === 'creee') {
      // Le succès est tracé sans try/catch : une création non tracée ne doit
      // pas passer inaperçue (même règle que QCM_PUBLIE).
      await this.auditService.record({
        action: 'TENTATIVE_DEMARREE',
        acteur: apprenantId,
        cible: issue.tentative.id,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: {
          qcmId,
          numero: issue.numero,
          nbTentativesMax: configuration.nbTentativesMax,
          dateDebut: issue.tentative.dateDebut,
          dateLimite: issue.tentative.dateLimite,
        },
      });
    }

    return this.versVue(issue.tentative, issue.numero, configuration, issue.type === 'reprise');
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * L'inscription ouvre l'accès : seule EN_COURS permet de démarrer. Une
   * formation inconnue est impossible ici (le QCM existe), mais le message
   * reste celui de « Mon espace » pour ne rien révéler de plus.
   */
  private async exigerInscriptionActive(
    apprenantId: string,
    formationId: string,
    contexte: ContexteDemarrage,
  ): Promise<Inscription> {
    const inscription = await this.inscriptionRepository.findOne({
      where: { apprenantId, formationId },
    });
    if (!inscription) {
      await this.journaliserRefusAcces(apprenantId, formationId, 'NON_INSCRIT', contexte);
      throw new ForbiddenException(MESSAGE_NON_INSCRIT);
    }
    if (inscription.statut === StatutInscription.SUSPENDUE) {
      await this.journaliserRefusAcces(apprenantId, formationId, 'INSCRIPTION_SUSPENDUE', contexte);
      throw new ForbiddenException(MESSAGE_SUSPENDUE);
    }
    if (inscription.statut === StatutInscription.TERMINEE) {
      await this.journaliserRefusAcces(apprenantId, formationId, 'INSCRIPTION_TERMINEE', contexte);
      throw new ForbiddenException(MESSAGE_TERMINEE);
    }
    return inscription;
  }

  /**
   * Toutes les lectures et l'éventuelle écriture, sous le verrou de
   * l'inscription. Aucune exception métier n'est levée ici : un refus est
   * RENVOYÉ, pour que la clôture d'une tentative expirée soit bien validée
   * (COMMIT) même quand le démarrage est ensuite refusé.
   */
  private async deciderEnTransaction(
    manager: EntityManager,
    inscriptionId: string,
    apprenantId: string,
    qcmId: string,
    configuration: ConfigurationAntiFraude,
  ): Promise<Bilan> {
    const verrouillee = await manager.findOne(Inscription, {
      where: { id: inscriptionId },
      lock: { mode: 'pessimistic_write' },
    });
    // L'inscription a pu être suspendue entre la lecture et le verrou.
    if (!verrouillee || verrouillee.statut !== StatutInscription.EN_COURS) {
      throw new ForbiddenException(
        verrouillee?.statut === StatutInscription.SUSPENDUE
          ? MESSAGE_SUSPENDUE
          : MESSAGE_NON_INSCRIT,
      );
    }

    // Une seule horloge : celle de PostgreSQL, figée pour toute la transaction.
    const [{ maintenant }] = (await manager.query('SELECT now() AS maintenant')) as Array<{
      maintenant: Date;
    }>;

    let expiree: TentativeQcm | null = null;
    const enCours = await manager.findOne(TentativeQcm, {
      where: { apprenantId, qcmId, statut: StatutTentative.EN_COURS },
    });
    if (enCours) {
      if (enCours.dateLimite.getTime() > maintenant.getTime()) {
        const numero = await manager.countBy(TentativeQcm, { apprenantId, qcmId });
        return { issue: { type: 'reprise', tentative: enCours, numero }, expiree: null };
      }
      // Échéance dépassée et pas de timer Redis avant US-QCM-07 : je clôture la
      // tentative à son échéance, réponses partielles conservées (ET-02).
      enCours.statut = StatutTentative.ABANDONNEE_TIMER;
      enCours.dateFin = enCours.dateLimite;
      enCours.dureeEffective = Math.round(
        (enCours.dateLimite.getTime() - enCours.dateDebut.getTime()) / MS_PAR_SECONDE,
      );
      await manager.update(
        TentativeQcm,
        { id: enCours.id },
        {
          statut: enCours.statut,
          dateFin: enCours.dateFin,
          dureeEffective: enCours.dureeEffective,
        },
      );
      expiree = enCours;
    }

    const nbTentativesPassees = await manager.countBy(TentativeQcm, { apprenantId, qcmId });
    const precedente = await manager.findOne(TentativeQcm, {
      where: { apprenantId, qcmId },
      order: { dateDebut: 'DESC' },
      select: { id: true, dateDebut: true, dateFin: true },
    });

    const refus =
      verifierFenetre(maintenant, configuration.dateOuverture, configuration.dateFermeture) ??
      verifierQuota(nbTentativesPassees, configuration.nbTentativesMax) ??
      verifierDelai(
        maintenant,
        precedente,
        configuration.delaiEntreTentatives,
        configuration.dateFermeture,
      );
    if (refus) {
      return { issue: { type: 'refus', refus, nbTentativesPassees }, expiree };
    }

    const tentative = await manager.save(
      TentativeQcm,
      manager.create(TentativeQcm, {
        apprenantId,
        qcmId,
        dateDebut: maintenant,
        dateLimite: calculerDateLimite(
          maintenant,
          configuration.dureeMaxMinutes,
          configuration.dateFermeture,
        ),
        statut: StatutTentative.EN_COURS,
      }),
    );
    return {
      issue: { type: 'creee', tentative, numero: nbTentativesPassees + 1 },
      expiree,
    };
  }

  /** Après une course perdue (23505) : la tentative EN_COURS existe forcément. */
  private async lireTentativeEnCours(apprenantId: string, qcmId: string): Promise<Issue> {
    const tentative = await this.tentativeRepository.findOneOrFail({
      where: { apprenantId, qcmId, statut: StatutTentative.EN_COURS },
    });
    const numero = await this.tentativeRepository.countBy({ apprenantId, qcmId });
    return { type: 'reprise', tentative, numero };
  }

  private versVue(
    tentative: TentativeQcm,
    numero: number,
    configuration: ConfigurationAntiFraude,
    reprise: boolean,
  ): TentativeDemarreeVue {
    return {
      id: tentative.id,
      qcmId: tentative.qcmId,
      statut: tentative.statut,
      dateDebut: tentative.dateDebut,
      dateLimite: tentative.dateLimite,
      dureeMaxMinutes: configuration.dureeMaxMinutes,
      numero,
      nbTentativesMax: configuration.nbTentativesMax,
      tentativesRestantes: Math.max(configuration.nbTentativesMax - numero, 0),
      reprise,
    };
  }

  private estViolationUnicite(erreur: unknown): boolean {
    return (
      erreur instanceof QueryFailedError &&
      (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
    );
  }

  /** Refus d'accès : même action et même forme que « Mon espace » (US-INSC-04). */
  private journaliserRefusAcces(
    apprenantId: string,
    formationId: string,
    motif: 'NON_INSCRIT' | 'INSCRIPTION_SUSPENDUE' | 'INSCRIPTION_TERMINEE',
    contexte: ContexteDemarrage,
  ): Promise<void> {
    return this.journaliser({
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
  }

  /**
   * Audit « au mieux » des refus et des clôtures : un échec d'écriture est
   * journalisé, mais la réponse à l'apprenant ne change pas.
   */
  private async journaliser(entree: Parameters<AuditService['record']>[0]): Promise<void> {
    try {
      await this.auditService.record(entree);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Audit ${entree.action} impossible (cible ${entree.cible}) : ${detail}`);
    }
  }
}
