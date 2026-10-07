import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/enums/role.enum';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { MailService } from '../../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from './formations.service';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/**
 * Vue d'un formateur affecté à une formation.
 *
 * `id` est l'identifiant du COMPTE (c'est lui qu'attend la route de retrait).
 * J'expose aussi le rôle et le statut actuels du compte : un formateur peut
 * être rétrogradé ou désactivé après son affectation (US-ROL-01, US-CPT-03),
 * la ligne reste alors en base et l'administrateur doit pouvoir le voir.
 */
export interface FormateurAffecteVue {
  id: string;
  email: string;
  nom: string | null;
  prenom: string | null;
  role: Role;
  statut: StatutCompte;
  affecteLe: Date;
}

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

/**
 * Affectation des formateurs aux formations (US-FORM-03, DS-16 P1, ADR-11).
 *
 * Le rôle FORMATEUR dit « vous pouvez enseigner » ; une ligne de
 * `formation_formateurs` dit « vous enseignez CETTE formation ». Je n'écris
 * ici que cette ligne : le garde qui la lit pour autoriser la création
 * d'évaluations arrive avec US-AUTH-16.
 *
 * Toute écriture passe d'abord par FormationsService.chargerPourEcriture :
 * 404 si la formation n'existe pas, 409 si elle est archivée.
 */
@Injectable()
export class FormationFormateursService {
  private readonly logger = new Logger(FormationFormateursService.name);

  constructor(
    @InjectRepository(AffectationFormateur)
    private readonly affectationRepository: Repository<AffectationFormateur>,
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
    // Envoi d'emails (@Global, US-CPT-05).
    private readonly mailService: MailService,
  ) {}

  /**
   * Affecte un formateur à une formation.
   *
   * Ordre volontaire (aucune écriture avant validation complète) :
   *   1. formation chargée pour écriture -> 404 si inconnue, 409 si archivée ;
   *   2. compte cible -> 404 s'il n'existe pas ;
   *   3. rôle FORMATEUR exigé -> 400 (critère d'erreur de la story) ;
   *   4. compte ACTIF exigé -> 400 : un compte en attente, désactivé ou
   *      anonymisé ne peut pas se connecter, l'affecter n'aurait aucun sens ;
   *   5. déjà affecté -> 409 ;
   *   6. enregistrement, `affecte_par` = l'administrateur du jeton ;
   *   7. notification par email, au mieux (voir notifier) ;
   *   8. audit FORMATEUR_AFFECTE.
   */
  async affecter(
    adminId: string,
    formationId: string,
    formateurId: string,
    context: Contexte,
  ): Promise<FormateurAffecteVue> {
    const formation = await this.formationsService.chargerPourEcriture(formationId);

    const formateur = await this.userRepository.findOne({ where: { id: formateurId } });
    if (!formateur) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (formateur.role !== Role.FORMATEUR) {
      throw new BadRequestException(
        'Seul un utilisateur ayant le rôle Formateur peut être affecté à une formation.',
      );
    }
    if (formateur.statut !== StatutCompte.ACTIF) {
      throw new BadRequestException(
        'Ce compte formateur n’est pas actif et ne peut pas être affecté.',
      );
    }

    const dejaAffecte = await this.affectationRepository.findOne({
      where: { formationId, formateurId },
    });
    if (dejaAffecte) {
      throw new ConflictException('Ce formateur est déjà affecté à cette formation.');
    }

    const affectation = await this.enregistrer(formationId, formateurId, adminId);
    const notificationEnvoyee = await this.notifier(formateur, formation);

    await this.auditService.record({
      action: 'FORMATEUR_AFFECTE',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formateurId,
        formateurEmail: formateur.email,
        formationTitre: formation.titre,
        notificationEnvoyee,
      },
    });

    return this.versVue(formateur, affectation.createdAt);
  }

  /**
   * Liste les formateurs affectés à une formation, du plus ancien au plus
   * récent. Lecture : autorisée aussi sur une formation archivée (elle reste
   * consultable), d'où un simple contrôle d'existence et non
   * chargerPourEcriture.
   *
   * Sélection EXPLICITE des colonnes du compte : le hash du mot de passe et le
   * secret MFA ne quittent jamais la base.
   */
  async lister(formationId: string): Promise<FormateurAffecteVue[]> {
    const existe = await this.formationRepository.countBy({ id: formationId });
    if (existe === 0) {
      throw new NotFoundException('Formation introuvable.');
    }

    const affectations = await this.affectationRepository.find({
      where: { formationId },
      relations: { formateur: true },
      select: {
        id: true,
        createdAt: true,
        formateur: { id: true, email: true, nom: true, prenom: true, role: true, statut: true },
      },
      order: { createdAt: 'ASC' },
    });

    return affectations.map((a) => this.versVue(a.formateur, a.createdAt));
  }

  /**
   * Retire un formateur d'une formation.
   *
   * Je ne vérifie NI le rôle NI le statut du compte : un formateur rétrogradé
   * ou désactivé depuis son affectation doit pouvoir être retiré. Les
   * évaluations qu'il a créées restent en place ; il perd seulement le droit
   * d'agir dessus (US-AUTH-16).
   */
  async retirer(
    adminId: string,
    formationId: string,
    formateurId: string,
    context: Contexte,
  ): Promise<void> {
    const formation = await this.formationsService.chargerPourEcriture(formationId);

    const affectation = await this.affectationRepository.findOne({
      where: { formationId, formateurId },
      relations: { formateur: true },
      select: { id: true, formateur: { id: true, email: true } },
    });
    if (!affectation) {
      throw new NotFoundException('Ce formateur n’est pas affecté à cette formation.');
    }

    await this.affectationRepository.delete({ id: affectation.id });

    await this.auditService.record({
      action: 'FORMATEUR_RETIRE',
      acteur: adminId,
      cible: formationId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formateurId,
        formateurEmail: affectation.formateur.email,
        formationTitre: formation.titre,
      },
    });
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * Insère l'affectation. Le contrôle « déjà affecté » fait plus haut ne
   * suffit pas si deux requêtes identiques arrivent en même temps : les deux
   * le passent. C'est l'index unique (formation, formateur) qui tranche ; je
   * traduis sa violation en 409 plutôt que de laisser remonter une erreur 500.
   */
  private async enregistrer(
    formationId: string,
    formateurId: string,
    adminId: string,
  ): Promise<AffectationFormateur> {
    try {
      return await this.affectationRepository.save(
        this.affectationRepository.create({ formationId, formateurId, affectePar: adminId }),
      );
    } catch (erreur) {
      if (
        erreur instanceof QueryFailedError &&
        (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
      ) {
        throw new ConflictException('Ce formateur est déjà affecté à cette formation.');
      }
      throw erreur;
    }
  }

  /**
   * Prévient le formateur par email (UC4 Administrateur) — AU MIEUX :
   * l'affectation est déjà enregistrée, une panne du serveur de messagerie ne
   * doit ni l'annuler ni faire échouer la requête. Je consigne l'échec dans
   * les logs et je renvoie le résultat, qui est tracé dans l'audit.
   */
  private async notifier(formateur: User, formation: Formation): Promise<boolean> {
    try {
      await this.mailService.sendAffectationFormateurEmail(formateur.email, {
        prenom: formateur.prenom,
        titreFormation: formation.titre,
      });
      return true;
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(
        `Email d'affectation non envoyé (formation ${formation.id}, formateur ${formateur.id}) : ${detail}`,
      );
      return false;
    }
  }

  private versVue(formateur: User, affecteLe: Date): FormateurAffecteVue {
    return {
      id: formateur.id,
      email: formateur.email,
      nom: formateur.nom,
      prenom: formateur.prenom,
      role: formateur.role,
      statut: formateur.statut,
      affecteLe,
    };
  }
}
