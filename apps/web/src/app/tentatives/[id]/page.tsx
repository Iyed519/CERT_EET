'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminError, getTentative, TentativeConsultee } from '../../../lib/api';
import { compteAReboursFr, dateHeureFr, dureeFr, LIBELLES_TENTATIVE } from '../../../lib/format';

/**
 * US-QCM-05 — Page d'une tentative en cours (DS-02, après l'étape 1).
 *
 * Elle survit à un rechargement : tout vient de GET /api/tentatives/:id (D14),
 * pas d'un état gardé dans le navigateur.
 *
 * Le compte à rebours ne fait pas confiance à l'horloge du navigateur : la
 * réponse porte l'heure du SERVEUR (`maintenant`) ; j'en déduis l'écart avec
 * l'horloge locale une fois, puis je décompte jusqu'à l'échéance fixée par le
 * serveur. Avancer l'heure du poste ne donne pas une seconde de plus. Ce
 * compteur n'est qu'un affichage : c'est le serveur qui refusera une réponse
 * hors délai (US-QCM-07).
 *
 * Les questions arrivent avec US-QCM-06 ; d'ici là, la page l'annonce.
 */
export default function TentativePage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tentativeId = params?.id ?? '';
  const [tentative, setTentative] = useState<TentativeConsultee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Heure du serveur moins heure locale, mesurée à la réception.
  const [ecart, setEcart] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    if (!tentativeId) return;
    void (async (): Promise<void> => {
      try {
        const vue = await getTentative(tentativeId);
        setEcart(new Date(vue.maintenant).getTime() - Date.now());
        setTentative(vue);
      } catch (error) {
        setErreur(
          error instanceof AdminError ? error.message : 'Impossible de charger cette tentative.',
        );
      }
    })();
  }, [tentativeId]);

  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(minuterie);
  }, []);

  if (erreur !== null) {
    return (
      <>
        <p className="back-link-row">
          <Link className="back-link" href="/mes-inscriptions">
            ← Mes inscriptions
          </Link>
        </p>
        <p className="alert alert-error">{erreur}</p>
      </>
    );
  }
  if (tentative === null) {
    return <p className="page-subtitle">Chargement…</p>;
  }

  const restant = new Date(tentative.dateLimite).getTime() - (maintenant + ecart);
  const enCours = tentative.statut === 'EN_COURS' && restant > 0;
  const bientotFini = enCours && restant <= 5 * 60_000;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href={`/mes-inscriptions/${tentative.formationId}`}>
          ← Mon espace
        </Link>
      </p>

      <div className="page-head">
        <div>
          <h1 className="page-title">{tentative.qcmTitre}</h1>
          <p className="page-subtitle">
            Tentative {tentative.numero} sur {tentative.nbTentativesMax} · durée{' '}
            {dureeFr(tentative.dureeMaxMinutes)}
          </p>
        </div>
        <span className={`statut-badge tentative-${enCours ? 'EN_COURS' : 'FINIE'}`}>
          {enCours
            ? LIBELLES_TENTATIVE.EN_COURS
            : tentative.statut === 'EN_COURS'
              ? 'Temps écoulé'
              : LIBELLES_TENTATIVE[tentative.statut]}
        </span>
      </div>

      <section
        className={`chrono${bientotFini ? ' chrono-alerte' : ''}${enCours ? '' : ' chrono-fini'}`}
        aria-label="Temps restant"
      >
        <span className="chrono-libelle">Temps restant</span>
        <span className="chrono-valeur" role="timer" aria-live="off">
          {compteAReboursFr(enCours ? restant : 0)}
        </span>
        <span className="field-hint">
          Démarrée le {dateHeureFr(tentative.dateDebut)} · fin au plus tard le{' '}
          {dateHeureFr(tentative.dateLimite)}
        </span>
      </section>

      {enCours ? (
        <p className="alert alert-info">
          Les questions de l’évaluation s’afficheront ici. Le temps continue de courir même si vous
          quittez cette page : vous pourrez la reprendre depuis votre espace.
        </p>
      ) : (
        <p className="alert alert-info">
          Cette tentative est terminée. Revenez à votre espace pour voir où vous en êtes.
        </p>
      )}
    </>
  );
}
