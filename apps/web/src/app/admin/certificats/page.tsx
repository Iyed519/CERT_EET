'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  CertificatAdmin,
  getCertificatsAdmin,
  relancerCertificat,
  StatutCertificat,
} from '../../../lib/api';
import {
  dateHeureFr,
  LIBELLES_STATUT_CERTIFICAT,
  nomApprenantFr,
  nombreFr,
} from '../../../lib/format';

const FILTRES: Array<{ valeur: StatutCertificat | null; libelle: string }> = [
  { valeur: null, libelle: 'Tous' },
  { valeur: 'EN_ATTENTE_GENERATION', libelle: 'En attente' },
  { valeur: 'EN_GENERATION', libelle: 'En génération' },
  { valeur: 'ACTIF', libelle: 'Émis' },
  { valeur: 'REVOQUE', libelle: 'Révoqués' },
];

/**
 * US-CERT-01 — Suivi de l'émission des certificats (administrateur, DS-04).
 *
 * Les certificats sont générés en arrière-plan (file BullMQ). Ici : statut,
 * score et mention, empreinte SHA-256 une fois émis, nombre de tentatives et
 * dernière erreur. « Relancer » remet en file un certificat en attente (après
 * trois échecs) ou bloqué en génération ; le serveur refuse (409) un
 * certificat émis ou révoqué. La liste se rafraîchit d'elle-même tant qu'une
 * génération est en cours.
 */
export default function CertificatsAdminPage(): JSX.Element {
  const [filtre, setFiltre] = useState<StatutCertificat | null>(null);
  const [liste, setListe] = useState<CertificatAdmin[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [relance, setRelance] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getCertificatsAdmin(filtre ?? undefined));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger les certificats.');
    }
  }, [filtre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Rafraîchissement tant qu'un certificat est en file ou en génération.
  const enCours = (liste ?? []).some(
    (c) => c.statut === 'EN_GENERATION' || (c.statut === 'EN_ATTENTE_GENERATION' && c.nbTentatives === 0),
  );
  useEffect(() => {
    if (!enCours) return undefined;
    const minuterie = setInterval(() => void charger(), 3000);
    return () => clearInterval(minuterie);
  }, [enCours, charger]);

  const relancer = async (c: CertificatAdmin): Promise<void> => {
    setErreur(null);
    setSucces(null);
    setRelance(c.id);
    try {
      await relancerCertificat(c.id);
      setSucces(`Génération relancée pour ${nomApprenantFr(c.apprenant)}.`);
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de relancer la génération.');
    } finally {
      setRelance(null);
      await charger();
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Certificats</h1>
          <p className="page-subtitle">
            Émission en arrière-plan : PDF, empreinte SHA-256 et QR code de vérification.
          </p>
        </div>
      </div>

      <div className="filtres-livrables certificats-filtres" role="group" aria-label="Filtrer les certificats">
        {FILTRES.map((f) => (
          <button
            key={f.libelle}
            type="button"
            className={`filtre-livrable${filtre === f.valeur ? ' filtre-livrable-actif' : ''}`}
            aria-pressed={filtre === f.valeur}
            onClick={() => {
              setErreur(null);
              setFiltre(f.valeur);
            }}
          >
            {f.libelle}
          </button>
        ))}
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {succes !== null && <p className="alert alert-success">{succes}</p>}

      {liste === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="page-subtitle">Aucun certificat dans cette catégorie.</p>
      ) : (
        <ul className="livrables-liste">
          {liste.map((c) => {
            const relancable = c.statut === 'EN_ATTENTE_GENERATION' || c.statut === 'EN_GENERATION';
            return (
              <li key={c.id} className="livrable-ligne certificat-ligne">
                <div className="livrable-ligne-corps">
                  <p className="livrable-ligne-nom">{nomApprenantFr(c.apprenant)}</p>
                  <p className="field-hint">
                    {c.formation.titre} · {nombreFr(c.scoreFinal)} / 100 · {c.mention} · demandé le{' '}
                    {dateHeureFr(c.dateEmission)}
                    {c.dateGeneration ? ` · émis le ${dateHeureFr(c.dateGeneration)}` : ''}
                  </p>
                  {c.empreinteSha256 && (
                    <code className="empreinte" title="SHA-256 du PDF">
                      {c.empreinteSha256}
                    </code>
                  )}
                  {c.derniereErreur && c.statut !== 'ACTIF' && (
                    <p className="field-hint texte-erreur">
                      {c.nbTentatives} tentative{c.nbTentatives > 1 ? 's' : ''} · {c.derniereErreur}
                    </p>
                  )}
                </div>
                <div className="livrable-ligne-actions">
                  <span className={`statut-badge certificat-${c.statut}`}>
                    {LIBELLES_STATUT_CERTIFICAT[c.statut]}
                  </span>
                  {relancable && (
                    <button
                      type="button"
                      className="btn-sm btn-primary-sm"
                      onClick={() => void relancer(c)}
                      disabled={relance !== null}
                    >
                      {relance === c.id ? 'Relance…' : 'Relancer'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
