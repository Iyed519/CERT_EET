import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { ModuleFormation } from '../../../database/entities/module-formation.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { User } from '../../../database/entities/user.entity';
import { StatutSupport } from '../../../database/enums/statut-support.enum';
import { MailService } from '../../../mail/mail.service';
import { StockageService } from '../../../stockage/stockage.service';
import { nomOriginal as nomRecu } from '../../ateliers/livrables/livrables.service';
import { AuditService } from '../../audit/audit.service';
import { FormationsService } from '../../formations/formations.service';
import {
  FOURNISSEUR_EMBEDDINGS,
  FournisseurEmbeddings,
} from '../embeddings/fournisseur-embeddings';
import { ErreurExtraction } from '../extraction/erreur-extraction';
import { extraireTexte } from '../extraction/extraction-texte';
import { FileIaService } from '../file-ia.service';
import { caracteresUtiles, decouper, DECOUPAGE, normaliserTexte } from './decoupage.regles';
import {
  cleStockageSupport,
  ExtensionSupport,
  MESSAGE_SUPPORT_DOUBLON,
  MESSAGE_SUPPORT_INTROUVABLE,
  nomOriginal,
  resumeErreurSupport,
  titreSupport,
  verifierFichierSupport,
  verifierReindexable,
} from './support.regles';

/** Le fichier tel que multer l'a écrit sur le disque. */
export interface FichierSupportTemporaire {
  originalname: string;
  path: string;
  size: number;
}

export interface ContexteSupport {
  adresseIp: string | null;
}

/** Un support, vu par le formateur (liste blanche : jamais la clé de stockage). */
export interface SupportVue {
  id: string;
  moduleId: string;
  titre: string;
  nomOriginal: string;
  extension: string;
  tailleOctets: number;
  sha256: string;
  statut: StatutSupport;
  nbSegments: number | null;
  nbCaracteres: number | null;
  modeleEmbeddings: string | null;
  nbTentatives: number;
  /** Motif du dernier échec (message en français), null sinon. */
  derniereErreur: string | null;
  dateDepot: Date;
  dateIndexation: Date | null;
  deposePar: { id: string; prenom: string | null; nom: string | null };
}

/** La fiche d'un support : la vue + un aperçu des premiers passages extraits. */
export interface SupportDetailVue extends SupportVue {
  apercu: Array<{ ordre: number; texte: string }>;
}

export const MESSAGE_STOCKAGE_SUPPORT =
  'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.';
export const MESSAGE_SUPPORT_UTILISE =
  'Ce support a servi à des générations de questions : il ne peut pas être supprimé.';
export const MESSAGE_ECHEC_TRANSITOIRE =
  'Indexation interrompue après plusieurs tentatives (service momentanément indisponible) : relancez-la.';
export const MESSAGE_FILE_INDISPONIBLE = 'La mise en file de l’indexation a échoué : relancez-la.';

const VIOLATION_UNICITE = '23505';
const VIOLATION_CLE_ETRANGERE = '23503';
const TYPES_CONTENU: Record<ExtensionSupport, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
/** Segments insérés par requête (paramètres PostgreSQL : 4 par ligne). */
const LOT_INSERTION = 100;
const APERCU_SEGMENTS = 3;
const APERCU_CARACTERES = 400;

const codePg = (erreur: unknown): string | undefined =>
  erreur instanceof QueryFailedError
    ? (erreur.driverError as { code?: string } | undefined)?.code
    : undefined;

/**
 * Supports pédagogiques de l'assistance IA (US-IA-01, DS-06 partie 1, AC-04).
 *
 * Dépôt (`deposer`, réponse 202) :
 *   1. module existant (404), formation non archivée (409) ;
 *   2. fichier : extension, taille, signature (400 — rien n'est enregistré) ;
 *   3. SHA-256 en flux ; même fichier déjà déposé dans le module -> 409
 *      (contrôle préalable, puis UNIQUE en base pour deux dépôts simultanés) ;
 *   4. envoi sur MinIO (503 si injoignable), PUIS insertion EN_INDEXATION ;
 *      si l'insertion échoue, l'objet est retiré ;
 *   5. audit SUPPORT_DEPOSE ; travail d'indexation en file (si la file est
 *      injoignable : ECHEC_INDEXATION, relançable) ; réponse immédiate.
 *
 * Indexation (`indexer`, worker BullMQ) : sous verrou, le support doit être
 * EN_INDEXATION (sinon rien : idempotent) ; lecture de l'objet, extraction du
 * texte (PDF dans un processus enfant), normalisation, découpage (≈ 512
 * tokens, chevauchement ≈ 50), vectorisation (FournisseurEmbeddings), puis,
 * dans UNE transaction sous verrou : segments remplacés, statut INDEXE ;
 * audit SUPPORT_INDEXE ; email au déposant (au mieux).
 * Un contenu illisible (ErreurExtraction) échoue tout de suite, sans reprise ;
 * une panne passagère est réessayée par BullMQ. Échec définitif :
 * ECHEC_INDEXATION avec un motif en français, audit, email.
 */
@Injectable()
export class SupportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SupportsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly formationsService: FormationsService,
    private readonly stockageService: StockageService,
    private readonly file: FileIaService,
    @Inject(FOURNISSEUR_EMBEDDINGS) private readonly embeddings: FournisseurEmbeddings,
    private readonly mailService: MailService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    this.file.demarrerWorkerIndexation({
      indexer: (id) => this.indexer(id),
      echecDefinitif: (id, erreur) => this.echecDefinitif(id, erreur),
    });
  }

  // ===================================================================
  //  Dépôt, lecture, relance, suppression (formateur affecté / admin)
  // ===================================================================

  async deposer(
    acteurId: string,
    moduleId: string,
    fichier: FichierSupportTemporaire | null,
    titreSaisi: string | undefined,
    contexte: ContexteSupport,
  ): Promise<SupportVue> {
    const module = await this.chargerModule(moduleId);
    await this.formationsService.chargerPourEcriture(module.formationId);

    // multer décode le nom en latin1 : relu en UTF-8 (correctif des livrables).
    const nom = fichier ? nomOriginal(nomRecu(fichier.originalname)) : '';
    const extension = verifierFichierSupport(
      fichier ? { nom, taille: fichier.size, entete: await lireEntete(fichier.path) } : null,
    );
    const chemin = (fichier as FichierSupportTemporaire).path;
    const taille = (fichier as FichierSupportTemporaire).size;
    const sha256 = await sha256Fichier(chemin);
    if (await this.dataSource.manager.existsBy(SupportPedagogique, { moduleId, sha256 })) {
      throw new ConflictException(MESSAGE_SUPPORT_DOUBLON);
    }

    const supportId = randomUUID();
    const cle = cleStockageSupport(moduleId, supportId, extension);
    try {
      await this.stockageService.deposer([
        { cle, chemin, taille, typeContenu: TYPES_CONTENU[extension], sha256 },
      ]);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Dépôt du support impossible (module ${moduleId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_SUPPORT);
    }

    const titre = titreSupport(titreSaisi, nom);
    try {
      await this.dataSource.query(
        `INSERT INTO supports_pedagogiques
           (id, module_id, depose_par, titre, nom_original, extension, taille_octets, sha256,
            cle_stockage, statut, date_depot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'EN_INDEXATION', now())`,
        [supportId, moduleId, acteurId, titre, nom, extension, taille, sha256, cle],
      );
    } catch (erreur) {
      await this.stockageService.supprimer([cle]);
      if (codePg(erreur) === VIOLATION_UNICITE) {
        throw new ConflictException(MESSAGE_SUPPORT_DOUBLON);
      }
      throw erreur;
    }

    await this.auditService.record({
      action: 'SUPPORT_DEPOSE',
      acteur: acteurId,
      cible: supportId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: module.formationId,
        moduleId,
        titre,
        extension,
        tailleOctets: taille,
        sha256,
      },
    });
    await this.mettreEnFile(supportId);
    return this.vue(supportId);
  }

  /** Les supports d'un module, du plus récent au plus ancien. */
  async listerDuModule(moduleId: string): Promise<SupportVue[]> {
    await this.chargerModule(moduleId);
    const supports = await this.dataSource.manager.find(SupportPedagogique, {
      where: { moduleId },
      relations: { deposant: true },
      order: { dateDepot: 'DESC', id: 'ASC' },
    });
    return supports.map(versVue);
  }

  /** La fiche d'un support, avec un aperçu du texte extrait (s'il est indexé). */
  async detail(supportId: string): Promise<SupportDetailVue> {
    const vue = await this.vue(supportId);
    const lignes = (await this.dataSource.query(
      `SELECT ordre, left(texte, $2) AS texte FROM segments_support
        WHERE support_id = $1 ORDER BY ordre LIMIT $3`,
      [supportId, APERCU_CARACTERES, APERCU_SEGMENTS],
    )) as Array<{ ordre: number; texte: string }>;
    return { ...vue, apercu: lignes };
  }

  /** Relance après un échec : sous verrou, ECHEC_INDEXATION -> EN_INDEXATION (409 sinon). */
  async reindexer(
    acteurId: string,
    supportId: string,
    contexte: ContexteSupport,
  ): Promise<SupportVue> {
    const tentatives = await this.dataSource.transaction(async (manager) => {
      const support = await this.verrouiller(manager, supportId);
      verifierReindexable(support.statut);
      await manager.update(
        SupportPedagogique,
        { id: supportId },
        { statut: StatutSupport.EN_INDEXATION, derniereErreur: null },
      );
      return support.nbTentatives;
    });
    await this.auditService.record({
      action: 'SUPPORT_REINDEXATION',
      acteur: acteurId,
      cible: supportId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { tentativesPrecedentes: tentatives },
    });
    // Suffixe = tentatives déjà faites : croissant, donc unique par relance.
    await this.mettreEnFile(supportId, `r${tentatives}`);
    return this.vue(supportId);
  }

  /**
   * Suppression (sous verrou, formation non archivée) : la ligne et ses
   * segments (CASCADE), puis l'objet sur MinIO. Un support qui a servi à une
   * génération (US-IA-02) est refusé en 409. Permise pendant l'indexation :
   * le worker, qui reprend le verrou avant d'écrire, ne trouvera plus rien.
   */
  async supprimer(acteurId: string, supportId: string, contexte: ContexteSupport): Promise<void> {
    let support: SupportPedagogique;
    try {
      support = await this.dataSource.transaction(async (manager) => {
        const s = await this.verrouiller(manager, supportId);
        await manager.delete(SupportPedagogique, { id: supportId });
        return s;
      });
    } catch (erreur) {
      if (codePg(erreur) === VIOLATION_CLE_ETRANGERE) {
        throw new ConflictException(MESSAGE_SUPPORT_UTILISE);
      }
      throw erreur;
    }
    await this.stockageService.supprimer([support.cleStockage]);
    await this.auditService.record({
      action: 'SUPPORT_SUPPRIME',
      acteur: acteurId,
      cible: supportId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        moduleId: support.moduleId,
        titre: support.titre,
        statut: support.statut,
        sha256: support.sha256,
      },
    });
  }

  // ===================================================================
  //  Worker d'indexation
  // ===================================================================

  async indexer(supportId: string): Promise<void> {
    const pris = await this.dataSource.transaction(async (manager) => {
      const support = await manager.findOne(SupportPedagogique, {
        where: { id: supportId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!support || support.statut !== StatutSupport.EN_INDEXATION) return null;
      await manager.update(
        SupportPedagogique,
        { id: supportId },
        { nbTentatives: support.nbTentatives + 1 },
      );
      return support;
    });
    if (!pris) return;

    try {
      const contenu = await this.lireObjet(pris.cleStockage, pris.tailleOctets);
      const texte = normaliserTexte(
        await extraireTexte(pris.extension as ExtensionSupport, contenu),
      );
      if (caracteresUtiles(texte) < DECOUPAGE.caracteresMin) {
        throw new ErreurExtraction(
          'Aucun texte exploitable : le document est peut-être une image numérisée (PDF scanné).',
        );
      }
      const passages = decouper(texte);
      if (passages.length > DECOUPAGE.segmentsMax) {
        throw new ErreurExtraction(
          `Document trop long : ${passages.length} passages (${DECOUPAGE.segmentsMax} au plus). Découpez-le en plusieurs supports.`,
        );
      }
      const vecteurs = await this.embeddings.vectoriser(passages, 'passage');

      const ecrit = await this.dataSource.transaction(async (manager) => {
        const support = await manager.findOne(SupportPedagogique, {
          where: { id: supportId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!support || support.statut !== StatutSupport.EN_INDEXATION) return false;
        await manager.query(`DELETE FROM segments_support WHERE support_id = $1`, [supportId]);
        for (let debut = 0; debut < passages.length; debut += LOT_INSERTION) {
          const lot = passages.slice(debut, debut + LOT_INSERTION);
          const valeurs: unknown[] = [];
          const lignes = lot.map((texteSegment, i) => {
            valeurs.push(
              supportId,
              debut + i + 1,
              texteSegment,
              JSON.stringify(vecteurs[debut + i]),
            );
            const n = i * 4;
            return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}::vector)`;
          });
          await manager.query(
            `INSERT INTO segments_support (support_id, ordre, texte, embedding) VALUES ${lignes.join(', ')}`,
            valeurs,
          );
        }
        await manager.query(
          `UPDATE supports_pedagogiques
              SET statut = 'INDEXE', nb_segments = $2, nb_caracteres = $3,
                  modele_embeddings = $4, date_indexation = now(), derniere_erreur = NULL,
                  updated_at = now()
            WHERE id = $1`,
          [supportId, passages.length, texte.length, this.embeddings.modele],
        );
        return true;
      });
      if (!ecrit) return;

      await this.auditService.record({
        action: 'SUPPORT_INDEXE',
        acteur: null,
        cible: supportId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          nbSegments: passages.length,
          nbCaracteres: texte.length,
          modeleEmbeddings: this.embeddings.modele,
          tentative: pris.nbTentatives + 1,
        },
      });
      await this.notifier(supportId, true, passages.length);
    } catch (erreur) {
      if (erreur instanceof ErreurExtraction) {
        // Le contenu est en cause : BullMQ n'essaie pas une deuxième fois.
        throw new UnrecoverableError(erreur.message);
      }
      throw erreur;
    }
  }

  /** Tentatives épuisées ou contenu illisible : ECHEC_INDEXATION, audit, email. */
  async echecDefinitif(supportId: string, erreur: unknown): Promise<void> {
    const contenuEnCause =
      erreur instanceof UnrecoverableError ||
      (erreur as { name?: string } | null)?.name === 'UnrecoverableError';
    const motif = contenuEnCause ? resumeErreurSupport(erreur) : MESSAGE_ECHEC_TRANSITOIRE;
    const lignes = (await this.dataSource.query(
      `UPDATE supports_pedagogiques
          SET statut = 'ECHEC_INDEXATION', derniere_erreur = $2, updated_at = now()
        WHERE id = $1 AND statut = 'EN_INDEXATION'
        RETURNING id`,
      [supportId, motif],
    )) as [Array<{ id: string }>, number];
    if (lignes[1] === 0) return;
    await this.auditService.record({
      action: 'SUPPORT_ECHEC_INDEXATION',
      acteur: null,
      cible: supportId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { motif, detail: resumeErreurSupport(erreur) },
    });
    await this.notifier(supportId, false, undefined, motif);
  }

  // ===================================================================
  //  Outils
  // ===================================================================

  private async chargerModule(moduleId: string): Promise<ModuleFormation> {
    const module = await this.dataSource.manager.findOne(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true, formationId: true, titre: true },
    });
    if (!module) throw new NotFoundException('Module introuvable.');
    return module;
  }

  /** Verrouille le support (FOR UPDATE), 404 s'il n'existe pas, 409 si la formation est archivée. */
  private async verrouiller(
    manager: EntityManager,
    supportId: string,
  ): Promise<SupportPedagogique> {
    const support = await manager.findOne(SupportPedagogique, {
      where: { id: supportId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!support) throw new NotFoundException(MESSAGE_SUPPORT_INTROUVABLE);
    const module = await manager.findOneOrFail(ModuleFormation, {
      where: { id: support.moduleId },
      select: { id: true, formationId: true },
    });
    await this.formationsService.chargerPourEcriture(module.formationId);
    return support;
  }

  /** Ajoute le travail ; si la file est injoignable, le support passe en échec (relançable). */
  private async mettreEnFile(supportId: string, suffixe?: string): Promise<void> {
    try {
      await this.file.ajouterIndexation(supportId, suffixe);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Mise en file de l'indexation impossible (${supportId}) : ${detail}`);
      await this.dataSource.query(
        `UPDATE supports_pedagogiques
            SET statut = 'ECHEC_INDEXATION', derniere_erreur = $2, updated_at = now()
          WHERE id = $1 AND statut = 'EN_INDEXATION'`,
        [supportId, MESSAGE_FILE_INDISPONIBLE],
      );
    }
  }

  private async vue(supportId: string): Promise<SupportVue> {
    const support = await this.dataSource.manager.findOne(SupportPedagogique, {
      where: { id: supportId },
      relations: { deposant: true },
    });
    if (!support) throw new NotFoundException(MESSAGE_SUPPORT_INTROUVABLE);
    return versVue(support);
  }

  /** Contenu de l'objet, en mémoire (20 Mo au plus, borne vérifiée au dépôt). */
  private async lireObjet(cle: string, tailleAttendue: number): Promise<Buffer> {
    const { flux } = await this.stockageService.lire(cle);
    const morceaux: Buffer[] = [];
    let total = 0;
    for await (const morceau of flux) {
      const tampon = Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau as Uint8Array);
      total += tampon.length;
      if (total > tailleAttendue) {
        flux.destroy();
        throw new ErreurExtraction('Le fichier stocké ne correspond pas au dépôt.');
      }
      morceaux.push(tampon);
    }
    return Buffer.concat(morceaux);
  }

  /** Email au déposant (au mieux : un échec est journalisé, jamais relancé). */
  private async notifier(
    supportId: string,
    reussi: boolean,
    nbSegments?: number,
    motif?: string,
  ): Promise<void> {
    try {
      const support = await this.dataSource.manager.findOne(SupportPedagogique, {
        where: { id: supportId },
        relations: { module: { formation: true } },
      });
      if (!support?.module?.formation) return;
      const deposant = await this.dataSource.manager.findOne(User, {
        where: { id: support.deposePar },
        select: { id: true, prenom: true, email: true },
      });
      if (!deposant) return;
      await this.mailService.sendSupportIndexationEmail(deposant.email, {
        prenom: deposant.prenom,
        titreSupport: support.titre,
        titreFormation: support.module.formation.titre,
        formationId: support.module.formationId,
        reussi,
        nbSegments,
        motif,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Email d'indexation non envoyé (support ${supportId}) : ${detail}`);
    }
  }
}

function versVue(s: SupportPedagogique): SupportVue {
  return {
    id: s.id,
    moduleId: s.moduleId,
    titre: s.titre,
    nomOriginal: s.nomOriginal,
    extension: s.extension,
    tailleOctets: s.tailleOctets,
    sha256: s.sha256,
    statut: s.statut,
    nbSegments: s.nbSegments,
    nbCaracteres: s.nbCaracteres,
    modeleEmbeddings: s.modeleEmbeddings,
    nbTentatives: s.nbTentatives,
    derniereErreur: s.derniereErreur,
    dateDepot: s.dateDepot,
    dateIndexation: s.dateIndexation,
    deposePar: {
      id: s.deposePar,
      prenom: s.deposant?.prenom ?? null,
      nom: s.deposant?.nom ?? null,
    },
  };
}

/** Les 8 premiers Kio du fichier (contrôle de signature). */
async function lireEntete(chemin: string): Promise<Buffer> {
  const fichier = await open(chemin, 'r');
  try {
    const tampon = Buffer.alloc(8192);
    const { bytesRead } = await fichier.read(tampon, 0, tampon.length, 0);
    return tampon.subarray(0, bytesRead);
  } finally {
    await fichier.close();
  }
}

/** SHA-256 hexadécimal du fichier, calculé en flux. */
function sha256Fichier(chemin: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const hash = createHash('sha256');
    createReadStream(chemin)
      .on('data', (morceau) => hash.update(morceau))
      .on('end', () => resoudre(hash.digest('hex')))
      .on('error', rejeter);
  });
}
