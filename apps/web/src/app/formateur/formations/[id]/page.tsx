'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AtelierModal } from '../../../../components/AtelierModal';
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
  QcmResume,
  StatutFormation,
} from '../../../../lib/api';
import {
  dateHeureFr,
  LIBELLES_STATUT_ATELIER,
  LIBELLES_STATUT_QCM,
} from '../../../../lib/format';

const LIBELLES: Record<StatutFormation, string> = {
  OUVERTE: 'Ouverte',
  FERMEE: 'Fermée',
  ARCHIVEE: 'Archivée',
};

/** Ce que le statut change pour le formateur, en une phrase. */
const NOTES: Record<StatutFormation, string | null> = {
  OUVERTE: null,
  FERMEE: 'Formation fermée : elle n’accepte plus d’inscriptions.',
  ARCHIVEE: 'Formation archivée : elle est figée, consultation seulement.',
};

/** AAAA-MM-JJ -> JJ/MM/AAAA, sans passer par Date (pas de décalage horaire). */
const dateFr = (iso: string | null): string => {
  if (!iso) return '—';
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
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
 * US-IA-01 — Sous les ateliers : les supports pédagogiques du module pour
 * l'assistance IA (dépôt, état d'indexation, relance, suppression).
 *
 * US-FORM-05 — Au-dessus : les ressources du cours (liens, vidéos YouTube /
 * Vimeo) que les apprenants voient dans « Mon espace ».
 */
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
  }, [id, chargerQcms]);

  const modifiable = formation !== null && formation.statut !== 'ARCHIVEE';

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/formateur/formations">
          ← Mes formations
        </Link>
      </p>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : formation === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{formation.titre}</h1>
              <p className="page-subtitle">
                {formation.dateDebut || formation.dateFin
                  ? `${dateFr(formation.dateDebut)} → ${dateFr(formation.dateFin)}`
                  : 'Dates non définies'}
                {formation.dureeHeures !== null ? ` · ${formation.dureeHeures} h` : ''}
              </p>
            </div>
            <span className={`statut-badge statut-${formation.statut}`}>
              {LIBELLES[formation.statut]}
            </span>
          </div>

          {NOTES[formation.statut] !== null && (
            <p className="alert alert-info">{NOTES[formation.statut]}</p>
          )}

          <dl className="fiche">
            <div>
              <dt>Capacité</dt>
              <dd>{formation.capaciteMax} apprenants</dd>
            </div>
            <div>
              <dt>Seuil de certification</dt>
              <dd>{formation.noteMinCertification} %</dd>
            </div>
            {formation.description && (
              <div className="fiche-large">
                <dt>Description</dt>
                <dd>{formation.description}</dd>
              </div>
            )}
            {formation.objectifs && (
              <div className="fiche-large">
                <dt>Objectifs pédagogiques</dt>
                <dd>{formation.objectifs}</dd>
              </div>
            )}
            {formation.prerequis && (
              <div className="fiche-large">
                <dt>Prérequis</dt>
                <dd>{formation.prerequis}</dd>
              </div>
            )}
          </dl>

          <h2 className="section-title">Modules</h2>
          {formation.modules.length === 0 ? (
            <p className="page-subtitle">Aucun module pour l’instant.</p>
          ) : (
            <ol className="espace-modules">
              {formation.modules.map((m) => (
                <li key={m.id} className="espace-module">
                  <div className="espace-module-tete">
                    <span className="module-ordre">{m.ordre}</span>
                    <div className="module-corps">
                      <div className="module-titre">{m.titre}</div>
                      {m.description && <div className="field-hint">{m.description}</div>}
                    </div>
                    {modifiable && (
                      <div className="module-boutons">
                        <button
                          className="btn-sm btn-primary-sm"
                          onClick={() => setNouveauQcm({ id: m.id, titre: m.titre })}
                        >
                          + Nouveau QCM
                        </button>
                        <button
                          className="btn-sm btn-primary-sm"
                          onClick={() => setNouvelAtelier({ id: m.id, titre: m.titre })}
                        >
                          + Nouvel atelier
                        </button>
                      </div>
                    )}
                  </div>
                  {(qcms[m.id] ?? []).length === 0 ? (
                    <p className="espace-vide">Aucun QCM dans ce module.</p>
                  ) : (
                    <ul className="espace-qcms">
                      {(qcms[m.id] ?? []).map((q) => (
                        <li key={q.id} className="espace-qcm">
                          <div className="module-corps">
                            <Link className="table-link" href={`/formateur/qcm/${q.id}`}>
                              QCM · {q.titre}
                            </Link>
                            <div className="field-hint">
                              {q.nbQuestions} question{q.nbQuestions > 1 ? 's' : ''}
                            </div>
                          </div>
                          <span className={`statut-badge statut-${q.statut}`}>
                            {LIBELLES_STATUT_QCM[q.statut]}
                          </span>
                          <Link className="btn-sm btn-link" href={`/formateur/qcm/${q.id}`}>
                            Ouvrir
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(ateliers[m.id] ?? []).length === 0 ? (
                    <p className="espace-vide">Aucun atelier dans ce module.</p>
                  ) : (
                    <ul className="espace-qcms">
                      {(ateliers[m.id] ?? []).map((a) => (
                        <li key={a.id} className="espace-qcm espace-atelier">
                          <div className="module-corps">
                            <Link className="table-link" href={`/formateur/ateliers/${a.id}`}>
                              Atelier · {a.titre}
                            </Link>
                            <div className="field-hint">
                              À rendre avant le {dateHeureFr(a.dateLimite)} ·{' '}
                              {a.typesLivrables.map((t) => `.${t}`).join(' ')}
                            </div>
                          </div>
                          <span className={`statut-badge statut-${a.statut}`}>
                            {LIBELLES_STATUT_ATELIER[a.statut]}
                          </span>
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
                  />
                  <SupportsModule moduleId={m.id} moduleTitre={m.titre} modifiable={modifiable} />
                </li>
              ))}
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
