'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ActionInscription } from '../../../components/ActionInscription';
import { ConfirmationInscription } from '../../../components/ConfirmationInscription';
import { useAuth } from '../../../contexts/AuthContext';
import { AdminError, FormationCatalogueDetailVue, getFormation } from '../../../lib/api';
import { LIBELLES_INSCRIPTION, periodeFr } from '../../../lib/format';

/**
 * US-INSC-01 — Fiche d'une formation du catalogue (DS-08, étape 2).
 *
 * L'apprenant y lit ce qu'il faut savoir AVANT de s'inscrire : période,
 * places restantes, description, objectifs, prérequis et intitulés des
 * modules. Le contenu des modules s'ouvre après l'inscription (US-INSC-04).
 * Une formation fermée ou archivée répond 404 : elle n'est plus au catalogue.
 */
export default function FormationCataloguePage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user } = useAuth();
  const estApprenant = user?.role === 'APPRENANT';
  const [formation, setFormation] = useState<FormationCatalogueDetailVue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    if (!id) return;
    setChargement(true);
    setErreur(null);
    try {
      setFormation(await getFormation(id));
    } catch (error) {
      setErreur(
        error instanceof AdminError ? error.message : 'Impossible de charger la formation.',
      );
    } finally {
      setChargement(false);
    }
  }, [id]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const periode = formation ? periodeFr(formation.dateDebut, formation.dateFin) : null;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/catalogue">
          ← Catalogue
        </Link>
      </p>

      {succes !== null && (
        <p className="alert alert-success">
          {succes} <Link href="/mes-inscriptions">Voir mes inscriptions</Link>
        </p>
      )}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement && formation === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : formation === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{formation.titre}</h1>
              <p className="page-subtitle">
                {periode ?? 'Dates non définies'}
                {formation.dureeHeures !== null ? ` · ${formation.dureeHeures} h` : ''}
              </p>
            </div>
            {estApprenant && (
              <div className="row-actions">
                {formation.statutInscription !== null && (
                  <span className={`statut-badge statut-${formation.statutInscription}`}>
                    {LIBELLES_INSCRIPTION[formation.statutInscription]}
                  </span>
                )}
                {(formation.statutInscription === 'EN_COURS' ||
                  formation.statutInscription === 'TERMINEE') && (
                  <Link
                    className="btn-sm btn-link btn-primary-sm"
                    href={`/mes-inscriptions/${formation.id}`}
                  >
                    Accéder à mon espace
                  </Link>
                )}
                <ActionInscription
                  formation={formation}
                  onInscrire={() => {
                    setSucces(null);
                    setConfirmation(true);
                  }}
                />
              </div>
            )}
          </div>

          {formation.statutInscription === 'SUSPENDUE' && (
            <p className="alert alert-info">
              Votre inscription à cette formation est suspendue. Seul un administrateur peut la
              réactiver.
            </p>
          )}

          <dl className="fiche">
            <div>
              <dt>Places restantes</dt>
              <dd>
                {formation.placesRestantes === 0
                  ? 'Complète'
                  : `${formation.placesRestantes} sur ${formation.capaciteMax}`}
              </dd>
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

          <h2 className="section-title">Programme</h2>
          {formation.modules.length === 0 ? (
            <p className="page-subtitle">Le programme n’est pas encore publié.</p>
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

      {confirmation && formation !== null && (
        <ConfirmationInscription
          formation={formation}
          onClose={() => setConfirmation(false)}
          onInscrit={() => {
            setConfirmation(false);
            setSucces('Inscription confirmée.');
            void charger();
          }}
          onRefus={() => void charger()}
        />
      )}
    </>
  );
}
