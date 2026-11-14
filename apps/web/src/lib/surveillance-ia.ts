'use client';
import {
  DetecteurAnomalies,
  luminositeMoyenne,
  resumerDetections,
  SEUILS,
  type Anomalie,
  type TypeAnomalie,
} from './surveillance-regles';

/**
 * US-QCM-15 — Analyse de la caméra par IA, DANS LE NAVIGATEUR de l'apprenant.
 *
 * MediaPipe Object Detector (EfficientDet-Lite0 int8, COCO) : personnes,
 * téléphones, livres. Le moteur WebAssembly et le modèle sont servis par la
 * plateforme (`/mediapipe/…`) : aucun appel à un tiers. Deux analyses par
 * seconde (US-QCM-16) ; à chaque anomalie confirmée (règles pures,
 * surveillance-regles.ts), la photo transmise est la MEILLEURE image de
 * l'épisode (celle où le téléphone, le livre ou les personnes ont le score le
 * plus haut), gardée en mémoire au fil de l'analyse. La vidéo ne quitte
 * jamais le poste.
 */

const CHEMIN_WASM = '/mediapipe/wasm';
const CHEMIN_MODELE = '/mediapipe/efficientdet_lite0.tflite';
const PERIODE_MS = 500;

interface DetecteurObjets {
  detectForVideo(
    image: HTMLVideoElement,
    instant: number,
  ): { detections: Array<{ categories: Array<{ categoryName: string; score: number }> }> };
  close(): void;
}

/** Copie de l'image courante de la vidéo, 640 × 480. */
function copier(video: HTMLVideoElement, toile = document.createElement('canvas')): HTMLCanvasElement {
  toile.width = 640;
  toile.height = 480;
  toile.getContext('2d')?.drawImage(video, 0, 0, 640, 480);
  return toile;
}

/** JPEG d'une image (sous 200 Ko). */
async function jpeg(toile: HTMLCanvasElement): Promise<Blob | null> {
  for (const qualite of [0.75, 0.6, 0.45]) {
    const image = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', qualite));
    if (image && image.size <= 190 * 1024) return image;
  }
  return null;
}

/** Photo de l'instant : 640 × 480, JPEG (sous 200 Ko). */
export async function photoDe(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth === 0) return null;
  return jpeg(copier(video));
}

/** Hôte de télémétrie que le moteur MediaPipe contacte au chargement. */
const HOTE_TELEMETRIE = 'odml.pa.googleapis.com';
let telemetrieCoupee = false;

/**
 * Souveraineté : le moteur tente d'envoyer des statistiques d'usage à Google.
 * La CSP bloque déjà l'appel ; on y répond ici localement (204) pour qu'aucune
 * requête ne parte et que la console reste propre. Rien d'autre n'est touché.
 */
function couperTelemetrie(): void {
  if (telemetrieCoupee || typeof window === 'undefined') return;
  telemetrieCoupee = true;
  const origine = window.fetch.bind(window);
  window.fetch = (entree: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (url.includes(HOTE_TELEMETRIE)) return Promise.resolve(new Response(null, { status: 204 }));
    return origine(entree, options);
  };
}

async function chargerDetecteur(): Promise<DetecteurObjets> {
  couperTelemetrie();
  const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
  const fichiers = await FilesetResolver.forVisionTasks(CHEMIN_WASM);
  // Le moteur écrit ses messages d'information (« INFO: … ») sur la sortie
  // d'erreur : on les écarte pendant le chargement seulement.
  const erreurConsole = console.error;
  console.error = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith('INFO: ')) return;
    erreurConsole(...args);
  };
  try {
    return (await ObjectDetector.createFromOptions(fichiers, {
      baseOptions: { modelAssetPath: CHEMIN_MODELE, delegate: 'CPU' },
      runningMode: 'VIDEO',
      scoreThreshold: SEUILS.scoreMoteur,
      maxResults: 10,
      categoryAllowlist: ['person', 'cell phone', 'book'],
    })) as unknown as DetecteurObjets;
  } finally {
    console.error = erreurConsole;
  }
}

/** État de l'analyse, affiché à l'apprenant (sans jamais dire ce qui a été détecté). */
export type EtatAnalyse = 'chargement' | 'active' | 'indisponible';

/** Ce que le modèle voit à un instant (diagnostic, en développement seulement). */
export interface Lecture {
  personnes: number;
  telephone: number;
  livre: number;
  luminosite: number;
}

type AnomalieSignalee = Anomalie | { type: 'ANALYSE_INDISPONIBLE'; confiance: null };

/**
 * Lance l'analyse sur la vidéo (déjà en lecture). `signaler` reçoit chaque
 * anomalie avec sa photo ; `ANALYSE_INDISPONIBLE` si le modèle ne peut pas
 * être chargé sur ce poste (une fois). `etat` suit le chargement. Renvoie la
 * fonction d'arrêt.
 */
export function demarrerAnalyse(
  video: HTMLVideoElement,
  absenceSecondes: number,
  signaler: (a: AnomalieSignalee, photo: Blob) => void,
  etat: (e: EtatAnalyse, cause?: string) => void = () => undefined,
  lecture?: (l: Lecture) => void,
): () => void {
  let arrete = false;
  let minuteur: ReturnType<typeof setInterval> | null = null;
  let detecteur: DetecteurObjets | null = null;
  const regles = new DetecteurAnomalies(absenceSecondes * 1000);
  // Meilleure image de l'épisode en cours, par type d'anomalie.
  const meilleures = new Map<TypeAnomalie, HTMLCanvasElement>();
  const mini = document.createElement('canvas');
  mini.width = 32;
  mini.height = 24;
  const contexte = mini.getContext('2d', { willReadFrequently: true });

  const envoyer = async (anomalie: AnomalieSignalee): Promise<void> => {
    const gardee = anomalie.type === 'ANALYSE_INDISPONIBLE' ? undefined : meilleures.get(anomalie.type);
    const photo = gardee ? await jpeg(gardee) : await photoDe(video);
    if (photo && !arrete) signaler(anomalie, photo);
  };

  const analyser = (): void => {
    if (arrete || !detecteur || video.readyState < 2 || video.videoWidth === 0) return;
    let resume = { personnes: 0, telephone: 0, livre: 0 };
    try {
      resume = resumerDetections(detecteur.detectForVideo(video, performance.now()).detections);
    } catch {
      return; // image illisible à cet instant : on attend la suivante
    }
    let luminosite = 128;
    if (contexte) {
      contexte.drawImage(video, 0, 0, 32, 24);
      luminosite = luminositeMoyenne(contexte.getImageData(0, 0, 32, 24).data);
    }
    lecture?.({ ...resume, luminosite });
    const verdict = regles.observer({ t: Date.now(), ...resume, luminosite });
    for (const type of verdict.meilleures) meilleures.set(type, copier(video, meilleures.get(type)));
    for (const a of verdict.anomalies) void envoyer(a);
  };

  // Page quittée : mesurée par les événements (les minuteurs d'une page cachée
  // sont ralentis par le navigateur) ; la photo est prise au retour.
  let cacheeDepuis: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
  const visibilite = (): void => {
    if (document.visibilityState === 'hidden') {
      cacheeDepuis = Date.now();
      return;
    }
    if (cacheeDepuis === null) return;
    const maintenant = Date.now();
    const alerte = regles.retourSurLaPage(maintenant, maintenant - cacheeDepuis);
    cacheeDepuis = null;
    // Laisse la caméra reprendre une image fraîche avant la photo.
    if (alerte) setTimeout(() => void envoyer(alerte), 600);
  };
  document.addEventListener('visibilitychange', visibilite);

  etat('chargement');
  void chargerDetecteur()
    .then((d) => {
      if (arrete) {
        d.close();
        return;
      }
      detecteur = d;
      minuteur = setInterval(analyser, PERIODE_MS);
      etat('active');
    })
    .catch((erreur: unknown) => {
      if (arrete) return;
      const cause = erreur instanceof Error ? erreur.message : String(erreur);
      console.error('Surveillance : modèle impossible à charger', erreur);
      etat('indisponible', cause);
      void envoyer({ type: 'ANALYSE_INDISPONIBLE', confiance: null });
    });
  return () => {
    arrete = true;
    document.removeEventListener('visibilitychange', visibilite);
    if (minuteur) clearInterval(minuteur);
    detecteur?.close();
  };
}
