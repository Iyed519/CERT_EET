import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { IaConfig, LlmConfig } from '../../../config/configuration';
import { ExtractionQuestionsIa } from '../../../database/entities/extraction-questions-ia.entity';
import { QuestionExtraiteIa } from '../../../database/entities/question-extraite-ia.entity';
import { OrigineQuestion } from '../../../database/enums/origine-question.enum';
import { RedisService } from '../../../redis/redis.service';
import { StockageService } from '../../../stockage/stockage.service';
import { nomOriginal as nomRecu } from '../../ateliers/livrables/livrables.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import { QcmService, QuestionValidee, QuestionVue } from '../../qcm/qcm.service';
import { ErreurExtraction } from '../extraction/erreur-extraction';
import { extrairePagesPdf } from '../extraction/extraction-pdf';
import { decoderTexte, texteDocument } from '../extraction/extraction-texte';
import { FileIaService } from '../file-ia.service';
import {
  DemandeExtraction,
  ErreurLlm,
  FOURNISSEUR_LLM,
  FournisseurLlm,
} from '../llm/fournisseur-llm';
import { estModifiee, nettoyerMotif } from '../suggestions/revision.regles';
import {
  AccepterQuestionExtraiteDto,
  RejeterQuestionExtraiteDto,
} from './extraction-questions.dto';
import {
  BORNES_EXTRACTION,
  cleStockageExtraction,
  construireDemandeExtraction,
  estPdfScanne,
  ExtensionExtraction,
  lireCsv,
  lireXlsx,
  MESSAGE_EXTRACTION_EN_COURS,
  MESSAGE_EXTRACTION_INTROUVABLE,
  MESSAGE_PDF_SCANNE_TROP_LONG,
  MESSAGE_QUESTION_EXTRAITE_DECIDEE,
  MESSAGE_QUESTION_EXTRAITE_INTROUVABLE,
  MESSAGE_REPONSE_A_CHOISIR,
  nomFichierExtraction,
  questionDepuisExtraite,
  rendreTableau,
  typeContenuExtraction,
  typeMediaImage,
  validerExtraction,
  verifierFichierExtraction,
  verifierQuotaExtractions,
  verifierRelancable,
} from './extraction-questions.regles';

interface Contexte {
  adresseIp: string | null;
}

/** Le fichier reçu par multer (disque temporaire). */
export interface FichierExtractionTemporaire {
  originalname: string;
  size: number;
  path: string;
}

/** Une extraction, vue par le formateur (liste blanche : jamais la clé de stockage). */
export interface ExtractionVue {
  id: string;
  qcmId: string;
  nomFichier: string;
  format: string;
  tailleOctets: number;
  statut: string;
  modeLecture: string | null;
  tronque: boolean;
  modeleLlm: string | null;
  nbQuestions: number | null;
  nbEcartees: number | null;
  nbTentatives: number;
  derniereErreur: string | null;
  fichierConserve: boolean;
  dateLancement: Date;
  dateFin: Date | null;
  formateur: { id: string; prenom: string | null; nom: string | null };
}

/** Une question extraite, telle que l'expose l'API. */
export interface QuestionExtraiteVue {
  id: string;
  extractionId: string;
  ordre: number;
  enonce: string;
  type: string;
  options: Array<{ texte: string; estCorrecte: boolean }>;
  reponseConnue: boolean;
  explication: string | null;
  niveau: string | null;
  statut: string;
  questionId: string | null;
  decidePar: string | null;
  dateDecision: Date | null;
  motifRejet: string | null;
}

export interface ExtractionDetailVue extends ExtractionVue {
  questions: QuestionExtraiteVue[];
}

export interface AcceptationExtraiteVue {
  questionExtraite: QuestionExtraiteVue;
  question: QuestionVue;
}

export interface ToutAccepterVue {
  acceptees: number;
  ignorees: number;
  extraction: ExtractionDetailVue;
}

export const MESSAGE_STOCKAGE_EXTRACTION =
  'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.';
export const MESSAGE_FILE_EXTRACTION = 'La mise en file de l’extraction a échoué : relancez-la.';
export const MESSAGE_REPONSE_ILLISIBLE_EXTRACTION = 'Réponse du modèle illisible.';
export const MESSAGE_ECHEC_EXTRACTION =
  'Extraction interrompue après plusieurs tentatives (fournisseur d’IA momentanément indisponible) : relancez-la.';

const FENETRE_QUOTA = 3600;
const VIOLATION_UNICITE = '23505';

/** Échec dû au CONTENU ou à la configuration : pas de nouvelle tentative. */
class ErreurDefinitive extends Error {}

/** Lecture du document : texte (ou tableau rendu en texte), ou fichier pour la vision. */
interface DocumentLu {
  mode: 'TEXTE' | 'TABLEAU' | 'VISION';
  texte?: string;
  fichier?: DemandeExtraction['fichier'];
}

/**
 * US-IA-08 — Extraction des questions d'un document par l'IA.
 *
 * Lancement (202) : QCM modifiable (`exigerAjoutPossible`), fichier contrôlé
 * (format, taille, signature — 400 sans appel à l'IA), une extraction active
 * par formateur (409), plafond horaire (429), fichier déposé dans MinIO,
 * extraction EN_ATTENTE, audit, travail dans la file `ia-extraction`.
 *
 * Worker : sous verrou, EN_ATTENTE ou EN_COURS -> EN_COURS (tentative
 * comptée) ; lecture du fichier selon le format ; appel au fournisseur
 * (`extraireQuestions`, JSON imposé) ; validation serveur ; une transaction :
 * questions PROPOSEE remplacées, TERMINEE (0 question = « aucune question
 * trouvée ») ; fichier supprimé ; audit. Échec définitif : ECHEC avec motif,
 * fichier gardé pour la relance.
 *
 * Revue : accepter (telle quelle ou retouchée ; réponse à choisir -> version
 * retouchée obligatoire), rejeter, tout accepter (questions complètes) ;
 * question ajoutée au QCM par les règles de l'éditeur, décision unique.
 */
@Injectable()
export class ExtractionQuestionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExtractionQuestionsService.name);
  private readonly configIa: IaConfig;
  private readonly configLlm: LlmConfig;

  constructor(
    private readonly dataSource: DataSource,
    private readonly qcmService: QcmService,
    private readonly formationsService: FormationsService,
    private readonly stockageService: StockageService,
    private readonly redisService: RedisService,
    private readonly file: FileIaService,
    @Inject(FOURNISSEUR_LLM) private readonly llm: FournisseurLlm,
    configService: ConfigService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {
    this.configIa = configService.getOrThrow<IaConfig>('ia');
    this.configLlm = configService.getOrThrow<LlmConfig>('llm');
  }

  onApplicationBootstrap(): void {
    this.file.demarrerWorkerExtraction({
      extraire: (id) => this.extraire(id),
      echecDefinitif: (id, erreur) => this.echecDefinitif(id, erreur),
    });
  }

  // ===================================================================
  //  Lancement, relance, lecture
  // ===================================================================

  async lancer(
    acteurId: string,
    qcmId: string,
    fichier: FichierExtractionTemporaire | null,
    contexte: Contexte,
  ): Promise<ExtractionVue> {
    const qcm = await this.qcmService.exigerAjoutPossible(qcmId);
    const nom = fichier ? nomFichierExtraction(nomRecu(fichier.originalname)) : '';
    const contenu = fichier ? await readFile(fichier.path) : Buffer.alloc(0);
    const extension = verifierFichierExtraction(
      fichier ? { nom, taille: fichier.size, contenu } : null,
    );
    if (await this.aUneExtractionActive(acteurId)) {
      throw new ConflictException(MESSAGE_EXTRACTION_EN_COURS);
    }
    await this.verifierQuota(acteurId);

    const extractionId = randomUUID();
    const cle = cleStockageExtraction(qcmId, extractionId, extension);
    const sha256 = createHash('sha256').update(contenu).digest('hex');
    try {
      await this.stockageService.deposerTampon(
        cle,
        contenu,
        typeContenuExtraction(extension),
        sha256,
      );
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Dépôt du document impossible (QCM ${qcmId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_EXTRACTION);
    }
    try {
      await this.dataSource.query(
        `INSERT INTO extractions_questions_ia
           (id, qcm_id, formateur_id, nom_fichier, format, taille_octets, sha256, cle_stockage,
            statut, date_lancement)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EN_ATTENTE', now())`,
        [extractionId, qcmId, acteurId, nom, extension, contenu.length, sha256, cle],
      );
    } catch (erreur) {
      await this.stockageService.supprimer([cle]);
      if (codePg(erreur) === VIOLATION_UNICITE) {
        throw new ConflictException(MESSAGE_EXTRACTION_EN_COURS);
      }
      throw erreur;
    }

    await this.auditService.record({
      action: 'QUESTIONS_EXTRACTION_LANCEE',
      acteur: acteurId,
      cible: extractionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: qcm.formationId,
        qcmId,
        nomFichier: nom,
        format: extension,
        tailleOctets: contenu.length,
        sha256,
      },
    });
    await this.mettreEnFile(extractionId);
    return this.vue(extractionId);
  }

  /** Relance d'une extraction en échec (fichier encore conservé). */
  async relancer(
    acteurId: string,
    extractionId: string,
    contexte: Contexte,
  ): Promise<ExtractionVue> {
    const extraction = await this.chargerExtraction(extractionId);
    await this.qcmService.exigerAjoutPossible(extraction.qcmId);
    verifierRelancable(extraction.statut, extraction.cleStockage !== null);
    let nb: number;
    try {
      [, nb] = (await this.dataSource.query(
        `UPDATE extractions_questions_ia
            SET statut = 'EN_ATTENTE', derniere_erreur = NULL, date_fin = NULL,
                date_lancement = now(), updated_at = now()
          WHERE id = $1 AND statut = 'ECHEC' AND cle_stockage IS NOT NULL`,
        [extractionId],
      )) as [unknown, number];
    } catch (erreur) {
      if (codePg(erreur) === VIOLATION_UNICITE) {
        throw new ConflictException(MESSAGE_EXTRACTION_EN_COURS);
      }
      throw erreur;
    }
    if (nb === 0) verifierRelancable('EN_COURS', true);
    await this.auditService.record({
      action: 'QUESTIONS_EXTRACTION_RELANCEE',
      acteur: acteurId,
      cible: extractionId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        qcmId: extraction.qcmId,
        tentativesPrecedentes: extraction.nbTentatives,
      },
    });
    await this.mettreEnFile(extractionId, `r${Date.now()}`);
    return this.vue(extractionId);
  }

  /** Les extractions d'un QCM, plus récentes d'abord (20 au plus). */
  async listerDuQcm(qcmId: string): Promise<ExtractionVue[]> {
    if (!(await this.dataSource.query('SELECT 1 FROM qcm WHERE id = $1', [qcmId])).length) {
      throw new NotFoundException('QCM introuvable.');
    }
    const lignes = await this.dataSource.manager.find(ExtractionQuestionsIa, {
      where: { qcmId },
      relations: { formateur: true },
      order: { dateLancement: 'DESC', id: 'ASC' },
      take: 20,
    });
    return lignes.map(versVue);
  }

  /** Une extraction et ses questions, dans l'ordre du document. */
  async detail(extractionId: string): Promise<ExtractionDetailVue> {
    const vue = await this.vue(extractionId);
    const questions = await this.dataSource.manager.find(QuestionExtraiteIa, {
      where: { extractionId },
      order: { ordre: 'ASC' },
    });
    return { ...vue, questions: questions.map(versQuestionVue) };
  }

  // ===================================================================
  //  Worker
  // ===================================================================

  async extraire(extractionId: string): Promise<void> {
    const prise = await this.dataSource.transaction(async (manager) => {
      const extraction = await manager.findOne(ExtractionQuestionsIa, {
        where: { id: extractionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!extraction || !['EN_ATTENTE', 'EN_COURS'].includes(extraction.statut)) return null;
      await manager.query(
        `UPDATE extractions_questions_ia
            SET statut = 'EN_COURS', nb_tentatives = nb_tentatives + 1, updated_at = now()
          WHERE id = $1`,
        [extractionId],
      );
      return extraction;
    });
    if (!prise) return;

    try {
      if (!prise.cleStockage) throw new ErreurDefinitive('Fichier de l’extraction introuvable.');
      const contenu = await this.lireObjet(prise.cleStockage, prise.tailleOctets);
      const lu = await this.lireDocument(prise.format as ExtensionExtraction, contenu);
      const { demande, tronque } = construireDemandeExtraction({
        nomFichier: prise.nomFichier,
        extension: prise.format as ExtensionExtraction,
        texte: lu.texte,
        fichier: lu.fichier,
        maxCaracteres: this.configLlm.promptMaxCaracteres,
      });
      const brute = await this.llm.extraireQuestions(demande, {
        delaiMs: this.configLlm.delaiMs,
      });
      const resultat = validerExtraction(brute);
      if (!resultat) throw new Error(MESSAGE_REPONSE_ILLISIBLE_EXTRACTION);

      const ecrit = await this.dataSource.transaction(async (manager) => {
        const extraction = await manager.findOne(ExtractionQuestionsIa, {
          where: { id: extractionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!extraction || extraction.statut !== 'EN_COURS') return false;
        await manager.query('DELETE FROM questions_extraites_ia WHERE extraction_id = $1', [
          extractionId,
        ]);
        for (const [i, q] of resultat.valides.entries()) {
          await manager.query(
            `INSERT INTO questions_extraites_ia
               (extraction_id, ordre, enonce, type, options, reponse_connue, explication, niveau)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
            [
              extractionId,
              i + 1,
              q.enonce,
              q.type,
              JSON.stringify(q.options),
              q.reponseConnue,
              q.explication,
              q.niveau,
            ],
          );
        }
        await manager.query(
          `UPDATE extractions_questions_ia
              SET statut = 'TERMINEE', nb_questions = $2, nb_ecartees = $3, modele_llm = $4,
                  mode_lecture = $5, tronque = $6, cle_stockage = NULL, derniere_erreur = NULL,
                  date_fin = now(), updated_at = now()
            WHERE id = $1`,
          [
            extractionId,
            resultat.valides.length,
            resultat.ecartees,
            this.llm.modele,
            lu.mode,
            tronque,
          ],
        );
        return true;
      });
      if (!ecrit) return;

      // Le document n'est plus utile : les questions sont en base.
      await this.stockageService.supprimer([prise.cleStockage]);
      await this.auditService.record({
        action: 'QUESTIONS_EXTRACTION_TERMINEE',
        acteur: null,
        cible: extractionId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          qcmId: prise.qcmId,
          modeleLlm: this.llm.modele,
          modeLecture: lu.mode,
          tronque,
          nbQuestions: resultat.valides.length,
          nbEcartees: resultat.ecartees,
          tentative: prise.nbTentatives + 1,
        },
      });
    } catch (erreur) {
      if (erreur instanceof ErreurDefinitive || erreur instanceof ErreurExtraction) {
        throw new UnrecoverableError(erreur.message);
      }
      if (erreur instanceof ErreurLlm && !erreur.recuperable) {
        throw new UnrecoverableError(erreur.message);
      }
      await this.noterErreur(extractionId, erreur);
      throw erreur;
    }
  }

  /** Tentatives épuisées ou échec définitif : ECHEC avec motif, fichier gardé, audit. */
  async echecDefinitif(extractionId: string, erreur: unknown): Promise<void> {
    const definitif =
      erreur instanceof UnrecoverableError ||
      (erreur as { name?: string } | null)?.name === 'UnrecoverableError';
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    const motif = definitif ? message : MESSAGE_ECHEC_EXTRACTION;
    const [, nb] = (await this.dataSource.query(
      `UPDATE extractions_questions_ia
          SET statut = 'ECHEC', derniere_erreur = left($2, 500), date_fin = now(), updated_at = now()
        WHERE id = $1 AND statut IN ('EN_ATTENTE', 'EN_COURS')`,
      [extractionId, motif],
    )) as [unknown, number];
    if (nb === 0) return;
    await this.auditService.record({
      action: 'QUESTIONS_EXTRACTION_ECHEC',
      acteur: null,
      cible: extractionId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { motif, detail: message.slice(0, 500) },
    });
  }

  // ===================================================================
  //  Revue humaine
  // ===================================================================

  async accepter(
    acteurId: string,
    questionExtraiteId: string,
    dto: AccepterQuestionExtraiteDto,
    contexte: Contexte,
  ): Promise<AcceptationExtraiteVue> {
    const { question, extraction } = await this.chargerQuestion(questionExtraiteId);
    await this.qcmService.exigerAjoutPossible(extraction.qcmId);
    if (!question.reponseConnue && !dto.question) {
      throw new BadRequestException(MESSAGE_REPONSE_A_CHOISIR);
    }
    const proposee = question.reponseConnue
      ? this.qcmService.validerQuestion(questionDepuisExtraite(question))
      : null;
    const saisie = dto.question
      ? this.qcmService.validerQuestion(dto.question)
      : (proposee as QuestionValidee);
    const modifiee = proposee === null || estModifiee(proposee, saisie);
    const questionId = await this.dataSource.transaction((manager) =>
      this.decider(manager, acteurId, questionExtraiteId, extraction.qcmId, saisie, modifiee),
    );
    await this.journaliserAcceptation(
      acteurId,
      questionExtraiteId,
      extraction,
      questionId,
      modifiee,
      saisie,
      proposee,
      contexte,
    );
    return {
      questionExtraite: await this.vueQuestion(questionExtraiteId),
      question: await this.qcmService.vueQuestion(extraction.qcmId, questionId),
    };
  }

  async rejeter(
    acteurId: string,
    questionExtraiteId: string,
    dto: RejeterQuestionExtraiteDto,
    contexte: Contexte,
  ): Promise<QuestionExtraiteVue> {
    const { extraction } = await this.chargerQuestion(questionExtraiteId);
    const [{ formation_id: formationId }] = (await this.dataSource.query(
      'SELECT m.formation_id FROM qcm q JOIN modules m ON m.id = q.module_id WHERE q.id = $1',
      [extraction.qcmId],
    )) as Array<{ formation_id: string }>;
    await this.formationsService.chargerPourEcriture(formationId);
    const motif = nettoyerMotif(dto.motif);
    await this.dataSource.transaction(async (manager) => {
      await this.verrouillerProposee(manager, questionExtraiteId);
      await manager.query(
        `UPDATE questions_extraites_ia
            SET statut = 'REJETEE', motif_rejet = $2, decide_par = $3,
                date_decision = now(), updated_at = now()
          WHERE id = $1`,
        [questionExtraiteId, motif, acteurId],
      );
    });
    await this.auditService.record({
      action: 'QUESTION_EXTRAITE_REJETEE',
      acteur: acteurId,
      cible: questionExtraiteId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { extractionId: extraction.id, qcmId: extraction.qcmId, motif },
    });
    return this.vueQuestion(questionExtraiteId);
  }

  /**
   * Accepte telles quelles toutes les questions COMPLÈTES (réponse connue)
   * encore PROPOSEE, dans l'ordre du document ; une question refusée par les
   * règles de l'éditeur ou décidée entre-temps est ignorée (comptée).
   */
  async toutAccepter(
    acteurId: string,
    extractionId: string,
    contexte: Contexte,
  ): Promise<ToutAccepterVue> {
    const extraction = await this.chargerExtraction(extractionId);
    await this.qcmService.exigerAjoutPossible(extraction.qcmId);
    const candidates = await this.dataSource.manager.find(QuestionExtraiteIa, {
      where: { extractionId, statut: 'PROPOSEE', reponseConnue: true },
      order: { ordre: 'ASC' },
    });
    let acceptees = 0;
    let ignorees = 0;
    for (const q of candidates) {
      try {
        const saisie = this.qcmService.validerQuestion(questionDepuisExtraite(q));
        const questionId = await this.dataSource.transaction((manager) =>
          this.decider(manager, acteurId, q.id, extraction.qcmId, saisie, false),
        );
        await this.journaliserAcceptation(
          acteurId,
          q.id,
          extraction,
          questionId,
          false,
          saisie,
          saisie,
          contexte,
        );
        acceptees += 1;
      } catch (erreur) {
        if (!(erreur instanceof HttpException)) throw erreur;
        ignorees += 1;
      }
    }
    return { acceptees, ignorees, extraction: await this.detail(extractionId) };
  }

  // ===================================================================
  //  Aides
  // ===================================================================

  /** Question ajoutée en fin de QCM et décision écrite, sous le verrou de la question. */
  private async decider(
    manager: EntityManager,
    acteurId: string,
    questionExtraiteId: string,
    qcmId: string,
    saisie: QuestionValidee,
    modifiee: boolean,
  ): Promise<string> {
    await this.verrouillerProposee(manager, questionExtraiteId);
    const id = await this.qcmService.insererQuestionEnFin(
      manager,
      qcmId,
      saisie,
      modifiee ? OrigineQuestion.IA_MODIFIEE : OrigineQuestion.IA,
    );
    await manager.query(
      `UPDATE questions_extraites_ia
          SET statut = $2, question_id = $3, decide_par = $4, date_decision = now(),
              updated_at = now()
        WHERE id = $1`,
      [questionExtraiteId, modifiee ? 'MODIFIEE' : 'ACCEPTEE', id, acteurId],
    );
    return id;
  }

  private async journaliserAcceptation(
    acteurId: string,
    questionExtraiteId: string,
    extraction: ExtractionQuestionsIa,
    questionId: string,
    modifiee: boolean,
    saisie: QuestionValidee,
    proposee: QuestionValidee | null,
    contexte: Contexte,
  ): Promise<void> {
    await this.auditService.record({
      action: 'QUESTION_EXTRAITE_ACCEPTEE',
      acteur: acteurId,
      cible: questionExtraiteId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        extractionId: extraction.id,
        qcmId: extraction.qcmId,
        questionId,
        modifiee,
        ...(modifiee
          ? {
              avant: proposee
                ? {
                    enonce: proposee.enonce,
                    type: proposee.type,
                    nbOptions: proposee.options.length,
                  }
                : { reponseConnue: false },
              apres: { enonce: saisie.enonce, type: saisie.type, nbOptions: saisie.options.length },
            }
          : {}),
      },
    });
  }

  private async verrouillerProposee(manager: EntityManager, id: string): Promise<void> {
    const ligne = await manager.findOne(QuestionExtraiteIa, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
      select: { id: true, statut: true },
    });
    if (!ligne) throw new NotFoundException(MESSAGE_QUESTION_EXTRAITE_INTROUVABLE);
    if (ligne.statut !== 'PROPOSEE') throw new ConflictException(MESSAGE_QUESTION_EXTRAITE_DECIDEE);
  }

  private async chargerQuestion(
    id: string,
  ): Promise<{ question: QuestionExtraiteIa; extraction: ExtractionQuestionsIa }> {
    const question = await this.dataSource.manager.findOne(QuestionExtraiteIa, {
      where: { id },
      relations: { extraction: true },
    });
    if (!question?.extraction) throw new NotFoundException(MESSAGE_QUESTION_EXTRAITE_INTROUVABLE);
    if (question.statut !== 'PROPOSEE') {
      throw new ConflictException(MESSAGE_QUESTION_EXTRAITE_DECIDEE);
    }
    return { question, extraction: question.extraction };
  }

  private async chargerExtraction(id: string): Promise<ExtractionQuestionsIa> {
    const extraction = await this.dataSource.manager.findOne(ExtractionQuestionsIa, {
      where: { id },
    });
    if (!extraction) throw new NotFoundException(MESSAGE_EXTRACTION_INTROUVABLE);
    return extraction;
  }

  private async aUneExtractionActive(formateurId: string): Promise<boolean> {
    const lignes = (await this.dataSource.query(
      `SELECT 1 FROM extractions_questions_ia
        WHERE formateur_id = $1 AND statut IN ('EN_ATTENTE', 'EN_COURS') LIMIT 1`,
      [formateurId],
    )) as unknown[];
    return lignes.length > 0;
  }

  /** Plafond horaire ; Redis injoignable : journalisé, pas de blocage. */
  private async verifierQuota(formateurId: string): Promise<void> {
    let compteur: { compte: number; resteSecondes: number };
    try {
      compteur = await this.redisService.incrementer(
        `limite:ia-extraction:${formateurId}`,
        FENETRE_QUOTA,
      );
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Plafond des extractions non vérifié (Redis) : ${detail}`);
      return;
    }
    verifierQuotaExtractions(
      compteur.compte,
      this.configIa.generationsParHeure,
      compteur.resteSecondes,
    );
  }

  /** File injoignable : ECHEC avec motif (fichier gardé, relance possible). */
  private async mettreEnFile(extractionId: string, suffixe?: string): Promise<void> {
    try {
      await this.file.ajouterExtraction(extractionId, suffixe);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Mise en file de l'extraction impossible (${extractionId}) : ${detail}`);
      await this.dataSource.query(
        `UPDATE extractions_questions_ia
            SET statut = 'ECHEC', derniere_erreur = $2, date_fin = now(), updated_at = now()
          WHERE id = $1 AND statut = 'EN_ATTENTE'`,
        [extractionId, MESSAGE_FILE_EXTRACTION],
      );
    }
  }

  private async noterErreur(extractionId: string, erreur: unknown): Promise<void> {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await this.dataSource.query(
      `UPDATE extractions_questions_ia SET derniere_erreur = left($2, 500), updated_at = now()
        WHERE id = $1 AND statut = 'EN_COURS'`,
      [extractionId, message],
    );
  }

  /** Le document entier (10 Mo au plus) lu depuis MinIO. */
  private async lireObjet(cle: string, tailleAttendue: number): Promise<Buffer> {
    const { flux } = await this.stockageService.lire(cle);
    const morceaux: Buffer[] = [];
    let total = 0;
    for await (const morceau of flux) {
      const tampon = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau as Uint8Array);
      total += tampon.length;
      if (total > Math.max(tailleAttendue, BORNES_EXTRACTION.tailleMaxOctets)) {
        throw new ErreurDefinitive('Fichier stocké plus gros que prévu.');
      }
      morceaux.push(tampon);
    }
    return Buffer.concat(morceaux);
  }

  /** Lecture selon le format (D4) : texte, tableau rendu en texte, ou fichier pour la vision. */
  private async lireDocument(extension: ExtensionExtraction, contenu: Buffer): Promise<DocumentLu> {
    const image = typeMediaImage(extension);
    if (image) {
      return {
        mode: 'VISION',
        fichier: { nature: 'image', typeMedia: image, base64: contenu.toString('base64') },
      };
    }
    switch (extension) {
      case 'pdf': {
        const pages = await extrairePagesPdf(contenu);
        if (!estPdfScanne(pages)) return { mode: 'TEXTE', texte: pages.join('\n\n') };
        if (pages.length > BORNES_EXTRACTION.pagesVisionMax) {
          throw new ErreurDefinitive(MESSAGE_PDF_SCANNE_TROP_LONG);
        }
        return {
          mode: 'VISION',
          fichier: {
            nature: 'document',
            typeMedia: 'application/pdf',
            base64: contenu.toString('base64'),
          },
        };
      }
      case 'docx':
        return { mode: 'TEXTE', texte: texteDocument(contenu) };
      case 'csv':
        return { mode: 'TABLEAU', texte: rendreTableau(lireCsv(contenu)) };
      case 'xlsx':
        return { mode: 'TABLEAU', texte: rendreTableau(lireXlsx(contenu)) };
      default:
        return { mode: 'TEXTE', texte: decoderTexte(contenu).replace(/^﻿/, '') };
    }
  }

  private async vue(extractionId: string): Promise<ExtractionVue> {
    const extraction = await this.dataSource.manager.findOne(ExtractionQuestionsIa, {
      where: { id: extractionId },
      relations: { formateur: true },
    });
    if (!extraction) throw new NotFoundException(MESSAGE_EXTRACTION_INTROUVABLE);
    return versVue(extraction);
  }

  private async vueQuestion(id: string): Promise<QuestionExtraiteVue> {
    return versQuestionVue(
      await this.dataSource.manager.findOneOrFail(QuestionExtraiteIa, { where: { id } }),
    );
  }
}

function codePg(erreur: unknown): string | undefined {
  return erreur instanceof QueryFailedError
    ? (erreur.driverError as { code?: string } | undefined)?.code
    : undefined;
}

function versVue(e: ExtractionQuestionsIa): ExtractionVue {
  return {
    id: e.id,
    qcmId: e.qcmId,
    nomFichier: e.nomFichier,
    format: e.format,
    tailleOctets: e.tailleOctets,
    statut: e.statut,
    modeLecture: e.modeLecture,
    tronque: e.tronque,
    modeleLlm: e.modeleLlm,
    nbQuestions: e.nbQuestions,
    nbEcartees: e.nbEcartees,
    nbTentatives: e.nbTentatives,
    derniereErreur: e.derniereErreur,
    fichierConserve: e.cleStockage !== null,
    dateLancement: e.dateLancement,
    dateFin: e.dateFin,
    formateur: {
      id: e.formateurId,
      prenom: e.formateur?.prenom ?? null,
      nom: e.formateur?.nom ?? null,
    },
  };
}

function versQuestionVue(q: QuestionExtraiteIa): QuestionExtraiteVue {
  return {
    id: q.id,
    extractionId: q.extractionId,
    ordre: q.ordre,
    enonce: q.enonce,
    type: q.type,
    options: q.options,
    reponseConnue: q.reponseConnue,
    explication: q.explication,
    niveau: q.niveau,
    statut: q.statut,
    questionId: q.questionId,
    decidePar: q.decidePar,
    dateDecision: q.dateDecision,
    motifRejet: q.motifRejet,
  };
}
