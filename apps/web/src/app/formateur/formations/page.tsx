'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  getCompteurAlertes,
  getMesFormations,
  MaFormation,
  StatutFormation,
} from '../../../lib/api';

/** Libellés FR des statuts (l'enum backend reste la source de vérité). */
const LIBELLES: Record<StatutFormation, string> = {
  BROUILLON: 'Brouillon',
  OUVERTE: 'Ouverte',
  FERMEE: 'Fermée',
  ARCHIVEE: 'Archivée',
};

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
};

/** Horodatage ISO -> JJ/MM/AAAA (date locale du navigateur). */
const jourFr = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

/**
 * US-AUTH-16 — Espace formateur : les formations auxquelles je suis affecté.
 *
 * Toutes, quel que soit leur statut : une formation fermée ou archivée reste
 * consultable par son formateur, alors que le catalogue public ne montre que
 * les formations ouvertes. La liste vient du serveur, qui ne lit que MES
 * affectations ; un compte qui n'est pas formateur reçoit un 403.
 */
export default function MesFormationsPage(): JSX.Element {
  const [formations, setFormations] = useState<MaFormation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      setFormations(await getMesFormations());
    } catch (error) {
      setErreur(
        error instanceof AdminError && error.statut === 403
          ? 'Cet espace est réservé aux formateurs.'
          : error instanceof AdminError
            ? error.message
            : 'Impossible de charger vos formations.',
      );
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes formations</h1>
          <p className="page-subtitle">
            Les formations auxquelles un administrateur vous a affecté.
          </p>
        </div>
        <div className="row-actions">
          <AlertesLien />
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : erreur !== null ? null : formations.length === 0 ? (
        <p className="page-subtitle">
          Vous n’êtes affecté à aucune formation pour l’instant. Un administrateur peut vous
          affecter depuis la page Formations de l’administration.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Période</th>
                <th>Statut</th>
                <th>Affecté le</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {formations.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link className="table-link" href={`/formateur/formations/${f.id}`}>
                      {f.titre}
                    </Link>
                    {f.dureeHeures !== null && (
                      <div className="muted-cell">{f.dureeHeures} h</div>
                    )}
                  </td>
                  <td>
                    {f.dateDebut || f.dateFin ? (
                      `${dateFr(f.dateDebut)} → ${dateFr(f.dateFin)}`
                    ) : (
                      <span className="muted-cell">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`statut-badge statut-${f.statut}`}>{LIBELLES[f.statut]}</span>
                  </td>
                  <td>{jourFr(f.affecteLe)}</td>
                  <td>
                    <Link className="btn-sm btn-link" href={`/formateur/formations/${f.id}`}>
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** US-SUIVI-02 — Lien vers les alertes de décrochage, avec le nombre d'alertes ouvertes. */
function AlertesLien(): JSX.Element {
  const [ouvertes, setOuvertes] = useState<number | null>(null);
  useEffect(() => {
    getCompteurAlertes()
      .then((c) => setOuvertes(c.ouvertes))
      .catch(() => setOuvertes(null));
  }, []);
  return (
    <Link className="btn-sm alertes-lien" href="/formateur/alertes">
      Alertes de décrochage
      {ouvertes !== null && ouvertes > 0 && <span className="badge-compteur">{ouvertes}</span>}
    </Link>
  );
}
