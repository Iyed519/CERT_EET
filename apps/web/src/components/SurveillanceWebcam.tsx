'use client';
import { useEffect, useRef, useState } from 'react';
import { deposerAlerteSurveillance, deposerCapture } from '../lib/api';
import { demarrerAnalyse } from '../lib/surveillance-ia';

/**
 * Surveillance par caméra pendant le passage d'un QCM surveillé (le
 * consentement a été donné au démarrage).
 *
 * - US-QCM-12 : une image au démarrage, puis une à chaque intervalle
 *   (320 × 240, JPEG compressé).
 * - US-QCM-15 : analyse par IA dans le navigateur (MediaPipe) ; à chaque
 *   anomalie, la photo de l'instant part avec l'alerte au formateur.
 *
 * L'apprenant ne voit PAS sa vidéo : l'élément vidéo, nécessaire à l'analyse,
 * est invisible ; seul un bandeau dit que la surveillance est active. Aucune
 * alerte ne lui est montrée pendant le QCM. La vidéo n'est jamais envoyée ; la
 * caméra est relâchée quand la page se ferme ou la tentative se termine.
 */
export default function SurveillanceWebcam({
  tentativeId,
  intervalleSecondes,
  absenceSecondes,
}: {
  tentativeId: string;
  intervalleSecondes: number;
  absenceSecondes: number;
}): JSX.Element {
  const video = useRef<HTMLVideoElement | null>(null);
  const [etat, setEtat] = useState<'demarrage' | 'active' | 'indisponible'>('demarrage');

  useEffect(() => {
    let flux: MediaStream | null = null;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    let arreterAnalyse: (() => void) | null = null;
    let arrete = false;

    const capturer = async (): Promise<void> => {
      const v = video.current;
      if (!v || v.videoWidth === 0) return;
      const toile = document.createElement('canvas');
      toile.width = 320;
      toile.height = 240;
      toile.getContext('2d')?.drawImage(v, 0, 0, 320, 240);
      const image = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', 0.6));
      if (image) await deposerCapture(tentativeId, image);
    };

    const demarrer = async (): Promise<void> => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
      } catch {
        if (!arrete) setEtat('indisponible');
        return;
      }
      if (arrete || !video.current) {
        flux.getTracks().forEach((p) => p.stop());
        return;
      }
      video.current.srcObject = flux;
      await video.current.play().catch(() => undefined);
      flux.getVideoTracks()[0]?.addEventListener('ended', () => setEtat('indisponible'));
      setEtat('active');
      // Première image dès que la caméra donne une image, puis à intervalle.
      setTimeout(() => void capturer(), 800);
      minuteur = setInterval(() => void capturer(), intervalleSecondes * 1000);
      // Analyse par IA : chaque anomalie part avec la photo de l'instant.
      arreterAnalyse = demarrerAnalyse(video.current, absenceSecondes, (anomalie, photo) => {
        void deposerAlerteSurveillance(tentativeId, anomalie.type, anomalie.confiance, photo);
      });
    };

    void demarrer();
    return () => {
      arrete = true;
      if (minuteur) clearInterval(minuteur);
      arreterAnalyse?.();
      flux?.getTracks().forEach((p) => p.stop());
    };
  }, [tentativeId, intervalleSecondes, absenceSecondes]);

  return (
    <>
      {/* Invisible : sert seulement à l'analyse ; l'apprenant ne voit pas sa vidéo. */}
      <video ref={video} className="surveillance-video" muted playsInline aria-hidden="true" />
      {etat === 'indisponible' ? (
        <div className="surveillance-active surveillance-active--alerte" role="alert">
          <span className="surveillance-point" aria-hidden="true" />
          <div>
            <strong>Caméra indisponible</strong>
            <span>
              La surveillance ne fonctionne plus : réactivez votre caméra, ou prévenez votre
              formateur.
            </span>
          </div>
        </div>
      ) : (
        <div className="surveillance-active" role="status">
          <span
            className={`surveillance-point${etat === 'active' ? ' surveillance-point--actif' : ''}`}
            aria-hidden="true"
          />
          <div>
            <strong>
              {etat === 'active'
                ? 'Surveillance par caméra active'
                : 'Activation de la caméra…'}
            </strong>
            <span>
              Votre caméra est analysée automatiquement pendant ce QCM. Aucune vidéo n’est
              enregistrée : une photo est prise en cas d’anomalie (téléphone, autre personne,
              absence…) et environ toutes les {Math.max(1, Math.round(intervalleSecondes / 60))}{' '}
              minutes.
            </span>
          </div>
        </div>
      )}
    </>
  );
}
