import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Role } from '../../../database/enums/role.enum';
import { StatutCompte } from '../../../database/enums/statut-compte.enum';
import { AuditService } from '../../audit/audit.service';
import { ActivationComptesService } from '../../auth/activation-comptes.service';
import {
  CompteAImporter,
  ErreurRapport,
  FichierImportInvalide,
  lireFichierComptes,
  validerLignes,
} from './import-comptes.regles';

/** Réponse d'un import réussi. */
export interface RapportImportComptes {
  crees: number;
  comptes: Array<{ ligne: number; id: string; email: string; role: Role }>;
}

/** Corps du refus (400) : rapport ligne par ligne, rien n'a été créé. */
export interface RefusImportComptes {
  statusCode: 400;
  message: string;
  lignesAnalysees: number;
  lignesEnErreur: number;
  erreurs: ErreurRapport[];
}

/** Clé du verrou consultatif qui sérialise les imports (transactionnel). */
const VERROU_IMPORT = 'cert_eet:import-comptes';

/**
 * US-CPT-02 — Import CSV de comptes par l'administrateur, tout ou rien.
 *
 *  1. lecture du fichier (bornes, en-tête, colonnes obligatoires) -> 400 ;
 *  2. transaction, imports sérialisés par un verrou consultatif : comptes
 *     déjà en base relus (adresse sans casse), chaque ligne validée ; la
 *     moindre erreur -> rien n'est écrit, 400 avec le rapport ligne par ligne ;
 *  3. sinon, tous les comptes créés en une instruction (EN_ATTENTE_ACTIVATION,
 *     sans mot de passe) ; une collision tardive (inscription simultanée)
 *     annule tout -> 409 ;
 *  4. après COMMIT : audit COMPTES_IMPORTES + COMPTE_CREE par compte, emails
 *     d'activation mis en file (asynchrones).
 */
@Injectable()
export class ImportComptesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly activations: ActivationComptesService,
  ) {}

  async importer(
    adminId: string,
    fichier: Buffer,
    context: { adresseIp: string | null },
  ): Promise<RapportImportComptes> {
    let lignes;
    try {
      lignes = lireFichierComptes(fichier);
    } catch (erreur) {
      if (erreur instanceof FichierImportInvalide) {
        throw new BadRequestException(erreur.message);
      }
      throw erreur;
    }

    let issue: { erreurs: ErreurRapport[] } | { crees: Array<CompteAImporter & { id: string }> };
    try {
      issue = await this.dataSource.transaction(async (em) => {
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [VERROU_IMPORT]);
        const adresses = lignes.map((l) => l.email).filter((e) => e !== '');
        const existants = new Set(
          (
            (await em.query(
              `SELECT lower(email) AS email FROM users WHERE lower(email) = ANY($1)`,
              [adresses],
            )) as Array<{ email: string }>
          ).map((r) => r.email),
        );
        const { valides, erreurs } = validerLignes(lignes, existants);
        if (erreurs.length > 0) return { erreurs };
        const valeurs: unknown[] = [];
        const tuples = valides.map((c, i) => {
          valeurs.push(c.email, c.nom, c.prenom, c.role);
          const b = i * 4;
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::users_role_enum, '${StatutCompte.EN_ATTENTE_ACTIVATION}'::users_statut_enum, NULL, false)`;
        });
        const crees = (await em.query(
          `INSERT INTO users (email, nom, prenom, role, statut, mot_de_passe_hash, profil_complet)
           VALUES ${tuples.join(', ')} RETURNING id, email`,
          valeurs,
        )) as Array<{ id: string; email: string }>;
        const idParEmail = new Map(crees.map((c) => [c.email, c.id]));
        return { crees: valides.map((c) => ({ ...c, id: idParEmail.get(c.email) as string })) };
      });
    } catch (erreur) {
      if (erreur instanceof QueryFailedError && (erreur as { code?: string }).code === '23505') {
        throw new ConflictException(
          "Un compte a été créé avec l'une de ces adresses pendant l'import : aucun compte n'a été créé, relancez l'import.",
        );
      }
      throw erreur;
    }

    if ('erreurs' in issue) {
      await this.auditService.record({
        action: 'COMPTES_IMPORTES',
        acteur: adminId,
        adresseIp: context.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { lignesAnalysees: lignes.length, lignesEnErreur: issue.erreurs.length },
      });
      const refus: RefusImportComptes = {
        statusCode: 400,
        message: `Import refusé : ${issue.erreurs.length} ligne(s) en erreur sur ${lignes.length}. Aucun compte n'a été créé.`,
        lignesAnalysees: lignes.length,
        lignesEnErreur: issue.erreurs.length,
        erreurs: issue.erreurs,
      };
      throw new BadRequestException(refus);
    }

    const parRole = issue.crees.reduce<Record<string, number>>((acc, c) => {
      acc[c.role] = (acc[c.role] ?? 0) + 1;
      return acc;
    }, {});
    await this.auditService.record({
      action: 'COMPTES_IMPORTES',
      acteur: adminId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { crees: issue.crees.length, parRole },
    });
    for (const c of issue.crees) {
      await this.auditService.record({
        action: 'COMPTE_CREE',
        acteur: adminId,
        cible: c.id,
        adresseIp: context.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: { origine: 'IMPORT_CSV', role: c.role },
      });
    }
    await this.activations.planifier(issue.crees.map((c) => c.id));
    return {
      crees: issue.crees.length,
      comptes: issue.crees.map((c) => ({ ligne: c.ligne, id: c.id, email: c.email, role: c.role })),
    };
  }

  /** Renvoi de l'email d'activation d'un compte importé encore en attente. */
  async renvoyerActivation(
    adminId: string,
    userId: string,
    context: { adresseIp: string | null },
  ): Promise<void> {
    const lignes = (await this.dataSource.query(
      `SELECT statut, mot_de_passe_hash FROM users WHERE id = $1`,
      [userId],
    )) as Array<{ statut: StatutCompte; mot_de_passe_hash: string | null }>;
    if (lignes.length === 0) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    if (lignes[0].statut !== StatutCompte.EN_ATTENTE_ACTIVATION || lignes[0].mot_de_passe_hash) {
      throw new ConflictException(
        "Ce compte n'attend pas d'activation par lien (déjà actif, ou inscrit lui-même).",
      );
    }
    await this.activations.planifier([userId]);
    await this.auditService.record({
      action: 'ACTIVATION_RENVOYEE',
      acteur: adminId,
      cible: userId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
  }
}
