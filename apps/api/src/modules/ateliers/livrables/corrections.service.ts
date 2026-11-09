import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Readable } from 'stream';
import { Correction } from '../../../database/entities/correction.entity';
import { Critere } from '../../../database/entities/critere.entity';
import { FichierLivrable } from '../../../database/entities/fichier-livrable.entity';
import { Livrable } from '../../../database/entities/livrable.entity';
import { NoteCritere } from '../../../database/entities/note-critere.entity';
import { StatutCorrection } from '../../../database/enums/statut-correction.enum';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';
import { User } from '../../../database/entities/user.entity';
import { MailService } from '../../../mail/mail.service';
import { StockageService } from '../../../stockage/stockage.service';
import { AuditService } from '../../audit/audit.service';
import { EligibiliteService } from '../../certificats/eligibilite.service';
import { FormationsService } from '../../formations/formations.service';
import { AteliersService } from '../ateliers.service';
import { CritereVue, GrillesService } from '../grille/grilles.service';
import { MESSAGE_STOCKAGE_INDISPONIBLE } from './livrables.service';
import { FinaliserCorrectionDto, NoterCritereDto } from './correction.dto';
import {
  Avancement,
  avancement,
  contribution,
  nettoyerCommentaireGeneral,
  nettoyerCommentaireNote,
  scorePondere,
  verifierComplete,
  verifierNotable,
  verifierOuvrable,
  verifierPoints,
} from './correction.regles';

interface Contexte {
  adresseIp: string | null;
}

/** L'apprenant, vu par le formateur qui corrige (liste blanche). */
export interface ApprenantVue {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
}

/** Une ligne de la liste « Livrables » d'un atelier. */
export interface LivrableResumeVue {
  id: string;
  apprenant: ApprenantVue;
  version: number;
  statut: StatutLivrable;
  dateSoumission: Date;
  enRetard: boolean;
  nbFichiers: number;
  /** null tant que la correction n'est pas ouverte. */
  avancement: Avancement | null;
  /** Score figé à la finalisation (US-ATEL-07) ; null avant. */
  scoreFinal: number | null;
}

/** La note d'un critère, avec sa contribution au score. */
export interface NoteVue {
  critereId: string;
  niveau: number;
  libelleNiveau: string;
  pointsPct: number;
  contribution: number;
  commentaire: string | null;
  updatedAt: Date;
}

/** La correction en cours (ou finalisée) d'un livrable. */
export interface CorrectionVue {
  id: string;
  statut: StatutCorrection;
  dateOuverture: Date;
  correcteur: { id: string; prenom: string | null; nom: string | null };
  notes: NoteVue[];
  scoreActuel: number;
  avancement: Avancement;
  /** US-ATEL-07 : renseignés une fois la correction finalisée (immuables). */
  scoreFinal: number | null;
  commentaireGeneral: string | null;
  dateFinalisation: Date | null;
}

/** Le livrable à corriger, sa grille et sa correction (liste blanche). */
export interface LivrableCorrectionVue {
  id: string;
  atelier: { id: string; titre: string; formationId: string; formationTitre: string };
  apprenant: ApprenantVue;
  version: number;
  statut: StatutLivrable;
  dateSoumission: Date;
  enRetard: boolean;
  hashTracabilite: string;
  commentaire: string | null;
  liens: string[];
  fichiers: Array<{
    ordre: number;
    nomOriginal: string;
    extension: string;
    tailleOctets: number;
    sha256: string;
  }>;
  criteres: CritereVue[];
  correction: CorrectionVue | null;
}

/** Réponse à l'enregistrement d'une note : de quoi rafraîchir le score. */
export interface NoteEnregistreeVue {
  note: NoteVue;
  scoreActuel: number;
  avancement: Avancement;
}

/** Un fichier prêt à être relayé au navigateur. */
export interface FichierTelecharge {
  flux: Readable;
  nomOriginal: string;
  taille: number;
}

export const MESSAGE_LIVRABLE_INTROUVABLE = 'Livrable introuvable.';
export const MESSAGE_CRITERE_INTROUVABLE = 'Critère introuvable dans la grille de cet atelier.';
export const MESSAGE_FICHIER_INTROUVABLE = 'Fichier introuvable pour ce livrable.';

/**
 * Correction d'un livrable, critère par critère (US-ATEL-06, DS-03 partie 2,
 * UC5 Formateur, AC-03). Côté formateur affecté ou administrateur : le
 * contrôleur pose @FormateurDeLaFormation, ce service ne revérifie pas
 * l'affectation.
 *
 *  - Ouvrir : SOUS LE VERROU DE LA LIGNE du livrable (FOR UPDATE), SOUMIS ->
 *    EN_CORRECTION et création de LA correction (heure de PostgreSQL). Deux
 *    ouvertures simultanées : la seconde attend le verrou, relit
 *    EN_CORRECTION et reçoit 409. L'apprenant ne peut plus agir sur un
 *    livrable en correction.
 *  - Noter : sous le même verrou ; livrable EN_CORRECTION exigé (409 sinon) ;
 *    le critère doit appartenir à la grille de l'atelier (404), le niveau
 *    exister et les points tomber dans sa plage (400). La note se remplace
 *    (brouillon) ; la réponse donne le score pondéré recalculé.
 *  - Formation archivée : ouvrir et noter -> 409 (règle des écritures).
 *  - Télécharger : relais en flux depuis le stockage, tracé.
 *  - Finaliser (US-ATEL-07) : correction complète exigée, score figé,
 *    feedback IMMUABLE (garanti aussi par la base), email à l'apprenant, puis
 *    évaluation de l'éligibilité à la certification (US-ATEL-09).
 * Chaque écriture est tracée (CORRECTION_OUVERTE, NOTE_CRITERE_ENREGISTREE,
 * CORRECTION_FINALISEE, LIVRABLE_FICHIER_TELECHARGE) avec son auteur.
 */
@Injectable()
export class CorrectionsService {
  private readonly logger = new Logger(CorrectionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ateliersService: AteliersService,
    private readonly grillesService: GrillesService,
    private readonly formationsService: FormationsService,
    private readonly stockageService: StockageService,
    private readonly mailService: MailService,
    private readonly eligibiliteService: EligibiliteService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  /** Les livrables d'un atelier (premier déposé en tête), filtrables par statut. */
  async listerDeLAtelier(atelierId: string, statut?: StatutLivrable): Promise<LivrableResumeVue[]> {
    const manager = this.dataSource.manager;
    const livrables = await manager.find(Livrable, {
      where: { atelierId, ...(statut ? { statut } : {}) },
      relations: { apprenant: true, fichiers: true },
      order: { dateSoumission: 'ASC', id: 'ASC' },
    });
    if (livrables.length === 0) return [];
    const nbCriteres = (await this.grillesService.criteresDeLAtelier(atelierId)).length;
    const lignes = (await manager.query(
      `SELECT c.livrable_id, count(n.id)::int AS notes, c.score_total::float8 AS score
         FROM corrections c LEFT JOIN notes_criteres n ON n.correction_id = c.id
        WHERE c.livrable_id = ANY($1)
        GROUP BY c.livrable_id, c.score_total`,
      [livrables.map((l) => l.id)],
    )) as Array<{ livrable_id: string; notes: number; score: number | null }>;
    const notesPar = new Map(lignes.map((l) => [l.livrable_id, l.notes]));
    const scorePar = new Map(lignes.map((l) => [l.livrable_id, l.score]));
    return livrables.map((l) => ({
      id: l.id,
      apprenant: apprenantVue(l),
      version: l.version,
      statut: l.statut,
      dateSoumission: l.dateSoumission,
      enRetard: l.enRetard,
      nbFichiers: l.fichiers?.length ?? 0,
      avancement: notesPar.has(l.id) ? avancement(notesPar.get(l.id) ?? 0, nbCriteres) : null,
      scoreFinal: scorePar.get(l.id) ?? null,
    }));
  }

  /** Le livrable, sa grille et sa correction (null si elle n'est pas ouverte). */
  async detail(livrableId: string): Promise<LivrableCorrectionVue> {
    const manager = this.dataSource.manager;
    const livrable = await manager.findOne(Livrable, {
      where: { id: livrableId },
      relations: { apprenant: true, fichiers: true, atelier: { module: { formation: true } } },
      order: { fichiers: { ordre: 'ASC' } },
    });
    if (!livrable || !livrable.atelier) {
      throw new NotFoundException(MESSAGE_LIVRABLE_INTROUVABLE);
    }
    const criteres = await this.grillesService.criteresDeLAtelier(livrable.atelierId);
    const correction = await manager.findOne(Correction, {
      where: { livrableId },
      relations: { correcteur: true, notes: { niveau: true } },
    });
    const atelier = livrable.atelier;
    return {
      id: livrable.id,
      atelier: {
        id: atelier.id,
        titre: atelier.titre,
        formationId: atelier.module.formationId,
        formationTitre: atelier.module.formation.titre,
      },
      apprenant: apprenantVue(livrable),
      version: livrable.version,
      statut: livrable.statut,
      dateSoumission: livrable.dateSoumission,
      enRetard: livrable.enRetard,
      hashTracabilite: livrable.hashTracabilite,
      commentaire: livrable.commentaire,
      liens: livrable.liens,
      fichiers: (livrable.fichiers ?? []).map((f) => ({
        ordre: f.ordre,
        nomOriginal: f.nomOriginal,
        extension: f.extension,
        tailleOctets: f.tailleOctets,
        sha256: f.sha256,
      })),
      criteres,
      correction: correction ? correctionVue(correction, criteres) : null,
    };
  }

  /** SOUMIS -> EN_CORRECTION et création de la correction, sous verrou. */
  async ouvrir(
    acteurId: string,
    livrableId: string,
    contexte: Contexte,
  ): Promise<LivrableCorrectionVue> {
    const { atelierId } = await this.dataSource.transaction(async (manager) => {
      const livrable = await this.verrouiller(manager, livrableId);
      verifierOuvrable(livrable.statut);
      const maintenant = await this.ateliersService.maintenant(manager);
      await manager.update(Livrable, { id: livrable.id }, { statut: StatutLivrable.EN_CORRECTION });
      await manager.insert(Correction, {
        livrableId: livrable.id,
        correcteurId: acteurId,
        statut: StatutCorrection.EN_COURS,
        dateOuverture: maintenant,
      });
      return livrable;
    });

    await this.auditService.record({
      action: 'CORRECTION_OUVERTE',
      acteur: acteurId,
      cible: livrableId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        atelierId,
        avant: { statut: StatutLivrable.SOUMIS },
        apres: { statut: StatutLivrable.EN_CORRECTION },
      },
    });
    return this.detail(livrableId);
  }

  /** Note (ou renote) un critère ; renvoie le score pondéré recalculé. */
  async noterCritere(
    acteurId: string,
    livrableId: string,
    critereId: string,
    dto: NoterCritereDto,
    contexte: Contexte,
  ): Promise<NoteEnregistreeVue> {
    const resultat = await this.dataSource.transaction(async (manager) => {
      const livrable = await this.verrouiller(manager, livrableId);
      verifierNotable(livrable.statut);
      const correction = await manager.findOneOrFail(Correction, {
        where: { livrableId: livrable.id },
      });
      const critere = await manager.findOne(Critere, {
        where: { id: critereId, grille: { atelierId: livrable.atelierId } },
        relations: { niveaux: true },
      });
      if (!critere) {
        throw new NotFoundException(MESSAGE_CRITERE_INTROUVABLE);
      }
      const niveau = verifierPoints(critere.niveaux, dto.niveau, dto.pointsPct);
      const commentaire = nettoyerCommentaireNote(dto.commentaire);

      const existante = await manager.findOne(NoteCritere, {
        where: { correctionId: correction.id, critereId },
        relations: { niveau: true },
      });
      const valeurs = { niveauId: niveau.id, pointsPct: dto.pointsPct, commentaire };
      if (existante) {
        await manager.update(NoteCritere, { id: existante.id }, valeurs);
      } else {
        await manager.insert(NoteCritere, { correctionId: correction.id, critereId, ...valeurs });
      }
      // Score recalculé sur l'état ENREGISTRÉ (dans la transaction).
      const notes = (await manager.query(
        `SELECT n.points_pct::float8 AS points, c.ponderation
           FROM notes_criteres n JOIN criteres c ON c.id = n.critere_id
          WHERE n.correction_id = $1`,
        [correction.id],
      )) as Array<{ points: number; ponderation: number }>;
      const nbCriteres = await manager.count(Critere, {
        where: { grille: { atelierId: livrable.atelierId } },
      });
      const note = await manager.findOneOrFail(NoteCritere, {
        where: { correctionId: correction.id, critereId },
      });
      return {
        atelierId: livrable.atelierId,
        avant: existante
          ? {
              niveau: existante.niveau?.ordre ?? null,
              pointsPct: existante.pointsPct,
              commentaire: existante.commentaire,
            }
          : null,
        vue: {
          note: {
            critereId,
            niveau: niveau.ordre,
            libelleNiveau: niveau.libelle,
            pointsPct: note.pointsPct,
            contribution: contribution(note.pointsPct, critere.ponderation),
            commentaire: note.commentaire,
            updatedAt: note.updatedAt,
          },
          scoreActuel: scorePondere(
            notes.map((n) => ({ pointsPct: Number(n.points), ponderation: n.ponderation })),
          ),
          avancement: avancement(notes.length, nbCriteres),
        } satisfies NoteEnregistreeVue,
      };
    });

    await this.auditService.record({
      action: 'NOTE_CRITERE_ENREGISTREE',
      acteur: acteurId,
      cible: livrableId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        atelierId: resultat.atelierId,
        critereId,
        avant: resultat.avant,
        apres: {
          niveau: resultat.vue.note.niveau,
          pointsPct: resultat.vue.note.pointsPct,
          commentaire: resultat.vue.note.commentaire,
        },
        scoreActuel: resultat.vue.scoreActuel,
      },
    });
    return resultat.vue;
  }

  /**
   * Finalise la correction (US-ATEL-07, DS-03 « Finalisation ») : sous le
   * verrou de la ligne du livrable, EN_CORRECTION exigé (409 sinon : déjà
   * noté = feedback immuable), grille à 100 % et chaque critère noté (400
   * « correction incomplète »), commentaire général obligatoire (400). Le
   * score est figé, la correction passe TERMINEE et le livrable NOTE (heure de
   * PostgreSQL) ; la base refuse ensuite toute modification. Audit
   * CORRECTION_FINALISEE, puis email à l'apprenant (au mieux).
   */
  async finaliser(
    acteurId: string,
    livrableId: string,
    dto: FinaliserCorrectionDto,
    contexte: Contexte,
  ): Promise<LivrableCorrectionVue> {
    const resultat = await this.dataSource.transaction(async (manager) => {
      const livrable = await this.verrouiller(manager, livrableId);
      verifierNotable(livrable.statut);
      const correction = await manager.findOneOrFail(Correction, {
        where: { livrableId: livrable.id },
      });
      const [grille] = (await manager.query(
        `SELECT count(c.id)::int AS nb, coalesce(sum(c.ponderation), 0)::int AS total
           FROM criteres c JOIN grilles g ON g.id = c.grille_id
          WHERE g.atelier_id = $1`,
        [livrable.atelierId],
      )) as Array<{ nb: number; total: number }>;
      const notes = (await manager.query(
        `SELECT n.points_pct::float8 AS points, c.ponderation
           FROM notes_criteres n JOIN criteres c ON c.id = n.critere_id
          WHERE n.correction_id = $1`,
        [correction.id],
      )) as Array<{ points: number; ponderation: number }>;
      verifierComplete(notes.length, grille.nb, grille.total);
      const commentaireGeneral = nettoyerCommentaireGeneral(dto.commentaireGeneral);
      const score = scorePondere(
        notes.map((n) => ({ pointsPct: Number(n.points), ponderation: n.ponderation })),
      );
      const maintenant = await this.ateliersService.maintenant(manager);
      await manager.update(
        Correction,
        { id: correction.id },
        {
          statut: StatutCorrection.TERMINEE,
          scoreTotal: score,
          commentaireGeneral,
          dateFinalisation: maintenant,
        },
      );
      await manager.update(Livrable, { id: livrable.id }, { statut: StatutLivrable.NOTE });
      return { livrable, score, nbCriteres: grille.nb };
    });

    await this.auditService.record({
      action: 'CORRECTION_FINALISEE',
      acteur: acteurId,
      cible: livrableId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        atelierId: resultat.livrable.atelierId,
        apprenantId: resultat.livrable.apprenantId,
        score: resultat.score,
        nbCriteres: resultat.nbCriteres,
        avant: { statut: StatutLivrable.EN_CORRECTION },
        apres: { statut: StatutLivrable.NOTE },
      },
    });
    await this.notifierApprenant(resultat.livrable, resultat.score);
    // US-ATEL-09 : la note acquise peut rendre l'apprenant éligible (au mieux).
    const [{ formation_id: formationId }] = (await this.dataSource.query(
      'SELECT m.formation_id FROM ateliers a JOIN modules m ON m.id = a.module_id WHERE a.id = $1',
      [resultat.livrable.atelierId],
    )) as Array<{ formation_id: string }>;
    await this.eligibiliteService.declencherSansEchec(
      resultat.livrable.apprenantId,
      formationId,
      'CORRECTION_FINALISEE',
    );
    return this.detail(livrableId);
  }

  /**
   * Email « livrable corrigé » à l'apprenant (DS-03 : notifier(apprenant)).
   * Au mieux : un échec est journalisé, la correction reste finalisée.
   */
  private async notifierApprenant(livrable: Livrable, score: number): Promise<void> {
    try {
      const manager = this.dataSource.manager;
      const [apprenant, atelier] = await Promise.all([
        manager.findOneOrFail(User, {
          where: { id: livrable.apprenantId },
          select: { id: true, prenom: true, email: true },
        }),
        manager.findOneOrFail(Livrable, {
          where: { id: livrable.id },
          relations: { atelier: { module: { formation: true } } },
        }),
      ]);
      await this.mailService.sendCorrectionFinaliseeEmail(apprenant.email, {
        prenom: apprenant.prenom,
        titreAtelier: atelier.atelier?.titre ?? '',
        titreFormation: atelier.atelier?.module.formation.titre ?? '',
        atelierId: livrable.atelierId,
        score,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Email de correction non envoyé (livrable ${livrable.id}) : ${detail}`);
    }
  }

  /**
   * Un fichier du livrable, relayé en flux depuis le stockage (tracé). Un
   * stockage injoignable ou un objet manquant -> 503 (le fichier est connu en
   * base : c'est le stockage qui fait défaut).
   */
  async telechargerFichier(
    acteurId: string,
    livrableId: string,
    ordre: number,
    contexte: Contexte,
  ): Promise<FichierTelecharge> {
    const fichier = await this.dataSource.manager.findOne(FichierLivrable, {
      where: { livrableId, ordre },
    });
    if (!fichier) {
      throw new NotFoundException(MESSAGE_FICHIER_INTROUVABLE);
    }
    let flux: Readable;
    try {
      ({ flux } = await this.stockageService.lire(fichier.cleStockage));
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Lecture sur le stockage impossible (livrable ${livrableId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_INDISPONIBLE);
    }
    await this.auditService.record({
      action: 'LIVRABLE_FICHIER_TELECHARGE',
      acteur: acteurId,
      cible: livrableId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { ordre, nomOriginal: fichier.nomOriginal, sha256: fichier.sha256 },
    });
    return { flux, nomOriginal: fichier.nomOriginal, taille: fichier.tailleOctets };
  }

  /**
   * Verrou de LA LIGNE du livrable (FOR UPDATE, sans jointure : PostgreSQL
   * refuse FOR UPDATE du côté nullable d'une jointure externe), puis 409 si sa
   * formation est archivée.
   */
  private async verrouiller(manager: EntityManager, livrableId: string): Promise<Livrable> {
    const livrable = await manager.findOne(Livrable, {
      where: { id: livrableId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!livrable) {
      throw new NotFoundException(MESSAGE_LIVRABLE_INTROUVABLE);
    }
    const [{ formation_id: formationId }] = (await manager.query(
      `SELECT m.formation_id FROM ateliers a JOIN modules m ON m.id = a.module_id WHERE a.id = $1`,
      [livrable.atelierId],
    )) as Array<{ formation_id: string }>;
    await this.formationsService.chargerPourEcriture(formationId);
    return livrable;
  }
}

function apprenantVue(livrable: Livrable): ApprenantVue {
  const a = livrable.apprenant;
  return {
    id: livrable.apprenantId,
    prenom: a?.prenom ?? null,
    nom: a?.nom ?? null,
    email: a?.email ?? '',
  };
}

function correctionVue(correction: Correction, criteres: readonly CritereVue[]): CorrectionVue {
  const ponderations = new Map(criteres.map((c) => [c.id, c.ponderation]));
  const notes: NoteVue[] = (correction.notes ?? [])
    .map((n) => ({
      critereId: n.critereId,
      niveau: n.niveau?.ordre ?? 0,
      libelleNiveau: n.niveau?.libelle ?? '',
      pointsPct: n.pointsPct,
      contribution: contribution(n.pointsPct, ponderations.get(n.critereId) ?? 0),
      commentaire: n.commentaire,
      updatedAt: n.updatedAt,
    }))
    .sort((a, b) => rang(criteres, a.critereId) - rang(criteres, b.critereId));
  return {
    id: correction.id,
    statut: correction.statut,
    dateOuverture: correction.dateOuverture,
    correcteur: {
      id: correction.correcteurId,
      prenom: correction.correcteur?.prenom ?? null,
      nom: correction.correcteur?.nom ?? null,
    },
    notes,
    scoreActuel: scorePondere(
      notes.map((n) => ({
        pointsPct: n.pointsPct,
        ponderation: ponderations.get(n.critereId) ?? 0,
      })),
    ),
    avancement: avancement(notes.length, criteres.length),
    scoreFinal: correction.scoreTotal ?? null,
    commentaireGeneral: correction.commentaireGeneral ?? null,
    dateFinalisation: correction.dateFinalisation ?? null,
  };
}

function rang(criteres: readonly CritereVue[], critereId: string): number {
  return criteres.findIndex((c) => c.id === critereId);
}
