'use client';
import { FormEvent, useState } from 'react';
import {
  AdminError,
  ajouterModuleFormateur,
  FormationDetailVue,
  modifierContenuFormation,
  ModuleVue,
  renommerModuleFormateur,
  reordonnerModulesFormateur,
  supprimerModuleFormateur,
} from '../lib/api';
import { CroixFermeture } from './CroixFermeture';

const message = (e: unknown, defaut: string): string => (e instanceof AdminError ? e.message : defaut);

/**
 * US-FORM-04 — Le formateur affecté gère le contenu pédagogique de sa
 * formation : description, objectifs, prérequis, et modules (ajout,
 * renommage, ordre, suppression d'un module vide). Les réglages
 * institutionnels (titre, dates, capacité, seuil…) restent à l'administrateur
 * et ne sont pas proposés ici.
 */
export function ContenuFormationModal({
  formation,
  onClose,
  onChange,
}: {
  formation: FormationDetailVue;
  onClose: () => void;
  onChange: () => void;
}): JSX.Element {
  const [description, setDescription] = useState(formation.description ?? '');
  const [objectifs, setObjectifs] = useState(formation.objectifs ?? '');
  const [prerequis, setPrerequis] = useState(formation.prerequis ?? '');
  const [modules, setModules] = useState<ModuleVue[]>(formation.modules);
  const [nouveau, setNouveau] = useState('');
  const [renommage, setRenommage] = useState<{ id: string; titre: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const agir = async (action: () => Promise<void>, ok: string): Promise<void> => {
    setErreur(null);
    setSucces(null);
    setEnCours(true);
    try {
      await action();
      setSucces(ok);
      onChange();
    } catch (e: unknown) {
      setErreur(message(e, 'Action impossible.'));
    } finally {
      setEnCours(false);
    }
  };

  const enregistrerContenu = (e: FormEvent): void => {
    e.preventDefault();
    const vide = (v: string): string | null => (v.trim() === '' ? null : v.trim());
    void agir(async () => {
      await modifierContenuFormation(formation.id, {
        description: vide(description),
        objectifs: vide(objectifs),
        prerequis: vide(prerequis),
      });
    }, 'Contenu enregistré.');
  };

  const deplacer = (index: number, sens: -1 | 1): void => {
    const cible = index + sens;
    if (cible < 0 || cible >= modules.length) return;
    const ordre = [...modules];
    [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
    void agir(async () => {
      setModules(await reordonnerModulesFormateur(formation.id, ordre.map((m) => m.id)));
    }, 'Ordre des modules enregistré.');
  };

  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card modal-wide modal-closable">
        <CroixFermeture onClose={onClose} disabled={enCours} />
        <h1 className="auth-title">Contenu pédagogique</h1>
        <p className="auth-subtitle">
          {formation.titre} — titre, dates, capacité et seuil restent gérés par l’administration.
        </p>
        {erreur !== null && <p className="alert alert-error">{erreur}</p>}
        {succes !== null && <p className="alert alert-success">{succes}</p>}

        <form className="contenu-form" onSubmit={enregistrerContenu}>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Objectifs pédagogiques</span>
            <textarea className="input" rows={3} value={objectifs} onChange={(e) => setObjectifs(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Prérequis</span>
            <textarea className="input" rows={2} value={prerequis} onChange={(e) => setPrerequis(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={enCours}>
            Enregistrer le contenu
          </button>
        </form>

        <h2 className="section-title">Modules</h2>
        <ol className="contenu-modules">
          {modules.map((m, i) => (
            <li key={m.id} className="contenu-module">
              <span className="module-ordre">{m.ordre}</span>
              {renommage?.id === m.id ? (
                <form
                  className="contenu-renommage"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const titre = renommage.titre.trim();
                    setRenommage(null);
                    void agir(async () => {
                      const maj = await renommerModuleFormateur(formation.id, m.id, titre);
                      setModules((l) => l.map((x) => (x.id === m.id ? maj : x)));
                    }, 'Module renommé.');
                  }}
                >
                  <input
                    className="input"
                    value={renommage.titre}
                    maxLength={200}
                    onChange={(e) => setRenommage({ id: m.id, titre: e.target.value })}
                    aria-label="Nouveau titre"
                  />
                  <button type="submit" className="btn-sm" disabled={renommage.titre.trim() === ''}>
                    OK
                  </button>
                </form>
              ) : (
                <span className="contenu-titre">{m.titre}</span>
              )}
              <span className="row-actions">
                <button className="btn-sm" aria-label="Monter" disabled={enCours || i === 0} onClick={() => deplacer(i, -1)}>
                  ↑
                </button>
                <button
                  className="btn-sm"
                  aria-label="Descendre"
                  disabled={enCours || i === modules.length - 1}
                  onClick={() => deplacer(i, 1)}
                >
                  ↓
                </button>
                <button className="btn-sm" disabled={enCours} onClick={() => setRenommage({ id: m.id, titre: m.titre })}>
                  Renommer
                </button>
                <button
                  className="btn-sm"
                  disabled={enCours}
                  onClick={() =>
                    void agir(async () => {
                      await supprimerModuleFormateur(formation.id, m.id);
                      setModules((l) =>
                        l.filter((x) => x.id !== m.id).map((x, k) => ({ ...x, ordre: k + 1 })),
                      );
                    }, 'Module supprimé.')
                  }
                >
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ol>
        <form
          className="contenu-ajout"
          onSubmit={(e) => {
            e.preventDefault();
            const titre = nouveau.trim();
            void agir(async () => {
              const m = await ajouterModuleFormateur(formation.id, titre);
              setModules((l) => [...l, m]);
              setNouveau('');
            }, 'Module ajouté.');
          }}
        >
          <input
            className="input"
            placeholder="Titre du nouveau module"
            maxLength={200}
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            aria-label="Titre du nouveau module"
          />
          <button type="submit" className="btn" disabled={enCours || nouveau.trim() === ''}>
            Ajouter
          </button>
        </form>
        <p className="field-hint">Un module qui contient des évaluations ou des ressources ne peut pas être supprimé.</p>
      </section>
    </div>
  );
}
