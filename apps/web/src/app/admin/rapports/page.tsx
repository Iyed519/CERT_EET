'use client';
import { useState } from 'react';
import { CarteModeleRapport } from '../../../components/CarteModeleRapport';
import { EnTetePage } from '../../../components/EnTetePage';
import { NomIcone } from '../../../components/Icone';
import { SectionPage } from '../../../components/SectionPage';
import { ListeRapports } from '../../../components/ListeRapports';
import {
  AdminError,
  demanderRapportInstitutionnel,
  FormatRapport,
  ModeleInstitutionnel,
} from '../../../lib/api';

const MODELES: Array<[ModeleInstitutionnel, string, string, NomIcone]> = [
  ['SYNTHESE', 'Synthèse de la plateforme', 'Utilisateurs, formations, évaluations, certificats.', 'pilotage'],
  ['FORMATIONS', 'Bilan par formation', 'Inscriptions, réussite aux QCM, ateliers, certificats.', 'formation'],
  ['CERTIFICATS', 'Registre des certificats', 'Certificats émis et consultations publiques.', 'certificat'],
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
  const [du, setDu] = useState(jour(-29));
  const [au, setAu] = useState(jour());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<ModeleInstitutionnel | null>(null);
  const [version, setVersion] = useState(0);

  // US-UX-08 : une carte par modèle ; même demande qu'avant (modèle, format, période).
  const demander = async (modele: ModeleInstitutionnel, format: FormatRapport): Promise<void> => {
    setErreur(null);
    setInfo(null);
    setEnvoi(modele);
    try {
      await demanderRapportInstitutionnel({ modele, format, du, au });
      setInfo('Rapport demandé : il sera prêt dans quelques instants (un email vous préviendra).');
      setVersion((v) => v + 1);
    } catch (err: unknown) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible de demander le rapport.');
    } finally {
      setEnvoi(null);
    }
  };

  return (
    <>
      <EnTetePage titre="Rapports institutionnels" phrase="Indicateurs agrégés sur une période, au format PDF ou CSV (Excel)." />

      <SectionPage
        titre="Nouveau rapport"
        icone="rapport"
        phrase="Choisissez la période, puis le modèle et son format : le rapport est préparé en arrière-plan (un email vous prévient)."
      >
        <div className="rapport-periode-commune">
          <label className="field">
            <span className="field-label">Du</span>
            <input className="input" type="date" value={du} onChange={(e) => setDu(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Au</span>
            <input className="input" type="date" value={au} onChange={(e) => setAu(e.target.value)} required />
          </label>
          <p className="field-hint">Jours inclus, heure de Tunis ; 366 jours au plus.</p>
        </div>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {info !== null && <p className="alert alert-info">{info}</p>}
        <div className="cartes-rapports">
          {MODELES.map(([m, libelle, aide, icone]) => (
            <CarteModeleRapport
              key={m}
              titre={libelle}
              description={aide}
              icone={icone}
              pret={Boolean(du && au)}
              envoi={envoi === m}
              onGenerer={(format) => void demander(m, format)}
            />
          ))}
        </div>
      </SectionPage>

      <SectionPage titre="Mes rapports" icone="telecharger" phrase="Les rapports que vous avez demandés, du plus récent au plus ancien.">
        <ListeRapports version={version} />
      </SectionPage>
    </>
  );
}
