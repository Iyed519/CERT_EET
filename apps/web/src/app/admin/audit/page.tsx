'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  getAuditLogs,
  getAuditActions,
  downloadAuditLogsCsv,
  AuditActeur,
  AuditLogEntry,
  AuditQuery,
  AdminError,
} from '../../../lib/api';
import { BarreListe } from '../../../components/BarreListe';
import { CarteIndicateur, GroupeIndicateurs } from '../../../components/CarteIndicateur';
import { EnTetePage } from '../../../components/EnTetePage';
import { EtatVide } from '../../../components/EtatVide';
import { FiltresPastilles } from '../../../components/FiltresPastilles';
import { Icone, NomIcone } from '../../../components/Icone';
import { PaginationListe } from '../../../components/PaginationListe';
import { PastilleStatut } from '../../../components/PastilleStatut';
import {
  actionsDeCategorie,
  CATEGORIES_AUDIT,
  CategorieAudit,
  categorieAudit,
  ICONE_CATEGORIE_AUDIT,
  LIBELLES_CATEGORIE_AUDIT,
  libelleActionAudit,
} from '../../../lib/libelles';
import { useCompteurs } from '../../../lib/useCompteurs';

/** Nombre d'entrées par page (aligné sur le défaut du backend, DS-16). */
const LIMIT = 50;

/** Horodatage ISO -> affichage FR lisible (date + heure). */
function formatHorodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/** US-AUDIT-01 — Nom lisible de l'acteur (prénom nom, sinon email). */
function nomActeur(acteur: AuditActeur): string {
  const nom = [acteur.prenom, acteur.nom].filter(Boolean).join(' ').trim();
  return nom || acteur.email;
}

/**
 * US-AUTH-12 / US-AUDIT-01 / DS-16 — Consultation du journal d'audit
 * (ADMINISTRATEUR).
 *
 * Tableau filtrable (action — liste des actions présentes —, email de
 * l'acteur, cible, résultat, période), paginé, trié du plus récent au plus
 * ancien, + téléchargement CSV du résultat filtré. L'acteur est affiché par
 * son nom et son email (jointure côté API, liste blanche). Lecture seule : aucune
 * action de modification/suppression n'existe (immuabilité NF3). La sécurité
 * réelle est côté API : un non-admin reçoit un 403 et ne voit aucune donnée.
 */
export default function AdminAuditPage(): JSX.Element {
  // Filtres APPLIQUÉS (déclenchent le chargement).
  const [filtres, setFiltres] = useState<AuditQuery>({ page: 1, limit: LIMIT });
  // Saisie EN COURS (appliquée seulement au clic sur « Filtrer »).
  const [action, setAction] = useState('');
  const [acteur, setActeur] = useState('');
  const [cible, setCible] = useState('');
  const [resultatFiltre, setResultatFiltre] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  // US-UX-08 : catégorie choisie (filtre `actions`), compteurs par catégorie et des échecs.
  const [categorie, setCategorie] = useState<CategorieAudit | ''>('');
  const [version, setVersion] = useState(0);
  // US-AUDIT-01 : actions présentes dans le journal (liste déroulante).
  const [actions, setActions] = useState<string[]>([]);

  useEffect(() => {
    getAuditActions()
      .then((a) => {
        setActions(a);
        setVersion((v) => v + 1);
      })
      .catch(() => setActions([]));
  }, []);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await getAuditLogs(filtres);
      setItems(resultat.items);
      setTotal(resultat.total);
      setVersion((v) => v + 1);
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : "Impossible de charger le journal d'audit.",
      );
    } finally {
      setChargement(false);
    }
  }, [filtres]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const appliquerFiltres = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Contrôle immédiat (l'API refuse aussi : 400, même message).
    if (from && to && from > to) {
      setErreur(
        'La période est invalide : la date de début doit précéder la date de fin.',
      );
      return;
    }
    setFiltres({
      action: action || undefined,
      actions: filtres.actions,
      acteur: acteur.trim() || undefined,
      cible: cible.trim() || undefined,
      resultat: resultatFiltre || undefined,
      from: from || undefined,
      to: to || undefined,
      page: 1,
      limit: LIMIT,
    });
  };

  const reinitialiser = (): void => {
    setCategorie('');
    setAction('');
    setActeur('');
    setCible('');
    setResultatFiltre('');
    setFrom('');
    setTo('');
    setFiltres({ page: 1, limit: LIMIT });
  };

  const changerPage = (delta: number): void => {
    setFiltres((precedent) => ({
      ...precedent,
      page: Math.max(1, (precedent.page ?? 1) + delta),
    }));
  };

  const telecharger = async (): Promise<void> => {
    setExportEnCours(true);
    setErreur(null);
    try {
      // Export = MÊMES filtres que l'affichage, sans pagination (tout le résultat).
      await downloadAuditLogsCsv({
        action: filtres.action,
        actions: filtres.actions,
        acteur: filtres.acteur,
        cible: filtres.cible,
        resultat: filtres.resultat,
        from: filtres.from,
        to: filtres.to,
      });
    } catch (error) {
      setErreur(
        error instanceof AdminError
          ? error.message
          : "Impossible d'exporter le journal d'audit.",
      );
    } finally {
      setExportEnCours(false);
    }
  };

  const page = filtres.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  /** US-UX-08 — Choisir une catégorie : filtre `actions` (codes présents de la catégorie), action remise à « Toutes ». */
  const choisirCategorie = (c: CategorieAudit | ''): void => {
    setCategorie(c);
    setAction('');
    setFiltres((precedent) => ({
      ...precedent,
      action: undefined,
      // Une catégorie sans action présente : un code impossible, pour une liste vide (et non tout le journal).
      actions: c ? actionsDeCategorie(actions, c).join(',') || 'AUCUNE_ACTION' : undefined,
      page: 1,
    }));
  };

  /** Filtres appliqués, hors catégorie et action : base des compteurs. */
  const base: AuditQuery = { ...filtres, action: undefined, actions: undefined, page: 1, limit: 1 };
  const compteurs = useCompteurs<CategorieAudit | 'TOUTES' | 'ECHECS'>(
    ['TOUTES', ...CATEGORIES_AUDIT, 'ECHECS'],
    async (c) => {
      if (c === 'ECHECS') return (await getAuditLogs({ ...filtres, resultat: 'Échec', page: 1, limit: 1 })).total;
      if (c === 'TOUTES') return (await getAuditLogs(base)).total;
      const codes = actionsDeCategorie(actions, c);
      return codes.length === 0 ? 0 : (await getAuditLogs({ ...base, actions: codes.join(',') })).total;
    },
    version,
  );

  const actionsProposees = categorie ? actionsDeCategorie(actions, categorie) : actions;

  return (
    <>
      <EnTetePage
        titre="Journal d’audit"
        phrase="Trace inviolable des actions sensibles : qui a fait quoi, quand, avec quel résultat. Lecture seule : aucune entrée ne peut être modifiée ni supprimée."
        actions={
          <button className="btn-sm" onClick={() => void telecharger()} disabled={exportEnCours || chargement}>
            <Icone nom="telecharger" taille={16} />
            {exportEnCours ? 'Préparation…' : 'Télécharger (CSV)'}
          </button>
        }
      />

      <GroupeIndicateurs>
        <CarteIndicateur
          libelle="Entrées"
          valeur={total.toLocaleString('fr-FR')}
          icone="audit"
          aide={categorie ? `catégorie « ${LIBELLES_CATEGORIE_AUDIT[categorie]} » et filtres appliqués` : 'avec les filtres appliqués'}
        />
        <CarteIndicateur
          libelle="Échecs"
          valeur={compteurs.ECHECS === undefined ? '—' : compteurs.ECHECS.toLocaleString('fr-FR')}
          icone="erreur"
          etat={(compteurs.ECHECS ?? 0) > 0 ? 'attention' : 'normal'}
          actif={filtres.resultat === 'Échec'}
          aide={filtres.resultat === 'Échec' ? 'affichés seuls : cliquer pour tout revoir' : 'cliquer pour n’afficher que les échecs'}
          onClick={() => {
            const echecs = filtres.resultat !== 'Échec';
            setResultatFiltre(echecs ? 'Échec' : '');
            setFiltres((precedent) => ({ ...precedent, resultat: echecs ? 'Échec' : undefined, page: 1 }));
          }}
        />
      </GroupeIndicateurs>

      <BarreListe
        filtres={
          <FiltresPastilles<CategorieAudit | ''>
            libelle="Filtrer par catégorie"
            valeur={categorie}
            onChange={choisirCategorie}
            options={[
              { valeur: '', libelle: 'Toutes', compteur: compteurs.TOUTES },
              ...CATEGORIES_AUDIT.map((c) => ({ valeur: c, libelle: LIBELLES_CATEGORIE_AUDIT[c], compteur: compteurs[c] })),
            ]}
          />
        }
        onActualiser={() => void charger()}
        actualisation={chargement}
      />

      <form className="filters audit-filtres" onSubmit={appliquerFiltres}>
        <div className="field">
          <label className="field-label" htmlFor="f-action">
            Action
          </label>
          <select id="f-action" className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{categorie ? `Toutes (${LIBELLES_CATEGORIE_AUDIT[categorie].toLowerCase()})` : 'Toutes'}</option>
            {(categorie ? [categorie] : CATEGORIES_AUDIT).map((c) => {
              const codes = actionsProposees.filter((a) => categorieAudit(a) === c);
              return codes.length === 0 ? null : (
                <optgroup key={c} label={LIBELLES_CATEGORIE_AUDIT[c]}>
                  {codes
                    .map((a) => [a, libelleActionAudit(a)] as const)
                    .sort((x, y) => x[1].localeCompare(y[1], 'fr'))
                    .map(([a, l]) => (
                      <option key={a} value={a}>
                        {l}
                      </option>
                    ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-acteur">
            Acteur (email)
          </label>
          <input
            id="f-acteur"
            className="input"
            value={acteur}
            maxLength={255}
            onChange={(e) => setActeur(e.target.value)}
            placeholder="ex. formateur@esprit.tn"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-cible">
            Cible
          </label>
          <input
            id="f-cible"
            className="input"
            value={cible}
            maxLength={255}
            onChange={(e) => setCible(e.target.value)}
            placeholder="Identifiant de la ressource"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-resultat">
            Résultat
          </label>
          <select id="f-resultat" className="input" value={resultatFiltre} onChange={(e) => setResultatFiltre(e.target.value)}>
            <option value="">Tous</option>
            <option value="Succès">Succès</option>
            <option value="Échec">Échec</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-from">
            Du
          </label>
          <input id="f-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-to">
            Au
          </label>
          <input id="f-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="filters-actions">
          <button type="submit" className="btn-sm" disabled={chargement}>
            Filtrer
          </button>
          <button type="button" className="btn-discret" onClick={reinitialiser} disabled={chargement}>
            Réinitialiser
          </button>
        </div>
      </form>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : items.length === 0 ? (
        <EtatVide
          titre="Aucune entrée"
          texte="Aucune entrée du journal ne correspond à ces filtres. Choisissez « Toutes » ou réinitialisez les filtres."
        />
      ) : (
        <>
          <div className="table-wrap table-wrap-compacte">
            <table className="data-table table-compacte liste-admin audit-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Horodatage</th>
                  <th>Acteur</th>
                  <th>Cible</th>
                  <th>IP</th>
                  <th>Résultat</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entree) => {
                  const cat = categorieAudit(entree.action);
                  return (
                    <tr key={entree.id}>
                      <th scope="row">
                        <span className="audit-action">
                          <span className={`activite-icone activite-${cat}`}>
                            <Icone nom={ICONE_CATEGORIE_AUDIT[cat] as NomIcone} taille={18} />
                          </span>
                          <span className="activite-corps">
                            <span className="activite-libelle" title={entree.action}>
                              {libelleActionAudit(entree.action)}
                            </span>
                            <span className="activite-detail">{LIBELLES_CATEGORIE_AUDIT[cat]}</span>
                          </span>
                        </span>
                      </th>
                      <td data-libelle="Horodatage">{formatHorodatage(entree.horodatage)}</td>
                      <td data-libelle="Acteur">
                        {entree.acteur ? (
                          <>
                            {nomActeur(entree.acteur)}
                            <br />
                            <span className="muted-cell">{entree.acteur.email}</span>
                          </>
                        ) : entree.userId ? (
                          <span className="muted-cell" title={entree.userId}>
                            Compte supprimé
                          </span>
                        ) : (
                          <span className="muted-cell">Système</span>
                        )}
                      </td>
                      <td data-libelle="Cible" className="mono">
                        {entree.cible ?? <span className="muted-cell">—</span>}
                      </td>
                      <td data-libelle="IP" className="mono audit-ip">
                        {entree.adresseIp ?? <span className="muted-cell">—</span>}
                      </td>
                      <td data-libelle="Résultat">
                        {entree.resultat ? (
                          <PastilleStatut ton={entree.resultat === 'Échec' ? 'danger' : 'succes'} libelle={entree.resultat} />
                        ) : (
                          <span className="muted-cell">—</span>
                        )}
                      </td>
                      <td data-libelle="Détails" className="mono">
                        {entree.detailsAvantApres ? (
                          <details>
                            <summary>Voir</summary>
                            <pre className="audit-details">{JSON.stringify(entree.detailsAvantApres, null, 2)}</pre>
                          </details>
                        ) : (
                          <span className="muted-cell">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationListe
            page={page}
            pages={totalPages}
            total={total}
            unite={['entrée', 'entrées']}
            onPage={(p) => changerPage(p - page)}
            desactive={chargement}
          />
        </>
      )}
    </>
  );
}
