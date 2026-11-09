import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { RessourcesConfig } from '../../config/configuration';
import { ModuleFormation } from '../../database/entities/module-formation.entity';
import { RessourceModule } from '../../database/entities/ressource-module.entity';
import { NatureRessource } from '../../database/enums/nature-ressource.enum';
import { Role } from '../../database/enums/role.enum';
import { RedisService } from '../../redis/redis.service';
import { StockageService } from '../../stockage/stockage.service';
import { nomOriginal as nomRecu } from '../ateliers/livrables/livrables.service';
import { AuditService } from '../audit/audit.service';
import { AutorisationRessourceService } from '../formations/autorisation/autorisation-ressource.service';
import { FormationsService } from '../formations/formations.service';
import { EspaceFormationService } from '../inscriptions/espace-formation.service';
import {
  analyserFichier,
  BORNES_FICHIER,
  cleStockageRessource,
  dispositionContenu,
  MESSAGE_LIEN_EXPIRE,
  MESSAGE_PAS_UN_FICHIER,
  ModeLecture,
  Plage,
  plageDemandee,
} from './fichier-ressource.regles';
import { MESSAGE_RESSOURCE_INTROUVABLE, nettoyerTexte, verifierPlace } from './ressource.regles';
import { RessourceVue, versVueRessource } from './ressources.service';

export interface FichierRessourceTemporaire {
  originalname: string;
  path: string;
  size: number;
}

/** Le lien de lecture remis au navigateur. */
export interface LienLecture {
  url: string;
  expireDansSecondes: number;
}

/** Ce que le contrôleur public renvoie au navigateur. */
export interface FichierServi {
  statut: 200 | 206;
  entetes: Record<string, string>;
  flux: Readable;
}

export const MESSAGE_STOCKAGE_RESSOURCE =
  'Le stockage des fichiers est momentanément indisponible : réessayez dans quelques instants.';
export const MESSAGE_ACCES_FORMATEUR = 'Accès refusé : vous n’êtes pas affecté à cette formation.';
export const PREFIXE_JETON = 'ressource:lien:';

/** Erreur 416 portant la taille (en-tête Content-Range attendu). */
export class PlageInsatisfaisable extends Error {
  constructor(public readonly taille: number) {
    super('Plage demandée hors du fichier.');
  }
}

/**
 * Ressources « fichier » des modules (US-FORM-06, révision v1.5).
 *
 * Dépôt : module (404), formation non archivée (409), fichier contrôlé (400 /
 * 413 ; contenu conforme pour un format lisible), SHA-256 en flux, envoi sur
 * MinIO (503), puis — sous le verrou du module — place disponible (409), rang
 * suivant, INSERT ; un échec retire l'objet. Audit RESSOURCE_AJOUTEE.
 *
 * Lecture : un `<video>` ou un onglet ne peut pas envoyer le jeton d'accès.
 * L'utilisateur authentifié demande donc un LIEN SIGNÉ à durée courte (10 min) :
 * jeton aléatoire de 256 bits conservé dans Redis (ressource + utilisateur),
 * jamais d'URL permanente. Accès : administrateur ; formateur affecté ;
 * apprenant inscrit (EN_COURS ou TERMINEE — refus tracé). La route publique du
 * jeton sert le fichier en flux, avec les plages d'octets (Range -> 206) pour
 * qu'une vidéo démarre vite et se parcoure ; format lisible -> `inline` et son
 * vrai type ; tout le reste -> `attachment` en `application/octet-stream` ;
 * `nosniff` partout.
 */
@Injectable()
export class FichiersRessourcesService {
  private readonly logger = new Logger(FichiersRessourcesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly formationsService: FormationsService,
    private readonly stockageService: StockageService,
    private readonly redisService: RedisService,
    private readonly autorisationService: AutorisationRessourceService,
    private readonly espaceFormationService: EspaceFormationService,
    private readonly configService: ConfigService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  private get tailleMaxOctets(): number {
    return this.configService.getOrThrow<RessourcesConfig>('ressources').tailleMaxMo * 1024 * 1024;
  }

  async deposer(
    acteurId: string,
    moduleId: string,
    fichier: FichierRessourceTemporaire | null,
    saisie: { titre?: string; description?: string },
    contexte: { adresseIp: string | null },
  ): Promise<RessourceVue> {
    const module = await this.dataSource.manager.findOne(ModuleFormation, {
      where: { id: moduleId },
      select: { id: true, formationId: true },
    });
    if (!module) throw new NotFoundException('Module introuvable.');
    await this.formationsService.chargerPourEcriture(module.formationId);

    const analyse = analyserFichier(
      fichier
        ? {
            // multer décode le nom en latin1 : relu en UTF-8 (correctif des livrables).
            nom: nomRecu(fichier.originalname),
            taille: fichier.size,
            entete: await lireEntete(fichier.path),
          }
        : null,
      this.tailleMaxOctets,
    );
    const { path: chemin, size: taille } = fichier as FichierRessourceTemporaire;
    const titre =
      nettoyerTexte(saisie.titre) ??
      nettoyerTexte(
        analyse.extension ? analyse.nom.slice(0, -(analyse.extension.length + 1)) : analyse.nom,
      )?.slice(0, 200) ??
      'Fichier';
    const description = nettoyerTexte(saisie.description);
    const sha256 = await sha256Fichier(chemin);
    const ressourceId = randomUUID();
    const cle = cleStockageRessource(moduleId, ressourceId, analyse.extension);

    try {
      await this.stockageService.deposer([
        { cle, chemin, taille, typeContenu: analyse.typeMime, sha256 },
      ]);
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Dépôt d'une ressource impossible (module ${moduleId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_RESSOURCE);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const verrou = await manager.findOne(ModuleFormation, {
          where: { id: moduleId },
          select: { id: true, formationId: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!verrou) throw new NotFoundException('Module introuvable.');
        await this.formationsService.chargerPourEcriture(verrou.formationId);
        const [{ nb, max }] = (await manager.query(
          `SELECT count(*)::int AS nb, coalesce(max(ordre), 0)::int AS max
             FROM ressources_module WHERE module_id = $1`,
          [moduleId],
        )) as Array<{ nb: number; max: number }>;
        verifierPlace(nb);
        await manager.query(
          `INSERT INTO ressources_module
             (id, module_id, ordre, nature, titre, description, nom_original, extension,
              type_mime, taille_octets, sha256, cle_stockage, lecture, ajoute_par)
           VALUES ($1, $2, $3, 'FICHIER', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            ressourceId,
            moduleId,
            max + 1,
            titre,
            description,
            analyse.nom,
            analyse.extension,
            analyse.typeMime,
            taille,
            sha256,
            cle,
            analyse.lecture,
            acteurId,
          ],
        );
      });
    } catch (erreur) {
      await this.stockageService.supprimer([cle]);
      throw erreur;
    }

    await this.auditService.record({
      action: 'RESSOURCE_AJOUTEE',
      acteur: acteurId,
      cible: ressourceId,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId: module.formationId,
        moduleId,
        nature: NatureRessource.FICHIER,
        titre,
        nomOriginal: analyse.nom,
        tailleOctets: taille,
        sha256,
        lecture: analyse.lecture,
      },
    });
    const ressource = await this.dataSource.manager.findOneOrFail(RessourceModule, {
      where: { id: ressourceId },
    });
    return versVueRessource(ressource);
  }

  /** Lien signé (10 min) vers le fichier, pour un utilisateur autorisé. */
  async lienLecture(
    utilisateur: { id: string; role: Role },
    ressourceId: string,
    contexte: { adresseIp: string | null; methode: string; route: string },
  ): Promise<LienLecture> {
    const ressource = await this.dataSource.manager.findOne(RessourceModule, {
      where: { id: ressourceId },
      relations: { module: true },
      select: { id: true, nature: true, module: { id: true, formationId: true } },
    });
    if (!ressource?.module) throw new NotFoundException(MESSAGE_RESSOURCE_INTROUVABLE);
    const formationId = ressource.module.formationId;
    if (utilisateur.role === Role.FORMATEUR) {
      if (!(await this.autorisationService.estAffecte(formationId, utilisateur.id))) {
        await this.auditService.record({
          action: 'ACCES_RESSOURCE_REFUSE',
          acteur: utilisateur.id,
          cible: formationId,
          adresseIp: contexte.adresseIp,
          resultat: 'Échec',
          detailsAvantApres: {
            ressource: 'ressource',
            ressourceId,
            methode: contexte.methode,
            route: contexte.route,
          },
        });
        throw new ForbiddenException(MESSAGE_ACCES_FORMATEUR);
      }
    } else if (utilisateur.role === Role.APPRENANT) {
      // Non inscrit / suspendu -> 403 tracé ; TERMINEE garde la consultation.
      await this.espaceFormationService.exigerAccesContenu(utilisateur.id, formationId, contexte);
    } else if (utilisateur.role !== Role.ADMINISTRATEUR) {
      throw new ForbiddenException('Accès refusé : rôle insuffisant.');
    }
    if (ressource.nature !== NatureRessource.FICHIER) {
      throw new NotFoundException(MESSAGE_PAS_UN_FICHIER);
    }
    const jeton = randomBytes(32).toString('base64url');
    await this.redisService.set(
      `${PREFIXE_JETON}${jeton}`,
      JSON.stringify({ ressourceId, utilisateurId: utilisateur.id }),
      BORNES_FICHIER.lienSecondes,
    );
    return {
      url: `/api/ressources/fichiers/${jeton}`,
      expireDansSecondes: BORNES_FICHIER.lienSecondes,
    };
  }

  /**
   * Sert le fichier d'un jeton valide (route publique) : 404 uniforme pour un
   * jeton inconnu ou expiré, 416 pour une plage hors du fichier.
   */
  async servir(jeton: string, range: string | undefined): Promise<FichierServi> {
    const valeur = /^[A-Za-z0-9_-]{43}$/.test(jeton)
      ? await this.redisService.get(`${PREFIXE_JETON}${jeton}`)
      : null;
    if (!valeur) throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    const { ressourceId } = JSON.parse(valeur) as { ressourceId: string };
    const ressource = await this.dataSource.manager.findOne(RessourceModule, {
      where: { id: ressourceId, nature: NatureRessource.FICHIER },
    });
    if (!ressource?.cleStockage || ressource.tailleOctets === null) {
      throw new NotFoundException(MESSAGE_LIEN_EXPIRE);
    }
    const taille = ressource.tailleOctets;
    const plage: Plage | null | 'INSATISFAISABLE' = plageDemandee(range, taille);
    if (plage === 'INSATISFAISABLE') throw new PlageInsatisfaisable(taille);
    const lecture = ressource.lecture as ModeLecture | null;
    let flux: Readable;
    try {
      ({ flux } = await this.stockageService.lirePlage(ressource.cleStockage, plage));
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Lecture d'une ressource impossible (${ressourceId}) : ${detail}`);
      throw new ServiceUnavailableException(MESSAGE_STOCKAGE_RESSOURCE);
    }
    const longueur = plage ? plage.fin - plage.debut + 1 : taille;
    return {
      statut: plage ? 206 : 200,
      flux,
      entetes: {
        'Content-Type': lecture ? (ressource.typeMime as string) : 'application/octet-stream',
        'Content-Length': String(longueur),
        'Content-Disposition': dispositionContenu(ressource.nomOriginal as string, lecture),
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=600',
        'Referrer-Policy': 'no-referrer',
        ...(plage ? { 'Content-Range': `bytes ${plage.debut}-${plage.fin}/${taille}` } : {}),
      },
    };
  }
}

async function lireEntete(chemin: string): Promise<Buffer> {
  const fichier = await open(chemin, 'r');
  try {
    const tampon = Buffer.alloc(64);
    const { bytesRead } = await fichier.read(tampon, 0, tampon.length, 0);
    return tampon.subarray(0, bytesRead);
  } finally {
    await fichier.close();
  }
}

function sha256Fichier(chemin: string): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const hash = createHash('sha256');
    createReadStream(chemin)
      .on('data', (m) => hash.update(m))
      .on('end', () => resoudre(hash.digest('hex')))
      .on('error', rejeter);
  });
}
