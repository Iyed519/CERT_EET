'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminError, EspaceFormationVue, getMonEspace } from '../../../lib/api';
import {
  dateFr,
  LIBELLES_AVANCEMENT_MODULE,
  LIBELLES_AVANCEMENT_QCM,
  LIBELLES_INSCRIPTION,
  periodeFr,
} from '../../../lib/format';

/** Ce que le statut de la formation change pour l'apprenant, en une phrase. */
const NOTES_FORMATION: Record<string, string | null> = {
  OUVERTE: null,
  FERMEE: 'Formation fermée aux nouvelles inscriptions : votre accès au contenu est conservé.',
  ARCHIVEE: 'Formation archivée : son contenu est figé, consultation seulement.',
};

/**
 * US-INSC-04 — Mon espace dans une formation (DS-09, étapes 1 et 2).
 *
 * Progression, échéance, puis les modules dans l'ordre avec leurs QCM
 * publiés et MON avancement sur chacun. Aucune question n'est chargée ici.
 * Le passage d'un QCM arrive avec US-QCM-05 : le bouton « Commencer » est
 * affiché mais inactif. Un apprenant non inscrit, ou dont l'inscription est
 * suspendue, reçoit le message exact du serveur (403).
 */
export default function MonEspacePage(): JSX.Element {
  const params = useParams<{ formationId: string }>();
  const formationId = params?.formationId ?? '';
  const [espace, setEspace] = useState<EspaceFormationVue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!formationId) return;
    void (async (): Promise<void> => {
      setChargement(true);
      setErreur(null);
      try {
        setEspace(await getMonEspace(formationId));
      } catch (error) {
        setErreur(
          error instanceof AdminError
            ? error.message
            : 'Impossible de charger votre espace de formation.',
        );
      } finally {
        setChargement(false);
      }
    })();
  }, [formationId]);

  const avancement = espace ? Math.round(espace.inscription.tauxAvancement) : 0;
  const note = espace ? NOTES_FORMATION[espace.formation.statut] : null;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/mes-inscriptions">
          ← Mes inscriptions
        </Link>
      </p>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : espace === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{espace.formation.titre}</h1>
              <p className="page-subtitle">
                {periodeFr(espace.formation.dateDebut, espace.formation.dateFin) ??
                  'Dates non définies'}
                {espace.formation.dureeHeures !== null
                  ? ` · ${espace.formation.dureeHeures} h`
                  : ''}
              </p>
            </div>
            <span className={`statut-badge statut-${espace.inscription.statut}`}>
              {LIBELLES_INSCRIPTION[espace.inscription.statut]}
            </span>
          </div>

          {note && <p className="alert alert-info">{note}</p>}

          <section className="progression" aria-label="Ma progression">
            <div className="progression-tete">
              <span className="progression-libelle">Ma progression</span>
              <span className="progression-valeur">{avancement} %</span>
            </div>
            <div
              className="progression-barre"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={avancement}
            >
              <div className="progression-remplie" style={{ width: `${avancement}%` }} />
            </div>
            <p className="field-hint">
              Échéance : {dateFr(espace.inscription.dateEcheance)} · Certification à partir de{' '}
              {espace.formation.noteMinCertification} %
            </p>
          </section>

          <h2 className="section-title">Modules</h2>
          {espace.modules.length === 0 ? (
            <p className="page-subtitle">Le programme n’est pas encore publié.</p>
          ) : (
            <ol className="espace-modules">
              {espace.modules.map((m) => (
                <li key={m.id} className="espace-module">
                  <div className="espace-module-tete">
                    <span className="module-ordre">{m.ordre}</span>
                    <div className="module-corps">
                      <div className="module-titre">{m.titre}</div>
                      {m.description && <div className="field-hint">{m.description}</div>}
                    </div>
                    {m.avancement !== 'SANS_EVALUATION' && (
                      <span className={`statut-badge avancement-${m.avancement}`}>
                        {LIBELLES_AVANCEMENT_MODULE[m.avancement]}
                      </span>
                    )}
                  </div>

                  {m.qcms.length === 0 ? (
                    <p className="espace-vide">Aucune évaluation publiée dans ce module.</p>
                  ) : (
                    <ul className="espace-qcms">
                      {m.qcms.map((q) => (
                        <li key={q.id} className="espace-qcm">
                          <div className="module-corps">
                            <div className="espace-qcm-titre">QCM · {q.titre}</div>
                            {q.description && <div className="field-hint">{q.description}</div>}
                          </div>
                          <span className={`statut-badge avancement-${q.avancement}`}>
                            {LIBELLES_AVANCEMENT_QCM[q.avancement]}
                          </span>
                          <button
                            type="button"
                            className="btn-sm"
                            disabled
                            title="Le passage des QCM arrive bientôt."
                          >
                            Commencer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
