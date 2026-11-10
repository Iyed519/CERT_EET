import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltreGenerationsDto } from './tracabilite.dto';
import {
  ACTIONS_TRACEES,
  BORNES_TRACABILITE,
  decalage,
  decompte,
  Decisions,
  MESSAGE_GENERATION_INTROUVABLE,
  verifierPeriode,
} from './tracabilite.regles';

interface Personne {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string;
}

/** Une génération dans le registre (administrateur). */
export interface GenerationTracee {
  id: string;
  statut: string;
  dateLancement: Date;
  dateFin: Date | null;
  modeleLlm: string | null;
  /** Paramètres tels que demandés au lancement (US-IA-02). */
  parametres: {
    nbQuestionsDemandees: number;
    types: string[];
    niveau: string;
    focusThematique: string | null;
  };
  nbSuggestions: number | null;
  nbInvalides: number | null;
  nbTentatives: number;
  derniereErreur: string | null;
  formateur: Personne | null;
  formation: { id: string; titre: string };
  module: { id: string; titre: string };
  support: { id: string; titre: string };
  decisions: Decisions;
}

export interface PageGenerations {
  total: number;
  page: number;
  limite: number;
  generations: GenerationTracee[];
}

/** Une suggestion avec sa décision et la question qu'elle a produite. */
export interface SuggestionTracee {
  id: string;
  ordre: number;
  enonce: string;
  type: string;
  statut: string;
  scoreConfiance: number | null;
  decidePar: Personne | null;
  dateDecision: Date | null;
  motifRejet: string | null;
  question: { id: string; origine: string } | null;
  qcm: { id: string; titre: string } | null;
}

export interface EvenementTrace {
  horodatage: Date;
  action: string;
  acteur: Personne | null;
  cible: string;
  resultat: string;
  details: unknown;
}

export interface DetailGenerationTracee extends GenerationTracee {
  suggestions: SuggestionTracee[];
  historique: EvenementTrace[];
}

const PERSONNE = (alias: string): string =>
  `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE json_build_object('id', ${alias}.id, 'prenom', ${alias}.prenom, 'nom', ${alias}.nom, 'email', ${alias}.email) END`;

const SELECT_GENERATION = `
  SELECT g.id, g.statut::text AS statut, g.date_lancement AS "dateLancement", g.date_fin AS "dateFin",
         g.modele_llm AS "modeleLlm",
         json_build_object('nbQuestionsDemandees', g.nb_questions_demandees, 'types', g.types_questions,
                           'niveau', g.niveau, 'focusThematique', g.focus_thematique) AS parametres,
         g.nb_suggestions AS "nbSuggestions", g.nb_invalides AS "nbInvalides",
         g.nb_tentatives AS "nbTentatives", g.derniere_erreur AS "derniereErreur",
         ${PERSONNE('u')} AS formateur,
         json_build_object('id', f.id, 'titre', f.titre) AS formation,
         json_build_object('id', m.id, 'titre', m.titre) AS module,
         json_build_object('id', s.id, 'titre', s.titre) AS support,
         COALESCE((SELECT json_agg(json_build_object('statut', x.statut, 'n', x.n))
                     FROM (SELECT statut::text AS statut, count(*)::int AS n
                             FROM suggestions_questions_ia WHERE generation_id = g.id
                            GROUP BY statut) x), '[]'::json) AS decompte
    FROM generations_ia g
    JOIN modules m ON m.id = g.module_id
    JOIN formations f ON f.id = m.formation_id
    JOIN supports_pedagogiques s ON s.id = g.support_id
    LEFT JOIN users u ON u.id = g.formateur_id`;

type LigneGeneration = Omit<GenerationTracee, 'decisions'> & {
  decompte: Array<{ statut: string; n: number }>;
};

/**
 * US-IA-05 — Registre des générations IA pour l'administrateur (DS-06,
 * §13.6) : qui a lancé quoi, sur quel module et quel support, avec quel
 * modèle et quels paramètres, quand, avec quel résultat ; pour chaque
 * suggestion, la décision (qui, quand, motif) et la question créée, dont
 * l'origine IA / IA_MODIFIEE est conservée ; l'historique d'audit complet.
 * Lecture seule.
 */
@Injectable()
export class TracabiliteGenerationsService {
  constructor(private readonly dataSource: DataSource) {}

  async lister(filtre: FiltreGenerationsDto): Promise<PageGenerations> {
    verifierPeriode(filtre.du, filtre.au);
    const page = filtre.page ?? 1;
    const limite = filtre.limite ?? BORNES_TRACABILITE.limiteDefaut;
    const conditions = `
      WHERE ($1::uuid IS NULL OR g.formateur_id = $1)
        AND ($2::uuid IS NULL OR m.formation_id = $2)
        AND ($3::text IS NULL OR g.statut::text = $3)
        AND ($4::timestamptz IS NULL OR g.date_lancement >= $4)
        AND ($5::timestamptz IS NULL OR g.date_lancement <= $5)`;
    const params = [
      filtre.formateurId ?? null,
      filtre.formationId ?? null,
      filtre.statut ?? null,
      filtre.du ?? null,
      filtre.au ?? null,
    ];
    const [{ total }] = (await this.dataSource.query(
      `SELECT count(*)::int AS total
         FROM generations_ia g JOIN modules m ON m.id = g.module_id ${conditions}`,
      params,
    )) as Array<{ total: number }>;
    const lignes = (await this.dataSource.query(
      `${SELECT_GENERATION} ${conditions}
        ORDER BY g.date_lancement DESC, g.id DESC
        LIMIT $6 OFFSET $7`,
      [...params, limite, decalage(page, limite)],
    )) as LigneGeneration[];
    return { total, page, limite, generations: lignes.map(versTracee) };
  }

  async detail(generationId: string): Promise<DetailGenerationTracee> {
    const [ligne] = (await this.dataSource.query(`${SELECT_GENERATION} WHERE g.id = $1`, [
      generationId,
    ])) as LigneGeneration[];
    if (!ligne) throw new NotFoundException(MESSAGE_GENERATION_INTROUVABLE);
    const suggestions = (await this.dataSource.query(
      `SELECT sg.id, sg.ordre, sg.enonce, sg.type, sg.statut::text AS statut,
              sg.score_confiance::float AS "scoreConfiance",
              ${PERSONNE('d')} AS "decidePar", sg.date_decision AS "dateDecision",
              sg.motif_rejet AS "motifRejet",
              CASE WHEN q.id IS NULL THEN NULL
                   ELSE json_build_object('id', q.id, 'origine', q.origine::text) END AS question,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE json_build_object('id', c.id, 'titre', c.titre) END AS qcm
         FROM suggestions_questions_ia sg
         LEFT JOIN users d ON d.id = sg.decide_par
         LEFT JOIN questions q ON q.id = sg.question_id
         LEFT JOIN qcm c ON c.id = sg.qcm_id
        WHERE sg.generation_id = $1
        ORDER BY sg.ordre`,
      [generationId],
    )) as SuggestionTracee[];
    const historique = (await this.dataSource.query(
      `SELECT a.horodatage, a.action, ${PERSONNE('u')} AS acteur, a.cible, a.resultat,
              a.details_avant_apres AS details
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.action = ANY($2)
          AND (a.cible = $1 OR a.cible = ANY($3))
        ORDER BY a.horodatage, a.id`,
      [generationId, [...ACTIONS_TRACEES], suggestions.map((s) => s.id)],
    )) as EvenementTrace[];
    return { ...versTracee(ligne), suggestions, historique };
  }
}

function versTracee(ligne: LigneGeneration): GenerationTracee {
  const vue: Partial<LigneGeneration> & GenerationTracee = {
    ...ligne,
    decisions: decompte(ligne.decompte),
  };
  delete vue.decompte;
  return vue;
}
