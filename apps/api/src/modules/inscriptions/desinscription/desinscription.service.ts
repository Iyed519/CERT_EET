import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';

export const MOTIF_DESINSCRIPTION = 'Désinscription à la demande de l’apprenant.';
export const MESSAGE_PAS_INSCRIT = 'Inscription introuvable pour cet utilisateur.';
export const MESSAGE_DEJA_DESINSCRIT = 'Cette inscription n’est plus active : rien à désinscrire.';

/** US-INSC-03 — Ce que l'apprenant voit AVANT de confirmer. */
export interface ConsequencesDesinscription {
  formation: { id: string; titre: string };
  statut: string;
  possible: boolean;
  tauxAvancement: number;
  tentativesEnCours: number;
  livrablesEnAttente: number;
  certificatsConserves: number;
  consequences: string[];
}

interface Ligne {
  id: string;
  statut: string;
  taux: number;
  titre: string;
  tentatives: number;
  livrables: number;
  certificats: number;
}

/**
 * US-INSC-03 — Se désinscrire d'une formation (UC1 Apprenant, DS-11 P1).
 *
 * - L'apprenant est TOUJOURS celui du jeton ; une formation où il n'est pas
 *   inscrit -> 404 (« inscription non trouvée pour cet utilisateur »).
 * - Conséquences affichées d'abord (GET), puis confirmation explicite.
 * - Désinscription = SUSPENDUE (jamais de suppression) avec le motif
 *   « à la demande de l'apprenant » et lui-même comme auteur ; `UPDATE …
 *   WHERE statut = 'EN_COURS'` : deux demandes simultanées -> une seule passe.
 * - Effets : l'accès à l'espace est retiré (règle US-INSC-04) ; tentatives et
 *   livrables restent en base ; les certificats ne sont pas touchés ; seul un
 *   administrateur peut réactiver (règle US-INSC-01 / US-INSC-02).
 * - Audit INSCRIPTION_DESINSCRITE ; email à chaque formateur affecté (au
 *   mieux, jamais bloquant).
 */
@Injectable()
export class DesinscriptionService {
  private readonly logger = new Logger(DesinscriptionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
  ) {}

  async consequences(
    apprenantId: string,
    formationId: string,
  ): Promise<ConsequencesDesinscription> {
    const l = await this.ligne(apprenantId, formationId);
    const possible = l.statut === 'EN_COURS';
    const consequences = [
      'Vous perdez l’accès aux modules, aux QCM, aux ateliers et aux ressources de la formation.',
      'Votre inscription n’est pas supprimée : seul un administrateur peut la réactiver.',
    ];
    if (l.tentatives > 0) {
      consequences.push(
        `${l.tentatives} tentative(s) de QCM en cours ne pourra(ont) pas être terminée(s) : elle(s) sera(ont) close(s) à l’échéance.`,
      );
    }
    if (l.livrables > 0) {
      consequences.push(
        `${l.livrables} livrable(s) en attente de correction resteront enregistré(s), sans garantie de correction.`,
      );
    }
    consequences.push(
      l.certificats > 0
        ? `Vos ${l.certificats} certificat(s) obtenu(s) restent valides et vérifiables.`
        : 'Aucun certificat n’est concerné.',
    );
    return {
      formation: { id: formationId, titre: l.titre },
      statut: l.statut,
      possible,
      tauxAvancement: l.taux,
      tentativesEnCours: l.tentatives,
      livrablesEnAttente: l.livrables,
      certificatsConserves: l.certificats,
      consequences,
    };
  }

  async desinscrire(
    apprenantId: string,
    formationId: string,
    contexte: { adresseIp: string | null } = { adresseIp: null },
  ): Promise<{ statut: 'SUSPENDUE'; formation: { id: string; titre: string } }> {
    const avant = await this.ligne(apprenantId, formationId);
    const [lignes] = (await this.dataSource.query(
      `UPDATE inscriptions
          SET statut = 'SUSPENDUE', motif_suspension = $2, date_suspension = now(),
              suspendue_par = apprenant_id, updated_at = now()
        WHERE id = $1 AND statut = 'EN_COURS'
      RETURNING id`,
      [avant.id, MOTIF_DESINSCRIPTION],
    )) as [unknown[], number];
    if (lignes.length === 0) throw new ConflictException(MESSAGE_DEJA_DESINSCRIT);
    await this.auditService.record({
      action: 'INSCRIPTION_DESINSCRITE',
      acteur: apprenantId,
      cible: avant.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        formationId,
        avant: avant.statut,
        apres: 'SUSPENDUE',
        tentativesEnCours: avant.tentatives,
        livrablesEnAttente: avant.livrables,
        certificatsConserves: avant.certificats,
      },
    });
    await this.notifierFormateurs(apprenantId, formationId, avant.titre);
    return { statut: 'SUSPENDUE', formation: { id: formationId, titre: avant.titre } };
  }

  private async ligne(apprenantId: string, formationId: string): Promise<Ligne> {
    const [l] = (await this.dataSource.query(
      `SELECT i.id, i.statut::text AS statut, i.taux_avancement::float AS taux, f.titre,
              (SELECT count(*)::int FROM tentatives_qcm t JOIN qcm q ON q.id = t.qcm_id
                 JOIN modules m ON m.id = q.module_id
                WHERE m.formation_id = f.id AND t.apprenant_id = $1 AND t.statut = 'EN_COURS')
                AS tentatives,
              (SELECT count(*)::int FROM livrables lv JOIN ateliers a ON a.id = lv.atelier_id
                 JOIN modules m ON m.id = a.module_id
                WHERE m.formation_id = f.id AND lv.apprenant_id = $1
                  AND lv.statut IN ('SOUMIS', 'EN_CORRECTION')) AS livrables,
              (SELECT count(*)::int FROM certificats c
                WHERE c.formation_id = f.id AND c.apprenant_id = $1 AND c.statut = 'ACTIF')
                AS certificats
         FROM inscriptions i JOIN formations f ON f.id = i.formation_id
        WHERE i.apprenant_id = $1 AND i.formation_id = $2`,
      [apprenantId, formationId],
    )) as Ligne[];
    if (!l) throw new NotFoundException(MESSAGE_PAS_INSCRIT);
    return l;
  }

  private async notifierFormateurs(
    apprenantId: string,
    formationId: string,
    titreFormation: string,
  ): Promise<void> {
    try {
      const [apprenant] = (await this.dataSource.query(
        `SELECT email, prenom, nom FROM users WHERE id = $1`,
        [apprenantId],
      )) as Array<{ email: string; prenom: string | null; nom: string | null }>;
      const formateurs = (await this.dataSource.query(
        `SELECT u.email, u.prenom FROM formation_formateurs ff JOIN users u ON u.id = ff.formateur_id
          WHERE ff.formation_id = $1 AND u.statut = 'ACTIF'`,
        [formationId],
      )) as Array<{ email: string; prenom: string | null }>;
      const nomApprenant =
        [apprenant?.prenom, apprenant?.nom].filter(Boolean).join(' ').trim() ||
        apprenant?.email ||
        '';
      for (const f of formateurs) {
        try {
          await this.mailService.sendDesinscriptionFormateurEmail(f.email, {
            prenomFormateur: f.prenom,
            nomApprenant,
            titreFormation,
          });
        } catch (erreur) {
          const detail = erreur instanceof Error ? erreur.message : String(erreur);
          this.logger.warn(`Email de désinscription non envoyé à ${f.email} : ${detail}`);
        }
      }
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(`Formateurs non notifiés (formation ${formationId}) : ${detail}`);
    }
  }
}
