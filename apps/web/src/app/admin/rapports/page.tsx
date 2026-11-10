'use client';
import { FormEvent, useState } from 'react';
import { ListeRapports } from '../../../components/ListeRapports';
import {
  AdminError,
  demanderRapportInstitutionnel,
  FormatRapport,
  ModeleInstitutionnel,
} from '../../../lib/api';

const MODELES: Array<[ModeleInstitutionnel, string, string]> = [
  ['SYNTHESE', 'Synthèse de la plateforme', 'Utilisateurs, formations, évaluations, certificats.'],
  ['FORMATIONS', 'Bilan par formation', 'Inscriptions, réussite aux QCM, ateliers, certificats.'],
  ['CERTIFICATS', 'Registre des certificats', 'Certificats émis et consultations publiques.'],
];

/** Date du jour de Tunis, décalée de `jours` (AAAA-MM-JJ). */
function jour(jours = 0): string {
  const d = new Date(Date.now() + jours * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Africa/Tunis' });
}

/**
 * US-RPT-02 — Rapports institutionnels (DS-16 P4).
 *
 * Modèle, format et période (jours inclus, heure de Tunis) ; la demande rend
 * la main tout de suite (génération en arrière-plan, email à la fin). Une
 * période invalide (début après la fin, plus de 366 jours) est refusée par
 * l'API avec un message clair, affiché ici.
 */
export default function RapportsInstitutionnelsPage(): JSX.Element {
  const [modele, setModele] = useState<ModeleInstitutionnel>('SYNTHESE');
  const [format, setFormat] = useState<FormatRapport>('PDF');
  const [du, setDu] = useState(jour(-29));
  const [au, setAu] = useState(jour());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [version, setVersion] = useState(0);

  const demander = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await demanderRapportInstitutionnel({ modele, format, du, au });
      setInfo('Rapport demandé : il sera prêt dans quelques instants (un email vous préviendra).');
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible de demander le rapport.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Rapports institutionnels</h1>
          <p className="page-subtitle">
            Indicateurs agrégés sur une période, au format PDF ou CSV (Excel).
          </p>
        </div>
      </div>

      <form className="tdb-bloc rapport-form" onSubmit={(e) => void demander(e)}>
        <h2>Nouveau rapport</h2>
        <fieldset className="rapport-choix">
          <legend className="field-label">Type de rapport</legend>
          {MODELES.map(([m, libelle, aide]) => (
            <label key={m} className="rapport-option">
              <input type="radio" name="modele" checked={modele === m} onChange={() => setModele(m)} />
              <span>
                {libelle}
                <span className="field-hint"> — {aide}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="rapport-choix">
          <legend className="field-label">Format</legend>
          {(['PDF', 'CSV'] as FormatRapport[]).map((f) => (
            <label key={f} className="rapport-option">
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
              {f === 'PDF' ? 'PDF (à imprimer)' : 'CSV (Excel)'}
            </label>
          ))}
        </fieldset>
        <div className="rapport-periode">
          <label className="field">
            <span className="field-label">Du</span>
            <input className="input" type="date" value={du} onChange={(e) => setDu(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Au</span>
            <input className="input" type="date" value={au} onChange={(e) => setAu(e.target.value)} required />
          </label>
        </div>
        <p className="field-hint">Jours inclus, heure de Tunis ; 366 jours au plus.</p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {info !== null && <p className="alert alert-info">{info}</p>}
        <button type="submit" className="btn" disabled={envoi || !du || !au}>
          {envoi ? 'Demande…' : 'Demander le rapport'}
        </button>
      </form>

      <section className="tdb-bloc" aria-label="Mes rapports">
        <h2>Mes rapports</h2>
        <ListeRapports version={version} />
      </section>
    </>
  );
}
