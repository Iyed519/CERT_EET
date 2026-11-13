'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AFaireMaintenant } from '../../components/AFaireMaintenant';
import { aFaireApprenant, ElementAFaire } from '../../lib/a-faire';
import { AdminError, EspaceFormationVue, getMesInscriptions, getMonEspace } from '../../lib/api';
import { dateFr } from '../../lib/format';

/**
 * US-UI-03 — « Mon espace » : page d'accueil de l'apprenant. D'abord ce qu'il
 * a à faire (QCM à passer ou à reprendre, livrables à rendre, retours à
 * lire), puis ses formations en cours avec leur progression. Données des API
 * existantes (`/mes-inscriptions`, `/formations/:id/mon-espace`).
 */
export default function MonEspacePage(): JSX.Element {
  const [espaces, setEspaces] = useState<EspaceFormationVue[] | null>(null);
  const [aFaire, setAFaire] = useState<ElementAFaire[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const inscriptions = (await getMesInscriptions()).filter((i) => i.statut === 'EN_COURS');
        const lus = await Promise.all(
          inscriptions.map((i) => getMonEspace(i.formation.id).catch(() => null)),
        );
        if (!actif) return;
        const valides = lus.filter((e): e is EspaceFormationVue => e !== null);
        setEspaces(valides);
        setAFaire(aFaireApprenant(valides));
      } catch (e) {
        if (actif) {
          setErreur(e instanceof AdminError ? e.message : 'Impossible de charger votre espace.');
          setEspaces([]);
        }
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Mon espace</h1>
          <p className="page-subtitle">Bonjour ! Voici ce qui vous attend dans vos formations.</p>
        </div>
      </div>

      <AFaireMaintenant
        elements={aFaire}
        chargement={espaces === null}
        erreur={erreur}
        vide={{
          texte:
            espaces && espaces.length === 0
              ? 'Vous n’êtes inscrit à aucune formation en cours. Choisissez-en une dans le catalogue pour commencer.'
              : 'Aucun QCM ouvert ni livrable à rendre en ce moment. Revenez ici : tout ce qui demande votre attention s’affichera en premier.',
          action: (
            <Link className="btn btn-lien" href="/catalogue">
              Parcourir le catalogue
            </Link>
          ),
        }}
      />

      {espaces !== null && espaces.length > 0 && (
        <section className="mon-espace-formations" aria-labelledby="titre-en-cours">
          <h2 className="section-title" id="titre-en-cours">
            Mes formations en cours
          </h2>
          <ul className="mon-espace-liste">
            {espaces.map((e) => (
              <li key={e.formation.id} className="mon-espace-carte">
                <div className="mon-espace-carte-tete">
                  <p className="mon-espace-carte-titre">{e.formation.titre}</p>
                  <span className="field-hint">
                    {e.formation.dateFin ? `Jusqu’au ${dateFr(e.formation.dateFin)}` : 'Sans date de fin'}
                  </span>
                </div>
                <div
                  className="progression-barre"
                  role="progressbar"
                  aria-label={`Progression dans ${e.formation.titre}`}
                  aria-valuenow={e.inscription.tauxAvancement}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="progression-remplie" style={{ width: `${e.inscription.tauxAvancement}%` }} />
                </div>
                <div className="mon-espace-carte-pied">
                  <span className="field-hint">{e.inscription.tauxAvancement} % terminé</span>
                  <Link className="btn-sm btn-lien" href={`/mes-inscriptions/${e.formation.id}`}>
                    Continuer
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
