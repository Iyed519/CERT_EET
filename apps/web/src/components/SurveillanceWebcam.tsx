'use client';
import { useEffect, useRef, useState } from 'react';
import { deposerAlerteSurveillance, deposerCapture } from '../lib/api';
import { demarrerAnalyse, type EtatAnalyse, type Lecture } from '../lib/surveillance-ia';
import { SEUILS } from '../lib/surveillance-regles';

/**
 * US-QCM-16 — Diagnostic : en développement SEULEMENT (jamais dans l'image de
 * recette ou de production, où Next.js fixe NODE_ENV à « production »), le
 * bandeau affiche ce que le modèle voit, pour régler et tester les seuils.
 */
const DIAGNOSTIC = process.env.NODE_ENV === 'development';

/**
 * Surveillance par caméra pendant le passage d'un QCM surveillé (le
 * consentement a été donné au démarrage).
 *
 * - US-QCM-15 : analyse par IA dans le navigateur (MediaPipe) ; à chaque
 *   anomalie, la photo part avec l'alerte au formateur.
 * - US-QCM-16 : plus de photo périodique par défaut, une photo seulement en
 *   cas d'anomalie. `intervalleSecondes` > 0 (réglage de test,
 *   `SURVEILLANCE_INTERVALLE_SECONDES`) ajoute une photo de contrôle à
 *   intervalle fixe. Le bandeau dit si l'analyse automatique tourne.
 *
 * L'apprenant ne voit PAS sa vidéo : l'élément vidéo, nécessaire à l'analyse,
 * est invisible. Aucune alerte ne lui est montrée pendant le QCM. La vidéo
 * n'est jamais envoyée ; la caméra est relâchée quand la page se ferme ou la
 * tentative se termine.
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
  const [camera, setCamera] = useState<'demarrage' | 'active' | 'indisponible'>('demarrage');
  const [analyse, setAnalyse] = useState<EtatAnalyse>('chargement');
  const [lecture, setLecture] = useState<Lecture | null>(null);

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

    /** Envoi d'une alerte ; un échec réseau ou serveur est retenté une fois. */
    const alerter = async (
      type: Parameters<typeof deposerAlerteSurveillance>[1],
      confiance: number | null,
      photo: Blob,
    ): Promise<void> => {
      const statut = await deposerAlerteSurveillance(tentativeId, type, confiance, photo);
      if (statut === 0 || statut >= 500) {
        await new Promise((ok) => setTimeout(ok, 3000));
        if (arrete) return;
        const second = await deposerAlerteSurveillance(tentativeId, type, confiance, photo);
        if (second !== 201) {
          console.error(`Surveillance : alerte ${type} non enregistrée (${second}).`);
        }
      } else if (statut !== 201 && statut !== 429) {
        console.error(`Surveillance : alerte ${type} refusée (${statut}).`);
      }
    };

    const demarrer = async (): Promise<void> => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
      } catch {
        if (!arrete) setCamera('indisponible');
        return;
      }
      if (arrete || !video.current) {
        flux.getTracks().forEach((p) => p.stop());
        return;
      }
      video.current.srcObject = flux;
      await video.current.play().catch(() => undefined);
      flux.getVideoTracks()[0]?.addEventListener('ended', () => setCamera('indisponible'));
      setCamera('active');
      // Photo de contrôle à intervalle fixe : seulement si le réglage de test l'active.
      if (intervalleSecondes > 0) {
        setTimeout(() => void capturer(), 800);
        minuteur = setInterval(() => void capturer(), intervalleSecondes * 1000);
      }
      // Analyse par IA : chaque anomalie part avec sa photo.
      arreterAnalyse = demarrerAnalyse(
        video.current,
        absenceSecondes,
        (anomalie, photo) => void alerter(anomalie.type, anomalie.confiance, photo),
        (e) => {
          if (!arrete) setAnalyse(e);
        },
        DIAGNOSTIC
          ? (l) => {
              if (!arrete) setLecture(l);
            }
          : undefined,
      );
    };

    void demarrer();
    return () => {
      arrete = true;
      if (minuteur) clearInterval(minuteur);
      arreterAnalyse?.();
      flux?.getTracks().forEach((p) => p.stop());
    };
  }, [tentativeId, intervalleSecondes, absenceSecondes]);

  if (camera === 'indisponible') {
    return (
      <>
        <video ref={video} className="surveillance-video" muted playsInline aria-hidden="true" />
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
      </>
    );
  }

  const minutes = Math.max(1, Math.round(intervalleSecondes / 60));
  return (
    <>
      {/* Invisible : sert seulement à l'analyse ; l'apprenant ne voit pas sa vidéo. */}
      <video ref={video} className="surveillance-video" muted playsInline aria-hidden="true" />
      <div className="surveillance-active" role="status">
        <span
          className={`surveillance-point${camera === 'active' ? ' surveillance-point--actif' : ''}`}
          aria-hidden="true"
        />
        <div>
          <strong>
            {camera === 'active' ? 'Surveillance par caméra active' : 'Activation de la caméra…'}
          </strong>
          <span>
            Votre caméra est analysée automatiquement pendant ce QCM. Aucune vidéo n’est
            enregistrée : une photo est prise uniquement en cas d’anomalie (téléphone, autre
            personne, absence…)
            {intervalleSecondes > 0
              ? `, et une photo de contrôle ${minutes === 1 ? 'chaque minute' : `toutes les ${minutes} minutes`}.`
              : '.'}
          </span>
          {camera === 'active' ? (
            <span className={`surveillance-analyse surveillance-analyse--${analyse}`}>
              {analyse === 'active'
                ? 'Analyse automatique : en marche'
                : analyse === 'chargement'
                  ? 'Analyse automatique : démarrage…'
                  : 'Analyse automatique indisponible sur ce poste : votre formateur est prévenu.'}
            </span>
          ) : null}
          {DIAGNOSTIC && lecture ? (
            <span className="surveillance-diagnostic">
              Diagnostic (développement) — personnes : {lecture.personnes} · téléphone :{' '}
              {lecture.telephone.toFixed(2)}
              {lecture.telephone >= SEUILS.scoreTelephone ? ' ✔' : ''} (seuil{' '}
              {SEUILS.scoreTelephone}) · livre : {lecture.livre.toFixed(2)}
              {lecture.livre >= SEUILS.scoreLivre ? ' ✔' : ''} (seuil {SEUILS.scoreLivre}) ·
              luminosité : {Math.round(lecture.luminosite)}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );
}
