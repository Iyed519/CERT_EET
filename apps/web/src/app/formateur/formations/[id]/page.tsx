'use client';
import Link from 'next/link';
import { EnTeteFormation } from '../../../../components/EnTeteFormation';
import { EtatVide } from '../../../../components/EtatVide';
import { FiltresPastilles } from '../../../../components/FiltresPastilles';
import { Icone } from '../../../../components/Icone';
import { MenuActions } from '../../../../components/MenuActions';
import { PastilleStatut } from '../../../../components/PastilleStatut';
import { useMiettes } from '../../../../components/TitrePage';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AtelierModal } from '../../../../components/AtelierModal';
import { ContenuFormationModal } from '../../../../components/ContenuFormationModal';
import { QcmInfosModal } from '../../../../components/QcmInfosModal';
import { RessourcesFormateur } from '../../../../components/RessourcesCours';
import { SupportsModule } from '../../../../components/SupportsModule';
import {
  AdminError,
  AtelierResume,
  FormationDetailVue,
  getAteliersDuModule,
  getMaFormation,
  getQcmsDuModule,
  ModuleVue,
  QcmResume,
  StatutFormation,
} from '../../../../lib/api';
import { resumeModule } from '../../../../lib/ui-regles';
import {
  dateHeureFr,
  LIBELLES_STATUT_ATELIER,
  LIBELLES_STATUT_QCM,
} from '../../../../lib/format';

/** Ce que le statut change pour le formateur, en une phrase. */
const NOTES: Record<StatutFormation, string | null> = {
  BROUILLON:
    'Formation en brouillon : préparez son contenu ; elle sera visible au catalogue quand un administrateur la publiera.',
  OUVERTE: null,
  FERMEE: 'Formation fermée : elle n’accepte plus d’inscriptions.',
  ARCHIVEE: 'Formation archivée : elle est figée, consultation seulement.',
};

/**
 * US-AUTH-16 — Une de mes formations : sa fiche et ses modules.
 *
 * C'est la première page servie derrière l'autorisation par ressource : un
 * formateur qui n'est pas affecté à cette formation reçoit un 403 (et le refus
 * est tracé côté serveur), même s'il connaît son identifiant.
 *
 * US-QCM-01 — Sous chaque module : ses QCM (statut, nombre de questions, lien
 * vers l'éditeur) et un bouton « Nouveau QCM », sauf si la formation est
 * archivée (le serveur refuserait toute écriture).
 *
 * US-ATEL-01 — Sous les QCM : les ateliers du module (statut, date limite,
 * types de livrables, lien vers la fiche) et un bouton « Nouvel atelier ».
 *
 * US-SUIVI-01 — Lien vers le suivi pédagogique (tableau de bord de la formation).
 *
 * US-IA-01 — Sous les ateliers : les supports pédagogiques du module pour
 * l'assistance IA (dépôt, état d'indexation, relance, suppression).
 *
 * US-FORM-05 — Au-dessus : les ressources du cours (liens, vidéos YouTube /
 * Vimeo) que les apprenants voient dans « Mon espace ».
 *
 * US-FORM-04 — « Modifier le contenu » : description, objectifs, prérequis et
 * modules (ajout, renommage, ordre, suppression), formation non archivée.
 *
 * US-UX-04 — Onglet « Contenu » de l'espace de la formation (son adresse
 * reste celle de la formation) : chaque module est un bloc repliable avec son
 * résumé, une icône et une pastille par élément, les brouillons distincts (et
 * masquables), et UN bouton « Ajouter » (QCM, atelier, lien ou vidéo, fichier,
 * support pour l'IA). La fiche (capacité, seuil, description, objectifs,
 * prérequis) est dans l'onglet « Vue d'ensemble ».
 */
type Demande = { moduleId: string; type: 'lien' | 'fichier' | 'support'; jeton: number };

export default function MaFormationPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [formation, setFormation] = useState<FormationDetailVue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // QCM de chaque module, indexés par identifiant de module.
  const [qcms, setQcms] = useState<Record<string, QcmResume[]>>({});
  const [nouveauQcm, setNouveauQcm] = useState<{ id: string; titre: string } | null>(null);
  // Ateliers de chaque module (US-ATEL-01), indexés par identifiant de module.
  const [ateliers, setAteliers] = useState<Record<string, AtelierResume[]>>({});
  const [nouvelAtelier, setNouvelAtelier] = useState<{ id: string; titre: string } | null>(null);
  const router = useRouter();
  const [contenuOuvert, setContenuOuvert] = useState(false);
  const [version, setVersion] = useState(0);
  // US-UX-04 : repli des modules, filtre des brouillons, ajouts demandés par le menu.
  const [replies, setReplies] = useState<Record<string, boolean>>({});
  const [brouillons, setBrouillons] = useState<'afficher' | 'masquer'>('afficher');
  const [demande, setDemande] = useState<Demande | null>(null);
  const [nbRessources, setNbRessources] = useState<Record<string, number>>({});
  const [nbSupports, setNbSupports] = useState<Record<string, number>>({});

  const chargerQcms = useCallback(async (f: FormationDetailVue): Promise<void> => {
    const [listesQcm, listesAteliers] = await Promise.all([
      Promise.all(f.modules.map((m) => getQcmsDuModule(m.id))),
      Promise.all(f.modules.map((m) => getAteliersDuModule(m.id))),
    ]);
    setQcms(Object.fromEntries(f.modules.map((m, i) => [m.id, listesQcm[i]])));
    setAteliers(Object.fromEntries(f.modules.map((m, i) => [m.id, listesAteliers[i]])));
  }, []);

  useEffect(() => {
    if (!id) return;
    void (async (): Promise<void> => {
      setChargement(true);
      setErreur(null);
      try {
        const detail = await getMaFormation(id);
        setFormation(detail);
        await chargerQcms(detail);
      } catch (error) {
        setErreur(
          error instanceof AdminError ? error.message : 'Impossible de charger la formation.',
        );
      } finally {
        setChargement(false);
      }
    })();
  }, [id, chargerQcms, version]);

  const modifiable = formation !== null && formation.statut !== 'ARCHIVEE';
  const nbBrouillons = useMemo(
    () =>
      Object.values(qcms).flat().filter((q) => q.statut === 'BROUILLON').length +
      Object.values(ateliers).flat().filter((a) => a.statut === 'BROUILLON').length,
    [qcms, ateliers],
  );
  const toutReplie = formation !== null && formation.modules.length > 0 && formation.modules.every((m) => replies[m.id]);

  const compteRessources = useCallback((moduleId: string, n: number) => {
    setNbRessources((c) => (c[moduleId] === n ? c : { ...c, [moduleId]: n }));
  }, []);
  const compteSupports = useCallback((moduleId: string, n: number) => {
    setNbSupports((c) => (c[moduleId] === n ? c : { ...c, [moduleId]: n }));
  }, []);

  const demander = (m: ModuleVue, type: Demande['type']): void => {
    setReplies((r) => ({ ...r, [m.id]: false }));
    setDemande({ moduleId: m.id, type, jeton: Date.now() });
  };

  useMiettes(formation ? [{ libelle: formation.titre }] : null);
  return (
    <>
      <EnTeteFormation id={id} actif="contenu" formation={formation} />

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : formation === null ? null : (
        <>
          {NOTES[formation.statut] !== null && (
            <p className="alert alert-info">{NOTES[formation.statut]}</p>
          )}

          <div className="barre-filtres">
            {nbBrouillons > 0 ? (
              <FiltresPastilles<'afficher' | 'masquer'>
                libelle="Brouillons"
                valeur={brouillons}
                onChange={setBrouillons}
                options={[
                  { valeur: 'afficher', libelle: 'Tout le contenu' },
                  { valeur: 'masquer', libelle: 'Masquer les brouillons', compteur: nbBrouillons },
                ]}
              />
            ) : (
              <span className="barre-filtres-resume">Aucun brouillon : tout le contenu est affiché.</span>
            )}
            <div className="row-actions">
              {formation.modules.length > 0 && (
                <button
                  type="button"
                  className="btn-discret"
                  onClick={() =>
                    setReplies(Object.fromEntries(formation.modules.map((m) => [m.id, !toutReplie])))
                  }
                >
                  <Icone nom={toutReplie ? 'chevron-bas' : 'chevron-haut'} taille={16} />
                  {toutReplie ? 'Tout déplier' : 'Tout replier'}
                </button>
              )}
              {modifiable && (
                <button className="btn-sm" onClick={() => setContenuOuvert(true)}>
                  <Icone nom="modifier" taille={16} />
                  Modifier le contenu
                </button>
              )}
            </div>
          </div>

          {contenuOuvert && (
            <ContenuFormationModal
              formation={formation}
              onClose={() => setContenuOuvert(false)}
              onChange={() => setVersion((v) => v + 1)}
            />
          )}

          {formation.modules.length === 0 ? (
            <EtatVide
              titre="Aucun module pour l’instant"
              texte="Ajoutez les modules du programme avec « Modifier le contenu » : vous pourrez ensuite y créer QCM et ateliers."
            />
          ) : (
            <ol className="espace-modules modules-lisibles">
              {formation.modules.map((m) => {
                const listeQcm = qcms[m.id] ?? [];
                const listeAteliers = ateliers[m.id] ?? [];
                const visiblesQcm = brouillons === 'masquer' ? listeQcm.filter((q) => q.statut !== 'BROUILLON') : listeQcm;
                const visiblesAteliers =
                  brouillons === 'masquer' ? listeAteliers.filter((a) => a.statut !== 'BROUILLON') : listeAteliers;
                const replie = replies[m.id] ?? false;
                const resume = resumeModule({
                  qcm: listeQcm.map((q) => q.statut),
                  ateliers: listeAteliers.length,
                  ressources: nbRessources[m.id],
                  supports: nbSupports[m.id],
                });
                const idCorps = `module-${m.id}`;
                return (
                  <li key={m.id} className={`espace-module module-bloc${replie ? ' module-replie' : ''}`}>
                    <div className="module-bloc-tete">
                      <button
                        type="button"
                        className="module-bloc-bascule"
                        aria-expanded={!replie}
                        aria-controls={idCorps}
                        onClick={() => setReplies((r) => ({ ...r, [m.id]: !replie }))}
                      >
                        <span className="module-ordre">{m.ordre}</span>
                        <span className="module-bloc-titres">
                          <span className="module-titre">{m.titre}</span>
                          <span className="module-resume">{resume}</span>
                        </span>
                        <Icone nom={replie ? 'chevron-bas' : 'chevron-haut'} taille={20} />
                      </button>
                      {modifiable && (
                        <MenuActions
                          libelle="Ajouter"
                          icone="ajouter"
                          principal
                          contexte={m.titre}
                          elements={[
                            { libelle: 'Nouveau QCM', icone: 'qcm', onClick: () => setNouveauQcm({ id: m.id, titre: m.titre }) },
                            { libelle: 'Nouvel atelier', icone: 'atelier', onClick: () => setNouvelAtelier({ id: m.id, titre: m.titre }) },
                            { libelle: 'Lien ou vidéo', icone: 'video', onClick: () => demander(m, 'lien'), separe: true },
                            { libelle: 'Fichier', icone: 'fichier', onClick: () => demander(m, 'fichier') },
                            { libelle: 'Support pour l’IA', icone: 'ia', onClick: () => demander(m, 'support'), separe: true },
                          ]}
                        />
                      )}
                    </div>
                    <div id={idCorps} className="module-bloc-corps" hidden={replie}>
                      {m.description && <p className="field-hint module-description">{m.description}</p>}
                      <p className="module-rubrique">Évaluations</p>
                      {visiblesQcm.length + visiblesAteliers.length === 0 ? (
                        <p className="espace-vide">
                          {listeQcm.length + listeAteliers.length === 0
                            ? 'Aucun QCM ni atelier dans ce module.'
                            : 'Seulement des brouillons, masqués par le filtre.'}
                        </p>
                      ) : (
                        <ul className="espace-qcms elements-module">
                          {visiblesQcm.map((q) => (
                            <li key={q.id} className={`espace-qcm element-module${q.statut === 'BROUILLON' ? ' element-brouillon' : ''}`}>
                              <span className="element-icone element-icone-qcm">
                                <Icone nom="qcm" taille={18} />
                              </span>
                              <div className="module-corps">
                                <Link className="table-link" href={`/formateur/qcm/${q.id}`}>
                                  <span className="sr-only">QCM · </span>
                                  {q.titre}
                                </Link>
                                <div className="field-hint">
                                  QCM · {q.nbQuestions} question{q.nbQuestions > 1 ? 's' : ''}
                                </div>
                              </div>
                              <PastilleStatut statut={q.statut} libelle={LIBELLES_STATUT_QCM[q.statut]} />
                              <Link className="btn-sm btn-link" href={`/formateur/qcm/${q.id}`}>
                                Ouvrir
                              </Link>
                            </li>
                          ))}
                          {visiblesAteliers.map((a) => (
                            <li key={a.id} className={`espace-qcm espace-atelier element-module${a.statut === 'BROUILLON' ? ' element-brouillon' : ''}`}>
                              <span className="element-icone element-icone-atelier">
                                <Icone nom="atelier" taille={18} />
                              </span>
                              <div className="module-corps">
                                <Link className="table-link" href={`/formateur/ateliers/${a.id}`}>
                                  <span className="sr-only">Atelier · </span>
                                  {a.titre}
                                </Link>
                                <div className="field-hint">
                                  Atelier · à rendre avant le {dateHeureFr(a.dateLimite)} ·{' '}
                                  {a.typesLivrables.map((t) => `.${t}`).join(' ')}
                                </div>
                              </div>
                              <PastilleStatut statut={a.statut} libelle={LIBELLES_STATUT_ATELIER[a.statut]} />
                              <Link className="btn-sm btn-link" href={`/formateur/ateliers/${a.id}`}>
                                Ouvrir
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      <RessourcesFormateur
                        moduleId={m.id}
                        moduleTitre={m.titre}
                        modifiable={modifiable}
                        boutonsAjout={false}
                        onCompte={(n) => compteRessources(m.id, n)}
                        demandeAjout={
                          demande && demande.moduleId === m.id && demande.type !== 'support'
                            ? { type: demande.type, jeton: demande.jeton }
                            : null
                        }
                      />
                      <SupportsModule
                        moduleId={m.id}
                        moduleTitre={m.titre}
                        modifiable={modifiable}
                        boutonsAjout={false}
                        onCompte={(n) => compteSupports(m.id, n)}
                        demandeAjout={demande && demande.moduleId === m.id && demande.type === 'support' ? demande.jeton : null}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      {nouvelAtelier && (
        <AtelierModal
          moduleId={nouvelAtelier.id}
          moduleTitre={nouvelAtelier.titre}
          onClose={() => setNouvelAtelier(null)}
          onEnregistre={(cree) => router.push(`/formateur/ateliers/${cree.id}`)}
        />
      )}

      {nouveauQcm && (
        <QcmInfosModal
          moduleId={nouveauQcm.id}
          moduleTitre={nouveauQcm.titre}
          onClose={() => setNouveauQcm(null)}
          onEnregistre={(cree) => router.push(`/formateur/qcm/${cree.id}`)}
        />
      )}
    </>
  );
}
