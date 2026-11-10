'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CroixFermeture } from '../../components/CroixFermeture';
import {
  AdminError,
  ConsequencesDesinscription,
  getConsequencesDesinscription,
  getMesInscriptions,
  InscriptionVue,
  seDesinscrire,
} from '../../lib/api';
import { dateFr, jourFr, LIBELLES_INSCRIPTION, periodeFr } from '../../lib/format';

/**
 * US-INSC-01 — Mes inscriptions (apprenant).
 *
 * Toutes mes inscriptions, la plus récente d'abord, y compris suspendues :
 * l'apprenant doit voir pourquoi il n'a plus accès. Le titre mène à « Mon
 * espace » dans la formation (modules et évaluations, US-INSC-04), sauf si
 * l'inscription est suspendue : l'accès est alors fermé.
 *
 * US-INSC-03 : « Se désinscrire » ouvre les conséquences (accès retiré,
 * évaluations en cours, certificats conservés) et demande une confirmation.
 */
export default function MesInscriptionsPage(): JSX.Element {
  const [inscriptions, setInscriptions] = useState<InscriptionVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aQuitter, setAQuitter] = useState<InscriptionVue | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setInscriptions(await getMesInscriptions());
    } catch (error) {
      setErreur(
        error instanceof AdminError && error.statut === 403
          ? 'Cet espace est réservé aux apprenants.'
          : error instanceof AdminError
            ? error.message
            : 'Impossible de charger vos inscriptions.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes inscriptions</h1>
          <p className="page-subtitle">Les formations auxquelles vous êtes inscrit.</p>
        </div>
        <div className="row-actions">
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {succes !== null && <p className="alert alert-success">{succes}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : erreur !== null ? null : inscriptions.length === 0 ? (
        <p className="page-subtitle">
          Vous n’êtes inscrit à aucune formation pour l’instant.{' '}
          <Link href="/catalogue">Parcourir le catalogue</Link>
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Période</th>
                <th>Inscrit le</th>
                <th>Échéance</th>
                <th>Avancement</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {inscriptions.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.statut !== 'SUSPENDUE' ? (
                      <Link className="table-link" href={`/mes-inscriptions/${i.formation.id}`}>
                        {i.formation.titre}
                      </Link>
                    ) : (
                      i.formation.titre
                    )}
                  </td>
                  <td>
                    {periodeFr(i.formation.dateDebut, i.formation.dateFin) ?? (
                      <span className="muted-cell">—</span>
                    )}
                  </td>
                  <td>{jourFr(i.dateInscription)}</td>
                  <td>{dateFr(i.dateEcheance)}</td>
                  <td>{i.tauxAvancement} %</td>
                  <td>
                    <span className={`statut-badge statut-${i.statut}`}>
                      {LIBELLES_INSCRIPTION[i.statut]}
                    </span>
                    {i.statut === 'SUSPENDUE' && (
                      <div className="muted-cell">Contactez un administrateur</div>
                    )}
                  </td>
                  <td>
                    {i.statut === 'EN_COURS' && (
                      <button
                        className="btn-sm"
                        onClick={() => {
                          setSucces(null);
                          setAQuitter(i);
                        }}
                      >
                        Se désinscrire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aQuitter !== null && (
        <DesinscriptionModal
          inscription={aQuitter}
          onClose={() => setAQuitter(null)}
          onDone={() => {
            setAQuitter(null);
            setSucces('Vous êtes désinscrit : vos certificats restent valides.');
            void charger();
          }}
        />
      )}
    </>
  );
}

/** US-INSC-03 — Conséquences, case de confirmation, puis désinscription. */
function DesinscriptionModal({
  inscription,
  onClose,
  onDone,
}: {
  inscription: InscriptionVue;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [infos, setInfos] = useState<ConsequencesDesinscription | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    getConsequencesDesinscription(inscription.formation.id)
      .then(setInfos)
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger les conséquences.'),
      );
  }, [inscription.formation.id]);

  const confirmer = async (): Promise<void> => {
    setErreur(null);
    setEnCours(true);
    try {
      await seDesinscrire(inscription.formation.id);
      onDone();
    } catch (e: unknown) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible de vous désinscrire.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Se désinscrire</h1>
        <p className="auth-subtitle">{inscription.formation.titre}</p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {infos === null ? (
          erreur === null && <p className="page-subtitle">Chargement…</p>
        ) : (
          <>
            <ul className="desinscription-consequences">
              {infos.consequences.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <label className="cycle-confirmation">
              <input
                type="checkbox"
                checked={confirme}
                onChange={(e) => setConfirme(e.target.checked)}
              />
              <span>J’ai compris ces conséquences et je confirme ma désinscription.</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose} disabled={enCours}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                disabled={!confirme || !infos.possible || enCours}
                onClick={() => void confirmer()}
              >
                {enCours ? 'Désinscription…' : 'Me désinscrire'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
