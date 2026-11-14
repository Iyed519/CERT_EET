'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EnTetePage } from '../../../components/EnTetePage';
import { EtatVide } from '../../../components/EtatVide';
import { Icone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { AdminError, FormationTableauDeBordFormateur, getTableauDeBordFormateur } from '../../../lib/api';
import { LIBELLES_STATUT_FORMATION_UN } from '../../../lib/format';

/**
 * US-UX-02 — « Apprenants » : une carte par formation (inscrits, actifs,
 * alertes de décrochage ouvertes) qui mène au suivi pédagogique de la
 * formation et à ses rapports. Données du tableau de bord du formateur
 * (aucun nouvel appel) ; le suivi lui-même ne change pas.
 */
export default function ApprenantsPage(): JSX.Element {
  const [formations, setFormations] = useState<FormationTableauDeBordFormateur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getTableauDeBordFormateur()
      .then((t) => setFormations(t.mesFormations))
      .catch((e: unknown) =>
        setErreur(
          e instanceof AdminError && e.statut === 403
            ? 'Cette page est réservée aux formateurs.'
            : e instanceof AdminError
              ? e.message
              : 'Impossible de charger vos formations.',
        ),
      );
  }, []);

  return (
    <>
      <EnTetePage
        titre="Apprenants"
        phrase="Le suivi pédagogique de chaque formation : avancement, notes, inactivité et alertes de vos apprenants."
      />
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {formations === null ? (
        erreur === null && <p className="page-subtitle">Chargement…</p>
      ) : formations.length === 0 ? (
        <EtatVide
          titre="Aucune formation pour l’instant"
          texte="Le suivi des apprenants apparaît dès qu’un administrateur vous affecte à une formation."
          action={
            <Link className="btn btn-lien" href="/formateur/demandes">
              Demander une formation
            </Link>
          }
        />
      ) : (
        <ul className="cartes-suivi">
          {formations.map((f) => (
            <li key={f.id} className="carte-suivi">
              <div className="carte-suivi-tete">
                <span className="section-page-icone">
                  <Icone nom="formation" taille={20} />
                </span>
                <h2 className="carte-suivi-titre">{f.titre}</h2>
                <PastilleStatut statut={f.statut} libelle={LIBELLES_STATUT_FORMATION_UN[f.statut] ?? f.statut} />
              </div>
              <dl className="carte-suivi-chiffres">
                <div>
                  <dt>Inscrits</dt>
                  <dd>{f.inscrits}</dd>
                </div>
                <div>
                  <dt>Actifs</dt>
                  <dd>{f.actifs}</dd>
                </div>
                <div>
                  <dt>Alertes ouvertes</dt>
                  <dd className={f.alertesOuvertes > 0 ? 'chiffre-alerte' : undefined}>{f.alertesOuvertes}</dd>
                </div>
              </dl>
              <div className="carte-suivi-actions">
                <Link className="btn-sm btn-primary-sm btn-lien" href={`/formateur/formations/${f.id}/suivi`}>
                  <Icone nom="apprenants" taille={16} />
                  Suivi pédagogique
                </Link>
                <Link className="btn-sm btn-lien" href={`/formateur/formations/${f.id}/rapports`}>
                  <Icone nom="rapport" taille={16} />
                  Rapports
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
