'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FormationCatalogueVue,
  InscriptionVue,
  MonCertificat,
  getFormations,
  getMesCertificats,
  getMesInscriptions,
} from '../../lib/api';
import { LIBELLES_INSCRIPTION, LIBELLES_STATUT_CERTIFICAT, jourFr, periodeFr } from '../../lib/format';
import { FormationVisuel } from '../FormationVisuel';
import { Salutation, Tuile } from './elements';

/** Accueil de l'apprenant : reprise des formations, certificats, découverte. */
export function AccueilApprenant({ email }: { email: string }): JSX.Element {
  const [inscriptions, setInscriptions] = useState<InscriptionVue[] | null>(null);
  const [certificats, setCertificats] = useState<MonCertificat[] | null>(null);
  const [decouvrir, setDecouvrir] = useState<FormationCatalogueVue[]>([]);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    Promise.all([getMesInscriptions(), getMesCertificats(), getFormations({ page: 1, limit: 12 })])
      .then(([i, c, f]) => {
        if (annule) return;
        setInscriptions(i);
        setCertificats(c);
        setDecouvrir(f.items.filter((x) => x.statutInscription === null).slice(0, 4));
      })
      .catch(() => {
        if (!annule) setErreur(true);
      });
    return () => {
      annule = true;
    };
  }, []);

  const enCours = (inscriptions ?? []).filter((i) => i.statut === 'EN_COURS');
  const terminees = (inscriptions ?? []).filter((i) => i.statut === 'TERMINEE');
  const emis = (certificats ?? []).filter((c) => c.statut === 'ACTIF');
  const charge = inscriptions !== null && certificats !== null;

  return (
    <div className="accueil">
      <Salutation
        email={email}
        role="APPRENANT"
        texte="Reprenez là où vous vous êtes arrêté et suivez vos certifications."
      >
        <Link href="/catalogue" className="bouton bouton-plein">
          Explorer le catalogue
        </Link>
      </Salutation>

      {erreur && <p className="alert alert-error">Impossible de charger votre tableau de bord.</p>}

      <div className="tuiles">
        <Tuile valeur={charge ? enCours.length : '—'} libelle="Formations en cours" href="/mes-inscriptions" />
        <Tuile valeur={charge ? terminees.length : '—'} libelle="Formations terminées" href="/mes-inscriptions" />
        <Tuile valeur={charge ? emis.length : '—'} libelle="Certificats obtenus" href="/mes-certificats" />
      </div>

      <section className="accueil-section" aria-labelledby="reprendre-titre">
        <div className="section-tete">
          <h2 id="reprendre-titre" className="accueil-section-titre">
            Reprendre mes formations
          </h2>
          <Link href="/mes-inscriptions" className="lien-fleche">
            Tout voir
          </Link>
        </div>
        {!charge ? (
          <p className="page-subtitle">Chargement…</p>
        ) : enCours.length === 0 ? (
          <div className="vide">
            <p>Vous ne suivez aucune formation pour l’instant.</p>
            <Link href="/catalogue" className="btn-sm btn-primary-sm btn-link">
              Trouver une formation
            </Link>
          </div>
        ) : (
          <div className="cartes">
            {enCours.slice(0, 4).map((i) => (
              <Link key={i.id} href={`/mes-inscriptions/${i.formation.id}`} className="carte carte-lien">
                <FormationVisuel id={i.formation.id} titre={i.formation.titre} />
                <div className="carte-corps">
                  <h3 className="carte-titre">{i.formation.titre}</h3>
                  <p className="carte-meta">
                    {periodeFr(i.formation.dateDebut, i.formation.dateFin) ??
                      `Inscrit le ${jourFr(i.dateInscription)}`}
                  </p>
                  <div className="carte-progression" aria-label={`Avancement ${i.tauxAvancement} %`}>
                    <div className="progression-barre">
                      <div className="progression-remplie" style={{ width: `${i.tauxAvancement}%` }} />
                    </div>
                    <span className="carte-progression-valeur">{i.tauxAvancement} %</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {charge && (certificats ?? []).length > 0 && (
        <section className="accueil-section" aria-labelledby="certificats-titre">
          <div className="section-tete">
            <h2 id="certificats-titre" className="accueil-section-titre">
              Mes derniers certificats
            </h2>
            <Link href="/mes-certificats" className="lien-fleche">
              Tout voir
            </Link>
          </div>
          <ul className="liste-simple">
            {(certificats ?? []).slice(0, 3).map((c) => (
              <li key={c.id} className="liste-simple-ligne">
                <span className="liste-simple-icone" aria-hidden="true">
                  ★
                </span>
                <div className="liste-simple-corps">
                  <span className="liste-simple-titre">{c.formation.titre}</span>
                  <span className="field-hint">
                    {c.mention} · {c.scoreFinal} / 100 · {jourFr(c.dateGeneration ?? c.dateEmission)}
                  </span>
                </div>
                <span className={`statut-badge certificat-${c.statut}`}>
                  {LIBELLES_STATUT_CERTIFICAT[c.statut]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decouvrir.length > 0 && (
        <section className="accueil-section" aria-labelledby="decouvrir-titre">
          <div className="section-tete">
            <h2 id="decouvrir-titre" className="accueil-section-titre">
              À découvrir
            </h2>
            <Link href="/catalogue" className="lien-fleche">
              Le catalogue
            </Link>
          </div>
          <div className="cartes">
            {decouvrir.map((f) => (
              <Link key={f.id} href={`/catalogue/${f.id}`} className="carte carte-lien">
                <FormationVisuel id={f.id} titre={f.titre} />
                <div className="carte-corps">
                  <h3 className="carte-titre">{f.titre}</h3>
                  <p className="carte-meta">
                    {f.dureeHeures !== null ? `${f.dureeHeures} h · ` : ''}
                    {f.placesRestantes === 0 ? 'Complète' : `${f.placesRestantes} place(s)`}
                  </p>
                  {f.statutInscription !== null && (
                    <span className={`statut-badge statut-${f.statutInscription}`}>
                      {LIBELLES_INSCRIPTION[f.statutInscription]}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
