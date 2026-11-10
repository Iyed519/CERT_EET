'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { ActionInscription } from '../../components/ActionInscription';
import { ConfirmationInscription } from '../../components/ConfirmationInscription';
import { FormationVisuel } from '../../components/FormationVisuel';
import { useAuth } from '../../contexts/AuthContext';
import { AdminError, FormationCatalogueVue, getFormations } from '../../lib/api';
import { LIBELLES_INSCRIPTION, periodeFr } from '../../lib/format';

const PAR_PAGE = 12;
/** Recherche : filtrée côté navigateur sur les 100 premières formations (maximum de l'API). */
const MAX_RECHERCHE = 100;

/** Comparaison sans casse ni accents. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * US-INSC-01 — Catalogue des formations ouvertes (DS-08, étape 1).
 *
 * Cartes : visuel, titre, durée, période, places restantes et, pour un
 * apprenant, son inscription éventuelle. Une formation déjà suivie reste
 * listée, marquée de son statut. Le bouton « S’inscrire » n’apparaît que pour
 * un apprenant ; le serveur refait tous les contrôles (capacité, ouverture,
 * inscription existante). `?q=` (recherche de l'en-tête) filtre par titre et
 * description.
 */
function Catalogue(): JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const estApprenant = user?.role === 'APPRENANT';
  const [formations, setFormations] = useState<FormationCatalogueVue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [saisie, setSaisie] = useState(q);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<FormationCatalogueVue | null>(null);

  useEffect(() => {
    setSaisie(q);
    setPage(1);
  }, [q]);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      if (q) {
        const resultat = await getFormations({ page: 1, limit: MAX_RECHERCHE });
        const cible = normaliser(q);
        const trouvees = resultat.items.filter((f) =>
          normaliser(`${f.titre} ${f.description ?? ''}`).includes(cible),
        );
        setFormations(trouvees);
        setTotal(trouvees.length);
      } else {
        const resultat = await getFormations({ page, limit: PAR_PAGE });
        setFormations(resultat.items);
        setTotal(resultat.total);
      }
    } catch (error) {
      setErreur(
        error instanceof AdminError ? error.message : 'Impossible de charger le catalogue.',
      );
    } finally {
      setChargement(false);
    }
  }, [page, q]);

  useEffect(() => {
    void charger();
  }, [charger]);

  function rechercher(e: FormEvent): void {
    e.preventDefault();
    const valeur = saisie.trim();
    router.push(valeur ? `/catalogue?q=${encodeURIComponent(valeur)}` : '/catalogue');
  }

  const totalPages = q ? 1 : Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <>
      <section className="catalogue-entete">
        <div>
          <h1 className="page-title">Catalogue des formations</h1>
          <p className="page-subtitle">
            {q
              ? `${total} résultat(s) pour « ${q} »`
              : 'Les formations ouvertes aux inscriptions, certifiantes et vérifiables.'}
          </p>
        </div>
        <form className="catalogue-recherche" role="search" onSubmit={rechercher}>
          <label htmlFor="catalogue-q" className="sr-only">
            Rechercher dans le catalogue
          </label>
          <input
            id="catalogue-q"
            type="search"
            className="input"
            placeholder="Titre, thème…"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <button type="submit" className="btn-sm btn-primary-sm">
            Rechercher
          </button>
          {q && (
            <Link href="/catalogue" className="btn-sm btn-link">
              Effacer
            </Link>
          )}
        </form>
      </section>

      {succes !== null && (
        <p className="alert alert-success">
          {succes} <Link href="/mes-inscriptions">Voir mes inscriptions</Link>
        </p>
      )}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <div className="cartes" aria-busy="true" aria-label="Chargement du catalogue">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="carte carte-squelette" />
          ))}
        </div>
      ) : erreur !== null ? null : formations.length === 0 ? (
        <div className="vide">
          <p>
            {q
              ? 'Aucune formation ne correspond à votre recherche.'
              : 'Aucune formation n’est ouverte aux inscriptions pour l’instant.'}
          </p>
        </div>
      ) : (
        <>
          <div className="cartes">
            {formations.map((f) => (
              <article key={f.id} className="carte">
                <Link href={`/catalogue/${f.id}`} className="carte-image-lien" tabIndex={-1}>
                  <FormationVisuel id={f.id} titre={f.titre} />
                  {f.placesRestantes === 0 && <span className="carte-ruban">Complète</span>}
                </Link>
                <div className="carte-corps">
                  <h2 className="carte-titre">
                    <Link href={`/catalogue/${f.id}`}>{f.titre}</Link>
                  </h2>
                  {f.description && <p className="carte-description">{f.description}</p>}
                  <ul className="carte-infos">
                    {f.dureeHeures !== null && <li>{f.dureeHeures} h</li>}
                    {periodeFr(f.dateDebut, f.dateFin) && <li>{periodeFr(f.dateDebut, f.dateFin)}</li>}
                    <li>
                      {f.placesRestantes === 0
                        ? 'Plus de place'
                        : `${f.placesRestantes} / ${f.capaciteMax} places`}
                    </li>
                    <li>Certifiant · seuil {f.noteMinCertification} / 100</li>
                  </ul>
                  <div className="carte-pied">
                    {estApprenant && f.statutInscription !== null ? (
                      <span className={`statut-badge statut-${f.statutInscription}`}>
                        {LIBELLES_INSCRIPTION[f.statutInscription]}
                      </span>
                    ) : (
                      <span />
                    )}
                    <div className="row-actions">
                      <Link className="btn-sm btn-link" href={`/catalogue/${f.id}`}>
                        Détails
                      </Link>
                      {estApprenant && (
                        <ActionInscription
                          formation={f}
                          onInscrire={() => {
                            setSucces(null);
                            setAConfirmer(f);
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <span className="page-subtitle">
                {total} formation(s) — page {page} / {totalPages}
              </span>
              <div className="row-actions">
                <button
                  className="btn-sm"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                >
                  Précédent
                </button>
                <button
                  className="btn-sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {aConfirmer !== null && (
        <ConfirmationInscription
          formation={aConfirmer}
          onClose={() => setAConfirmer(null)}
          onInscrit={(inscription) => {
            setAConfirmer(null);
            setSucces(`Vous êtes inscrit à la formation « ${inscription.formation.titre} ».`);
            void charger();
          }}
          onRefus={() => void charger()}
        />
      )}
    </>
  );
}

export default function CataloguePage(): JSX.Element {
  return (
    <Suspense fallback={<p className="page-subtitle">Chargement…</p>}>
      <Catalogue />
    </Suspense>
  );
}
