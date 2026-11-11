'use client';
import { useEffect, useRef, useState } from 'react';
import { deposerCapture } from '../lib/api';

/**
 * US-QCM-12 — Captures webcam pendant le passage d'un QCM surveillé (le
 * consentement a été donné au démarrage). Une image au montage, puis une à
 * chaque intervalle : 320 × 240 px, JPEG compressé — le minimum utile. La
 * vidéo n'est jamais envoyée, seulement ces images ; la caméra est relâchée
 * quand la page se ferme ou la tentative se termine.
 */
export default function SurveillanceWebcam({
  tentativeId,
  intervalleSecondes,
}: {
  tentativeId: string;
  intervalleSecondes: number;
}): JSX.Element {
  const video = useRef<HTMLVideoElement | null>(null);
  const [etat, setEtat] = useState<'demarrage' | 'active' | 'indisponible'>('demarrage');
  const [derniere, setDerniere] = useState<Date | null>(null);

  useEffect(() => {
    let flux: MediaStream | null = null;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    let arrete = false;

    const capturer = async (): Promise<void> => {
      const v = video.current;
      if (!v || v.videoWidth === 0) return;
      const toile = document.createElement('canvas');
      toile.width = 320;
      toile.height = 240;
      toile.getContext('2d')?.drawImage(v, 0, 0, 320, 240);
      const image = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', 0.6));
      if (image && (await deposerCapture(tentativeId, image))) setDerniere(new Date());
    };

    const demarrer = async (): Promise<void> => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
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
    };

    void demarrer();
    return () => {
      arrete = true;
      if (minuteur) clearInterval(minuteur);
      flux?.getTracks().forEach((p) => p.stop());
    };
  }, [tentativeId, intervalleSecondes]);

  return (
    <div className={`surveillance-bandeau${etat === 'indisponible' ? ' alerte' : ''}`} role="status">
      <video ref={video} muted playsInline aria-label="Aperçu de votre caméra" />
      {etat === 'indisponible' ? (
        <span>
          Caméra indisponible : la surveillance ne fonctionne plus. Réactivez la caméra, ou
          prévenez votre formateur.
        </span>
      ) : (
        <span>
          Surveillance webcam active — une image toutes les {Math.round(intervalleSecondes / 60)}{' '}
          min environ
          {derniere ? ` (dernière à ${derniere.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})` : ''}
          .
        </span>
      )}
    </div>
  );
}
