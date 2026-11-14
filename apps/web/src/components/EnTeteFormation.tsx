'use client';
import { useEffect, useState } from 'react';
import { FormationDetailVue, getMaFormation } from '../lib/api';
import { LIBELLES_STATUT_FORMATION_UN } from '../lib/format';
import { Onglets } from './Onglets';
import { PastilleStatut } from './PastilleStatut';

export type OngletFormation = 'apercu' | 'contenu' | 'apprenants' | 'rapports';

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
};

/** Adresse de chaque onglet de l'espace d'une formation (US-UX-04). */
export function adressesOngletsFormation(id: string): Record<OngletFormation, string> {
  return {
    apercu: `/formateur/formations/${id}/vue-d-ensemble`,
    contenu: `/formateur/formations/${id}`,
    apprenants: `/formateur/formations/${id}/suivi`,
    rapports: `/formateur/formations/${id}/rapports`,
  };
}

/**
 * US-UX-04 — En-tête commun de l'espace d'une formation (formateur) : titre,
 * statut, dates, puis les onglets « Vue d'ensemble », « Contenu »,
 * « Apprenants » (suivi pédagogique) et « Rapports », chacun avec son adresse.
 * La formation est passée par la page qui l'a déjà, sinon lue ici.
 */
export function EnTeteFormation({
  id,
  actif,
  formation: donnee,
}: {
  id: string;
  actif: OngletFormation;
  formation?: FormationDetailVue | null;
}): JSX.Element {
  const [lue, setLue] = useState<FormationDetailVue | null>(null);
  useEffect(() => {
    if (donnee !== undefined || !id) return;
    getMaFormation(id)
      .then(setLue)
      .catch(() => setLue(null));
  }, [id, donnee]);
  const f = donnee ?? lue;
  const adresses = adressesOngletsFormation(id);
  return (
    <div className="entete-formation">
      <div className="page-head">
        <div>
          <h1 className="page-title">{f?.titre ?? 'Formation'}</h1>
          {f && (
            <p className="page-subtitle">
              {f.dateDebut || f.dateFin ? `${dateFr(f.dateDebut)} → ${dateFr(f.dateFin)}` : 'Dates non définies'}
              {f.dureeHeures !== null ? ` · ${f.dureeHeures} h` : ''}
              {` · ${f.modules.length} module${f.modules.length > 1 ? 's' : ''}`}
            </p>
          )}
        </div>
        {f && <PastilleStatut statut={f.statut} libelle={LIBELLES_STATUT_FORMATION_UN[f.statut] ?? f.statut} />}
      </div>
      <Onglets
        libelle="Sections de la formation"
        actif={actif}
        onglets={[
          { id: 'apercu', libelle: 'Vue d’ensemble', icone: 'formation', href: adresses.apercu },
          { id: 'contenu', libelle: 'Contenu', icone: 'module', href: adresses.contenu, compteur: f?.modules.length },
          { id: 'apprenants', libelle: 'Apprenants', icone: 'apprenants', href: adresses.apprenants },
          { id: 'rapports', libelle: 'Rapports', icone: 'rapport', href: adresses.rapports },
        ]}
      />
    </div>
  );
}
