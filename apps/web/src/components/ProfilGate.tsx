'use client';
import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  completeProfile,
  getDomaines,
  getEtablissements,
  getMe,
  Domaine,
  EtablissementVue,
  NiveauEtudes,
  ProfilError,
} from '../lib/api';
/**
 * Carte bloquante de complétion du profil apprenant (US-AUTH-15).
 *
 * Montée globalement (layout). N'agit que si l'utilisateur est connecté
 * (accessToken en mémoire) ET que /auth/me renvoie profil_complet = false.
 * Tant que le profil n'est pas complété, l'overlay bloque l'accès au site.
 */
const NIVEAUX: Array<[NiveauEtudes, string]> = [
  ['SANS_BAC', 'Sans bac'],
  ['BAC', 'Baccalauréat'],
  ['PREPA', 'Classes préparatoires'],
  ['BTS', 'BTS'],
  ['LICENCE', 'Licence'],
  ['MAITRISE', 'Maîtrise'],
  ['MASTERE', 'Mastère'],
  ['INGENIEUR', "Diplôme d'ingénieur"],
  ['DOCTORAT', 'Doctorat'],
  ['AUTRE', 'Autre'],
];
export function ProfilGate(): JSX.Element | null {
  const { accessToken } = useAuth();
  const [besoin, setBesoin] = useState(false);
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [etablissements, setEtablissements] = useState<EtablissementVue[]>([]);
  // Champs du formulaire.
  const [dateNaissance, setDateNaissance] = useState('');
  const [niveau, setNiveau] = useState<NiveauEtudes | ''>('');
  const [enEtudes, setEnEtudes] = useState(true);
  const [domaineId, setDomaineId] = useState('');
  // Choix établissement : id, '' (aucun), ou 'AUTRE' (texte libre).
  const [etabChoix, setEtabChoix] = useState('');
  const [etabAutre, setEtabAutre] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  // 1) Vérifier si le profil doit être complété (à la connexion).
  useEffect(() => {
    if (!accessToken) {
      setBesoin(false);
      return;
    }
    let annule = false;
    getMe()
      .then((profil) => {
        // Carte réservée aux apprenants (US-AUTH-15) : admin/formateur non bloqués.
        if (!annule && !profil.profilComplet && profil.role === 'APPRENANT') {
          setBesoin(true);
        }
      })
      .catch(() => {
        /* si /me échoue, l'intercepteur gère la session ; on n'affiche rien */
      });
    return () => {
      annule = true;
    };
  }, [accessToken]);
  // 2) Charger le référentiel une fois la carte affichée.
  useEffect(() => {
    if (!besoin) {
      return;
    }
    getDomaines()
      .then(setDomaines)
      .catch(() => setDomaines([]));
    getEtablissements()
      .then(setEtablissements)
      .catch(() => setEtablissements([]));
  }, [besoin]);
  if (!besoin) {
    return null;
  }
  // Regrouper les établissements par université pour les <optgroup>.
  const parUniversite = new Map<string, EtablissementVue[]>();
  for (const etab of etablissements) {
    const cle = etab.universite?.nom ?? 'Autre';
    const liste = parUniversite.get(cle) ?? [];
    liste.push(etab);
    parUniversite.set(cle, liste);
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    if (!niveau) {
      setErreur("Veuillez choisir un niveau d'études.");
      return;
    }
    setEnCours(true);
    try {
      await completeProfile({
        dateNaissance,
        niveauEtudes: niveau,
        enEtudes,
        domaineEtudesId: enEtudes && domaineId ? domaineId : undefined,
        etablissementId:
          enEtudes && etabChoix && etabChoix !== 'AUTRE' ? etabChoix : undefined,
        etablissementAutre:
          enEtudes && etabChoix === 'AUTRE' && etabAutre ? etabAutre : undefined,
      });
      setBesoin(false); // profil complété -> l'overlay disparaît
    } catch (error) {
      setErreur(
        error instanceof ProfilError
          ? error.message
          : 'Une erreur est survenue. Veuillez réessayer.',
      );
    } finally {
      setEnCours(false);
    }
  }
  return (
    <div className="profil-overlay" role="dialog" aria-modal="true">
      <section className="profil-card">
        <h1 className="auth-title">Complétez votre profil</h1>
        <p className="auth-subtitle">
          Quelques informations pour accéder à Cert_EET.
        </p>
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="dob">Date de naissance</label>
            <input
              id="dob"
              className="input"
              type="date"
              required
              value={dateNaissance}
              onChange={(e) => setDateNaissance(e.target.value)}
              disabled={enCours}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="niveau">Niveau d'études</label>
            <select
              id="niveau"
              className="input"
              required
              value={niveau}
              onChange={(e) => setNiveau(e.target.value as NiveauEtudes)}
              disabled={enCours}
            >
              <option value="" disabled>Choisir…</option>
              {NIVEAUX.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>{libelle}</option>
              ))}
            </select>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={enEtudes}
              onChange={(e) => setEnEtudes(e.target.checked)}
              disabled={enCours}
            />
            <span>Je suis actuellement en études</span>
          </label>
          {enEtudes && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="domaine">Domaine d'études</label>
                <select
                  id="domaine"
                  className="input"
                  value={domaineId}
                  onChange={(e) => setDomaineId(e.target.value)}
                  disabled={enCours}
                >
                  <option value="">Choisir…</option>
                  {domaines.map((d) => (
                    <option key={d.id} value={d.id}>{d.libelle}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="etab">Établissement</label>
                <select
                  id="etab"
                  className="input"
                  value={etabChoix}
                  onChange={(e) => setEtabChoix(e.target.value)}
                  disabled={enCours}
                >
                  <option value="">Choisir…</option>
                  <option value="AUTRE">Autre / non listé…</option>
                  {Array.from(parUniversite.entries()).map(([uni, liste]) => (
                    <optgroup key={uni} label={uni}>
                      {liste.map((etab) => (
                        <option key={etab.id} value={etab.id}>{etab.nom}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="field-hint">
                  Tapez pour rechercher. Absent de la liste ? Choisissez « Autre ».
                </span>
              </div>
              {etabChoix === 'AUTRE' && (
                <div className="field">
                  <label className="field-label" htmlFor="etab-autre">Précisez l'établissement</label>
                  <input
                    id="etab-autre"
                    className="input"
                    type="text"
                    maxLength={255}
                    value={etabAutre}
                    onChange={(e) => setEtabAutre(e.target.value)}
                    disabled={enCours}
                  />
                </div>
              )}
            </>
          )}
          {erreur !== null && <p className="alert alert-error">{erreur}</p>}
          <button className="btn" type="submit" disabled={enCours}>
            {enCours ? 'Enregistrement…' : 'Continuer'}
          </button>
        </form>
      </section>
    </div>
  );
}
