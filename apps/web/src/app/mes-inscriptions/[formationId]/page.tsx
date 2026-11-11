'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DemarrageTentative, QcmADemarrer } from '../../../components/DemarrageTentative';
import { RessourcesApprenant } from '../../../components/RessourcesCours';
import { AdminError, EspaceFormationVue, getMonEspace, StatutCertificat } from '../../../lib/api';
import {
  dateFr,
  echeanceAtelierFr,
  fenetreQcmFr,
  LIBELLES_AVANCEMENT_MODULE,
  LIBELLES_AVANCEMENT_QCM,
  LIBELLES_ETAT_DEPOT,
  LIBELLES_INSCRIPTION,
  LIBELLES_LIVRABLE_COURT,
  periodeFr,
} from '../../../lib/format';

/** Ce que le statut de la formation change pour l'apprenant, en une phrase. */
const NOTES_FORMATION: Record<string, string | null> = {
  OUVERTE: null,
  FERMEE: 'Formation fermée aux nouvelles inscriptions : votre accès au contenu est conservé.',
  ARCHIVEE: 'Formation archivée : son contenu est figé, consultation seulement.',
};

type QcmEspace = EspaceFormationVue['modules'][number]['qcms'][number];

/** Bouton d'un QCM : libellé, et raison de l'inactivité le cas échéant. */
interface ActionQcm {
  libelle: string;
  // null = bouton actif.
  raisonInactif: string | null;
  // Raison écrite sous le bouton (le survol n'existe pas sur mobile) ; inutile
  // quand la ligne de fenêtre (« Ouvre le … », « Fermé depuis … ») la dit déjà.
  raisonVisible: boolean;
}

/**
 * Ce que propose le bouton d'un QCM. Purement informatif : le serveur
 * revérifie tout au démarrage (US-QCM-05) et c'est son refus qui fait foi —
 * le délai entre deux tentatives, par exemple, n'est connu que de lui.
 */
function actionQcm(q: QcmEspace, inscriptionActive: boolean): ActionQcm {
  if (q.tentativeEnCoursId !== null) {
    return { libelle: 'Reprendre', raisonInactif: null, raisonVisible: false };
  }
  const libelle = q.nbTentativesPassees > 0 ? 'Nouvelle tentative' : 'Commencer';
  if (!inscriptionActive) {
    return {
      libelle,
      raisonInactif: 'Votre formation est terminée : évaluations en lecture seule.',
      raisonVisible: true,
    };
  }
  if (q.fenetre === null) {
    return {
      libelle,
      raisonInactif: 'Cette évaluation n’est pas encore disponible.',
      raisonVisible: true,
    };
  }
  if (q.fenetre === 'A_VENIR') {
    return {
      libelle,
      raisonInactif: 'Disponible à l’ouverture de la fenêtre.',
      raisonVisible: false,
    };
  }
  if (q.fenetre === 'FERMEE') {
    return {
      libelle,
      raisonInactif: 'La fenêtre de cette évaluation est fermée.',
      raisonVisible: false,
    };
  }
  if (q.nbTentativesMax !== null && q.nbTentativesPassees >= q.nbTentativesMax) {
    return {
      libelle,
      raisonInactif: 'Vous avez utilisé toutes vos tentatives.',
      raisonVisible: true,
    };
  }
  return { libelle, raisonInactif: null, raisonVisible: false };
}

/**
 * US-INSC-04 — Mon espace dans une formation (DS-09, étapes 1 et 2).
 *
 * Progression, échéance, puis les modules dans l'ordre avec leurs QCM
 * publiés et MON avancement sur chacun. Aucune question n'est chargée ici.
 * US-QCM-04 — Chaque QCM publié montre sa fenêtre d'ouverture (à venir avec
 * ses dates, ouvert jusqu'à, fermé depuis), calculée par le serveur.
 * US-QCM-05 — « Commencer » ouvre une confirmation (durée, rang de la
 * tentative), puis démarre la tentative et mène à sa page ; « Reprendre » y
 * mène directement quand une tentative est en cours. Un refus du serveur
 * (hors fenêtre, tentatives épuisées, délai) s'affiche dans la modale, et
 * l'espace est rechargé pour refléter l'état réel. Un apprenant non inscrit,
 * ou dont l'inscription est suspendue, reçoit le message exact du serveur (403).
 * US-ATEL-03 — Sous les QCM, les ateliers publiés du module : date limite,
 * état du dépôt (calculé par le serveur) et lien vers leur fiche.
 * US-ATEL-04 — Un atelier où j'ai déposé montre le statut de mon livrable.
 */
export default function MonEspacePage(): JSX.Element {
  const params = useParams<{ formationId: string }>();
  const formationId = params?.formationId ?? '';
  const router = useRouter();
  const [espace, setEspace] = useState<EspaceFormationVue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aDemarrer, setADemarrer] = useState<QcmADemarrer | null>(null);

  // `silencieux` : rechargement après un refus, sans masquer la page.
  const charger = useCallback(
    async (silencieux = false): Promise<void> => {
      if (!formationId) return;
      if (!silencieux) setChargement(true);
      setErreur(null);
      try {
        setEspace(await getMonEspace(formationId));
      } catch (error) {
        setErreur(
          error instanceof AdminError
            ? error.message
            : 'Impossible de charger votre espace de formation.',
        );
      } finally {
        setChargement(false);
      }
    },
    [formationId],
  );

  useEffect(() => {
    void charger();
  }, [charger]);

  const inscriptionActive = espace?.inscription.statut === 'EN_COURS';

  const cliquerQcm = (q: QcmEspace): void => {
    if (q.tentativeEnCoursId !== null) {
      router.push(`/tentatives/${q.tentativeEnCoursId}`);
      return;
    }
    setADemarrer({
      id: q.id,
      titre: q.titre,
      dureeMaxMinutes: q.dureeMaxMinutes,
      nbTentativesMax: q.nbTentativesMax,
      nbTentativesPassees: q.nbTentativesPassees,
      dateFermeture: q.dateFermeture,
      surveillanceWebcam: q.surveillanceWebcam,
    });
  };

  const avancement = espace ? Math.round(espace.inscription.tauxAvancement) : 0;
  const note = espace ? NOTES_FORMATION[espace.formation.statut] : null;

  return (
    <>
      <p className="back-link-row">
        <Link className="back-link" href="/mes-inscriptions">
          ← Mes inscriptions
        </Link>
      </p>

      {erreur !== null && <p className="alert alert-error">{erreur}</p>}

      {chargement ? (
        <p className="page-subtitle">Chargement…</p>
      ) : espace === null ? null : (
        <>
          <div className="page-head">
            <div>
              <h1 className="page-title">{espace.formation.titre}</h1>
              <p className="page-subtitle">
                {periodeFr(espace.formation.dateDebut, espace.formation.dateFin) ??
                  'Dates non définies'}
                {espace.formation.dureeHeures !== null
                  ? ` · ${espace.formation.dureeHeures} h`
                  : ''}
              </p>
            </div>
            <span className={`statut-badge statut-${espace.inscription.statut}`}>
              {LIBELLES_INSCRIPTION[espace.inscription.statut]}
            </span>
          </div>

          {note && <p className="alert alert-info">{note}</p>}

          <section className="progression" aria-label="Ma progression">
            <div className="progression-tete">
              <span className="progression-libelle">Ma progression</span>
              <span className="progression-valeur">{avancement} %</span>
            </div>
            <div
              className="progression-barre"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={avancement}
            >
              <div className="progression-remplie" style={{ width: `${avancement}%` }} />
            </div>
            <p className="field-hint">
              Échéance : {dateFr(espace.inscription.dateEcheance)} · Certification à partir de{' '}
              {espace.formation.noteMinCertification} %
            </p>
          </section>

          <CarteCertification certification={espace.certification} />

          <h2 className="section-title">Modules</h2>
          {espace.modules.length === 0 ? (
            <p className="page-subtitle">Le programme n’est pas encore publié.</p>
          ) : (
            <ol className="espace-modules">
              {espace.modules.map((m) => (
                <li key={m.id} className="espace-module">
                  <div className="espace-module-tete">
                    <span className="module-ordre">{m.ordre}</span>
                    <div className="module-corps">
                      <div className="module-titre">{m.titre}</div>
                      {m.description && <div className="field-hint">{m.description}</div>}
                    </div>
                    {m.avancement !== 'SANS_EVALUATION' && (
                      <span className={`statut-badge avancement-${m.avancement}`}>
                        {LIBELLES_AVANCEMENT_MODULE[m.avancement]}
                      </span>
                    )}
                  </div>

                  <RessourcesApprenant ressources={m.ressources ?? []} />

                  {m.qcms.length === 0 && m.ateliers.length === 0 ? (
                    <p className="espace-vide">Aucune évaluation publiée dans ce module.</p>
                  ) : m.qcms.length === 0 ? null : (
                    <ul className="espace-qcms">
                      {m.qcms.map((q) => {
                        const action = actionQcm(q, inscriptionActive);
                        return (
                          <li key={q.id} className="espace-qcm">
                            <div className="module-corps">
                              <div className="espace-qcm-titre">QCM · {q.titre}</div>
                              {q.description && <div className="field-hint">{q.description}</div>}
                              {q.fenetre !== null &&
                                q.dateOuverture !== null &&
                                q.dateFermeture !== null && (
                                  <div className={`fenetre-qcm fenetre-${q.fenetre}`}>
                                    {fenetreQcmFr(q.fenetre, q.dateOuverture, q.dateFermeture)}
                                  </div>
                                )}
                            </div>
                            <span className={`statut-badge avancement-${q.avancement}`}>
                              {LIBELLES_AVANCEMENT_QCM[q.avancement]}
                            </span>
                            <button
                              type="button"
                              className={`btn-sm${action.raisonInactif === null ? ' btn-qcm-actif' : ''}`}
                              disabled={action.raisonInactif !== null}
                              title={action.raisonInactif ?? undefined}
                              onClick={() => cliquerQcm(q)}
                            >
                              {action.libelle}
                            </button>
                            {action.raisonVisible && (
                              <span className="espace-qcm-raison">{action.raisonInactif}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.ateliers.length > 0 && (
                    <ul className="espace-qcms">
                      {m.ateliers.map((a) => (
                        <li key={a.id} className="espace-qcm espace-atelier">
                          <div className="module-corps">
                            <Link className="table-link" href={`/mes-ateliers/${a.id}`}>
                              Atelier · {a.titre}
                            </Link>
                            <div className={`fenetre-qcm depot-${a.etatDepot}`}>
                              {echeanceAtelierFr(a.etatDepot, a.dateLimite, a.toleranceRetardHeures)}
                            </div>
                          </div>
                          {a.nouveauFeedback ? (
                            <span className="statut-badge badge-nouveau-feedback">
                              Nouveau feedback
                            </span>
                          ) : a.statutMonLivrable !== null ? (
                            <span className={`statut-badge livrable-${a.statutMonLivrable}`}>
                              {LIBELLES_LIVRABLE_COURT[a.statutMonLivrable]}
                            </span>
                          ) : (
                            <span className={`statut-badge depot-badge-${a.etatDepot}`}>
                              {LIBELLES_ETAT_DEPOT[a.etatDepot]}
                            </span>
                          )}
                          <Link className="btn-sm btn-link" href={`/mes-ateliers/${a.id}`}>
                            Consulter
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {aDemarrer !== null && (
        <DemarrageTentative
          qcm={aDemarrer}
          onClose={() => setADemarrer(null)}
          onDemarree={(tentative) => router.push(`/tentatives/${tentative.id}`)}
          onRefus={() => void charger(true)}
        />
      )}
    </>
  );
}

/** Messages de la carte « Certification » selon l'état de mon certificat. */
const ETAT_CERTIFICAT: Record<StatutCertificat, { titre: string; texte: string }> = {
  EN_ATTENTE_GENERATION: {
    titre: 'Certificat en préparation',
    texte: 'Vous remplissez toutes les conditions : votre certificat est en cours d’émission.',
  },
  EN_GENERATION: {
    titre: 'Certificat en préparation',
    texte: 'Vous remplissez toutes les conditions : votre certificat est en cours d’émission.',
  },
  ACTIF: {
    titre: 'Certificat délivré 🎓',
    texte: 'Votre certificat est disponible ; vous l’avez reçu par email avec son lien de vérification.',
  },
  REVOQUE: {
    titre: 'Certificat révoqué',
    texte: 'Ce certificat a été révoqué par l’administration.',
  },
  EXPIRE: {
    titre: 'Certificat expiré',
    texte: 'La durée de validité de ce certificat est écoulée : il reste téléchargeable mais n’est plus valide.',
  },
};

/**
 * US-ATEL-09 — Carte « Certification » de « Mon espace » : évaluations
 * validées sur requises (chaque QCM réussi, chaque atelier noté au-dessus du
 * seuil) ; une fois les conditions réunies, l'état de mon certificat.
 */
function CarteCertification({
  certification,
}: {
  certification: EspaceFormationVue['certification'];
}): JSX.Element {
  const { certificat, validees, requises } = certification;
  if (certificat) {
    const etat = ETAT_CERTIFICAT[certificat.statut];
    return (
      <section className={`carte-certification certification-${certificat.statut}`} aria-live="polite">
        <p className="carte-certification-titre">{etat.titre}</p>
        <p className="field-hint">{etat.texte}</p>
        {certificat.statut === 'ACTIF' && (
          <Link className="btn-sm btn-primary-sm btn-lien carte-certification-lien" href="/mes-certificats">
            Voir mon certificat
          </Link>
        )}
      </section>
    );
  }
  const pct = requises === 0 ? 0 : Math.round((validees / requises) * 100);
  return (
    <section className="carte-certification" aria-label="Certification">
      <div className="progression-tete">
        <span className="carte-certification-titre">Certification</span>
        <span className="progression-valeur">
          {validees}/{requises} évaluation{validees > 1 ? 's' : ''} validée{validees > 1 ? 's' : ''}
        </span>
      </div>
      <div className="progression-barre" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="progression-remplie" style={{ width: `${pct}%` }} />
      </div>
      <p className="field-hint">
        {requises === 0
          ? 'Aucune évaluation publiée pour le moment.'
          : 'Réussissez chaque QCM et obtenez au moins le seuil de certification à chaque atelier : le certificat est alors émis automatiquement.'}
      </p>
    </section>
  );
}
