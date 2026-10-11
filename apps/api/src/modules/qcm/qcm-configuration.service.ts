import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigurationAntiFraude } from '../../database/entities/configuration-anti-fraude.entity';
import { QcmQuestion } from '../../database/entities/qcm-question.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { AffichageResultats } from '../../database/enums/affichage-resultats.enum';
import { StatutQcm } from '../../database/enums/statut-qcm.enum';
import { AuditService } from '../audit/audit.service';
import { FormationsService } from '../formations/formations.service';
import { ConfigurationDto } from './dto/configuration.dto';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/** Configuration anti-fraude telle que la voit le formateur. */
export interface ConfigurationVue {
  randomiserQuestions: boolean;
  randomiserOptions: boolean;
  nbQuestionsTirees: number | null;
  dureeMaxMinutes: number;
  dateOuverture: Date;
  dateFermeture: Date;
  nbTentativesMax: number;
  delaiEntreTentatives: number;
  blocageSessionsMultiples: boolean;
  affichageResultats: AffichageResultats;
  scoreMinValidation: number;
  ponderationFormation: number;
  proctoringWebcam: boolean;
  desactiverCopierColler: boolean;
  updatedAt: Date;
}

/** Champs comparés pour la règle « QCM tenté » (tout sauf la fermeture). */
const CHAMPS_FIGES = [
  'randomiserQuestions',
  'randomiserOptions',
  'nbQuestionsTirees',
  'dureeMaxMinutes',
  'dateOuverture',
  'nbTentativesMax',
  'delaiEntreTentatives',
  'blocageSessionsMultiples',
  'affichageResultats',
  'scoreMinValidation',
  'ponderationFormation',
  'proctoringWebcam',
  'desactiverCopierColler',
] as const;

type Valeurs = Omit<ConfigurationVue, 'updatedAt'>;

/** Vue d'une configuration (partagée avec le détail d'un QCM). */
export function versConfigurationVue(c: ConfigurationAntiFraude): ConfigurationVue {
  return {
    randomiserQuestions: c.randomiserQuestions,
    randomiserOptions: c.randomiserOptions,
    nbQuestionsTirees: c.nbQuestionsTirees,
    dureeMaxMinutes: c.dureeMaxMinutes,
    dateOuverture: c.dateOuverture,
    dateFermeture: c.dateFermeture,
    nbTentativesMax: c.nbTentativesMax,
    delaiEntreTentatives: c.delaiEntreTentatives,
    blocageSessionsMultiples: c.blocageSessionsMultiples,
    affichageResultats: c.affichageResultats,
    scoreMinValidation: c.scoreMinValidation,
    ponderationFormation: c.ponderationFormation,
    proctoringWebcam: c.proctoringWebcam,
    desactiverCopierColler: c.desactiverCopierColler,
    updatedAt: c.updatedAt,
  };
}

/**
 * Paramètres anti-fraude d'un QCM (US-QCM-03, DS-12 partie 3, UC2 Formateur).
 *
 * Un QCM a AU PLUS une configuration : chaque enregistrement la remplace en
 * entier. Elle est seulement ENREGISTRÉE ici ; c'est le passage de l'apprenant
 * qui l'applique, côté serveur (démarrage US-QCM-05, randomisation US-QCM-06,
 * minuterie US-QCM-07, notation US-QCM-08).
 */
@Injectable()
export class QcmConfigurationService {
  constructor(
    @InjectRepository(Qcm)
    private readonly qcmRepository: Repository<Qcm>,
    @InjectRepository(ConfigurationAntiFraude)
    private readonly configurationRepository: Repository<ConfigurationAntiFraude>,
    @InjectRepository(QcmQuestion)
    private readonly lienRepository: Repository<QcmQuestion>,
    @InjectRepository(TentativeQcm)
    private readonly tentativeRepository: Repository<TentativeQcm>,
    private readonly formationsService: FormationsService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /**
   * Enregistre (crée ou remplace) la configuration, dans cet ordre :
   *   1. QCM -> 404 ; formation archivée -> 409 ;
   *   2. au moins une question -> sinon 409 (« un QCM contenant des
   *      questions », critère de la story) ;
   *   3. règles croisées -> 400 : ouverture < fermeture, fermeture dans le
   *      futur, fenêtre au moins aussi longue que la durée, tirage ≤ nombre
   *      de questions ;
   *   4. QCM déjà tenté -> seule la date de fermeture peut être REPOUSSÉE ;
   *      toute autre différence -> 409 (règles connues des apprenants
   *      qui ont déjà composé) ;
   *   5. enregistrement ; BROUILLON -> NON_PUBLIE (un QCM publié le reste) ;
   *   6. audit QCM_CONFIGURE avec l'avant / l'après.
   */
  async configurer(
    acteurId: string,
    qcmId: string,
    dto: ConfigurationDto,
    contexte: Contexte,
  ): Promise<ConfigurationVue> {
    const qcm = await this.qcmRepository.findOne({
      where: { id: qcmId },
      relations: { module: true },
    });
    if (!qcm) {
      throw new NotFoundException('QCM introuvable.');
    }
    await this.formationsService.chargerPourEcriture(qcm.module.formationId);

    const nbQuestions = await this.lienRepository.countBy({ qcmId });
    if (nbQuestions === 0) {
      throw new ConflictException(
        'Ajoutez au moins une question avant de configurer les paramètres anti-fraude.',
      );
    }

    const valeurs = this.valider(dto, nbQuestions);
    const existante = await this.configurationRepository.findOne({ where: { qcmId } });

    if ((await this.tentativeRepository.countBy({ qcmId })) > 0) {
      this.verifierModificationApresTentatives(existante, valeurs);
    }

    const avant = existante ? this.valeursDe(existante) : null;
    const enregistree = await this.configurationRepository.save(
      existante
        ? this.configurationRepository.merge(existante, valeurs)
        : this.configurationRepository.create({ qcmId, ...valeurs }),
    );

    const statutAvant = qcm.statut;
    if (qcm.statut === StatutQcm.BROUILLON) {
      await this.qcmRepository.update({ id: qcmId }, { statut: StatutQcm.NON_PUBLIE });
    }

    await this.auditService.record({
      action: 'QCM_CONFIGURE',
      acteur: acteurId,
      cible: qcmId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        avant,
        apres: valeurs,
        statut: {
          avant: statutAvant,
          apres: statutAvant === StatutQcm.BROUILLON ? StatutQcm.NON_PUBLIE : statutAvant,
        },
      },
    });

    return versConfigurationVue(enregistree);
  }

  /**
   * Règles qui croisent plusieurs champs ; renvoie les valeurs normalisées.
   * Exportée pour les tests unitaires.
   */
  valider(dto: ConfigurationDto, nbQuestions: number, maintenant: Date = new Date()): Valeurs {
    const ouverture = new Date(dto.dateOuverture);
    const fermeture = new Date(dto.dateFermeture);
    if (ouverture.getTime() >= fermeture.getTime()) {
      throw new BadRequestException('La date d’ouverture doit précéder la date de fermeture.');
    }
    if (fermeture.getTime() <= maintenant.getTime()) {
      throw new BadRequestException('La date de fermeture doit être dans le futur.');
    }
    const fenetreMinutes = (fermeture.getTime() - ouverture.getTime()) / 60_000;
    if (fenetreMinutes < dto.dureeMaxMinutes) {
      throw new BadRequestException(
        `La fenêtre d’ouverture (${Math.floor(fenetreMinutes)} min) est plus courte que la durée d’une tentative (${dto.dureeMaxMinutes} min).`,
      );
    }
    const nbQuestionsTirees = dto.nbQuestionsTirees ?? null;
    if (nbQuestionsTirees !== null && nbQuestionsTirees > nbQuestions) {
      throw new BadRequestException(
        `Impossible de tirer ${nbQuestionsTirees} questions : le QCM n’en contient que ${nbQuestions}.`,
      );
    }
    return {
      randomiserQuestions: dto.randomiserQuestions,
      randomiserOptions: dto.randomiserOptions,
      nbQuestionsTirees,
      dureeMaxMinutes: dto.dureeMaxMinutes,
      dateOuverture: ouverture,
      dateFermeture: fermeture,
      nbTentativesMax: dto.nbTentativesMax,
      delaiEntreTentatives: dto.delaiEntreTentatives,
      blocageSessionsMultiples: dto.blocageSessionsMultiples,
      affichageResultats: dto.affichageResultats,
      scoreMinValidation: dto.scoreMinValidation,
      ponderationFormation: dto.ponderationFormation,
      proctoringWebcam: dto.proctoringWebcam,
      desactiverCopierColler: dto.desactiverCopierColler,
    };
  }

  // ===================================================================
  //  Helpers privés
  // ===================================================================

  /**
   * QCM déjà tenté : les apprenants ont composé avec ces règles, je n'en
   * change aucune — sauf la fermeture, qui peut être REPOUSSÉE (prolonger une
   * session ne lèse personne). Avancer la fermeture, ou toucher à autre
   * chose, donne 409.
   */
  private verifierModificationApresTentatives(
    existante: ConfigurationAntiFraude | null,
    valeurs: Valeurs,
  ): void {
    const message =
      'Des apprenants ont déjà passé ce QCM : ses paramètres sont figés. Seule la date de fermeture peut être repoussée.';
    if (!existante) {
      throw new ConflictException(message);
    }
    const actuelles = this.valeursDe(existante);
    const differents = CHAMPS_FIGES.filter(
      (champ) => !memeValeur(actuelles[champ], valeurs[champ]),
    );
    const fermetureAvancee =
      valeurs.dateFermeture.getTime() < new Date(existante.dateFermeture).getTime();
    if (differents.length > 0 || fermetureAvancee) {
      throw new ConflictException(message);
    }
  }

  private valeursDe(c: ConfigurationAntiFraude): Valeurs {
    const vue: Partial<ConfigurationVue> = versConfigurationVue(c);
    delete vue.updatedAt;
    return vue as Valeurs;
  }
}

/** Égalité tolérante aux dates (comparées à la milliseconde) et aux nombres. */
function memeValeur(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  return a === b;
}
