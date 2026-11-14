'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CarteIndicateur, GroupeIndicateurs } from '../../../../../components/CarteIndicateur';
import { EnTeteFormation, adressesOngletsFormation } from '../../../../../components/EnTeteFormation';
import { Icone } from '../../../../../components/Icone';
import { SectionPage } from '../../../../../components/SectionPage';
import { useMiettes } from '../../../../../components/TitrePage';
import { AdminError, FormationDetailVue, getMaFormation, getSuiviFormation, SuiviFormation } from '../../../../../lib/api';
import { avancementMoyen } from '../../../../../lib/ui-regles';

/**
 * US-UX-04 — Onglet « Vue d'ensemble » de l'espace d'une formation : la fiche
 * (capacité, seuil de certification, description, objectifs, prérequis) et
 * les chiffres clés du suivi pédagogique existant, chacun menant à l'onglet
 * qui permet d'agir. Lecture seule ; « Modifier le contenu » reste dans
 * l'onglet « Contenu ».
 */
export default function VueEnsembleFormationPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [formation, setFormation] = useState<FormationDetailVue | null>(null);
  const [suivi, setSuivi] = useState<SuiviFormation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getMaFormation(id)
      .then(setFormation)
      .catch((e: unknown) => setErreur(e instanceof AdminError ? e.message : 'Impossible de charger la formation.'));
    getSuiviFormation(id)
      .then(setSuivi)
      .catch(() => setSuivi(null));
  }, [id]);

  useMiettes(formation ? [{ href: `/formateur/formations/${id}`, libelle: formation.titre }, { libelle: 'Vue d’ensemble' }] : null);
  const adresses = adressesOngletsFormation(id);
  const k = suivi?.kpis;
  const avancement = suivi ? avancementMoyen(suivi.apprenants) : null;

  return (
    <>
      <EnTeteFormation id={id} actif="apercu" formation={formation} />
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {formation && (
        <>
          {k && (
            <section aria-label="Chiffres clés de la formation">
              <GroupeIndicateurs>
                <CarteIndicateur
                  libelle="Apprenants actifs"
                  valeur={k.actifs}
                  icone="apprenants"
                  href={adresses.apprenants}
                  aide={`sur ${k.inscrits} inscrits (suivi pédagogique)`}
                />
                <CarteIndicateur
                  libelle="Avancement moyen"
                  valeur={avancement === null ? '—' : `${avancement} %`}
                  icone="tendance-hausse"
                  href={adresses.apprenants}
                  aide="des apprenants en cours"
                />
                <CarteIndicateur
                  libelle="Alertes ouvertes"
                  valeur={k.alertesOuvertes + k.surveillanceAExaminer}
                  icone="alerte"
                  href="/formateur/alertes"
                  etat={k.alertesOuvertes + k.surveillanceAExaminer > 0 ? 'attention' : 'normal'}
                  aide={`${k.alertesOuvertes} décrochage · ${k.surveillanceAExaminer} surveillance`}
                />
                <CarteIndicateur
                  libelle="Contenu publié"
                  valeur={k.qcmPublies + k.ateliersPublies}
                  icone="module"
                  href={adresses.contenu}
                  aide={`${k.qcmPublies} QCM · ${k.ateliersPublies} atelier${k.ateliersPublies > 1 ? 's' : ''} · ${formation.modules.length} module${formation.modules.length > 1 ? 's' : ''}`}
                />
              </GroupeIndicateurs>
            </section>
          )}

          <SectionPage titre="La formation" icone="formation" phrase="Réglages fixés par l’administrateur et contenu pédagogique.">
            <dl className="fiche">
              <div>
                <dt>Capacité</dt>
                <dd>{formation.capaciteMax} apprenants</dd>
              </div>
              <div>
                <dt>Seuil de certification</dt>
                <dd>{formation.noteMinCertification} %</dd>
              </div>
              {formation.description && (
                <div className="fiche-large">
                  <dt>Description</dt>
                  <dd>{formation.description}</dd>
                </div>
              )}
              {formation.objectifs && (
                <div className="fiche-large">
                  <dt>Objectifs pédagogiques</dt>
                  <dd>{formation.objectifs}</dd>
                </div>
              )}
              {formation.prerequis && (
                <div className="fiche-large">
                  <dt>Prérequis</dt>
                  <dd>{formation.prerequis}</dd>
                </div>
              )}
            </dl>
          </SectionPage>

          <SectionPage titre="Programme" icone="module" actions={
            <Link className="btn-sm btn-lien" href={adresses.contenu}>
              <Icone nom="module" taille={16} />
              Préparer le contenu
            </Link>
          }>
            <ol className="programme-liste">
              {formation.modules.map((m) => (
                <li key={m.id}>
                  <span className="module-ordre">{m.ordre}</span>
                  <span>{m.titre}</span>
                </li>
              ))}
            </ol>
          </SectionPage>
        </>
      )}
    </>
  );
}
