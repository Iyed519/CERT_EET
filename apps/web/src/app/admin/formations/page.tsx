'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { CroixFermeture } from '../../../components/CroixFermeture';
import {
  getFormations,
  getFormation,
  createFormation,
  updateFormation,
  addFormationModule,
  updateFormationModule,
  reorderFormationModules,
  deleteFormationModule,
  getFormationFormateurs,
  assignFormationFormateur,
  removeFormationFormateur,
  getAdminUsers,
  FormationVue,
  FormationInput,
  FormationPatch,
  ModuleVue,
  FormateurAffecte,
  AdminUser,
  StatutFormation,
  AdminError,
  getImpactCycleFormation,
  changerStatutFormation,
  ImpactCycleFormation,
} from '../../../lib/api';

/** Libellés FR des statuts (l'enum backend reste la source de vérité). */
const STATUTS: Array<[StatutFormation, string]> = [
  ['BROUILLON', 'Brouillon'],
  ['OUVERTE', 'Ouverte'],
  ['FERMEE', 'Fermée'],
  ['ARCHIVEE', 'Archivée'],
];
const libelleStatut = (s: StatutFormation): string =>
  STATUTS.find(([v]) => v === s)?.[1] ?? s;

const PAR_PAGE = 20;

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
};

const messageDe = (error: unknown, parDefaut: string): string =>
  error instanceof AdminError ? error.message : parDefaut;

/**
 * US-FORM-01 — Console admin des formations : liste filtrable, création,
 * modification de la configuration et gestion des modules.
 * US-FORM-03 — affectation des formateurs à une formation.
 *
 * La sécurité réelle est côté API (@Roles(ADMINISTRATEUR) sur les écritures) :
 * cette page n'est qu'une interface. Les règles métier (capacité > 0, seuil
 * dans [0,100], dates cohérentes, formation archivée figée…) sont appliquées
 * par le serveur ; j'affiche ses messages tels quels.
 */
export default function AdminFormationsPage(): JSX.Element {
  const [formations, setFormations] = useState<FormationVue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filtre, setFiltre] = useState<StatutFormation | ''>('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // null = modale fermée ; 'nouvelle' = création ; sinon la formation éditée.
  const [edition, setEdition] = useState<FormationVue | 'nouvelle' | null>(null);
  // Formation dont on gère les modules (null = modale fermée).
  const [cibleModules, setCibleModules] = useState<FormationVue | null>(null);
  // Formation dont on gère les formateurs (null = modale fermée).
  const [cibleFormateurs, setCibleFormateurs] = useState<FormationVue | null>(null);
  // US-FORM-02 — clôturer / archiver / rouvrir.
  const [cibleStatut, setCibleStatut] = useState<FormationVue | null>(null);

  const charger = useCallback(async (): Promise<void> => {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await getFormations({
        statut: filtre === '' ? undefined : filtre,
        page,
        limit: PAR_PAGE,
      });
      setFormations(resultat.items);
      setTotal(resultat.total);
    } catch (error) {
      setErreur(messageDe(error, 'Impossible de charger les formations.'));
    } finally {
      setChargement(false);
    }
  }, [filtre, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const dernierePage = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Formations</h1>
          <p className="page-subtitle">
            Créez les formations, leurs modules et leurs formateurs ; ouvrez-les aux inscriptions quand elles sont prêtes.
          </p>
        </div>
        <div className="row-actions">
          <select
            className="input input-auto"
            aria-label="Filtrer par statut"
            value={filtre}
            onChange={(e) => {
              setPage(1);
              setFiltre(e.target.value as StatutFormation | '');
            }}
            disabled={chargement}
          >
            <option value="">Tous les statuts</option>
            {STATUTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn-sm" onClick={() => void charger()} disabled={chargement}>
            Actualiser
          </button>
          <button
            className="btn-sm btn-primary-sm"
            onClick={() => {
              setSucces(null);
              setErreur(null);
              setEdition('nouvelle');
            }}
          >
            Nouvelle formation
          </button>
        </div>
      </div>

      {succes !== null && <p className="alert alert-success">{succes}</p>}
      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Formation</th>
                  <th>Période</th>
                  <th>Capacité</th>
                  <th>Seuil</th>
                  <th>Statut</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {formations.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div>{f.titre}</div>
                      {f.dureeHeures !== null && (
                        <div className="muted-cell">{f.dureeHeures} h</div>
                      )}
                    </td>
                    <td>
                      {f.dateDebut || f.dateFin ? (
                        `${dateFr(f.dateDebut)} → ${dateFr(f.dateFin)}`
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td>{f.capaciteMax}</td>
                    <td>{f.noteMinCertification} %</td>
                    <td>
                      <span className={`statut-badge statut-${f.statut}`}>
                        {libelleStatut(f.statut)}
                      </span>
                    </td>
                    <td>
                      {f.statut === 'ARCHIVEE' ? (
                        <span className="muted-cell">Figée (archivée)</span>
                      ) : (
                        <div className="row-actions">
                          <button
                            className="btn-sm"
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setEdition(f);
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            className="btn-sm"
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleModules(f);
                            }}
                          >
                            Modules
                          </button>
                          <button
                            className="btn-sm"
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleFormateurs(f);
                            }}
                          >
                            Formateurs
                          </button>
                          <button
                            className="btn-sm"
                            onClick={() => {
                              setSucces(null);
                              setErreur(null);
                              setCibleStatut(f);
                            }}
                          >
                            Statut
                          </button>
                          <Link className="btn-sm" href={`/admin/formations/${f.id}/inscriptions`}>
                            Inscriptions
                          </Link>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {formations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted-cell">
                      Aucune formation{filtre === '' ? '' : ` ${libelleStatut(filtre).toLowerCase()}`}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="muted-cell">
              {total} formation{total > 1 ? 's' : ''} — page {page} / {dernierePage}
            </span>
            <div className="row-actions">
              <button
                className="btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </button>
              <button
                className="btn-sm"
                disabled={page >= dernierePage}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      )}

      {edition !== null && (
        <FormationModal
          formation={edition === 'nouvelle' ? null : edition}
          onClose={() => setEdition(null)}
          onDone={(message) => {
            setEdition(null);
            setSucces(message);
            void charger();
          }}
        />
      )}

      {cibleModules !== null && (
        <ModulesModal formation={cibleModules} onClose={() => setCibleModules(null)} />
      )}

      {cibleFormateurs !== null && (
        <FormateursModal
          formation={cibleFormateurs}
          onClose={() => setCibleFormateurs(null)}
        />
      )}

      {cibleStatut !== null && (
        <StatutModal
          formation={cibleStatut}
          onClose={() => setCibleStatut(null)}
          onDone={(message) => {
            setCibleStatut(null);
            setSucces(message);
            void charger();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/** État du formulaire : tout en texte, converti à l'envoi. */
interface Saisie {
  titre: string;
  description: string;
  objectifs: string;
  prerequis: string;
  dateDebut: string;
  dateFin: string;
  dureeHeures: string;
  capaciteMax: string;
  noteMinCertification: string;
  modeleCertificat: string;
  dureeValiditeMois: string;
}

const saisieInitiale = (f: FormationVue | null): Saisie => ({
  titre: f?.titre ?? '',
  description: f?.description ?? '',
  objectifs: f?.objectifs ?? '',
  prerequis: f?.prerequis ?? '',
  dateDebut: f?.dateDebut ?? '',
  dateFin: f?.dateFin ?? '',
  dureeHeures: f?.dureeHeures != null ? String(f.dureeHeures) : '',
  capaciteMax: f ? String(f.capaciteMax) : '',
  noteMinCertification: f ? String(f.noteMinCertification) : '',
  modeleCertificat: f?.modeleCertificat ?? '',
  dureeValiditeMois: f?.dureeValiditeMois != null ? String(f.dureeValiditeMois) : '',
});

/** Champ texte facultatif : vide -> absent (création) ou null (modification). */
const texteOuVide = (valeur: string): string | undefined => {
  const propre = valeur.trim();
  return propre === '' ? undefined : propre;
};

/** Construit le corps de création : les facultatifs vides sont omis. */
const versCreation = (s: Saisie): FormationInput => ({
  titre: s.titre.trim(),
  description: texteOuVide(s.description),
  objectifs: texteOuVide(s.objectifs),
  prerequis: texteOuVide(s.prerequis),
  dateDebut: texteOuVide(s.dateDebut),
  dateFin: texteOuVide(s.dateFin),
  dureeHeures: s.dureeHeures.trim() === '' ? undefined : Number(s.dureeHeures),
  capaciteMax: Number(s.capaciteMax),
  noteMinCertification: Number(s.noteMinCertification),
  modeleCertificat: texteOuVide(s.modeleCertificat),
  dureeValiditeMois: s.dureeValiditeMois.trim() === '' ? undefined : Number(s.dureeValiditeMois),
});

/**
 * Construit le PATCH : uniquement les champs réellement modifiés. Un champ
 * facultatif vidé part à `null` (le serveur l'efface).
 */
const versModification = (s: Saisie, f: FormationVue): FormationPatch => {
  const nouveau = versCreation(s);
  const patch: Record<string, unknown> = {};
  const comparer = (champ: keyof FormationInput): void => {
    const apres = nouveau[champ] ?? null;
    if (apres !== (f[champ] ?? null)) {
      patch[champ] = apres;
    }
  };
  (
    [
      'titre',
      'description',
      'objectifs',
      'prerequis',
      'dateDebut',
      'dateFin',
      'dureeHeures',
      'capaciteMax',
      'noteMinCertification',
      'modeleCertificat',
      'dureeValiditeMois',
    ] as Array<keyof FormationInput>
  ).forEach(comparer);
  return patch as FormationPatch;
};

/** Modale de création / modification d'une formation. */
function FormationModal({
  formation,
  onClose,
  onDone,
}: {
  formation: FormationVue | null;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [saisie, setSaisie] = useState<Saisie>(() => saisieInitiale(formation));
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const creation = formation === null;

  const champ =
    (cle: keyof Saisie) =>
    (e: { target: { value: string } }): void =>
      setSaisie((s) => ({ ...s, [cle]: e.target.value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      if (formation === null) {
        const creee = await createFormation(versCreation(saisie));
        onDone(`Formation « ${creee.titre} » créée : elle est ouverte et visible au catalogue.`);
      } else {
        const patch = versModification(saisie, formation);
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        const maj = await updateFormation(formation.id, patch);
        onDone(`Formation « ${maj.titre} » modifiée.`);
      }
    } catch (error) {
      setErreur(messageDe(error, 'Une erreur est survenue. Veuillez réessayer.'));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">{creation ? 'Nouvelle formation' : 'Modifier la formation'}</h1>
        <p className="auth-subtitle">
          {creation
            ? 'Elle sera créée au statut « Ouverte » et visible au catalogue.'
            : 'Seuls les champs modifiés sont enregistrés et tracés.'}
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="f-titre">
              Titre
            </label>
            <input
              id="f-titre"
              className="input"
              required
              maxLength={255}
              value={saisie.titre}
              onChange={champ('titre')}
              disabled={enCours}
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="f-capacite">
                Capacité maximale
              </label>
              <input
                id="f-capacite"
                className="input"
                type="number"
                required
                min={1}
                step={1}
                value={saisie.capaciteMax}
                onChange={champ('capaciteMax')}
                disabled={enCours}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-seuil">
                Seuil de certification (%)
              </label>
              <input
                id="f-seuil"
                className="input"
                type="number"
                required
                min={0}
                max={100}
                step={0.01}
                value={saisie.noteMinCertification}
                onChange={champ('noteMinCertification')}
                disabled={enCours}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-validite">
                Validité des certificats (mois)
              </label>
              <input
                id="f-validite"
                className="input"
                type="number"
                min={1}
                max={120}
                step={1}
                placeholder="Sans expiration"
                value={saisie.dureeValiditeMois}
                onChange={champ('dureeValiditeMois')}
                disabled={enCours}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-duree">
                Durée (heures)
              </label>
              <input
                id="f-duree"
                className="input"
                type="number"
                min={1}
                step={1}
                value={saisie.dureeHeures}
                onChange={champ('dureeHeures')}
                disabled={enCours}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="f-debut">
                Date de début
              </label>
              <input
                id="f-debut"
                className="input"
                type="date"
                value={saisie.dateDebut}
                onChange={champ('dateDebut')}
                disabled={enCours}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="f-fin">
                Date de fin
              </label>
              <input
                id="f-fin"
                className="input"
                type="date"
                min={saisie.dateDebut || undefined}
                value={saisie.dateFin}
                onChange={champ('dateFin')}
                disabled={enCours}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="f-description">
              Description
            </label>
            <textarea
              id="f-description"
              className="input"
              rows={2}
              maxLength={5000}
              value={saisie.description}
              onChange={champ('description')}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-objectifs">
              Objectifs pédagogiques
            </label>
            <textarea
              id="f-objectifs"
              className="input"
              rows={2}
              maxLength={5000}
              value={saisie.objectifs}
              onChange={champ('objectifs')}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-prerequis">
              Prérequis
            </label>
            <textarea
              id="f-prerequis"
              className="input"
              rows={2}
              maxLength={5000}
              value={saisie.prerequis}
              onChange={champ('prerequis')}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="f-modele">
              Modèle de certificat
            </label>
            <input
              id="f-modele"
              className="input"
              maxLength={255}
              value={saisie.modeleCertificat}
              onChange={champ('modeleCertificat')}
              disabled={enCours}
              placeholder="Ex. : modele-esprit-standard"
            />
            <span className="field-hint">
              Référence du gabarit utilisé à l’émission du certificat.
            </span>
          </div>

          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={onClose}
              disabled={enCours}
            >
              Annuler
            </button>
            <button type="submit" className="btn" disabled={enCours}>
              {enCours ? 'Enregistrement…' : creation ? 'Créer la formation' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Modale de gestion des modules d'une formation : ajout en fin de liste,
 * renommage, montée / descente, suppression. L'ordre affiché est celui du
 * serveur : après chaque action, je remplace la liste par sa réponse.
 */
function ModulesModal({
  formation,
  onClose,
}: {
  formation: FormationVue;
  onClose: () => void;
}): JSX.Element {
  const [modules, setModules] = useState<ModuleVue[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  // Module en cours de renommage + valeur saisie.
  const [renommage, setRenommage] = useState<{ id: string; titre: string } | null>(null);
  // Module dont la suppression attend une confirmation (second clic).
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  const recharger = useCallback(async (): Promise<void> => {
    const detail = await getFormation(formation.id);
    setModules(detail.modules);
  }, [formation.id]);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        await recharger();
      } catch (error) {
        setErreur(messageDe(error, 'Impossible de charger les modules.'));
      } finally {
        setChargement(false);
      }
    })();
  }, [recharger]);

  /** Exécute une action serveur avec verrouillage + message d'erreur commun. */
  const agir = async (action: () => Promise<void>, parDefaut: string): Promise<void> => {
    setErreur(null);
    setAConfirmer(null);
    setEnCours(true);
    try {
      await action();
    } catch (error) {
      setErreur(messageDe(error, parDefaut));
    } finally {
      setEnCours(false);
    }
  };

  async function handleAjout(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await agir(async () => {
      await addFormationModule(formation.id, {
        titre: titre.trim(),
        description: texteOuVide(description),
      });
      setTitre('');
      setDescription('');
      await recharger();
    }, "Impossible d'ajouter le module.");
  }

  const deplacer = (index: number, pas: -1 | 1): Promise<void> =>
    agir(async () => {
      const ids = modules.map((m) => m.id);
      const cible = index + pas;
      [ids[index], ids[cible]] = [ids[cible], ids[index]];
      setModules(await reorderFormationModules(formation.id, ids));
    }, 'Impossible de réordonner les modules.');

  const renommer = (): Promise<void> =>
    agir(async () => {
      if (renommage === null) return;
      await updateFormationModule(formation.id, renommage.id, {
        titre: renommage.titre.trim(),
      });
      setRenommage(null);
      await recharger();
    }, 'Impossible de renommer le module.');

  const supprimer = (moduleId: string): Promise<void> =>
    agir(async () => {
      await deleteFormationModule(formation.id, moduleId);
      await recharger();
    }, 'Impossible de supprimer le module.');

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Modules</h1>
        <p className="auth-subtitle">
          {formation.titre} — l’ordre ci-dessous est celui présenté aux apprenants.
        </p>

        {erreur !== null && <p className="alert alert-error">{erreur}</p>}

        {chargement ? (
          <p className="page-subtitle">Chargement…</p>
        ) : modules.length === 0 ? (
          <p className="page-subtitle">Aucun module pour l’instant. Ajoutez le premier ci-dessous.</p>
        ) : (
          <ol className="module-list">
            {modules.map((m, index) => (
              <li key={m.id} className="module-item">
                <span className="module-ordre">{m.ordre}</span>
                <div className="module-corps">
                  {renommage?.id === m.id ? (
                    <input
                      className="input"
                      aria-label="Nouveau titre du module"
                      maxLength={255}
                      value={renommage.titre}
                      onChange={(e) => setRenommage({ id: m.id, titre: e.target.value })}
                      disabled={enCours}
                    />
                  ) : (
                    <>
                      <div className="module-titre">{m.titre}</div>
                      {m.description && <div className="field-hint">{m.description}</div>}
                    </>
                  )}
                </div>
                {renommage?.id === m.id ? (
                  <div className="row-actions">
                    <button
                      className="btn-sm"
                      disabled={enCours || renommage.titre.trim() === ''}
                      onClick={() => void renommer()}
                    >
                      OK
                    </button>
                    <button
                      className="btn-sm btn-ghost"
                      disabled={enCours}
                      onClick={() => setRenommage(null)}
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="row-actions">
                    <button
                      className="btn-sm btn-icon"
                      aria-label={`Monter le module ${m.titre}`}
                      disabled={enCours || index === 0}
                      onClick={() => void deplacer(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn-sm btn-icon"
                      aria-label={`Descendre le module ${m.titre}`}
                      disabled={enCours || index === modules.length - 1}
                      onClick={() => void deplacer(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="btn-sm"
                      disabled={enCours}
                      onClick={() => {
                        setAConfirmer(null);
                        setRenommage({ id: m.id, titre: m.titre });
                      }}
                    >
                      Renommer
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      disabled={enCours}
                      onClick={() =>
                        aConfirmer === m.id ? void supprimer(m.id) : setAConfirmer(m.id)
                      }
                    >
                      {aConfirmer === m.id ? 'Confirmer ?' : 'Supprimer'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <form className="form" onSubmit={handleAjout}>
          <div className="field">
            <label className="field-label" htmlFor="m-titre">
              Nouveau module
            </label>
            <input
              id="m-titre"
              className="input"
              required
              maxLength={255}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              disabled={enCours || chargement}
              placeholder="Titre du module"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="m-description">
              Description (facultative)
            </label>
            <textarea
              id="m-description"
              className="input"
              rows={2}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={enCours || chargement}
            />
            <span className="field-hint">Le module est ajouté en dernière position.</span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={onClose}
              disabled={enCours}
            >
              Fermer
            </button>
            <button
              type="submit"
              className="btn"
              disabled={enCours || chargement || titre.trim() === ''}
            >
              {enCours ? 'Enregistrement…' : 'Ajouter le module'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** « Prénom Nom », ou l'email quand le compte n'a ni l'un ni l'autre. */
const nomComplet = (u: { prenom: string | null; nom: string | null; email: string }): string =>
  [u.prenom, u.nom].filter(Boolean).join(' ') || u.email;

/** Horodatage ISO -> JJ/MM/AAAA (date locale du navigateur). */
const jourFr = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

/**
 * US-FORM-03 — Modale des formateurs d'une formation : qui est affecté, en
 * affecter un autre, en retirer un (confirmation au second clic).
 *
 * Les candidats viennent de la liste des comptes, filtrée ici sur le rôle
 * Formateur et le statut actif ; le serveur revérifie de toute façon. Un
 * formateur déjà affecté qui a depuis perdu son rôle ou son compte reste
 * listé, avec un signalement : l'administrateur décide de le retirer ou non.
 */
function FormateursModal({
  formation,
  onClose,
}: {
  formation: FormationVue;
  onClose: () => void;
}): JSX.Element {
  const [affectes, setAffectes] = useState<FormateurAffecte[]>([]);
  const [candidats, setCandidats] = useState<AdminUser[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [choix, setChoix] = useState('');
  // Formateur dont le retrait attend une confirmation (second clic).
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  const recharger = useCallback(async (): Promise<void> => {
    setAffectes(await getFormationFormateurs(formation.id));
  }, [formation.id]);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [, utilisateurs] = await Promise.all([recharger(), getAdminUsers()]);
        setCandidats(
          utilisateurs.filter((u) => u.role === 'FORMATEUR' && u.statut === 'ACTIF'),
        );
      } catch (error) {
        setErreur(messageDe(error, 'Impossible de charger les formateurs.'));
      } finally {
        setChargement(false);
      }
    })();
  }, [recharger]);

  // Un formateur déjà affecté n'est plus proposé.
  const dejaAffectes = new Set(affectes.map((a) => a.id));
  const disponibles = candidats.filter((c) => !dejaAffectes.has(c.id));

  /** Exécute une action serveur avec verrouillage + message d'erreur commun. */
  const agir = async (action: () => Promise<void>, parDefaut: string): Promise<void> => {
    setErreur(null);
    setSucces(null);
    setAConfirmer(null);
    setEnCours(true);
    try {
      await action();
    } catch (error) {
      setErreur(messageDe(error, parDefaut));
      // La liste a pu changer entre-temps (autre administrateur) : je resynchronise.
      await recharger().catch(() => undefined);
    } finally {
      setEnCours(false);
    }
  };

  async function handleAffectation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await agir(async () => {
      const affecte = await assignFormationFormateur(formation.id, choix);
      setChoix('');
      await recharger();
      setSucces(`${nomComplet(affecte)} est affecté à la formation.`);
    }, 'Impossible d’affecter le formateur.');
  }

  const retirer = (formateur: FormateurAffecte): Promise<void> =>
    agir(async () => {
      await removeFormationFormateur(formation.id, formateur.id);
      await recharger();
      setSucces(`${nomComplet(formateur)} n’est plus affecté à la formation.`);
    }, 'Impossible de retirer le formateur.');

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Formateurs</h1>
        <p className="auth-subtitle">
          {formation.titre} — seuls les formateurs affectés pourront y créer des évaluations.
        </p>

        {succes !== null && <p className="alert alert-success">{succes}</p>}
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}

        {chargement ? (
          <p className="page-subtitle">Chargement…</p>
        ) : affectes.length === 0 ? (
          <p className="page-subtitle">
            Aucun formateur affecté pour l’instant. Choisissez-en un ci-dessous.
          </p>
        ) : (
          <ul className="module-list">
            {affectes.map((a) => (
              <li key={a.id} className="module-item">
                <div className="module-corps">
                  <div className="module-titre">{nomComplet(a)}</div>
                  <div className="field-hint">
                    {nomComplet(a) === a.email ? '' : `${a.email} — `}affecté le{' '}
                    {jourFr(a.affecteLe)}
                  </div>
                  {a.role !== 'FORMATEUR' && (
                    <div className="field-hint">
                      <span className="statut-badge statut-FERMEE">N’a plus le rôle Formateur</span>
                    </div>
                  )}
                  {a.statut !== 'ACTIF' && (
                    <div className="field-hint">
                      <span className="statut-badge statut-DESACTIVE">Compte non actif</span>
                    </div>
                  )}
                </div>
                <div className="row-actions">
                  <button
                    className="btn-sm btn-danger"
                    disabled={enCours}
                    onClick={() =>
                      aConfirmer === a.id ? void retirer(a) : setAConfirmer(a.id)
                    }
                  >
                    {aConfirmer === a.id ? 'Confirmer ?' : 'Retirer'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="form" onSubmit={handleAffectation}>
          <div className="field">
            <label className="field-label" htmlFor="f-formateur">
              Affecter un formateur
            </label>
            <select
              id="f-formateur"
              className="input"
              required
              value={choix}
              onChange={(e) => setChoix(e.target.value)}
              disabled={enCours || chargement || disponibles.length === 0}
            >
              <option value="">Choisir un formateur…</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {nomComplet(c)}
                  {nomComplet(c) === c.email ? '' : ` — ${c.email}`}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {chargement
                ? 'Chargement des comptes…'
                : candidats.length === 0
                  ? 'Aucun compte actif n’a le rôle Formateur. Attribuez-le d’abord depuis la page Utilisateurs.'
                  : disponibles.length === 0
                    ? 'Tous les formateurs actifs sont déjà affectés à cette formation.'
                    : 'Seuls les comptes actifs ayant le rôle Formateur sont proposés.'}
            </span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={onClose}
              disabled={enCours}
            >
              Fermer
            </button>
            <button type="submit" className="btn" disabled={enCours || chargement || choix === ''}>
              {enCours ? 'Enregistrement…' : 'Affecter'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ACTIONS_STATUT: Record<StatutFormation, { libelle: string; effet: string; succes: string }> = {
  BROUILLON: {
    libelle: 'Remettre en brouillon',
    effet: 'Transition non proposée par l’API.',
    succes: 'Formation en brouillon.',
  },
  FERMEE: {
    libelle: 'Clôturer',
    effet: 'Plus aucune inscription ; les inscrits terminent leur parcours.',
    succes: 'Formation clôturée.',
  },
  ARCHIVEE: {
    libelle: 'Archiver',
    effet:
      'Parcours figé et définitif : plus de modification, de QCM, de dépôt ni de demande de certificat. Les certificats émis restent vérifiables.',
    succes: 'Formation archivée.',
  },
  OUVERTE: {
    libelle: 'Rouvrir',
    effet: 'La formation revient au catalogue et accepte de nouveau les inscriptions.',
    succes: 'Formation rouverte.',
  },
};

/** US-FORM-08 : publier un brouillon n'est pas « rouvrir ». */
const PUBLIER = {
  libelle: 'Publier',
  effet: 'La formation entre au catalogue et accepte les inscriptions.',
  succes: 'Formation publiée.',
};
const actionStatut = (
  de: StatutFormation,
  vers: StatutFormation,
): { libelle: string; effet: string; succes: string } =>
  de === 'BROUILLON' && vers === 'OUVERTE' ? PUBLIER : ACTIONS_STATUT[vers];

/**
 * US-FORM-02 — Modale de changement de statut : impact (inscriptions,
 * évaluations en cours, certificats), actions possibles, confirmation
 * explicite exigée quand des évaluations sont en cours.
 */
function StatutModal({
  formation,
  onClose,
  onDone,
}: {
  formation: FormationVue;
  onClose: () => void;
  onDone: (message: string) => void;
}): JSX.Element {
  const [impact, setImpact] = useState<ImpactCycleFormation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [confirme, setConfirme] = useState(false);

  useEffect(() => {
    getImpactCycleFormation(formation.id)
      .then(setImpact)
      .catch((e: unknown) =>
        setErreur(e instanceof AdminError ? e.message : 'Impossible de charger l’impact.'),
      );
  }, [formation.id]);

  const e = impact?.evaluationsEnCours;
  const nbEnCours = e
    ? e.tentativesEnCours + e.livrablesACorriger + e.correctionsEnCours + e.certificatsEnEmission
    : 0;

  async function appliquer(vers: StatutFormation): Promise<void> {
    setErreur(null);
    setEnCours(true);
    try {
      await changerStatutFormation(formation.id, vers, confirme);
      onDone(actionStatut(formation.statut, vers).succes);
    } catch (err: unknown) {
      setErreur(err instanceof AdminError ? err.message : 'Impossible de changer le statut.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Statut de la formation</h1>
        <p className="auth-subtitle">
          {formation.titre} — actuellement « {libelleStatut(formation.statut)} ».
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {impact === null ? (
          erreur === null && <p className="page-subtitle">Chargement…</p>
        ) : (
          <>
            <ul className="cycle-impact">
              <li>
                <span>Inscriptions en cours</span>
                <strong>{impact.inscriptionsEnCours}</strong>
              </li>
              <li>
                <span>Tentatives de QCM en cours</span>
                <strong>{impact.evaluationsEnCours.tentativesEnCours}</strong>
              </li>
              <li>
                <span>Livrables à corriger / corrections ouvertes</span>
                <strong>
                  {impact.evaluationsEnCours.livrablesACorriger} /{' '}
                  {impact.evaluationsEnCours.correctionsEnCours}
                </strong>
              </li>
              <li>
                <span>Certificats en émission / actifs</span>
                <strong>
                  {impact.evaluationsEnCours.certificatsEnEmission} / {impact.certificatsActifs}
                </strong>
              </li>
            </ul>
            {nbEnCours > 0 && impact.transitionsPossibles.some((t) => t !== 'OUVERTE') && (
              <label className="cycle-confirmation">
                <input
                  type="checkbox"
                  checked={confirme}
                  onChange={(ev) => setConfirme(ev.target.checked)}
                />
                <span>
                  {nbEnCours} évaluation{nbEnCours > 1 ? 's sont' : ' est'} en cours : je confirme
                  le changement de statut.
                </span>
              </label>
            )}
            <div className="cycle-actions">
              {impact.transitionsPossibles.map((t) => (
                <div key={t} className="cycle-action">
                  <button
                    type="button"
                    className={t === 'ARCHIVEE' ? 'btn btn-danger-solid' : 'btn'}
                    disabled={enCours || (t !== 'OUVERTE' && nbEnCours > 0 && !confirme)}
                    onClick={() => void appliquer(t)}
                  >
                    {actionStatut(formation.statut, t).libelle}
                  </button>
                  <span className="field-hint">{actionStatut(formation.statut, t).effet}</span>
                </div>
              ))}
              {impact.transitionsPossibles.length === 0 && (
                <p className="page-subtitle">Formation archivée : statut définitif.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
