'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MaFormation, getMesFormations } from '../../lib/api';
import { periodeFr } from '../../lib/format';
import { FormationVisuel } from '../FormationVisuel';
import { ICONES, Raccourci, Salutation, Tuile } from './elements';

const LIBELLES_STATUT: Record<string, string> = {
  OUVERTE: 'Ouverte',
  FERMEE: 'Fermée',
  ARCHIVEE: 'Archivée',
};

/** Accueil du formateur : ses formations et ses outils. */
export function AccueilFormateur({ email }: { email: string }): JSX.Element {
  const [formations, setFormations] = useState<MaFormation[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    getMesFormations()
      .then((f) => {
        if (!annule) setFormations(f);
      })
      .catch(() => {
        if (!annule) setErreur(true);
      });
    return () => {
      annule = true;
    };
  }, []);

  const ouvertes = (formations ?? []).filter((f) => f.statut === 'OUVERTE');

  return (
    <div className="accueil">
      <Salutation email={email} role="FORMATEUR" texte="Préparez vos contenus, évaluez et suivez vos apprenants.">
        <Link href="/formateur/formations" className="bouton bouton-plein">
          Mes formations
        </Link>
      </Salutation>

      {erreur && <p className="alert alert-error">Impossible de charger vos formations.</p>}

      <div className="tuiles">
        <Tuile
          valeur={formations === null ? '—' : formations.length}
          libelle="Formations affectées"
          href="/formateur/formations"
        />
        <Tuile
          valeur={formations === null ? '—' : ouvertes.length}
          libelle="Formations ouvertes"
          href="/formateur/formations"
        />
      </div>

      <section className="accueil-section" aria-labelledby="mes-formations-titre">
        <div className="section-tete">
          <h2 id="mes-formations-titre" className="accueil-section-titre">
            Mes formations
          </h2>
          <Link href="/formateur/formations" className="lien-fleche">
            Tout voir
          </Link>
        </div>
        {formations === null ? (
          <p className="page-subtitle">Chargement…</p>
        ) : formations.length === 0 ? (
          <div className="vide">
            <p>Aucune formation ne vous est encore affectée. L’administration vous en confiera une.</p>
          </div>
        ) : (
          <div className="cartes">
            {formations.slice(0, 6).map((f) => (
              <article key={f.id} className="carte">
                <Link href={`/formateur/formations/${f.id}`} className="carte-image-lien" tabIndex={-1}>
                  <FormationVisuel id={f.id} titre={f.titre} />
                </Link>
                <div className="carte-corps">
                  <h3 className="carte-titre">
                    <Link href={`/formateur/formations/${f.id}`}>{f.titre}</Link>
                  </h3>
                  <p className="carte-meta">
                    {periodeFr(f.dateDebut, f.dateFin) ?? 'Dates à définir'}
                  </p>
                  <span className={`statut-badge statut-${f.statut}`}>
                    {LIBELLES_STATUT[f.statut] ?? f.statut}
                  </span>
                  <div className="carte-actions">
                    <Link href={`/formateur/formations/${f.id}`} className="btn-sm btn-link">
                      Contenu
                    </Link>
                    <Link href={`/formateur/formations/${f.id}/suivi`} className="btn-sm btn-link">
                      Suivi
                    </Link>
                    <Link href={`/formateur/formations/${f.id}/rapports`} className="btn-sm btn-link">
                      Rapports
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="accueil-section" aria-labelledby="outils-titre">
        <h2 id="outils-titre" className="accueil-section-titre">
          Mes outils
        </h2>
        <div className="raccourcis">
          <Raccourci
            href="/formateur/alertes"
            titre="Alertes de suivi"
            texte="Apprenants en retard, inactifs ou en difficulté."
            icone={ICONES.alerte}
          />
          <Raccourci
            href="/rapports"
            titre="Mes rapports"
            texte="Exports générés en arrière-plan."
            icone={ICONES.rapport}
          />
          <Raccourci
            href="/catalogue"
            titre="Catalogue"
            texte="Toutes les formations ouvertes."
            icone={ICONES.formation}
          />
        </div>
      </section>
    </div>
  );
}
