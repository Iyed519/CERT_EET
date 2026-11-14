/**
 * US-QCM-15 / US-QCM-16 — Règles PURES de la surveillance par IA (navigateur).
 *
 * Le détecteur reçoit, deux fois par seconde, ce que le modèle a vu (nombre
 * de personnes, meilleurs scores « téléphone » et « livre ») et la luminosité
 * moyenne de l'image. Il décide quand une anomalie est CONFIRMÉE et ne la
 * signale qu'UNE fois par épisode, jamais moins d'une minute après la
 * précédente du même type.
 *
 * US-QCM-16 : le modèle léger (EfficientDet-Lite0) rate souvent un objet sur
 * une image puis le retrouve sur la suivante, avec des scores modestes (un
 * téléphone tenu en main : 0,3 à 0,6). Un épisode tolère donc des trous
 * courts (`toleranceMs`) et se confirme par un NOMBRE d'images où l'objet est
 * vu (`minVus`), au lieu d'exiger une présence ininterrompue. Le détecteur
 * indique aussi, à chaque image, si elle est la MEILLEURE de l'épisode (score
 * le plus haut) : la photo de l'alerte est celle-là, pour que le téléphone y
 * soit visible même s'il a déjà disparu au moment de la confirmation.
 *
 * La page quittée n'est plus jugée image par image (le navigateur ralentit les
 * minuteurs d'une page cachée) : `retourSurLaPage` est appelé au retour, avec
 * la durée pendant laquelle la page était cachée.
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
  /** Personnes détectées (score ≥ SEUILS.scorePersonne). */
  personnes: number;
  /** Meilleur score « cell phone » (0 si aucun). */
  telephone: number;
  /** Meilleur score « book » (0 si aucun). */
  livre: number;
  /** Luminosité moyenne de l'image, 0 (noir) à 255. */
  luminosite: number;
}

export interface Anomalie {
  type: TypeAnomalie;
  /** Score du modèle pour un objet (téléphone, livre), sinon null. */
  confiance: number | null;
}

/** Ce que renvoie une observation. */
export interface Verdict {
  /** Anomalies confirmées à signaler maintenant. */
  anomalies: Anomalie[];
  /** Types dont cette image est la meilleure de l'épisode en cours (photo à garder). */
  meilleures: TypeAnomalie[];
}

/** Seuils (scores du modèle, durées en ms). */
export const SEUILS = {
  /** Score minimal demandé au moteur (filtre de base, sous les seuils ci-dessous). */
  scoreMoteur: 0.25,
  scorePersonne: 0.5,
  scoreTelephone: 0.3,
  scoreLivre: 0.4,
  /** Téléphone : vu sur 2 images en 1,5 s au plus (≈ 0,5 s de présence). */
  telephone: { minVus: 2, dureeMs: 500, toleranceMs: 1_500 },
  /** Livre / document : vu sur 3 images, sur au moins 1,5 s. */
  document: { minVus: 3, dureeMs: 1_500, toleranceMs: 1_500 },
  /** Deux personnes ou plus : vues sur 3 images, sur au moins 1,5 s. */
  personnesMultiples: { minVus: 3, dureeMs: 1_500, toleranceMs: 1_000 },
  /** Image presque noire pendant 10 s (sans interruption). */
  cameraMasqueeMs: 10_000,
  luminositeNoire: 18,
  /** Règle continue : deux images au plus 3 s l'une de l'autre (poste lent). */
  trouMaxContinuMs: 3_000,
  /** Page cachée plus de 5 s. */
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
  debut: number;
  dernierVu: number;
  vus: number;
  meilleur: number;
  signale: boolean;
}

/** Une condition, ce qu'il faut pour la confirmer, et sa mesure (meilleure image). */
interface Regle {
  type: Exclude<TypeAnomalie, 'ONGLET_QUITTE'>;
  minVus: number;
  dureeMs: number;
  toleranceMs: number;
  active: (o: Observation) => boolean;
  /** Mesure de l'image (plus haut = meilleure photo) ; null : pas de photo à garder. */
  mesure: ((o: Observation) => number) | null;
  /** La confiance transmise est le meilleur score (objets seulement). */
  confiance: boolean;
}

export class DetecteurAnomalies {
  private readonly regles: Regle[];
  private readonly episodes = new Map<TypeAnomalie, Episode>();
  private readonly derniersEnvois = new Map<TypeAnomalie, number>();

  /** @param absenceMs absence à l'image avant l'alerte (5 min par défaut). */
  constructor(absenceMs = 300_000) {
    const noire = (o: Observation): boolean => o.luminosite < SEUILS.luminositeNoire;
    // Durée continue : une seule image normale clôt l'épisode.
    const continu = (dureeMs: number): Pick<Regle, 'minVus' | 'dureeMs' | 'toleranceMs'> => ({
      minVus: 1,
      dureeMs,
      toleranceMs: 0,
    });
    this.regles = [
      {
        type: 'CAMERA_MASQUEE',
        ...continu(SEUILS.cameraMasqueeMs),
        active: noire,
        mesure: null,
        confiance: false,
      },
      // Image noire : l'absence et les objets ne sont pas jugés (pas d'alerte en double).
      {
        type: 'ABSENCE',
        ...continu(absenceMs),
        active: (o) => !noire(o) && o.personnes === 0,
        mesure: null,
        confiance: false,
      },
      {
        type: 'PERSONNES_MULTIPLES',
        ...SEUILS.personnesMultiples,
        active: (o) => !noire(o) && o.personnes >= 2,
        mesure: (o) => o.personnes,
        confiance: false,
      },
      {
        type: 'TELEPHONE',
        ...SEUILS.telephone,
        active: (o) => !noire(o) && o.telephone >= SEUILS.scoreTelephone,
        mesure: (o) => o.telephone,
        confiance: true,
      },
      {
        type: 'DOCUMENT',
        ...SEUILS.document,
        active: (o) => !noire(o) && o.livre >= SEUILS.scoreLivre,
        mesure: (o) => o.livre,
        confiance: true,
      },
    ];
  }

  /** Une observation : anomalies confirmées et meilleures images de l'instant. */
  observer(o: Observation): Verdict {
    const anomalies: Anomalie[] = [];
    const meilleures: TypeAnomalie[] = [];
    for (const r of this.regles) {
      const ouvert = this.episodes.get(r.type);
      if (!r.active(o)) {
        // Trou plus long que la tolérance : l'épisode est clos.
        if (ouvert && o.t - ouvert.dernierVu > r.toleranceMs) this.episodes.delete(r.type);
        continue;
      }
      const mesure = r.mesure ? r.mesure(o) : 0;
      // Règle continue (tolérance nulle) : une image normale a déjà clos
      // l'épisode ; seul un trou sans aucune image (poste figé) le rouvre.
      const trouMax = r.toleranceMs > 0 ? r.toleranceMs : SEUILS.trouMaxContinuMs;
      const e: Episode =
        ouvert && o.t - ouvert.dernierVu <= trouMax
          ? ouvert
          : { debut: o.t, dernierVu: o.t, vus: 0, meilleur: -1, signale: false };
      e.vus += 1;
      e.dernierVu = o.t;
      if (r.mesure && mesure > e.meilleur) {
        e.meilleur = mesure;
        meilleures.push(r.type);
      }
      const dernier = this.derniersEnvois.get(r.type);
      if (
        !e.signale &&
        e.vus >= r.minVus &&
        o.t - e.debut >= r.dureeMs &&
        (dernier === undefined || o.t - dernier >= SEUILS.ecartMemeTypeMs)
      ) {
        e.signale = true;
        this.derniersEnvois.set(r.type, o.t);
        anomalies.push({
          type: r.type,
          confiance: r.confiance ? Math.round(e.meilleur * 1000) / 1000 : null,
        });
      }
      this.episodes.set(r.type, e);
    }
    return { anomalies, meilleures };
  }

  /**
   * Retour sur la page du QCM après `masqueeMs` passées ailleurs (autre onglet,
   * autre fenêtre). Renvoie l'alerte à signaler, ou null.
   */
  retourSurLaPage(t: number, masqueeMs: number): Anomalie | null {
    if (masqueeMs < SEUILS.ongletQuitteMs) return null;
    const dernier = this.derniersEnvois.get('ONGLET_QUITTE');
    if (dernier !== undefined && t - dernier < SEUILS.ecartMemeTypeMs) return null;
    this.derniersEnvois.set('ONGLET_QUITTE', t);
    return { type: 'ONGLET_QUITTE', confiance: null };
  }
}

/** Résumé d'un résultat du modèle : personnes, meilleurs scores téléphone / livre. */
export function resumerDetections(
  detections: ReadonlyArray<{ categories: ReadonlyArray<{ categoryName: string; score: number }> }>,
  seuilPersonne: number = SEUILS.scorePersonne,
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
