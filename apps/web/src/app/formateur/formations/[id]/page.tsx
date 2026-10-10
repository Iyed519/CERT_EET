'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AdminError,
  FormationDetailVue,
  getMaFormation,
  StatutFormation,
} from '../../../../lib/api';

const LIBELLES: Record<StatutFormation, string> = {
  OUVERTE: 'Ouverte',
  FERMEE: 'Fermée',
  ARCHIVEE: 'Archivée',
};

/** Ce que le statut change pour le formateur, en une phrase. */
const NOTES: Record<StatutFormation, string | null> = {
  OUVERTE: null,
  FERMEE: 'Formation fermée : elle n’accepte plus d’inscriptions.',
  ARCHIVEE: 'Formation archivée : elle est figée, consultation seulement.',
};

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
};

/**
 * US-AUTH-16 — Une de mes formations : sa fiche et ses modules, en lecture.
 *
 * C'est la première page servie derrière l'autorisation par ressource : un
 * formateur qui n'est pas affecté à cette formation reçoit un 403 (et le refus
 * est tracé côté serveur), même s'il connaît son identifiant.
 */
export default function MaFormationPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [formation, setFormation] = useState<FormationDetailVue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async (): Promise<void> => {
      setChargement(true);
      setErreur(null);
      try {
        setFormation(await getMaFormation(id));
      } catch (error) {
        setErreur(
          error instanceof AdminError ? error.message : 'Impossible de charger la formation.',
        );
      } finally {
        setChargement(false);
      }
    })();
  }, [id]);

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/formateur/formations">
          ← Mes formations
        </Link>
      </p>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : formation === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{formation.titre}</h1>
              <p className="page-subtitle">
                {formation.dateDebut || formation.dateFin
                  ? `${dateFr(formation.dateDebut)} → ${dateFr(formation.dateFin)}`
                  : 'Dates non définies'}
                {formation.dureeHeures !== null ? ` · ${formation.dureeHeures} h` : ''}
              </p>
            </div>
            <span className={`statut-badge statut-${formation.statut}`}>
              {LIBELLES[formation.statut]}
            </span>
          </div>

          {NOTES[formation.statut] !== null && (
            <p className="alert alert-info">{NOTES[formation.statut]}</p>
          )}

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

          <h2 className="section-title">Modules</h2>
          {formation.modules.length === 0 ? (
            <p className="page-subtitle">Aucun module pour l’instant.</p>
          ) : (
            <ol className="module-list">
              {formation.modules.map((m) => (
                <li key={m.id} className="module-item">
                  <span className="module-ordre">{m.ordre}</span>
                  <div className="module-corps">
                    <div className="module-titre">{m.titre}</div>
                    {m.description && <div className="field-hint">{m.description}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
