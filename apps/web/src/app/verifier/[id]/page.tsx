'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  empreinteFichier,
  verifierCertificat,
  VerificationCertificat,
  VerdictCertificat,
} from '../../../lib/api';
import { jourFr, nombreFr } from '../../../lib/format';

const VERDICTS: Record<VerdictCertificat, { titre: string; texte: string }> = {
  VALIDE: {
    titre: 'Certificat valide et authentique',
    texte: 'Ce certificat a été délivré par l’organisme ci-dessous et son document est intact.',
  },
  REVOQUE: {
    titre: 'Certificat révoqué',
    texte: 'Ce certificat a été révoqué par l’organisme émetteur : il ne doit plus être considéré comme valide.',
  },
  INTEGRITE_COMPROMISE: {
    titre: 'Intégrité compromise',
    texte: 'Le document conservé ne correspond plus à son empreinte d’origine : ce certificat a peut-être été falsifié.',
  },
};

type Comparaison = { etat: 'calcul' } | { etat: 'identique' | 'different'; nom: string } | null;

/**
 * US-CERT-04 — Page PUBLIQUE de vérification d'un certificat (DS-05), ouverte
 * par le QR code ou le lien partagé, sans compte. Verdict (valide, révoqué,
 * intégrité compromise), données minimales (titulaire, formation, organisme,
 * mention, score, date) et empreinte SHA-256. Le visiteur peut comparer un PDF
 * reçu : l'empreinte est calculée dans son navigateur, le fichier n'est
 * envoyé nulle part. Lien inconnu : un message neutre.
 */
export default function VerifierPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [resultat, setResultat] = useState<VerificationCertificat | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [comparaison, setComparaison] = useState<Comparaison>(null);

  useEffect(() => {
    if (!id) return;
    verifierCertificat(id)
      .then(setResultat)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : 'Vérification impossible.'));
  }, [id]);

  const comparer = async (fichier: File | undefined): Promise<void> => {
    if (!fichier || !resultat) return;
    setComparaison({ etat: 'calcul' });
    const empreinte = await empreinteFichier(fichier);
    setComparaison({
      etat: empreinte === resultat.empreinteSha256 ? 'identique' : 'different',
      nom: fichier.name,
    });
  };

  return (
    <div className="verification">
      <p className="verification-surtitre">Vérification de certificat</p>
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {resultat === undefined && erreur === null && <p className="page-subtitle">Vérification en cours…</p>}

      {resultat === null && (
        <section className="verification-carte verdict-INCONNU">
          <h1 className="verification-titre">Certificat introuvable</h1>
          <p>
            Aucun certificat ne correspond à ce lien. Vérifiez qu’il a été copié en entier, ou
            demandez au titulaire de vous le renvoyer.
          </p>
        </section>
      )}

      {resultat && (
        <section className={`verification-carte verdict-${resultat.verdict}`} aria-live="polite">
          <div className="verification-verdict">
            <span className="verification-pastille" aria-hidden="true">
              {resultat.verdict === 'VALIDE' ? '✓' : '!'}
            </span>
            <div>
              <h1 className="verification-titre">{VERDICTS[resultat.verdict].titre}</h1>
              <p className="verification-texte">{VERDICTS[resultat.verdict].texte}</p>
            </div>
          </div>

          <dl className="verification-fiche">
            <div>
              <dt>Titulaire</dt>
              <dd>{resultat.titulaire}</dd>
            </div>
            <div>
              <dt>Formation</dt>
              <dd>{resultat.formation}</dd>
            </div>
            <div>
              <dt>Organisme émetteur</dt>
              <dd>{resultat.organismeEmetteur}</dd>
            </div>
            <div>
              <dt>Délivré le</dt>
              <dd>{jourFr(resultat.dateEmission)}</dd>
            </div>
            <div>
              <dt>Résultat</dt>
              <dd>
                {nombreFr(resultat.scoreFinal)} / 100 — mention {resultat.mention}
              </dd>
            </div>
            <div className="verification-fiche-large">
              <dt>Empreinte SHA-256 du document</dt>
              <dd>
                <code className="empreinte">{resultat.empreinteSha256}</code>
              </dd>
            </div>
          </dl>
          {resultat.integrite === 'NON_VERIFIABLE' && (
            <p className="field-hint">
              L’intégrité du document n’a pas pu être recontrôlée à l’instant ; le statut reste valable.
            </p>
          )}

          <div className="verification-comparer">
            <p className="verification-comparer-titre">Vous avez reçu ce certificat en PDF ?</p>
            <p className="field-hint">
              Déposez-le ici : son empreinte est calculée dans votre navigateur et comparée à celle
              publiée ci-dessus. Le fichier n’est envoyé nulle part.
            </p>
            <label className="btn-sm verification-fichier">
              Choisir le PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="depot-input"
                onChange={(e) => void comparer(e.target.files?.[0])}
              />
            </label>
            {comparaison?.etat === 'calcul' && <p className="field-hint">Calcul de l’empreinte…</p>}
            {comparaison?.etat === 'identique' && (
              <p className="alert alert-success">
                « {comparaison.nom} » est identique au certificat délivré.
              </p>
            )}
            {comparaison?.etat === 'different' && (
              <p className="alert alert-error">
                « {comparaison.nom} » ne correspond pas au certificat délivré : ce n’est pas
                l’original.
              </p>
            )}
          </div>

          {resultat.verdict === 'VALIDE' && resultat.integrite !== 'NON_VERIFIABLE' && (
            <a className="btn-sm btn-primary-sm btn-lien" href={`/api/verification/${resultat.certificatId}/pdf`}>
              Télécharger le PDF certifié
            </a>
          )}
        </section>
      )}
    </div>
  );
}
