import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GenerationsService } from '../generations/generations.service';
import { SupportsService } from '../supports/supports.service';
import {
  EtatSuivi,
  etatGeneration,
  etatSupport,
  memeEtat,
  NatureSuivi,
  SUIVI_TEMPS_REEL,
} from './suivi.regles';

/** Un événement SSE (forme attendue par `@Sse` de NestJS). */
export interface EvenementSuivi {
  type: 'etat';
  data: EtatSuivi;
}

/**
 * US-IA-07 — Flux d'avancement d'un support ou d'une génération. L'état est
 * relu toutes les secondes (mêmes vues que l'API REST) ; seul un changement
 * est envoyé ; le flux se termine à l'état final ou après la durée maximale ;
 * une erreur de lecture (ressource supprimée…) termine le flux par une erreur.
 * Le premier état est TOUJOURS envoyé : un client qui se reconnecte n'a rien
 * perdu.
 */
@Injectable()
export class SuiviTempsReelService {
  constructor(
    private readonly supports: SupportsService,
    private readonly generations: GenerationsService,
  ) {}

  /** Lecture ponctuelle de l'état (aussi utilisée par le flux). */
  async lire(nature: NatureSuivi, id: string): Promise<EtatSuivi> {
    if (nature === 'support') return etatSupport(await this.supports.detail(id));
    return etatGeneration(await this.generations.vue(id));
  }

  flux(
    nature: NatureSuivi,
    id: string,
    options: { intervalleMs?: number; dureeMaxMs?: number } = {},
  ): Observable<EvenementSuivi> {
    const intervalle = options.intervalleMs ?? SUIVI_TEMPS_REEL.intervalleMs;
    const dureeMax = options.dureeMaxMs ?? SUIVI_TEMPS_REEL.dureeMaxMs;
    return new Observable<EvenementSuivi>((abonne) => {
      let dernier: EtatSuivi | null = null;
      let minuteur: NodeJS.Timeout | null = null;
      let arrete = false;
      const debut = Date.now();
      const tour = async (): Promise<void> => {
        try {
          const etat = await this.lire(nature, id);
          if (arrete) return;
          if (!memeEtat(dernier, etat)) {
            dernier = etat;
            abonne.next({ type: 'etat', data: etat });
          }
          if (etat.final || Date.now() - debut >= dureeMax) {
            abonne.complete();
            return;
          }
          minuteur = setTimeout(() => void tour(), intervalle);
        } catch (erreur) {
          if (!arrete) abonne.error(erreur);
        }
      };
      void tour();
      return () => {
        arrete = true;
        if (minuteur) clearTimeout(minuteur);
      };
    });
  }
}
