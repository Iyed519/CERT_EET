'use client';
import { FormEvent, useState } from 'react';
import { CroixFermeture } from './CroixFermeture';
import { AdminError, importerComptes, ResultatImportComptes } from '../lib/api';

const LIBELLES_ROLE: Record<string, string> = {
  APPRENANT: 'Apprenant',
  FORMATEUR: 'Formateur',
  ADMINISTRATEUR: 'Administrateur',
};

/**
 * US-CPT-02 — Import CSV de comptes (administrateur). Tout ou rien : si une
 * seule ligne est fautive, aucun compte n'est créé et le rapport liste chaque
 * ligne à corriger. Les comptes créés attendent leur activation par email.
 */
export default function ImportComptesModal({
  onClose,
  onImporte,
}: {
  onClose: () => void;
  onImporte: (message: string) => void;
}): JSX.Element {
  const [fichier, setFichier] = useState<File | null>(null);
  const [resultat, setResultat] = useState<ResultatImportComptes | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!fichier) return;
    setErreur(null);
    setResultat(null);
    setEnCours(true);
    try {
      const r = await importerComptes(fichier);
      setResultat(r);
      if (r.ok) {
        onImporte(
          `${r.crees} compte(s) créé(s). Chaque personne reçoit un email pour activer son compte (lien valable 48 heures).`,
        );
      }
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Une erreur est survenue.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true" aria-labelledby="titre-import">
      <section className="profil-card modal-closable import-comptes">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title" id="titre-import">
          Importer des comptes (CSV)
        </h1>
        <p className="auth-subtitle">
          Une ligne d’en-tête, puis un compte par ligne. Colonnes : <code>email</code>,{' '}
          <code>nom</code>, <code>prenom</code> et, facultative, <code>role</code> (APPRENANT par
          défaut, ou FORMATEUR). Séparateur point-virgule ou virgule ; 500 comptes et 256 Ko au plus.
        </p>
        <pre className="import-exemple" aria-label="Exemple de fichier">
          {'email;nom;prenom;role\namel.abidi@exemple.tn;Abidi;Amel;\nsami.trabelsi@exemple.tn;Trabelsi;Sami;FORMATEUR'}
        </pre>
        <p className="field-hint">
          Tout ou rien : si une seule ligne est incorrecte, aucun compte n’est créé. Les comptes
          créés reçoivent un email d’activation pour choisir leur mot de passe.
        </p>

        {resultat?.ok ? (
          <>
            <p className="alert alert-success">{resultat.crees} compte(s) créé(s) — en attente d’activation.</p>
            <div className="table-wrap import-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ligne</th>
                    <th>E-mail</th>
                    <th>Rôle</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.comptes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.ligne}</td>
                      <td className="cellule-coupable">{c.email}</td>
                      <td>{LIBELLES_ROLE[c.role] ?? c.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form className="form" onSubmit={envoyer}>
            <div className="field">
              <label className="field-label" htmlFor="fichier-comptes">
                Fichier CSV
              </label>
              <input
                id="fichier-comptes"
                className="input"
                type="file"
                accept=".csv,text/csv"
                required
                disabled={enCours}
                onChange={(e) => {
                  setFichier(e.target.files?.[0] ?? null);
                  setResultat(null);
                  setErreur(null);
                }}
              />
            </div>
            {erreur !== null && <p className="alert alert-error">{erreur}</p>}
            {resultat && !resultat.ok && (
              <>
                <p className="alert alert-error">{resultat.message}</p>
                <div className="table-wrap import-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ligne</th>
                        <th>E-mail</th>
                        <th>À corriger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultat.erreurs.map((e) => (
                        <tr key={e.ligne}>
                          <td>{e.ligne}</td>
                          <td className="cellule-coupable">{e.email || '—'}</td>
                          <td>{e.libelles.join(' ; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn-sm btn-ghost" type="button" onClick={onClose} disabled={enCours}>
                Annuler
              </button>
              <button className="btn" type="submit" disabled={enCours || !fichier}>
                {enCours ? 'Import…' : 'Importer'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
