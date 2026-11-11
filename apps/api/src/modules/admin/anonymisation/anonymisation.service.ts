import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Role } from '../../../database/enums/role.enum';
import { StatutCompte } from '../../../database/enums/statut-compte.enum';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../../auth/auth.service';
import { SurveillanceService } from '../../surveillance/surveillance.service';
import {
  emailAnonyme,
  NOM_ANONYMISE,
  retireDernierAdmin,
  TEXTE_ANONYMISE,
} from './anonymisation.regles';

const FAUX_HASH_BCRYPT = '$2a$12$invalidplaceholderhashinvalidplaceholderhash123456789';

interface LigneCible {
  id: string;
  role: Role;
  statut: StatutCompte;
}

/** Vue renvoyée après l'anonymisation (aucune donnée personnelle). */
export interface AnonymisationVue {
  id: string;
  statut: StatutCompte;
  email: string;
  nom: string;
  sessionsRevoquees: number;
}

/**
 * US-CPT-04 — Anonymisation RGPD d'un compte par l'administrateur (droit à
 * l'oubli), IRRÉVERSIBLE.
 *
 *  1. réauthentification de l'administrateur (mot de passe) — échec : 401,
 *     aucune transaction démarrée, tentative journalisée ;
 *  2. transaction : si la cible est administrateur, les administrateurs actifs
 *     sont verrouillés (ordre stable) avant la cible (FOR UPDATE) -> deux
 *     anonymisations croisées ne peuvent pas retirer le dernier ;
 *  3. refus : cible introuvable 404, déjà anonymisée 409, soi-même 403,
 *     dernier administrateur actif 403 ;
 *  4. données personnelles remplacées (identité, email, profil, secrets),
 *     liaisons OAuth et liens email supprimés, traces de connexion (IP,
 *     navigateur) effacées, justifications libres masquées ; statut ANONYMISE ;
 *  5. après COMMIT : toutes les sessions révoquées (base + Redis), captures
 *     webcam supprimées (US-QCM-12), audit COMPTE_ANONYMISE sans donnée
 *     personnelle.
 * Conservés : tentatives, livrables, corrections, certificats (vérifiables,
 * titulaire masqué), journal d'audit.
 */
@Injectable()
export class AnonymisationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
    // US-QCM-12 : les captures webcam (images du visage) sont supprimées.
    private readonly surveillance: SurveillanceService,
  ) {}

  async anonymiser(
    adminId: string,
    cibleId: string,
    motDePasseAdmin: string,
    context: { adresseIp: string | null },
  ): Promise<AnonymisationVue> {
    const [admin] = (await this.dataSource.query(
      `SELECT mot_de_passe_hash FROM users WHERE id = $1`,
      [adminId],
    )) as Array<{ mot_de_passe_hash: string | null }>;
    const ok = await bcrypt.compare(motDePasseAdmin, admin?.mot_de_passe_hash ?? FAUX_HASH_BCRYPT);
    if (!admin || !ok) {
      await this.auditService.record({
        action: 'COMPTE_ANONYMISE',
        acteur: adminId,
        cible: cibleId,
        adresseIp: context.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { motif: 'Mot de passe administrateur invalide' },
      });
      throw new UnauthorizedException('Mot de passe administrateur invalide.');
    }
    if (adminId === cibleId) {
      throw new ForbiddenException('Vous ne pouvez pas anonymiser votre propre compte.');
    }

    const resultat = await this.dataSource.transaction(async (em) => {
      const [apercu] = (await em.query(`SELECT role FROM users WHERE id = $1`, [
        cibleId,
      ])) as Array<{
        role: Role;
      }>;
      if (!apercu) throw new NotFoundException('Utilisateur cible introuvable.');
      let adminsActifs = 0;
      if (apercu.role === Role.ADMINISTRATEUR) {
        const admins = (await em.query(
          `SELECT id FROM users WHERE role = 'ADMINISTRATEUR' AND statut = 'ACTIF' ORDER BY id FOR UPDATE`,
        )) as Array<{ id: string }>;
        adminsActifs = admins.length;
      }
      const [cible] = (await em.query(
        `SELECT id, role, statut FROM users WHERE id = $1 FOR UPDATE`,
        [cibleId],
      )) as LigneCible[];
      if (!cible) throw new NotFoundException('Utilisateur cible introuvable.');
      if (cible.statut === StatutCompte.ANONYMISE) {
        throw new ConflictException('Ce compte est déjà anonymisé.');
      }
      if (cible.role === Role.ADMINISTRATEUR && retireDernierAdmin(cible, adminsActifs)) {
        throw new ForbiddenException('Il doit rester au moins un administrateur actif.');
      }
      const email = emailAnonyme(cible.id);
      await em.query(
        `UPDATE users SET
            email = $2, nom = $3, prenom = NULL, mot_de_passe_hash = NULL,
            mfa_active = false, mfa_secret = NULL, derniere_connexion = NULL,
            date_naissance = NULL, niveau_etudes = NULL, domaine_etudes_id = NULL,
            etablissement_id = NULL, etablissement_autre = NULL,
            statut = 'ANONYMISE', updated_at = now()
          WHERE id = $1`,
        [cible.id, email, NOM_ANONYMISE],
      );
      const oauth = (await em.query(`DELETE FROM comptes_oauth WHERE user_id = $1 RETURNING id`, [
        cible.id,
      ])) as unknown[];
      await em.query(`DELETE FROM jetons_lien_email WHERE user_id = $1`, [cible.id]);
      await em.query(
        `UPDATE refresh_tokens SET adresse_ip = NULL, user_agent = NULL WHERE user_id = $1`,
        [cible.id],
      );
      await em.query(`UPDATE demandes_role SET justification = $2 WHERE user_id = $1`, [
        cible.id,
        TEXTE_ANONYMISE,
      ]);
      return {
        cible,
        email,
        liaisonsOauth: Array.isArray(oauth[0]) ? (oauth[0] as unknown[]).length : oauth.length,
      };
    });

    const sessionsRevoquees = await this.authService.invalidateUserSessions(cibleId);
    const capturesSupprimees = await this.surveillance.purger({ apprenantId: cibleId, acteur: adminId });
    await this.auditService.record({
      action: 'COMPTE_ANONYMISE',
      acteur: adminId,
      cible: cibleId,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: {
        role: resultat.cible.role,
        ancienStatut: resultat.cible.statut,
        sessionsRevoquees,
        liaisonsOauthSupprimees: resultat.liaisonsOauth,
        capturesWebcamSupprimees: capturesSupprimees,
      },
    });
    return {
      id: cibleId,
      statut: StatutCompte.ANONYMISE,
      email: resultat.email,
      nom: NOM_ANONYMISE,
      sessionsRevoquees,
    };
  }
}
