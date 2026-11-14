'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EnTetePage } from '../../../components/EnTetePage';
import { EtatVide } from '../../../components/EtatVide';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { SectionPage } from '../../../components/SectionPage';
import { AdminError, getEvaluationsFormateur, QcmAEvaluer } from '../../../lib/api';
import { LIBELLES_STATUT_QCM } from '../../../lib/format';
import { parFormation } from '../../../lib/ui-regles';

type Filtre = 'avec' | 'signales' | 'tous';

/**
 * US-UX-02 — « Tentatives des QCM » : chaque QCM de mes formations avec ses
 * tentatives, celles à évaluer et les alertes de la surveillance par IA à
 * examiner ; mène à l'historique des tentatives (rapport PDF, détail) ou à
 * l'éditeur du QCM. Les pages par QCM ne changent pas.
 */
export default function TentativesDesQcmPage(): JSX.Element {
  const [qcm, setQcm] = useState<QcmAEvaluer[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('avec');

  const charger = useCallback(async (): Promise<void> => {
    setErreur(null);
    try {
      setQcm((await getEvaluationsFormateur()).qcm);
    } catch (e) {
      setErreur(
        e instanceof AdminError && e.statut === 403
          ? 'Cette page est réservée aux formateurs.'
          : e instanceof AdminError
            ? e.message
            : 'Impossible de charger les QCM.',
      );
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const avec = useMemo(() => (qcm ?? []).filter((q) => q.tentatives > 0), [qcm]);
  const signales = useMemo(() => (qcm ?? []).filter((q) => q.alertesAExaminer > 0), [qcm]);
  const visibles = filtre === 'avec' ? avec : filtre === 'signales' ? signales : (qcm ?? []);

  return (
    <>
      <EnTetePage
        titre="Tentatives des QCM"
        phrase="Les QCM de vos formations et leurs tentatives. Ouvrez l’historique d’un QCM pour voir chaque tentative, son rapport et les alertes de l’IA."
      />
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {qcm === null ? (
        erreur === null && <p className="page-subtitle">Chargement…</p>
      ) : qcm.length === 0 ? (
        <EtatVide
          titre="Aucun QCM pour l’instant"
          texte="Créez un QCM dans le contenu d’une de vos formations ; ses tentatives apparaîtront ici."
          action={
            <Link className="btn btn-lien" href="/formateur/formations">
              Voir mes formations
            </Link>
          }
        />
      ) : (
        <>
          <div className="barre-filtres">
            <FiltresPastilles<Filtre>
              libelle="Filtrer les QCM"
              valeur={filtre}
              onChange={setFiltre}
              options={[
                { valeur: 'avec', libelle: 'Avec des tentatives', compteur: avec.length },
                { valeur: 'signales', libelle: 'Signalés par l’IA', compteur: signales.length },
                { valeur: 'tous', libelle: 'Tous les QCM', compteur: qcm.length },
              ]}
            />
            <p className="barre-filtres-resume" aria-live="polite">
              {filtre === 'avec'
                ? 'QCM qui ont au moins une tentative'
                : filtre === 'signales'
                  ? 'QCM avec des alertes de l’IA à examiner'
                  : 'Tous les QCM de vos formations, brouillons compris'}
            </p>
          </div>
          {visibles.length === 0 ? (
            <EtatVide
              titre={filtre === 'signales' ? 'Aucune alerte à examiner' : 'Aucune tentative pour l’instant'}
              texte={
                filtre === 'signales'
                  ? 'La surveillance par IA n’a rien signalé qui reste à examiner.'
                  : 'Les tentatives apparaîtront dès que des apprenants passeront vos QCM publiés.'
              }
              action={
                <button type="button" className="btn-sm" onClick={() => setFiltre('tous')}>
                  Voir tous les QCM
                </button>
              }
            />
          ) : (
            parFormation(visibles).map((g) => (
              <SectionPage key={g.id} titre={g.titre} icone="formation">
                <div className="table-wrap table-wrap-compacte">
                  <table className="data-table table-compacte">
                    <thead>
                      <tr>
                        <th scope="col">QCM</th>
                        <th scope="col">Statut</th>
                        <th scope="col">Tentatives</th>
                        <th scope="col">À évaluer</th>
                        <th scope="col">Alertes IA</th>
                        <th scope="col">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lignes.map((q) => (
                        <tr key={q.id} className={q.alertesAExaminer > 0 ? 'ligne-signalee' : undefined}>
                          <th scope="row">
                            <Link className="table-link lien-objet" href={`/formateur/qcm/${q.id}`}>
                              <Icone nom="qcm" taille={18} />
                              {q.titre}
                            </Link>
                            <div className="muted-cell">{q.moduleTitre}</div>
                          </th>
                          <td data-libelle="Statut">
                            <PastilleStatut statut={q.statut} libelle={LIBELLES_STATUT_QCM[q.statut]} />
                          </td>
                          <td data-libelle="Tentatives">{q.tentatives}</td>
                          <td data-libelle="À évaluer">{q.aEvaluer}</td>
                          <td data-libelle="Alertes IA">
                            {q.alertesAExaminer > 0 ? (
                              <PastilleStatut ton="danger" icone="surveillance" libelle={`${q.alertesAExaminer} à examiner`} />
                            ) : (
                              <span className="muted-cell">—</span>
                            )}
                          </td>
                          <td>
                            <Link className="btn-sm btn-lien" href={`/formateur/qcm/${q.id}/tentatives`}>
                              Voir les tentatives
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionPage>
            ))
          )}
        </>
      )}
    </>
  );
}
