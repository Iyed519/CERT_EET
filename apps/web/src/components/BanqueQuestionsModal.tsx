'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminError, Banque, getBanque, importerDeLaBanque } from '../lib/api';
import { LIBELLES_TYPE_QUESTION } from '../lib/format';
import { CroixFermeture } from './CroixFermeture';

/**
 * Modale « Importer depuis ma banque » (US-QCM-02) : questions de mes autres
 * QCM, recherche dans l'énoncé, sélection multiple. L'import crée une
 * LIAISON : la question reste la même, partagée entre les QCM — une question
 * « figée » (déjà tentée ailleurs) ne pourra changer que d'explication.
 */
export function BanqueQuestionsModal({
  qcmId,
  onClose,
  onImporte,
}: {
  qcmId: string;
  onClose: () => void;
  onImporte: () => void;
}): JSX.Element {
  const [recherche, setRecherche] = useState('');
  const [banque, setBanque] = useState<Banque | null>(null);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(
    async (texte: string): Promise<void> => {
      setErreur(null);
      try {
        setBanque(await getBanque(qcmId, texte));
      } catch (e) {
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger la banque.');
      }
    },
    [qcmId],
  );

  useEffect(() => {
    void charger('');
  }, [charger]);

  const basculer = (id: string): void =>
    setChoisies((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const chercher = (e: FormEvent): void => {
    e.preventDefault();
    void charger(recherche);
  };

  const importer = async (): Promise<void> => {
    setEnCours(true);
    setErreur(null);
    try {
      await importerDeLaBanque(qcmId, choisies);
      onImporte();
    } catch (e) {
      setErreur(e instanceof AdminError ? e.message : 'Impossible d’importer les questions.');
      setEnCours(false);
    }
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-closable modal-wide">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h2 className="auth-title">Importer depuis ma banque</h2>
        <p className="auth-subtitle">
          Questions de vos autres QCM. Elles sont liées, pas copiées : une modification se
          retrouve dans chaque QCM qui les utilise.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        <form className="banque-recherche" onSubmit={chercher}>
          <input
            className="input"
            type="search"
            aria-label="Rechercher dans l’énoncé"
            placeholder="Rechercher dans l’énoncé"
            maxLength={200}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <button type="submit" className="btn-sm">
            Rechercher
          </button>
        </form>

        {banque === null ? (
          <p className="page-subtitle">Chargement…</p>
        ) : banque.questions.length === 0 ? (
          <p className="page-subtitle">{banque.message ?? 'Aucune question.'}</p>
        ) : (
          <ul className="banque-liste">
            {banque.questions.map((q) => (
              <li key={q.id} className="banque-question">
                <label className="banque-choix">
                  <input
                    type="checkbox"
                    checked={choisies.includes(q.id)}
                    onChange={() => basculer(q.id)}
                    disabled={enCours}
                  />
                  <span className="banque-corps">
                    <span className="banque-enonce">{q.enonce}</span>
                    <span className="banque-meta">
                      {LIBELLES_TYPE_QUESTION[q.type]} · {q.options.length} options ·{' '}
                      {q.qcms.map((x) => x.titre).join(', ')}
                      {q.figee && <span className="statut-badge statut-EN_ATTENTE banque-figee">Figée</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={onClose}
            disabled={enCours}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void importer()}
            disabled={enCours || choisies.length === 0}
          >
            {enCours
              ? 'Import…'
              : choisies.length === 0
                ? 'Importer'
                : `Importer ${choisies.length} question${choisies.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </section>
    </div>
  );
}
