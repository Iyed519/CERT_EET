import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppConfig, MinuterieConfig } from '../../config/configuration';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { AuditService } from '../audit/audit.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';

/** Ligne clôturée par le balayage (colonnes renvoyées par RETURNING). */
interface LigneCloturee {
  id: string;
  apprenant_id: string;
  qcm_id: string;
  date_limite: Date;
}

/**
 * Balayage des tentatives échues que personne ne touche plus (US-QCM-07,
 * décision D2) : l'apprenant a fermé l'onglet, la tentative resterait
 * EN_COURS indéfiniment. Toutes les `intervalleSecondes`, UNE requête
 * conditionnelle clôture les tentatives EN_COURS dont l'échéance est passée
 * depuis plus de `delaiGraceSecondes` :
 *
 *   UPDATE … SET statut = ABANDONNEE_TIMER, date_fin = date_limite, …
 *   WHERE statut = 'EN_COURS' AND date_limite <= now() - grâce RETURNING …
 *
 * - Sûr avec plusieurs instances de l'API : la condition est réévaluée ligne
 *   par ligne sous verrou par PostgreSQL ; une ligne déjà clôturée (par une
 *   autre instance, une sauvegarde ou une soumission) n'est plus EN_COURS et
 *   n'est pas renvoyée — un seul audit par clôture.
 * - Délai de grâce (D11) : une requête de l'apprenant juste après l'échéance
 *   reçoit elle-même le 409 `temps_ecoule` ; le balayage ne passe qu'ensuite.
 * - Sans dépendance (pas de @nestjs/schedule) : un setInterval, arrêté à
 *   l'arrêt du module, désactivé en test (les tests appellent `balayer()`).
 * - Les clés Redis (`timer:{id}`) des tentatives clôturées sont supprimées.
 */
@Injectable()
export class TentativeBalayageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TentativeBalayageService.name);
  private minuteur: NodeJS.Timeout | null = null;
  private enCours = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly minuterie: TentativeMinuterieService,
  ) {}

  onModuleInit(): void {
    const { nodeEnv } = this.configService.getOrThrow<AppConfig>('app');
    const config = this.configService.getOrThrow<MinuterieConfig>('minuterie');
    if (!config.balayageActif || nodeEnv === 'test') {
      this.logger.log('Balayage des tentatives échues désactivé.');
      return;
    }
    this.minuteur = setInterval(() => void this.tourner(), config.intervalleSecondes * 1000);
    // Le minuteur ne retient pas le processus à l'arrêt.
    this.minuteur.unref();
    this.logger.log(
      `Balayage des tentatives échues toutes les ${config.intervalleSecondes} s ` +
        `(grâce ${config.delaiGraceSecondes} s).`,
    );
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  /**
   * Clôture les tentatives échues depuis plus de `delaiGraceSecondes`
   * (par défaut, celui de la configuration) et renvoie leurs identifiants.
   */
  async balayer(delaiGraceSecondes?: number): Promise<string[]> {
    const grace =
      delaiGraceSecondes ??
      this.configService.getOrThrow<MinuterieConfig>('minuterie').delaiGraceSecondes;
    const resultat = (await this.dataSource.query(
      `UPDATE tentatives_qcm
          SET statut = $1,
              date_fin = date_limite,
              duree_effective = GREATEST(ROUND(EXTRACT(EPOCH FROM (date_limite - date_debut))), 0)::int
        WHERE statut = $2
          AND date_limite <= now() - make_interval(secs => $3)
    RETURNING id, apprenant_id, qcm_id, date_limite`,
      [StatutTentative.ABANDONNEE_TIMER, StatutTentative.EN_COURS, grace],
    )) as [LigneCloturee[], number] | LigneCloturee[];
    // Le pilote PostgreSQL de TypeORM renvoie [lignes, nombre] pour un UPDATE.
    const lignes = Array.isArray(resultat[0])
      ? (resultat[0] as LigneCloturee[])
      : (resultat as LigneCloturee[]);

    for (const ligne of lignes) {
      await this.journaliser(ligne);
      await this.minuterie.effacer(ligne.id);
    }
    return lignes.map((l) => l.id);
  }

  /** Un tour du minuteur : jamais deux balayages en même temps dans une instance. */
  private async tourner(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      const cloturees = await this.balayer();
      if (cloturees.length > 0) {
        this.logger.log(`${cloturees.length} tentative(s) échue(s) clôturée(s).`);
      }
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Balayage des tentatives échues impossible : ${detail}`);
    } finally {
      this.enCours = false;
    }
  }

  /**
   * Clôture faite par le SYSTÈME (D12) : pas d'acteur ; l'apprenant est dans
   * les détails. Audit « au mieux » : la clôture est déjà validée.
   */
  private async journaliser(ligne: LigneCloturee): Promise<void> {
    try {
      await this.auditService.record({
        action: 'TENTATIVE_EXPIREE',
        acteur: null,
        cible: ligne.id,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          apprenantId: ligne.apprenant_id,
          qcmId: ligne.qcm_id,
          statut: { avant: StatutTentative.EN_COURS, apres: StatutTentative.ABANDONNEE_TIMER },
          dateLimite: ligne.date_limite,
          cause: 'balayage',
        },
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Audit TENTATIVE_EXPIREE impossible (cible ${ligne.id}) : ${detail}`);
    }
  }
}
