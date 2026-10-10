import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, QueryFailedError, Repository } from 'typeorm';
import { Formation } from '../../database/entities/formation.entity';
import { Inscription } from '../../database/entities/inscription.entity';
import { User } from '../../database/entities/user.entity';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../database/enums/statut-inscription.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/** Vue d'une inscription renvoyée à l'apprenant. */
export interface InscriptionVue {
  id: string;
  statut: StatutInscription;
  dateInscription: Date;
  dateEcheance: string | null;
  tauxAvancement: number;
  formation: {
    id: string;
    titre: string;
    statut: StatutFormation;
    dateDebut: string | null;
    dateFin: string | null;
  };
}

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

const MESSAGE_DEJA_INSCRIT = 'Vous êtes déjà inscrit à cette formation.';

/**
 * Inscription d'un apprenant à une formation (US-INSC-01, DS-08).
 *
 * L'inscription est IMMÉDIATE (DS-08 : aucune validation par un
 * administrateur) : elle naît au statut EN_COURS, avec pour échéance la date
 * de fin de la formation. L'accès aux modules qu'elle ouvre est servi par
 * US-INSC-04.
 */
@Injectable()
export class InscriptionsService {
  private readonly logger = new Logger(InscriptionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Inscription)
    private readonly inscriptionRepository: Repository<Inscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
    // Envoi d'emails (@Global, US-CPT-05).
    private readonly mailService: MailService,
  ) {}

  /**
   * Inscrit l'apprenant connecté à une formation.
   *
   *   1. contrôles + insertion dans UNE transaction (voir creerEnTransaction) ;
   *   2. email de bienvenue, au mieux (UC4) ;
   *   3. audit INSCRIPTION_CREEE (acteur = l'apprenant, cible = la formation).
   *
   * L'email et l'audit viennent APRÈS le commit : une inscription n'est
   * annoncée que si elle existe vraiment.
   */
  async inscrire(
    apprenantId: string,
    formationId: string,
    context: Contexte,
  ): Promise<InscriptionVue> {
    const { inscription, formation, placesRestantes } = await this.creer(apprenantId, formationId);

    const notificationEnvoyee = await this.notifier(apprenantId, formation);

    await this.auditService.record({
      action: 'INSCRIPTION_CREEE',
      acteur: apprenantId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        inscriptionId: inscription.id,
        formationTitre: formation.titre,
        dateEcheance: inscription.dateEcheance,
        placesRestantes,
        notificationEnvoyee,
      },
    });

    return this.versVue(inscription, formation);
  }

  /**
   * Les inscriptions de l'apprenant connecté, la plus récente d'abord, tous
   * statuts (une inscription suspendue reste visible : il doit savoir
   * pourquoi il n'a plus accès). Seules quelques colonnes de la formation
   * sont lues.
   */
  async mesInscriptions(apprenantId: string): Promise<InscriptionVue[]> {
    const inscriptions = await this.inscriptionRepository.find({
      where: { apprenantId },
      relations: { formation: true },
      select: {
        id: true,
        statut: true,
        dateInscription: true,
        dateEcheance: true,
        tauxAvancement: true,
        formation: { id: true, titre: true, statut: true, dateDebut: true, dateFin: true },
      },
      order: { dateInscription: 'DESC' },
    });
    return inscriptions.map((i) => this.versVue(i, i.formation));
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * Lance la transaction et traduit en 409 une violation de l'index unique
   * (apprenant, formation). Le verrou pris dans la transaction sérialise déjà
   * les inscriptions à une même formation ; l'index reste le dernier rempart.
   */
  private async creer(
    apprenantId: string,
    formationId: string,
  ): Promise<{ inscription: Inscription; formation: Formation; placesRestantes: number }> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.creerEnTransaction(manager, apprenantId, formationId),
      );
    } catch (erreur) {
      if (
        erreur instanceof QueryFailedError &&
        (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
      ) {
        throw new ConflictException(MESSAGE_DEJA_INSCRIT);
      }
      throw erreur;
    }
  }

  /**
   * Contrôles et insertion, dans cet ordre (aucune écriture avant la fin des
   * contrôles) :
   *   1. formation lue AVEC VERROU (SELECT … FOR UPDATE). Deux apprenants qui
   *      visent la dernière place passent l'un après l'autre : le second
   *      compte l'inscription du premier et reçoit 409. Sans verrou, les deux
   *      compteraient la même place libre et la capacité serait dépassée ;
   *   2. inconnue ou non OUVERTE -> 404, même réponse que le catalogue, qui
   *      ne révèle pas les formations fermées ou archivées ;
   *   3. inscription existante -> 409 ; si elle est SUSPENDUE, seul un
   *      administrateur peut la réactiver (DS-11 P3), le message le dit ;
   *   4. inscriptions non suspendues >= capacité -> 409 « Formation complète » ;
   *   5. insertion EN_COURS, échéance = date de fin de la formation (DS-08).
   */
  private async creerEnTransaction(
    manager: EntityManager,
    apprenantId: string,
    formationId: string,
  ): Promise<{ inscription: Inscription; formation: Formation; placesRestantes: number }> {
    const formation = await manager.findOne(Formation, {
      where: { id: formationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!formation || formation.statut !== StatutFormation.OUVERTE) {
      throw new NotFoundException('Formation introuvable.');
    }

    const existante = await manager.findOne(Inscription, {
      where: { apprenantId, formationId },
    });
    if (existante?.statut === StatutInscription.SUSPENDUE) {
      throw new ConflictException(
        'Votre inscription à cette formation est suspendue : contactez un administrateur pour la réactiver.',
      );
    }
    if (existante) {
      throw new ConflictException(MESSAGE_DEJA_INSCRIT);
    }

    const inscrits = await manager.count(Inscription, {
      where: { formationId, statut: Not(StatutInscription.SUSPENDUE) },
    });
    if (inscrits >= formation.capaciteMax) {
      throw new ConflictException('Formation complète : il ne reste aucune place.');
    }

    const inscription = await manager.save(
      manager.create(Inscription, {
        apprenantId,
        formationId,
        statut: StatutInscription.EN_COURS,
        dateEcheance: formation.dateFin,
      }),
    );
    return { inscription, formation, placesRestantes: formation.capaciteMax - inscrits - 1 };
  }

  /**
   * Email de bienvenue (UC4 Administrateur) — AU MIEUX : l'inscription est
   * déjà enregistrée, une panne de la messagerie ne doit ni l'annuler ni
   * faire échouer la requête. L'échec est journalisé dans les logs et son
   * résultat tracé dans l'audit.
   */
  private async notifier(apprenantId: string, formation: Formation): Promise<boolean> {
    try {
      const apprenant = await this.userRepository.findOne({
        where: { id: apprenantId },
        select: { id: true, email: true, prenom: true },
      });
      if (!apprenant) {
        return false;
      }
      await this.mailService.sendBienvenueInscriptionEmail(apprenant.email, {
        prenom: apprenant.prenom,
        titreFormation: formation.titre,
        dateDebut: formation.dateDebut,
        dateFin: formation.dateFin,
      });
      return true;
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(
        `Email de bienvenue non envoyé (formation ${formation.id}, apprenant ${apprenantId}) : ${detail}`,
      );
      return false;
    }
  }

  private versVue(inscription: Inscription, formation: Formation): InscriptionVue {
    return {
      id: inscription.id,
      statut: inscription.statut,
      dateInscription: inscription.dateInscription,
      dateEcheance: inscription.dateEcheance,
      tauxAvancement: inscription.tauxAvancement,
      formation: {
        id: formation.id,
        titre: formation.titre,
        statut: formation.statut,
        dateDebut: formation.dateDebut,
        dateFin: formation.dateFin,
      },
    };
  }
}
