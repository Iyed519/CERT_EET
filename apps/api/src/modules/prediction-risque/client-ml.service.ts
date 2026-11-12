import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RisqueConfig } from '../../config/configuration';
import { NiveauRisque } from '../../database/enums/niveau-risque.enum';
import { Variables } from './risque.variables';

/** Une prédiction renvoyée par le service ml. */
export interface PredictionMl {
  identifiant: string;
  probabilite: number;
  niveau: NiveauRisque;
  raisons: string[];
}

export interface ReponseMl {
  versionModele: string;
  predictions: PredictionMl[];
}

/** Lot maximal accepté par le service ml (`ML_TAILLE_LOT_MAX`, 500) ; marge de sécurité. */
export const TAILLE_LOT = 200;

const NIVEAUX: Record<string, NiveauRisque> = {
  faible: NiveauRisque.FAIBLE,
  moyen: NiveauRisque.MOYEN,
  élevé: NiveauRisque.ELEVE,
};

/**
 * IA — Client HTTP du service ml (conteneur séparé, réseau interne).
 *
 * Délai court (`ML_DELAI_MS`, 3 s par défaut), AUCUNE nouvelle tentative :
 * si le service est arrêté, lent, en erreur ou répond n'importe quoi, la
 * méthode renvoie `null` et journalise un avertissement (sans les données
 * envoyées). L'appelant continue sans prédiction : seules les règles
 * d'alerte s'appliquent (repli silencieux).
 */
@Injectable()
export class ClientMlService {
  private readonly logger = new Logger(ClientMlService.name);

  constructor(private readonly configService: ConfigService) {}

  async predire(
    apprenants: Array<{ identifiant: string; variables: Variables }>,
  ): Promise<ReponseMl | null> {
    if (apprenants.length === 0) return { versionModele: '', predictions: [] };
    const { mlUrl, delaiMs } = this.configService.getOrThrow<RisqueConfig>('risque');
    try {
      const reponse = await fetch(`${mlUrl.replace(/\/+$/, '')}/predire`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apprenants: apprenants.map((a) => ({ identifiant: a.identifiant, ...a.variables })),
        }),
        signal: AbortSignal.timeout(delaiMs),
      });
      if (!reponse.ok) throw new Error(`statut HTTP ${reponse.status}`);
      return this.lire(await reponse.json(), apprenants.map((a) => a.identifiant));
    } catch (erreur) {
      const raison = erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
      this.logger.warn(`Service ml indisponible (${raison}) : repli sur les règles d'alerte seules.`);
      return null;
    }
  }

  /** Vérifie la forme de la réponse : une prédiction valide par apprenant envoyé, dans l'ordre. */
  private lire(corps: unknown, identifiants: string[]): ReponseMl {
    const c = corps as { version_modele?: unknown; predictions?: unknown };
    if (typeof c?.version_modele !== 'string' || !Array.isArray(c.predictions)) {
      throw new Error('réponse mal formée');
    }
    if (c.predictions.length !== identifiants.length) throw new Error('nombre de prédictions inattendu');
    const predictions = (c.predictions as Array<Record<string, unknown>>).map((p, i) => {
      const niveau = NIVEAUX[String(p.niveau)];
      const probabilite = Number(p.probabilite);
      if (
        p.identifiant !== identifiants[i] ||
        !niveau ||
        !Number.isFinite(probabilite) ||
        probabilite < 0 ||
        probabilite > 1 ||
        !Array.isArray(p.raisons) ||
        !p.raisons.every((r) => typeof r === 'string')
      ) {
        throw new Error('prédiction mal formée');
      }
      return {
        identifiant: identifiants[i],
        probabilite,
        niveau,
        raisons: (p.raisons as string[]).slice(0, 3).map((r) => r.slice(0, 200)),
      };
    });
    return { versionModele: c.version_modele.slice(0, 50), predictions };
  }
}
