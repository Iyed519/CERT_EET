/**
 * US-QCM-15 — Règles PURES de la surveillance par IA (navigateur).
 *
 * Le détecteur reçoit, une fois par seconde environ, ce que le modèle a vu
 * (nombre de personnes, meilleurs scores « téléphone » et « livre »),
 * la luminosité moyenne de l'image et la visibilité de la page. Il décide
 * quand une anomalie est CONFIRMÉE (elle dure assez longtemps) et ne la
 * signale qu'UNE fois par épisode : l'alerte repart seulement après un retour
 * à la normale, et jamais moins d'une minute après la précédente du même type.
 */

export type TypeAnomalie =
  | 'PERSONNES_MULTIPLES'
  | 'ABSENCE'
  | 'TELEPHONE'
  | 'DOCUMENT'
  | 'CAMERA_MASQUEE'
  | 'ONGLET_QUITTE';

export interface Observation {
  /** Instant de l'observation (ms). */
  t: number;
  /** Personnes détectées (score ≥ seuil). */
  personnes: number;
  /** Meilleur score « cell phone » (0 si aucun). */
  telephone: number;
  /** Meilleur score « book » (0 si aucun). */
  livre: number;
  /** Luminosité moyenne de l'image, 0 (noir) à 255. */
  luminosite: number;
  /** La page du QCM est-elle visible ? */
  pageVisible: boolean;
}

export interface Anomalie {
  type: TypeAnomalie;
  /** Score du modèle pour un objet (téléphone, livre), sinon null. */
  confiance: number | null;
}

/** Durées de confirmation (ms) et seuils. */
export const SEUILS = {
  scoreObjet: 0.5,
  personnesMultiplesMs: 3_000,
  telephoneMs: 2_000,
  documentMs: 3_000,
  cameraMasqueeMs: 10_000,
  luminositeNoire: 18,
  ongletQuitteMs: 5_000,
  /** Même type : une minute au moins entre deux alertes. */
  ecartMemeTypeMs: 60_000,
} as const;

/** Libellés courts (écran du formateur). */
export const LIBELLES_ANOMALIE: Record<TypeAnomalie | 'ANALYSE_INDISPONIBLE', string> = {
  PERSONNES_MULTIPLES: 'Plusieurs personnes devant la caméra',
  ABSENCE: 'Apprenant absent de l’image',
  TELEPHONE: 'Téléphone détecté',
  DOCUMENT: 'Livre ou document détecté',
  CAMERA_MASQUEE: 'Caméra masquée ou image noire',
  ONGLET_QUITTE: 'Page du QCM quittée',
  ANALYSE_INDISPONIBLE: 'Analyse automatique indisponible sur ce poste',
};

interface Episode {
  debut: number | null;
  signale: boolean;
  meilleur: number;
}

/** Une condition et sa durée de confirmation. */
interface Regle {
  type: TypeAnomalie;
  dureeMs: number;
  active: (o: Observation) => boolean;
  score?: (o: Observation) => number;
}

export class DetecteurAnomalies {
  private readonly regles: Regle[];
  private readonly episodes = new Map<TypeAnomalie, Episode>();
  private readonly derniersEnvois = new Map<TypeAnomalie, number>();

  /** @param absenceMs absence à l'image avant l'alerte (5 min par défaut). */
  constructor(absenceMs = 300_000) {
    const noire = (o: Observation): boolean => o.luminosite < SEUILS.luminositeNoire;
    this.regles = [
      { type: 'ONGLET_QUITTE', dureeMs: SEUILS.ongletQuitteMs, active: (o) => !o.pageVisible },
      { type: 'CAMERA_MASQUEE', dureeMs: SEUILS.cameraMasqueeMs, active: noire },
      // Image noire : l'absence et les objets ne sont pas jugés (pas d'alerte en double).
      {
        type: 'ABSENCE',
        dureeMs: absenceMs,
        active: (o) => !noire(o) && o.personnes === 0,
      },
      {
        type: 'PERSONNES_MULTIPLES',
        dureeMs: SEUILS.personnesMultiplesMs,
        active: (o) => !noire(o) && o.personnes >= 2,
      },
      {
        type: 'TELEPHONE',
        dureeMs: SEUILS.telephoneMs,
        active: (o) => !noire(o) && o.telephone >= SEUILS.scoreObjet,
        score: (o) => o.telephone,
      },
      {
        type: 'DOCUMENT',
        dureeMs: SEUILS.documentMs,
        active: (o) => !noire(o) && o.livre >= SEUILS.scoreObjet,
        score: (o) => o.livre,
      },
    ];
  }

  /** Une observation ; renvoie les anomalies confirmées à signaler maintenant. */
  observer(o: Observation): Anomalie[] {
    const aSignaler: Anomalie[] = [];
    for (const r of this.regles) {
      const e = this.episodes.get(r.type) ?? { debut: null, signale: false, meilleur: 0 };
      if (!r.active(o)) {
        // Retour à la normale : l'épisode est clos.
        this.episodes.set(r.type, { debut: null, signale: false, meilleur: 0 });
        continue;
      }
      const debut = e.debut ?? o.t;
      const meilleur = Math.max(e.meilleur, r.score ? r.score(o) : 0);
      let signale = e.signale;
      const dernier = this.derniersEnvois.get(r.type);
      if (
        !signale &&
        o.t - debut >= r.dureeMs &&
        (dernier === undefined || o.t - dernier >= SEUILS.ecartMemeTypeMs)
      ) {
        signale = true;
        this.derniersEnvois.set(r.type, o.t);
        aSignaler.push({
          type: r.type,
          confiance: r.score ? Math.round(meilleur * 1000) / 1000 : null,
        });
      }
      this.episodes.set(r.type, { debut, signale, meilleur });
    }
    return aSignaler;
  }
}

/** Résumé d'un résultat du modèle : personnes, meilleurs scores téléphone / livre. */
export function resumerDetections(
  detections: ReadonlyArray<{ categories: ReadonlyArray<{ categoryName: string; score: number }> }>,
  seuilPersonne = 0.5,
): { personnes: number; telephone: number; livre: number } {
  let personnes = 0;
  let telephone = 0;
  let livre = 0;
  for (const d of detections) {
    const c = d.categories[0];
    if (!c) continue;
    if (c.categoryName === 'person' && c.score >= seuilPersonne) personnes++;
    else if (c.categoryName === 'cell phone') telephone = Math.max(telephone, c.score);
    else if (c.categoryName === 'book') livre = Math.max(livre, c.score);
  }
  return { personnes, telephone, livre };
}

/** Luminosité moyenne (0-255) de pixels RGBA. */
export function luminositeMoyenne(pixels: Uint8ClampedArray): number {
  let somme = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    somme += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
  }
  return n === 0 ? 0 : somme / n;
}
