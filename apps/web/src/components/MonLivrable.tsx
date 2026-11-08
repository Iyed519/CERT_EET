'use client';
import type { LivrableApprenant } from '../lib/api';
import { dateHeureFr, tailleFr } from '../lib/format';

const LIBELLES_STATUT: Record<LivrableApprenant['statut'], string> = {
  SOUMIS: 'Soumis — en attente de correction',
  EN_CORRECTION: 'En correction',
  NOTE: 'Noté',
};

/**
 * US-ATEL-04 — Mon livrable déposé (UC4 Apprenant, étape 5) : statut, version,
 * horodatage du serveur, retard éventuel, fichiers avec leur SHA-256 et hash
 * de traçabilité (preuve d'antériorité), commentaire et liens.
 */
export function MonLivrable({ livrable }: { livrable: LivrableApprenant }): JSX.Element {
  return (
    <section className="mon-livrable" aria-labelledby="titre-mon-livrable">
      <div className="mon-livrable-tete">
        <h2 id="titre-mon-livrable" className="section-title">
          Mon livrable
        </h2>
        <span className={`statut-badge livrable-${livrable.statut}`}>
          {LIBELLES_STATUT[livrable.statut]}
        </span>
      </div>
      <p className="field-hint">
        Version {livrable.version} · déposé le {dateHeureFr(livrable.dateSoumission)}
        {livrable.enRetard ? ' · en retard (pendant la tolérance)' : ''}
      </p>

      <ul className="depot-fichiers">
        {livrable.fichiers.map((f) => (
          <li key={f.ordre} className="depot-fichier">
            <span className="depot-fichier-nom">{f.nomOriginal}</span>
            <span className="field-hint">{tailleFr(f.tailleOctets)}</span>
            <code className="empreinte" title="SHA-256 du fichier">
              {f.sha256}
            </code>
          </li>
        ))}
      </ul>

      <dl className="fiche mon-livrable-fiche">
        <div className="fiche-large">
          <dt>Hash de traçabilité (SHA-256)</dt>
          <dd>
            <code className="empreinte">{livrable.hashTracabilite}</code>
          </dd>
        </div>
        {livrable.commentaire && (
          <div className="fiche-large">
            <dt>Commentaire</dt>
            <dd>{livrable.commentaire}</dd>
          </div>
        )}
        {livrable.liens.length > 0 && (
          <div className="fiche-large">
            <dt>Liens</dt>
            <dd>
              {livrable.liens.map((l) => (
                <a key={l} className="table-link lien-externe" href={l} target="_blank" rel="noopener noreferrer">
                  {l}
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
