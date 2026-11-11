import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { MailConfig } from '../../config/configuration';
import { StatutCompte } from '../../database/enums/statut-compte.enum';
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { JetonsLienService } from './jetons-lien.service';

/** Durée de validité d'un lien de réinitialisation (30 minutes). */
export const REINITIALISATION_DUREE_SECONDES = 30 * 60;
/** Au plus 3 emails de réinitialisation par adresse et par heure (silencieux). */
export const REINITIALISATION_EMAILS_PAR_HEURE = 3;
/** Réponse identique dans tous les cas (anti-énumération). */
export const MESSAGE_DEMANDE_REINITIALISATION =
  'Si un compte actif correspond à cette adresse, un email contenant un lien de réinitialisation vient de lui être envoyé. Le lien est valable 30 minutes.';
export const MESSAGE_LIEN_INVALIDE =
  'Lien de réinitialisation invalide, expiré ou déjà utilisé. Demandez un nouveau lien.';

interface LigneCompte {
  id: string;
  email: string;
  prenom: string | null;
  statut: StatutCompte;
}

/**
 * US-AUTH-06 — Mot de passe oublié.
 *
 * Demande : réponse toujours identique ; seul un compte ACTIF reçoit un lien
 * (jeton à usage unique, 30 min, empreinte seule en base), au plus 3 par
 * heure et par adresse. L'envoi de l'email ne retarde pas la réponse.
 *
 * Réinitialisation : consommation atomique du jeton et mise à jour du mot de
 * passe dans une même transaction (ligne du compte verrouillée), puis
 * révocation de TOUTES les sessions (base + Redis), audit et email.
 */
@Injectable()
export class MotDePasseOublieService {
  private readonly logger = new Logger(MotDePasseOublieService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly jetons: JetonsLienService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async demander(email: string, context: { adresseIp: string | null }): Promise<void> {
    // Même recherche exacte que la connexion (US-AUTH-01).
    const adresse = email.trim();
    const lignes = (await this.dataSource.query(
      `SELECT id, email, prenom, statut FROM users WHERE email = $1`,
      [adresse],
    )) as LigneCompte[];
    const compte = lignes[0];
    if (!compte || compte.statut !== StatutCompte.ACTIF) {
      // Rien n'est écrit pour une adresse inconnue (aucune donnée sur un tiers).
      return;
    }
    if (!(await this.sousLeQuota(adresse))) {
      await this.auditService.record({
        action: 'MDP_RESET_DEMANDE',
        acteur: compte.id,
        adresseIp: context.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { motif: 'Quota horaire de liens atteint' },
      });
      return;
    }
    const jeton = await this.jetons.emettre(
      compte.id,
      'REINITIALISATION_MDP',
      REINITIALISATION_DUREE_SECONDES,
    );
    await this.auditService.record({
      action: 'MDP_RESET_DEMANDE',
      acteur: compte.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
    });
    const { appBaseUrl } = this.configService.getOrThrow<MailConfig>('mail');
    const lien = `${appBaseUrl}/reinitialiser-mot-de-passe?token=${encodeURIComponent(jeton)}`;
    // Pas d'await : la durée de la réponse ne dépend pas de l'envoi SMTP
    // (sinon elle trahirait l'existence du compte).
    void this.mailService
      .sendReinitialisationMotDePasseEmail(compte.email, {
        prenom: compte.prenom,
        lien,
        minutes: REINITIALISATION_DUREE_SECONDES / 60,
      })
      .catch((erreur: unknown) =>
        this.logger.error(
          `Email de réinitialisation non envoyé (${compte.id}) : ${String(erreur)}`,
        ),
      );
  }

  async reinitialiser(
    jeton: string,
    nouveauMotDePasse: string,
    context: { adresseIp: string | null },
  ): Promise<{ sessionsRevoquees: number }> {
    const nouveauHash = await bcrypt.hash(nouveauMotDePasse, 12);
    const compte = await this.dataSource.transaction(async (em) => {
      const userId = await this.jetons.consommer(jeton, 'REINITIALISATION_MDP', em);
      if (!userId) return null;
      const lignes = (await em.query(
        `SELECT id, email, prenom, statut FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      )) as LigneCompte[];
      const ligne = lignes[0];
      if (!ligne || ligne.statut !== StatutCompte.ACTIF) return null;
      await em.query(`UPDATE users SET mot_de_passe_hash = $2, updated_at = now() WHERE id = $1`, [
        ligne.id,
        nouveauHash,
      ]);
      // Les autres liens encore valables de ce compte ne servent plus à rien.
      await em.query(
        `UPDATE jetons_lien_email SET utilise_le = now()
          WHERE user_id = $1 AND objet = 'REINITIALISATION_MDP' AND utilise_le IS NULL`,
        [ligne.id],
      );
      return ligne;
    });
    if (!compte) {
      await this.auditService.record({
        action: 'MDP_RESET',
        acteur: null,
        adresseIp: context.adresseIp,
        resultat: 'Échec',
        detailsAvantApres: { motif: 'Lien invalide, expiré ou déjà utilisé' },
      });
      throw new BadRequestException(MESSAGE_LIEN_INVALIDE);
    }
    const sessionsRevoquees = await this.authService.invalidateUserSessions(compte.id);
    await this.auditService.record({
      action: 'MDP_RESET',
      acteur: compte.id,
      adresseIp: context.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { sessionsRevoquees },
    });
    try {
      await this.mailService.sendMotDePasseModifieEmail(compte.email, { prenom: compte.prenom });
    } catch (erreur) {
      this.logger.error(
        `Email de confirmation de réinitialisation non envoyé (${compte.id}) : ${String(erreur)}`,
      );
    }
    return { sessionsRevoquees };
  }

  /** Quota silencieux par adresse : compteur Redis d'une heure (clé hachée). */
  private async sousLeQuota(adresse: string): Promise<boolean> {
    const cle = `limite:mdp-oublie-email:${crypto.createHash('sha256').update(adresse.toLowerCase()).digest('hex')}`;
    try {
      const { compte } = await this.redisService.incrementer(cle, 3600);
      return compte <= REINITIALISATION_EMAILS_PAR_HEURE;
    } catch (erreur) {
      this.logger.error(`Quota de réinitialisation indisponible (Redis) : ${String(erreur)}`);
      return true;
    }
  }
}
