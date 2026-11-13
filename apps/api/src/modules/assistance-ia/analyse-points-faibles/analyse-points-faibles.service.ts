import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { LlmConfig } from '../../../config/configuration';
import {
  FOURNISSEUR_EMBEDDINGS,
  FournisseurEmbeddings,
} from '../embeddings/fournisseur-embeddings';
import { estErreurLlm, FOURNISSEUR_LLM, FournisseurLlm } from '../llm/fournisseur-llm';
import {
  AnalysePointsFaibles,
  construirePromptAnalyse,
  EntreeAnalyse,
  MAX_PASSAGES,
  PassageCours,
  requetePassages,
  ResultatAnalyse,
  validerAnalyse,
} from './analyse-points-faibles.regles';

/** Délai d'un appel, rapport de session (file : rien n'attend). */
export const DELAI_ANALYSE_MAX_MS = 60_000;
/**
 * PDF d'une tentative : la requête HTTP attend la réponse, sous le délai du
 * mandataire (60 s, nginx) -> un seul essai de 45 s au plus (D4).
 */
export const DELAI_ANALYSE_SYNCHRONE_MS = 45_000;

interface ReglageAppel {
  delaiMs: number;
  essaisMax: number;
}

const SESSION: ReglageAppel = { delaiMs: DELAI_ANALYSE_MAX_MS, essaisMax: 2 };
const SYNCHRONE: ReglageAppel = { delaiMs: DELAI_ANALYSE_SYNCHRONE_MS, essaisMax: 1 };

export const MESSAGE_ANALYSE_ERREUR_INATTENDUE =
  'Erreur inattendue pendant l’analyse ; réessayez plus tard.';

/**
 * US-IA-10 — Analyse des points faibles d'un apprenant par le modèle de
 * langage (FOURNISSEUR_LLM), ancrée sur les passages du cours (RAG). Ne lève
 * JAMAIS : un échec devient `{ statut: 'INDISPONIBLE', message }`, affiché
 * dans le rapport (D6).
 */
@Injectable()
export class AnalysePointsFaiblesService {
  private readonly logger = new Logger(AnalysePointsFaiblesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(FOURNISSEUR_LLM) private readonly llm: FournisseurLlm,
    @Inject(FOURNISSEUR_EMBEDDINGS) private readonly embeddings: FournisseurEmbeddings,
  ) {}

  /** Analyse (sans cache) : rapport de session. */
  async analyser(
    entree: Omit<EntreeAnalyse, 'passages'>,
    moduleIds: string[],
    reglage: ReglageAppel = SESSION,
  ): Promise<ResultatAnalyse> {
    const passages = await this.passagesDuCours(moduleIds, requetePassages(entree.questions));
    try {
      const analyse = await this.appeler({ ...entree, passages }, reglage);
      return { statut: 'OK', analyse, source: 'GENEREE' };
    } catch (erreur) {
      return { statut: 'INDISPONIBLE', message: this.message(erreur) };
    }
  }

  /**
   * Analyse d'une tentative notée (figée) : réutilise l'analyse conservée,
   * sinon appelle le modèle et conserve une réussite (D4).
   */
  async pourTentative(
    tentativeId: string,
    entree: Omit<EntreeAnalyse, 'passages'>,
    moduleIds: string[],
  ): Promise<ResultatAnalyse> {
    const [conservee] = (await this.dataSource.query(
      `SELECT contenu FROM analyses_ia_tentatives WHERE tentative_id = $1 AND avec_corrige = $2`,
      [tentativeId, entree.avecCorrige],
    )) as Array<{ contenu: AnalysePointsFaibles }>;
    if (conservee) return { statut: 'OK', analyse: conservee.contenu, source: 'CACHE' };

    const resultat = await this.analyser(entree, moduleIds, SYNCHRONE);
    if (resultat.statut === 'OK') {
      await this.dataSource.query(
        `INSERT INTO analyses_ia_tentatives (tentative_id, avec_corrige, modele, contenu)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [
          tentativeId,
          entree.avecCorrige,
          resultat.analyse.modele,
          JSON.stringify(resultat.analyse),
        ],
      );
    }
    return resultat;
  }

  /** Un appel ; rapport de session : une nouvelle tentative si l'erreur est récupérable. */
  private async appeler(
    entree: EntreeAnalyse,
    reglage: ReglageAppel,
  ): Promise<AnalysePointsFaibles> {
    const prompt = construirePromptAnalyse(entree);
    const numeros = new Set(entree.questions.map((q) => q.numero));
    const delaiMs = Math.min(
      this.configService.get<LlmConfig>('llm')?.delaiMs ?? reglage.delaiMs,
      reglage.delaiMs,
    );
    for (let essai = 1; ; essai++) {
      try {
        const brut = await this.llm.analyserPointsFaibles(prompt, { delaiMs });
        return validerAnalyse(brut, numeros, this.llm.modele);
      } catch (erreur) {
        const recuperable =
          estErreurLlm(erreur) && (erreur as { recuperable?: boolean }).recuperable;
        if (essai >= reglage.essaisMax || !recuperable) throw erreur;
      }
    }
  }

  /** Message affiché : celui du fournisseur (français, sans secret), sinon générique. */
  private message(erreur: unknown): string {
    if (estErreurLlm(erreur)) return (erreur as Error).message;
    this.logger.error(
      `Analyse des points faibles : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
    return MESSAGE_ANALYSE_ERREUR_INATTENDUE;
  }

  /** Passages des supports indexés des modules, les plus proches des erreurs (D2). */
  private async passagesDuCours(moduleIds: string[], requete: string): Promise<PassageCours[]> {
    if (moduleIds.length === 0 || requete.trim() === '') return [];
    try {
      const [vecteur] = await this.embeddings.vectoriser([requete], 'requete');
      const lignes = (await this.dataSource.query(
        `SELECT s.titre AS support, seg.texte
           FROM segments_support seg
           JOIN supports_pedagogiques s ON s.id = seg.support_id
          WHERE s.module_id = ANY($1::uuid[]) AND s.statut = 'INDEXE'
          ORDER BY seg.embedding <=> $2::vector, seg.ordre
          LIMIT $3`,
        [moduleIds, JSON.stringify(vecteur), MAX_PASSAGES],
      )) as PassageCours[];
      return lignes;
    } catch (erreur) {
      // Sans passages, l'analyse reste possible (conseils généraux).
      this.logger.warn(
        `Passages du cours indisponibles : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
      );
      return [];
    }
  }
}
