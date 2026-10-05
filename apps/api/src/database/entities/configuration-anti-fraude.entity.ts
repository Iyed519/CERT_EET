import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AffichageResultats } from '../enums/affichage-resultats.enum';
import { numericTransformer } from '../transformers/numeric.transformer';
import { Qcm } from './qcm.entity';

/**
 * Configuration anti-fraude d'un QCM (US-QCM-03, DS-12 P3 ; table
 * `config_anti_fraude`).
 *
 * Objet de configuration qui regroupe TOUTES les mesures anti-fraude du
 * besoin F1 (forte cohésion, dossier de conception §12). Toutes ces règles
 * sont lues et appliquées par le serveur : le navigateur n'en décide aucune.
 *
 * Je double les validations de DS-12 par des CHECK en base (fenêtre cohérente,
 * durée > 0, seuils dans [0,100], au moins une tentative) : une configuration
 * incohérente ne peut pas exister, même si un service oubliait de valider.
 *
 * Les booléens valent `false` par défaut (aucune mesure activée
 * implicitement) ; les autres paramètres sont obligatoires et viennent de la
 * saisie du formateur.
 */
@Check('CHK_config_anti_fraude_fenetre', '"date_ouverture" < "date_fermeture"')
@Check('CHK_config_anti_fraude_duree', '"duree_max_minutes" > 0')
@Check(
  'CHK_config_anti_fraude_nb_questions_tirees',
  '"nb_questions_tirees" IS NULL OR "nb_questions_tirees" > 0',
)
@Check('CHK_config_anti_fraude_nb_tentatives', '"nb_tentatives_max" >= 1')
@Check('CHK_config_anti_fraude_delai', '"delai_entre_tentatives" >= 0')
@Check(
  'CHK_config_anti_fraude_score_min',
  '"score_min_validation" >= 0 AND "score_min_validation" <= 100',
)
@Check(
  'CHK_config_anti_fraude_ponderation',
  '"ponderation_formation" >= 0 AND "ponderation_formation" <= 100',
)
@Entity('config_anti_fraude')
export class ConfigurationAntiFraude {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unicité : un QCM a AU PLUS une configuration (composition 1-1).
  @Column({ name: 'qcm_id', type: 'uuid', unique: true })
  qcmId: string;

  @OneToOne(() => Qcm, (qcm) => qcm.configuration, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'qcm_id',
    foreignKeyConstraintName: 'FK_config_anti_fraude_qcm',
  })
  qcm: Qcm;

  // --- Randomisation (US-QCM-06) ---
  @Column({ name: 'randomiser_questions', type: 'boolean', default: false })
  randomiserQuestions: boolean;

  @Column({ name: 'randomiser_options', type: 'boolean', default: false })
  randomiserOptions: boolean;

  // Tirage de K questions parmi N ; null = toutes les questions du QCM.
  @Column({ name: 'nb_questions_tirees', type: 'int', nullable: true })
  nbQuestionsTirees: number | null;

  // --- Temps (US-QCM-07) : base de la deadline et du TTL Redis ---
  @Column({ name: 'duree_max_minutes', type: 'int' })
  dureeMaxMinutes: number;

  // --- Fenêtre d'ouverture (US-QCM-04 / US-QCM-05) ---
  @Column({ name: 'date_ouverture', type: 'timestamptz' })
  dateOuverture: Date;

  @Column({ name: 'date_fermeture', type: 'timestamptz' })
  dateFermeture: Date;

  // --- Limitation des tentatives (US-QCM-05 / US-QCM-10) ---
  @Column({ name: 'nb_tentatives_max', type: 'int', default: 1 })
  nbTentativesMax: number;

  // Délai minimal entre deux tentatives, en heures (DS-12).
  @Column({ name: 'delai_entre_tentatives', type: 'int', default: 0 })
  delaiEntreTentatives: number;

  @Column({
    name: 'blocage_sessions_multiples',
    type: 'boolean',
    default: false,
  })
  blocageSessionsMultiples: boolean;

  // --- Résultat (US-QCM-08 / US-QCM-09) ---
  @Column({
    name: 'affichage_resultats',
    type: 'enum',
    enum: AffichageResultats,
  })
  affichageResultats: AffichageResultats;

  // Seuil de réussite de la tentative, en pourcentage (0 à 100).
  @Column({
    name: 'score_min_validation',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  scoreMinValidation: number;

  // Poids du QCM dans la note de la formation, en pourcentage (0 à 100).
  @Column({
    name: 'ponderation_formation',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  ponderationFormation: number;

  // --- Paramètres enregistrés mais sans effet serveur ce sprint ---
  @Column({ name: 'proctoring_webcam', type: 'boolean', default: false })
  proctoringWebcam: boolean;

  @Column({ name: 'desactiver_copier_coller', type: 'boolean', default: false })
  desactiverCopierColler: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
