'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AdminError,
  getMesCertificats,
  MonCertificat,
  telechargerMonCertificat,
} from '../../lib/api';
import { Fenetre } from '../../components/Fenetre';
import { jourFr, LIBELLES_MOTIF_REVOCATION, nombreFr } from '../../lib/format';

/** Libellés d'état, côté titulaire. */
const ETATS: Record<MonCertificat['statut'], string> = {
  EN_ATTENTE_GENERATION: 'En préparation',
  EN_GENERATION: 'En préparation',
  ACTIF: 'Délivré',
  REVOQUE: 'Révoqué',
  EXPIRE: 'Expiré',
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
 * US-UI-01 — Liste compacte (une ligne par certificat) ; le lien de
 * vérification, l'empreinte et la révocation s'ouvrent dans une fiche.
 */
export default function MesCertificatsPage(): JSX.Element {
  const [liste, setListe] = useState<MonCertificat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [fiche, setFiche] = useState<MonCertificat | null>(null);

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
        <div className="table-wrap table-wrap-compacte">
          <table className="data-table table-compacte">
            <caption className="sr-only">Mes certificats</caption>
            <thead>
              <tr>
                <th scope="col">Formation</th>
                <th scope="col">Résultat</th>
                <th scope="col">Date</th>
                <th scope="col">État</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((c) => {
                const disponible = c.statut === 'ACTIF' || c.statut === 'EXPIRE';
                return (
                  <tr key={c.id}>
                    <th scope="row" data-libelle="Formation">
                      <button type="button" className="lien-bouton ligne-ouvrir" onClick={() => setFiche(c)}>
                        {c.formation.titre}
                      </button>
                    </th>
                    <td data-libelle="Résultat">
                      {nombreFr(c.scoreFinal)} / 100 · {c.mention}
                    </td>
                    <td data-libelle="Date">{c.dateGeneration ? jourFr(c.dateGeneration) : '—'}</td>
                    <td data-libelle="État">
                      <span className={`statut-badge certificat-${c.statut}`}>{ETATS[c.statut]}</span>
                    </td>
                    <td>
                      <span className="liste-compacte-actions">
                        {disponible && (
                          <button
                            type="button"
                            className="btn-sm btn-primary-sm"
                            onClick={() => void telecharger(c)}
                            disabled={enCours !== null}
                          >
                            {enCours === c.id ? 'Téléchargement…' : 'Télécharger le PDF'}
                          </button>
                        )}
                        <button type="button" className="btn-sm" onClick={() => setFiche(c)}>
                          Détails
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {fiche && (
        <Fenetre
          titre={fiche.formation.titre}
          sousTitre={`${fiche.organismeEmetteur} · ${nombreFr(fiche.scoreFinal)} / 100 · mention ${fiche.mention}`}
          onClose={() => setFiche(null)}
          occupe={enCours !== null}
          actions={
            <>
              {fiche.urlVerification && (
                <button type="button" className="btn btn-secondaire" onClick={() => void copier(fiche)}>
                  {copie === fiche.id ? 'Lien copié ✓' : 'Copier le lien de vérification'}
                </button>
              )}
              {(fiche.statut === 'ACTIF' || fiche.statut === 'EXPIRE') && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void telecharger(fiche)}
                  disabled={enCours !== null}
                >
                  {enCours === fiche.id ? 'Téléchargement…' : 'Télécharger le PDF'}
                </button>
              )}
            </>
          }
        >
          <p>
            <span className={`statut-badge certificat-${fiche.statut}`}>{ETATS[fiche.statut]}</span>
            <span className="field-hint">
              {fiche.dateGeneration ? ` Délivré le ${jourFr(fiche.dateGeneration)}` : ''}
              {fiche.dateExpiration && fiche.statut === 'EXPIRE' ? ` · expiré le ${jourFr(fiche.dateExpiration)}` : ''}
              {fiche.dateExpiration && fiche.statut === 'ACTIF' ? ` · valable jusqu’au ${jourFr(fiche.dateExpiration)}` : ''}
            </span>
          </p>
          {(fiche.statut === 'EN_ATTENTE_GENERATION' || fiche.statut === 'EN_GENERATION') && (
            <p className="field-hint">Votre certificat est en cours d’émission : il sera disponible dans quelques instants.</p>
          )}
          {fiche.statut === 'REVOQUE' && (
            <p className="field-hint texte-erreur">
              {fiche.revocation
                ? `Révoqué le ${jourFr(fiche.revocation.date)} — ${LIBELLES_MOTIF_REVOCATION[fiche.revocation.motif]}. `
                : 'Révoqué. '}
              Il n’est plus téléchargeable ; pour toute question, contactez ESPRIT Entreprise.
            </p>
          )}
          {fiche.urlVerification && (
            <dl className="fiche certificat-carte-fiche">
              <div className="fiche-large">
                <dt>Lien public de vérification</dt>
                <dd>
                  <a className="table-link lien-externe" href={fiche.urlVerification} target="_blank" rel="noopener noreferrer">
                    {fiche.urlVerification}
                  </a>
                </dd>
              </div>
              <div className="fiche-large">
                <dt>Empreinte SHA-256 du PDF</dt>
                <dd>
                  <code className="empreinte">{fiche.empreinteSha256}</code>
                </dd>
              </div>
            </dl>
          )}
        </Fenetre>
      )}
    </>
  );
}
