'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EnTetePage } from '../../../components/EnTetePage';
import { EtatVide } from '../../../components/EtatVide';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone } from '../../../components/Icone';
import { PastilleStatut } from '../../../components/PastilleStatut';
import { SectionPage } from '../../../components/SectionPage';
import { AdminError, AtelierAEvaluer, getEvaluationsFormateur } from '../../../lib/api';
import { LIBELLES_STATUT_ATELIER } from '../../../lib/format';
import { parFormation } from '../../../lib/ui-regles';

type Filtre = 'a-corriger' | 'tous';

/**
 * US-UX-02 — « Livrables à corriger » : tous les ateliers de mes formations,
 * avec leurs livrables à corriger, en correction et notés ; chaque atelier
 * s'ouvre sur sa page, où se fait la correction (rien ne change à la correction).
 */
export default function LivrablesACorrigerPage(): JSX.Element {
  const [ateliers, setAteliers] = useState<AtelierAEvaluer[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('a-corriger');

  const charger = useCallback(async (): Promise<void> => {
    setErreur(null);
    try {
      setAteliers((await getEvaluationsFormateur()).ateliers);
    } catch (e) {
      setErreur(
        e instanceof AdminError && e.statut === 403
          ? 'Cette page est réservée aux formateurs.'
          : e instanceof AdminError
            ? e.message
            : 'Impossible de charger les livrables.',
      );
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const aCorriger = useMemo(() => (ateliers ?? []).filter((a) => a.aCorriger + a.enCorrection > 0), [ateliers]);
  const visibles = filtre === 'a-corriger' ? aCorriger : (ateliers ?? []);

  return (
    <>
      <EnTetePage
        titre="Livrables à corriger"
        phrase="Les ateliers de vos formations et leurs livrables. Ouvrez un atelier pour corriger ses livrables avec sa grille."
      />
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}
      {ateliers === null ? (
        erreur === null && <p className="page-subtitle">Chargement…</p>
      ) : ateliers.length === 0 ? (
        <EtatVide
          titre="Aucun atelier pour l’instant"
          texte="Créez un atelier dans le contenu d’une de vos formations : les livrables des apprenants arriveront ici."
          action={
            <Link className="btn btn-lien" href="/formateur/formations">
              Voir mes formations
            </Link>
          }
        />
      ) : (
        <>
          <div className="barre-filtres">
            <FiltresPastilles<Filtre>
              libelle="Filtrer les ateliers"
              valeur={filtre}
              onChange={setFiltre}
              options={[
                { valeur: 'a-corriger', libelle: 'Avec des livrables à corriger', compteur: aCorriger.length },
                { valeur: 'tous', libelle: 'Tous les ateliers', compteur: ateliers.length },
              ]}
            />
            <p className="barre-filtres-resume" aria-live="polite">
              {filtre === 'a-corriger'
                ? `${aCorriger.length} atelier${aCorriger.length > 1 ? 's' : ''} avec des livrables à corriger ou en correction`
                : `${ateliers.length} atelier${ateliers.length > 1 ? 's' : ''} dans vos formations`}
            </p>
          </div>
          {visibles.length === 0 ? (
            <EtatVide
              titre="Rien à corriger"
              texte="Tous les livrables déposés ont été notés. Les nouveaux dépôts apparaîtront ici."
              action={
                <button type="button" className="btn-sm" onClick={() => setFiltre('tous')}>
                  Voir tous les ateliers
                </button>
              }
            />
          ) : (
            parFormation(visibles).map((g) => (
              <SectionPage key={g.id} titre={g.titre} icone="formation">
                <div className="table-wrap table-wrap-compacte">
                  <table className="data-table table-compacte">
                    <thead>
                      <tr>
                        <th scope="col">Atelier</th>
                        <th scope="col">Statut</th>
                        <th scope="col">À corriger</th>
                        <th scope="col">En correction</th>
                        <th scope="col">Notés</th>
                        <th scope="col">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lignes.map((a) => (
                        <tr key={a.id} className={a.aCorriger > 0 ? 'ligne-a-traiter' : undefined}>
                          <th scope="row">
                            <Link className="table-link lien-objet" href={`/formateur/ateliers/${a.id}`}>
                              <Icone nom="atelier" taille={18} />
                              {a.titre}
                            </Link>
                            <div className="muted-cell">{a.moduleTitre}</div>
                          </th>
                          <td data-libelle="Statut">
                            <PastilleStatut statut={a.statut} libelle={LIBELLES_STATUT_ATELIER[a.statut]} />
                          </td>
                          <td data-libelle="À corriger">
                            {a.aCorriger > 0 ? (
                              <PastilleStatut ton="danger" icone="correction" libelle={String(a.aCorriger)} />
                            ) : (
                              <span className="muted-cell">0</span>
                            )}
                          </td>
                          <td data-libelle="En correction">{a.enCorrection}</td>
                          <td data-libelle="Notés">{a.notes}</td>
                          <td>
                            <Link className="btn-sm btn-lien" href={`/formateur/ateliers/${a.id}`}>
                              Ouvrir l’atelier
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionPage>
            ))
          )}
        </>
      )}
    </>
  );
}
