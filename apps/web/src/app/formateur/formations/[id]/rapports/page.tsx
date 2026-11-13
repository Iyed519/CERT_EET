'use client';
import { useMiettes } from '../../../../../components/TitrePage';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { ListeRapports } from '../../../../../components/ListeRapports';
import {
  AdminError,
  demanderRapportSession,
  FormatRapport,
  getMaFormation,
  getSuiviFormation,
  PorteeRapport,
} from '../../../../../lib/api';
import { nomApprenantFr } from '../../../../../lib/format';

const PORTEES: Array<[PorteeRapport, string, string]> = [
  ['GLOBAL', 'Vue globale', 'Indicateurs et une ligne par apprenant.'],
  ['INDIVIDUEL', 'Un apprenant', 'Tentatives, livrables, alertes d’un apprenant.'],
  ['MODULE', 'Par module', 'Meilleure note par évaluation publiée du module.'],
];

/**
 * US-RPT-01 — Exporter un rapport de session (DS-14 P3).
 *
 * Choix du format (CSV pour Excel, PDF) et de la portée ; la demande rend la
 * main tout de suite (génération en arrière-plan, email à la fin) et la
 * liste se met à jour seule. Formateur affecté ou administrateur.
 */
export default function RapportsFormationPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [titre, setTitre] = useState<string | null>(null);
  const [modules, setModules] = useState<Array<{ id: string; titre: string; ordre: number }>>([]);
  const [apprenants, setApprenants] = useState<Array<{ id: string; libelle: string }>>([]);
  const [format, setFormat] = useState<FormatRapport>('PDF');
  const [portee, setPortee] = useState<PorteeRapport>('GLOBAL');
  const [apprenantId, setApprenantId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([getMaFormation(id), getSuiviFormation(id)])
      .then(([f, s]) => {
        setTitre(f.titre);
        setModules([...f.modules].sort((a, b) => a.ordre - b.ordre));
        setApprenants(s.apprenants.map((a) => ({ id: a.id, libelle: `${nomApprenantFr(a)} — ${a.email}` })));
      })
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger la formation.'),
      );
  }, [id]);

  const pret =
    portee === 'GLOBAL' || (portee === 'INDIVIDUEL' && apprenantId) || (portee === 'MODULE' && moduleId);

  const demander = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await demanderRapportSession(id, {
        format,
        portee,
        ...(portee === 'INDIVIDUEL' ? { apprenantId } : {}),
        ...(portee === 'MODULE' ? { moduleId } : {}),
      });
      setInfo('Rapport demandé : il sera prêt dans quelques instants (un email vous préviendra).');
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible de demander le rapport.');
    } finally {
      setEnvoi(false);
    }
  };

  useMiettes([{ href: `/formateur/formations/${id}`, libelle: titre ?? 'La formation' }, { libelle: 'Rapports de session' }]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Rapports de session</h1>
          <p className="page-subtitle">
            Exportez un rapport de la session (vue globale, un apprenant ou un module) : il est
            préparé en arrière-plan puis listé dans « Rapports ». {titre ?? ''}
          </p>
        </div>
      </div>

      <form className="tdb-bloc rapport-form" onSubmit={(e) => void demander(e)}>
        <h2>Nouveau rapport</h2>
        <fieldset className="rapport-choix">
          <legend className="field-label">Format</legend>
          {(['PDF', 'CSV'] as FormatRapport[]).map((f) => (
            <label key={f} className="rapport-option">
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
              {f === 'PDF' ? 'PDF (à imprimer)' : 'CSV (Excel)'}
            </label>
          ))}
        </fieldset>
        <fieldset className="rapport-choix">
          <legend className="field-label">Portée</legend>
          {PORTEES.map(([p, libelle, aide]) => (
            <label key={p} className="rapport-option">
              <input type="radio" name="portee" checked={portee === p} onChange={() => setPortee(p)} />
              <span>
                {libelle}
                <span className="field-hint"> — {aide}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {portee === 'INDIVIDUEL' && (
          <label className="field">
            <span className="field-label">Apprenant</span>
            <select className="input" value={apprenantId} onChange={(e) => setApprenantId(e.target.value)}>
              <option value="">Choisir un apprenant…</option>
              {apprenants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </select>
          </label>
        )}
        {portee === 'MODULE' && (
          <label className="field">
            <span className="field-label">Module</span>
            <select className="input" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">Choisir un module…</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.ordre}. {m.titre}
                </option>
              ))}
            </select>
          </label>
        )}
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {info !== null && <p className="alert alert-info">{info}</p>}
        <button type="submit" className="btn" disabled={envoi || !pret}>
          {envoi ? 'Demande…' : 'Demander le rapport'}
        </button>
      </form>

      <section className="tdb-bloc" aria-label="Mes rapports de cette formation">
        <h2>Mes rapports de cette formation</h2>
        <ListeRapports formationId={id} version={version} />
      </section>
    </>
  );
}
