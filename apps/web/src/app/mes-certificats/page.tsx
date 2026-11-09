'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  getMesCertificats,
  MonCertificat,
  telechargerMonCertificat,
} from '../../lib/api';
import { jourFr, nombreFr } from '../../lib/format';

/** Libellés d'état, côté titulaire. */
const ETATS: Record<MonCertificat['statut'], string> = {
  EN_ATTENTE_GENERATION: 'En préparation',
  EN_GENERATION: 'En préparation',
  ACTIF: 'Délivré',
  REVOQUE: 'Révoqué',
};

/** Nom proposé au navigateur (le serveur envoie le même). */
const nomFichier = (titre: string): string => {
  const base = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `certificat-${base || 'formation'}.pdf`;
};

/**
 * US-CERT-03 — « Mes certificats » (apprenant). Pour chaque certificat :
 * formation, score, mention, date ; une fois délivré, le téléchargement du
 * PDF, son empreinte SHA-256 et le lien public de vérification à partager
 * (copiable). En préparation : un message ; révoqué : plus de
 * téléchargement. La liste se rafraîchit seule tant qu'un certificat se
 * prépare.
 */
export default function MesCertificatsPage(): JSX.Element {
  const [liste, setListe] = useState<MonCertificat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    try {
      setListe(await getMesCertificats());
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de charger vos certificats.');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const preparation = (liste ?? []).some(
    (c) => c.statut === 'EN_GENERATION' || c.statut === 'EN_ATTENTE_GENERATION',
  );
  useEffect(() => {
    if (!preparation) return undefined;
    const minuterie = setInterval(() => void charger(), 5000);
    return () => clearInterval(minuterie);
  }, [preparation, charger]);

  const telecharger = async (c: MonCertificat): Promise<void> => {
    setErreur(null);
    setEnCours(c.id);
    try {
      await telechargerMonCertificat(c.id, nomFichier(c.formation.titre));
    } catch (error) {
      setErreur(error instanceof AdminError ? error.message : 'Impossible de télécharger le certificat.');
      await charger();
    } finally {
      setEnCours(null);
    }
  };

  const copier = async (c: MonCertificat): Promise<void> => {
    if (!c.urlVerification) return;
    try {
      await navigator.clipboard.writeText(c.urlVerification);
      setCopie(c.id);
      setTimeout(() => setCopie(null), 2000);
    } catch {
      setErreur('Copie impossible : sélectionnez le lien et copiez-le à la main.');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mes certificats</h1>
          <p className="page-subtitle">
            Délivrés automatiquement quand toutes les évaluations d’une formation sont validées.
          </p>
        </div>
      </div>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {liste === null ? (
        <p className="page-subtitle">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="carte-ailleurs">
          Vous n’avez pas encore de certificat. Il apparaîtra ici dès que vous aurez validé toutes
          les évaluations d’une formation.
        </p>
      ) : (
        <ul className="certificats-liste">
          {liste.map((c) => (
            <li key={c.id} className={`certificat-carte certificat-carte-${c.statut}`}>
              <div className="certificat-carte-tete">
                <div>
                  <p className="certificat-carte-formation">{c.formation.titre}</p>
                  <p className="field-hint">
                    {c.organismeEmetteur} · {nombreFr(c.scoreFinal)} / 100 · mention {c.mention}
                    {c.dateGeneration ? ` · délivré le ${jourFr(c.dateGeneration)}` : ''}
                  </p>
                </div>
                <span className={`statut-badge certificat-${c.statut}`}>{ETATS[c.statut]}</span>
              </div>

              {c.statut === 'ACTIF' && (
                <div className="certificat-carte-actions">
                  <button
                    type="button"
                    className="btn-sm btn-primary-sm"
                    onClick={() => void telecharger(c)}
                    disabled={enCours !== null}
                  >
                    {enCours === c.id ? 'Téléchargement…' : 'Télécharger le PDF'}
                  </button>
                  <button type="button" className="btn-sm" onClick={() => void copier(c)}>
                    {copie === c.id ? 'Lien copié ✓' : 'Copier le lien de vérification'}
                  </button>
                </div>
              )}
              {(c.statut === 'EN_ATTENTE_GENERATION' || c.statut === 'EN_GENERATION') && (
                <p className="field-hint">Votre certificat est en cours d’émission : il sera disponible dans quelques instants.</p>
              )}
              {c.statut === 'REVOQUE' && (
                <p className="field-hint texte-erreur">Ce certificat a été révoqué : il n’est plus téléchargeable.</p>
              )}

              {c.urlVerification && (
                <dl className="fiche certificat-carte-fiche">
                  <div className="fiche-large">
                    <dt>Lien public de vérification</dt>
                    <dd>
                      <a className="table-link lien-externe" href={c.urlVerification} target="_blank" rel="noopener noreferrer">
                        {c.urlVerification}
                      </a>
                    </dd>
                  </div>
                  <div className="fiche-large">
                    <dt>Empreinte SHA-256 du PDF</dt>
                    <dd>
                      <code className="empreinte">{c.empreinteSha256}</code>
                    </dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
