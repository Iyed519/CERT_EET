import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AffectationFormateur } from '../../../database/entities/affectation-formateur.entity';
import { Atelier } from '../../../database/entities/atelier.entity';
import { FichierLivrable } from '../../../database/entities/fichier-livrable.entity';
import { Livrable } from '../../../database/entities/livrable.entity';
import { User } from '../../../database/entities/user.entity';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';
import { StatutFormation } from '../../../database/enums/statut-formation.enum';
import { StatutInscription } from '../../../database/enums/statut-inscription.enum';
import { StatutLivrable } from '../../../database/enums/statut-livrable.enum';
import { MailService } from '../../../mail/mail.service';
import { ObjetADeposer, StockageService } from '../../../stockage/stockage.service';
import { AuditService } from '../../audit/audit.service';
import { MESSAGE_FORMATION_ARCHIVEE_PARCOURS } from '../../formations/cycle-formation.regles';
import { ContexteAcces, EspaceFormationService } from '../../inscriptions/espace-formation.service';
import { MESSAGE_ATELIER_INTROUVABLE } from '../ateliers-apprenant.service';
import { AteliersService } from '../ateliers.service';
import { SoumettreLivrableDto } from './soumettre-livrable.dto';
import {
  hashTracabilite,
  MESSAGE_DEJA_SOUMIS,
  nettoyerCommentaire,
  nomPourStockage,
  normaliserLiens,
  verifierDelaiDepot,
  verifierFichiers,
} from './livrable.regles';

/** Un fichier tel que multer l'a écrit sur le disque (stockage temporaire). */
export interface FichierTemporaire {
  originalname: string;
  path: string;
  size: number;
}

/** Le livrable, vu par son auteur (liste blanche : jamais la clé de stockage). */
export interface LivrableVue {
  id: string;
  atelierId: string;
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
}

export const MESSAGE_FORMATION_TERMINEE =
  'Votre formation est terminée : vous ne pouvez plus déposer de livrable.';

export const MESSAGE_STOCKAGE_INDISPONIBLE =
  'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.';

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

/** Type MIME déclaré au stockage (informatif : le contenu a déjà été contrôlé). */
const TYPES_CONTENU: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  json: 'application/json',
};

/**
 * Dépôt d'un livrable par un apprenant (US-ATEL-04, DS-03 partie 1, UC4
 * Apprenant). Ordre :
 *   1. atelier PUBLIÉ (sinon 404, comme la fiche) ;
 *   2. inscription : absente / suspendue -> 403 tracé (règle de « Mon
 *      espace ») ; TERMINEE -> 403 (consultation seulement) ;
 *   3. délai jugé à la RÉCEPTION, heure de PostgreSQL : à l'heure, en retard
 *      (tolérance) ou 409 ;
 *   4. un seul livrable par atelier : déjà soumis -> 409 (le remplacement est
 *      US-ATEL-05) ;
 *   5. fichiers (nombre, extension, taille, signature), commentaire, liens ->
 *      400 ; rien n'est enregistré ;
 *   6. SHA-256 de chaque fichier (en flux), hash de traçabilité ;
 *   7. envoi au stockage (MinIO ; injoignable -> 503), PUIS insertion en base dans une transaction.
 *      Si l'insertion échoue — notamment un dépôt simultané qui a gagné
 *      (UNIQUE, 23505 -> 409) — les objets envoyés sont supprimés ;
 *   8. audit LIVRABLE_SOUMIS, puis email aux formateurs affectés (au mieux :
 *      un échec d'envoi ne remet pas le dépôt en cause).
 * Les fichiers temporaires sont supprimés par l'intercepteur du contrôleur.
 */
@Injectable()
export class LivrablesService {
  private readonly logger = new Logger(LivrablesService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Atelier)
    private readonly atelierRepository: Repository<Atelier>,
    @InjectRepository(Livrable)
    private readonly livrableRepository: Repository<Livrable>,
    private readonly ateliersService: AteliersService,
    private readonly espaceFormationService: EspaceFormationService,
    private readonly stockageService: StockageService,
    private readonly mailService: MailService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  async soumettre(
    apprenantId: string,
    atelierId: string,
    fichiers: FichierTemporaire[],
    dto: SoumettreLivrableDto,
    contexte: ContexteAcces,
  ): Promise<LivrableVue> {
    const atelier = await this.atelierRepository.findOne({
      where: { id: atelierId, statut: StatutAtelier.PUBLIE },
      relations: { module: { formation: true } },
    });
    if (!atelier) {
      throw new NotFoundException(MESSAGE_ATELIER_INTROUVABLE);
    }
    const formation = atelier.module.formation;
    const inscription = await this.espaceFormationService.exigerAccesContenu(
      apprenantId,
      formation.id,
      contexte,
    );
    if (inscription.statut === StatutInscription.TERMINEE) {
      throw new ForbiddenException(MESSAGE_FORMATION_TERMINEE);
    }
    // US-FORM-02 : une formation archivée a un parcours figé.
    if (formation.statut === StatutFormation.ARCHIVEE) {
      throw new ConflictException(MESSAGE_FORMATION_ARCHIVEE_PARCOURS);
    }

    const maintenant = await this.ateliersService.maintenant(this.dataSource.manager);
    const { enRetard } = verifierDelaiDepot(
      atelier.dateLimite,
      atelier.toleranceRetardHeures,
      maintenant,
    );
    if (await this.livrableRepository.existsBy({ atelierId, apprenantId })) {
      throw new ConflictException(MESSAGE_DEJA_SOUMIS);
    }

    const recus = await Promise.all(
      fichiers.map(async (f) => ({
        nom: nomOriginal(f.originalname),
        taille: f.size,
        entete: await lireEntete(f.path),
      })),
    );
    const extensions = verifierFichiers(recus, atelier);
    const commentaire = nettoyerCommentaire(dto.commentaire);
    const liens = normaliserLiens(dto.liens);

    const empreintes = await Promise.all(fichiers.map((f) => sha256Fichier(f.path)));
    const hash = hashTracabilite(empreintes);
    const livrableId = randomUUID();
    const objets: ObjetADeposer[] = fichiers.map((f, i) => ({
      cle: `livrables/${apprenantId}/${atelierId}/${livrableId}/v1/${i + 1}-${nomPourStockage(recus[i].nom)}`,
      chemin: f.path,
      taille: f.size,
      typeContenu: TYPES_CONTENU[extensions[i]] ?? 'application/octet-stream',
      sha256: empreintes[i],
    }));

    try {
      await this.stockageService.deposer(objets);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Dépôt sur le stockage impossible (atelier ${atelierId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_INDISPONIBLE);
    }
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(Livrable, {
          id: livrableId,
          atelierId,
          apprenantId,
          version: 1,
          statut: StatutLivrable.SOUMIS,
          dateSoumission: maintenant,
          enRetard,
          hashTracabilite: hash,
          commentaire,
          liens,
        });
        await manager.insert(
          FichierLivrable,
          objets.map((o, i) => ({
            livrableId,
            ordre: i + 1,
            nomOriginal: recus[i].nom,
            extension: extensions[i],
            tailleOctets: o.taille,
            sha256: o.sha256,
            cleStockage: o.cle,
          })),
        );
      });
    } catch (erreur) {
      await this.stockageService.supprimer(objets.map((o) => o.cle));
      if (
        erreur instanceof QueryFailedError &&
        (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
      ) {
        throw new ConflictException(MESSAGE_DEJA_SOUMIS);
      }
      throw erreur;
    }

    await this.auditService.record({
      action: 'LIVRABLE_SOUMIS',
      acteur: apprenantId,
      cible: livrableId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        atelierId,
        formationId: formation.id,
        version: 1,
        enRetard,
        hashTracabilite: hash,
        nbFichiers: objets.length,
        tailleTotaleOctets: objets.reduce((t, o) => t + o.taille, 0),
      },
    });

    await this.notifierFormateurs(apprenantId, atelier, enRetard);
    return (await this.monLivrable(apprenantId, atelierId)) as LivrableVue;
  }

  /** Le livrable de l'apprenant pour cet atelier (null s'il n'a rien déposé). */
  async monLivrable(apprenantId: string, atelierId: string): Promise<LivrableVue | null> {
    const livrable = await this.livrableRepository.findOne({
      where: { atelierId, apprenantId },
      relations: { fichiers: true },
      order: { fichiers: { ordre: 'ASC' } },
    });
    if (!livrable) return null;
    return {
      id: livrable.id,
      atelierId: livrable.atelierId,
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
    };
  }

  /**
   * Email « nouveau livrable » à chaque formateur affecté à la formation
   * (DS-03 : notifier(formateur)). Au mieux : chaque échec est journalisé,
   * jamais renvoyé à l'apprenant — son dépôt est déjà enregistré.
   */
  private async notifierFormateurs(
    apprenantId: string,
    atelier: Atelier,
    enRetard: boolean,
  ): Promise<void> {
    try {
      const [apprenant, affectations] = await Promise.all([
        this.dataSource.manager.findOne(User, {
          where: { id: apprenantId },
          select: { id: true, nom: true, prenom: true, email: true },
        }),
        this.dataSource.manager.find(AffectationFormateur, {
          where: { formationId: atelier.module.formationId },
          relations: { formateur: true },
        }),
      ]);
      const nomApprenant =
        [apprenant?.prenom, apprenant?.nom].filter(Boolean).join(' ') ||
        apprenant?.email ||
        'Un apprenant';
      for (const a of affectations) {
        try {
          await this.mailService.sendLivrableSoumisEmail(a.formateur.email, {
            prenom: a.formateur.prenom,
            nomApprenant,
            titreAtelier: atelier.titre,
            titreFormation: atelier.module.formation.titre,
            atelierId: atelier.id,
            enRetard,
          });
        } catch (erreur) {
          const detail = erreur instanceof Error ? erreur.message : String(erreur);
          this.logger.error(
            `Email de livrable non envoyé (formateur ${a.formateurId}) : ${detail}`,
          );
        }
      }
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(
        `Notification des formateurs impossible (atelier ${atelier.id}) : ${detail}`,
      );
    }
  }
}

/**
 * multer (busboy) décode le nom de fichier en latin1 : « résumé.pdf » arrive
 * en « rÃ©sumÃ©.pdf ». Je le relis en UTF-8 quand c'est bien de l'UTF-8.
 */
export function nomOriginal(brut: string): string {
  const utf8 = Buffer.from(brut, 'latin1').toString('utf8');
  return utf8.includes('�') ? brut : utf8;
}

/** Les 8 premiers octets d'un fichier (signature du format). */
async function lireEntete(chemin: string): Promise<Buffer> {
  const fichier = await open(chemin, 'r');
  try {
    const tampon = Buffer.alloc(8);
    const { bytesRead } = await fichier.read(tampon, 0, 8, 0);
    return tampon.subarray(0, bytesRead);
  } finally {
    await fichier.close();
  }
}

/** SHA-256 d'un fichier, lu en flux (jamais chargé en mémoire). */
function sha256Fichier(chemin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(chemin)
      .on('error', reject)
      .on('data', (morceau) => hash.update(morceau))
      .on('end', () => resolve(hash.digest('hex')));
  });
}
