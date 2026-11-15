'use client';
import { useMiettes } from '../../../../../components/TitrePage';
import { EnTeteFormation } from '../../../../../components/EnTeteFormation';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CarteModeleRapport } from '../../../../../components/CarteModeleRapport';
import { NomIcone } from '../../../../../components/Icone';
import { SectionPage } from '../../../../../components/SectionPage';
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

const PORTEES: Array<[PorteeRapport, string, string, NomIcone]> = [
  ['GLOBAL', 'Vue globale', 'Indicateurs et une ligne par apprenant.', 'apprenants'],
  ['INDIVIDUEL', 'Un apprenant', 'Tentatives, livrables, alertes d’un apprenant.', 'apprenant'],
  ['MODULE', 'Par module', 'Meilleure note par évaluation publiée du module.', 'module'],
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
  const [apprenantId, setApprenantId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<PorteeRapport | null>(null);
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

  // US-UX-08 : une carte par portée ; même demande qu'avant (format, portée, apprenant ou module).
  const pret = (portee: PorteeRapport): boolean =>
    portee === 'GLOBAL' || (portee === 'INDIVIDUEL' && apprenantId !== '') || (portee === 'MODULE' && moduleId !== '');

  const demander = async (portee: PorteeRapport, format: FormatRapport): Promise<void> => {
    setErreur(null);
    setInfo(null);
    setEnvoi(portee);
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
      setEnvoi(null);
    }
  };

  useMiettes([{ href: `/formateur/formations/${id}`, libelle: titre ?? 'La formation' }, { libelle: 'Rapports de session' }]);
  return (
    <>
      <EnTeteFormation id={id} actif="rapports" />
      <div className="page-head">
        <div>
          <h2 className="page-title page-title-onglet">Rapports de session</h2>
          <p className="page-subtitle">
            Exportez un rapport de la session (vue globale, un apprenant ou un module) : il est
            préparé en arrière-plan puis listé dans « Rapports ». {titre ?? ''}
          </p>
        </div>
      </div>

      <SectionPage titre="Nouveau rapport" icone="rapport" phrase="Choisissez la portée et le format : le rapport est préparé en arrière-plan puis listé ci-dessous.">
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {info !== null && <p className="alert alert-info">{info}</p>}
        <div className="cartes-rapports">
          {PORTEES.map(([p, libelle, aide, icone]) => (
            <CarteModeleRapport
              key={p}
              titre={libelle}
              description={aide}
              icone={icone}
              pret={pret(p)}
              envoi={envoi === p}
              onGenerer={(format) => void demander(p, format)}
            >
              {p === 'INDIVIDUEL' && (
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
              {p === 'MODULE' && (
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
            </CarteModeleRapport>
          ))}
        </div>
      </SectionPage>

      <SectionPage titre="Mes rapports de cette formation" icone="telecharger">
        <ListeRapports formationId={id} version={version} />
      </SectionPage>
    </>
  );
}
