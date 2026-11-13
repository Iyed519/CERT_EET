import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { LlmConfig } from '../../../config/configuration';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { User } from '../../../database/entities/user.entity';
import { StatutGeneration } from '../../../database/enums/statut-generation.enum';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import {
  FOURNISSEUR_EMBEDDINGS,
  FournisseurEmbeddings,
} from '../embeddings/fournisseur-embeddings';
import { FileIaService } from '../file-ia.service';
import { ErreurLlm, FOURNISSEUR_LLM, FournisseurLlm } from '../llm/fournisseur-llm';
import { NiveauGeneration, TypeGenerable } from './generation.regles';
import {
  construirePrompt,
  PassageContexte,
  passagesDansLaLimite,
  PIPELINE,
  texteRequete,
  validerReponse,
} from './pipeline.regles';
import { estErreurLlm, motifApresTentatives } from '../llm/fournisseur-llm';

export const MESSAGE_AUCUNE_VALIDE =
  'Le modèle n’a proposé aucune question conforme : relancez une génération, éventuellement avec un autre thème.';
export const MESSAGE_REPONSE_ILLISIBLE = 'Réponse du modèle illisible.';
export const MESSAGE_MODELE_EMBEDDINGS =
  'Le support a été indexé avec un autre modèle d’embeddings : réindexez-le avant de générer.';
export const MESSAGE_SUPPORT_SANS_PASSAGE =
  'Le support ne contient plus de passages indexés : réindexez-le avant de générer.';
export const MESSAGE_ECHEC_GENERATION =
  'Génération interrompue après plusieurs tentatives (fournisseur d’IA momentanément indisponible) : relancez-la.';

/** Échec dû au CONTENU ou à la configuration : pas de nouvelle tentative. */
class ErreurDefinitive extends Error {}

/**
 * Pipeline RAG d'une génération (US-IA-03, DS-06 « Pipeline de génération
 * asynchrone », AC-04) — worker de la file `ia-generation`.
 *
 *  1. Sous verrou, la génération doit être EN_COURS (sinon rien :
 *     idempotent) ; tentative comptée.
 *  2. RETRIEVAL : le thème (ou, à défaut, le titre du support) est vectorisé
 *     par le MÊME fournisseur d'embeddings que le support (sinon échec
 *     définitif : réindexer) ; les 8 passages les plus proches en distance
 *     cosinus, UNIQUEMENT parmi ceux du support ciblé (pgvector, `<=>`).
 *  3. AUGMENTED GENERATION : prompt borné (LLM_PROMPT_MAX_CARACTERES), consignes
 *     dans le message système, support dans un bloc de données délimité ;
 *     appel au fournisseur (LLM_DELAI_MS) ; JSON imposé.
 *  4. VALIDATION côté serveur (structure, options, une seule bonne réponse en
 *     QCU / Vrai-Faux…) : les questions non conformes sont comptées, jamais
 *     enregistrées ; aucune conforme -> nouvelle tentative.
 *  5. Une transaction sous verrou : suggestions PROPOSEE remplacées, génération
 *     TERMINEE (compteurs, modèle, fin à l'heure de PostgreSQL). Audit
 *     GENERATION_IA_TERMINEE, email au formateur (au mieux).
 * Échec définitif (configuration, contenu, tentatives épuisées) : ECHEC avec
 * un motif en français, audit GENERATION_IA_ECHEC, email.
 */
@Injectable()
export class PipelineRagService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PipelineRagService.name);
  private readonly config: LlmConfig;

  constructor(
    private readonly dataSource: DataSource,
    private readonly file: FileIaService,
    @Inject(FOURNISSEUR_EMBEDDINGS) private readonly embeddings: FournisseurEmbeddings,
    @Inject(FOURNISSEUR_LLM) private readonly llm: FournisseurLlm,
    private readonly mailService: MailService,
    configService: ConfigService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {
    this.config = configService.getOrThrow<LlmConfig>('llm');
  }

  onApplicationBootstrap(): void {
    this.file.demarrerWorkerGeneration({
      generer: (id) => this.generer(id),
      echecDefinitif: (id, erreur) => this.echecDefinitif(id, erreur),
    });
  }

  async generer(generationId: string): Promise<void> {
    const prise = await this.dataSource.transaction(async (manager) => {
      const generation = await manager.findOne(GenerationIa, {
        where: { id: generationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!generation || generation.statut !== StatutGeneration.EN_COURS) return null;
      await manager.update(
        GenerationIa,
        { id: generationId },
        { nbTentatives: generation.nbTentatives + 1 },
      );
      return generation;
    });
    if (!prise) return;

    try {
      const support = await this.dataSource.manager.findOneOrFail(SupportPedagogique, {
        where: { id: prise.supportId },
      });
      if (support.modeleEmbeddings !== this.embeddings.modele) {
        throw new ErreurDefinitive(MESSAGE_MODELE_EMBEDDINGS);
      }
      const passages = await this.passagesProches(
        support.id,
        texteRequete(prise.focusThematique, support.titre),
      );
      if (passages.length === 0) throw new ErreurDefinitive(MESSAGE_SUPPORT_SANS_PASSAGE);
      const contexte = passagesDansLaLimite(passages, this.config.promptMaxCaracteres);
      const types = prise.typesQuestions as TypeGenerable[];
      const prompt = construirePrompt({
        passages: contexte,
        nbQuestions: prise.nbQuestionsDemandees,
        types,
        niveau: prise.niveau as NiveauGeneration,
        focus: prise.focusThematique,
        titreSupport: support.titre,
      });

      const brute = await this.llm.genererQuestions(prompt, { delaiMs: this.config.delaiMs });
      const resultat = validerReponse(brute, {
        types,
        nbDemandees: prise.nbQuestionsDemandees,
        numerosPassages: new Set(contexte.map((p) => p.numero)),
      });
      if (!resultat) throw new Error(MESSAGE_REPONSE_ILLISIBLE);
      if (resultat.valides.length === 0) {
        // Le hasard du modèle peut mieux faire : nouvelle tentative.
        await this.noterErreur(generationId, MESSAGE_AUCUNE_VALIDE);
        throw new Error(MESSAGE_AUCUNE_VALIDE);
      }

      const ecrit = await this.dataSource.transaction(async (manager) => {
        const generation = await manager.findOne(GenerationIa, {
          where: { id: generationId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!generation || generation.statut !== StatutGeneration.EN_COURS) return false;
        await manager.query('DELETE FROM suggestions_questions_ia WHERE generation_id = $1', [
          generationId,
        ]);
        for (const [i, s] of resultat.valides.entries()) {
          await manager.query(
            `INSERT INTO suggestions_questions_ia
               (generation_id, ordre, enonce, type, options, explication, score_confiance,
                passages_sources, statut)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'PROPOSEE')`,
            [
              generationId,
              i + 1,
              s.enonce,
              s.type,
              JSON.stringify(s.options),
              s.explication,
              s.scoreConfiance,
              s.passagesSources,
            ],
          );
        }
        await manager.query(
          `UPDATE generations_ia
              SET statut = 'TERMINEE', nb_suggestions = $2, nb_invalides = $3, modele_llm = $4,
                  derniere_erreur = NULL, date_fin = now(), updated_at = now()
            WHERE id = $1`,
          [generationId, resultat.valides.length, resultat.invalides, this.llm.modele],
        );
        return true;
      });
      if (!ecrit) return;

      await this.auditService.record({
        action: 'GENERATION_IA_TERMINEE',
        acteur: null,
        cible: generationId,
        adresseIp: null,
        resultat: 'Succès',
        detailsAvantApres: {
          supportId: support.id,
          modeleLlm: this.llm.modele,
          passages: contexte.map((p) => p.numero),
          nbSuggestions: resultat.valides.length,
          nbInvalides: resultat.invalides,
          tentative: prise.nbTentatives + 1,
        },
      });
      await this.notifier(prise, support.titre, true, resultat.valides.length);
    } catch (erreur) {
      if (erreur instanceof ErreurDefinitive) throw new UnrecoverableError(erreur.message);
      if (erreur instanceof ErreurLlm && !erreur.recuperable) {
        throw new UnrecoverableError(erreur.message);
      }
      throw erreur;
    }
  }

  /** Tentatives épuisées ou échec définitif : ECHEC avec motif, audit, email. */
  async echecDefinitif(generationId: string, erreur: unknown): Promise<void> {
    const definitif =
      erreur instanceof UnrecoverableError ||
      (erreur as { name?: string } | null)?.name === 'UnrecoverableError';
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    const motif = definitif
      ? message
      : message === MESSAGE_AUCUNE_VALIDE
        ? MESSAGE_AUCUNE_VALIDE
        : estErreurLlm(erreur)
          ? motifApresTentatives('Génération', message)
          : MESSAGE_ECHEC_GENERATION;
    const [lignes, nb] = (await this.dataSource.query(
      `UPDATE generations_ia
          SET statut = 'ECHEC', derniere_erreur = left($2, 500), date_fin = now(), updated_at = now()
        WHERE id = $1 AND statut = 'EN_COURS'
        RETURNING support_id, formateur_id, module_id`,
      [generationId, motif],
    )) as [Array<{ support_id: string; formateur_id: string; module_id: string }>, number];
    if (nb === 0) return;
    await this.auditService.record({
      action: 'GENERATION_IA_ECHEC',
      acteur: null,
      cible: generationId,
      adresseIp: null,
      resultat: 'Échec',
      detailsAvantApres: { motif, detail: message.slice(0, 500) },
    });
    const generation = await this.dataSource.manager.findOne(GenerationIa, {
      where: { id: generationId },
    });
    const support = await this.dataSource.manager.findOne(SupportPedagogique, {
      where: { id: lignes[0].support_id },
      select: { id: true, titre: true },
    });
    if (generation) await this.notifier(generation, support?.titre ?? '', false, 0, motif);
  }

  /** Les 8 passages du support les plus proches de la requête (distance cosinus). */
  private async passagesProches(supportId: string, requete: string): Promise<PassageContexte[]> {
    const [vecteur] = await this.embeddings.vectoriser([requete], 'requete');
    const lignes = (await this.dataSource.query(
      `SELECT ordre, texte FROM segments_support
        WHERE support_id = $1
        ORDER BY embedding <=> $2::vector, ordre
        LIMIT $3`,
      [supportId, JSON.stringify(vecteur), PIPELINE.passagesMax],
    )) as Array<{ ordre: number; texte: string }>;
    return lignes.map((l) => ({ numero: l.ordre, texte: l.texte }));
  }

  private async noterErreur(generationId: string, message: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE generations_ia SET derniere_erreur = left($2, 500), updated_at = now()
        WHERE id = $1 AND statut = 'EN_COURS'`,
      [generationId, message],
    );
  }

  /** Email au formateur (au mieux). */
  private async notifier(
    generation: GenerationIa,
    titreSupport: string,
    reussie: boolean,
    nbSuggestions: number,
    motif?: string,
  ): Promise<void> {
    try {
      const formateur = await this.dataSource.manager.findOne(User, {
        where: { id: generation.formateurId },
        select: { id: true, prenom: true, email: true },
      });
      const [module] = (await this.dataSource.query(
        'SELECT formation_id FROM modules WHERE id = $1',
        [generation.moduleId],
      )) as Array<{ formation_id: string }>;
      if (!formateur || !module) return;
      await this.mailService.sendGenerationTermineeEmail(formateur.email, {
        prenom: formateur.prenom,
        titreSupport,
        formationId: module.formation_id,
        reussie,
        nbSuggestions,
        motif,
      });
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.error(`Email de fin de génération non envoyé (${generation.id}) : ${detail}`);
    }
  }
}
