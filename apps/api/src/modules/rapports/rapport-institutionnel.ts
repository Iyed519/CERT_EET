import { TableauDeBordGlobal } from '../pilotage/tableau-de-bord.service';
import { SectionPdf, csv, dateHeure, nombre, pdf } from './rapport-format';

/**
 * Contenu PUR des rapports institutionnels (US-RPT-02, DS-16 P4) :
 * synthèse de la plateforme, bilan par formation, registre des certificats
 * émis, sur une période (jours inclus, heure de Tunis). Colonnes en LISTE
 * BLANCHE : jamais de mot de passe, d'adresse IP ni de réponse à un QCM.
 */

export type ModeleInstitutionnel = 'SYNTHESE' | 'FORMATIONS' | 'CERTIFICATS';

export const MODELES: ModeleInstitutionnel[] = ['SYNTHESE', 'FORMATIONS', 'CERTIFICATS'];

export const LIBELLES_MODELE: Record<ModeleInstitutionnel, string> = {
  SYNTHESE: 'Synthèse de la plateforme',
  FORMATIONS: 'Bilan par formation',
  CERTIFICATS: 'Registre des certificats émis',
};

export interface PeriodeRapport {
  du: string;
  au: string;
}

/** Une ligne du bilan par formation (période = activité sur la période). */
export interface BilanFormation {
  titre: string;
  statut: string;
  inscrits: number;
  nouvellesInscriptions: number;
  terminees: number;
  suspendues: number;
  tentativesNotees: number;
  tentativesReussies: number;
  scoreMoyen: number | null;
  correctionsFinalisees: number;
  noteMoyenneAteliers: number | null;
  certificatsEmis: number;
  certificatsRevoques: number;
}

/** Une ligne du registre des certificats émis sur la période. */
export interface CertificatRegistre {
  id: string;
  titulaire: string;
  email: string;
  formation: string;
  scoreFinal: number;
  mention: string | null;
  statut: string;
  dateEmission: Date;
  consultations: number;
}

export type ContenuInstitutionnel =
  | { modele: 'SYNTHESE'; periode: PeriodeRapport; tdb: TableauDeBordGlobal }
  | { modele: 'FORMATIONS'; periode: PeriodeRapport; formations: BilanFormation[] }
  | { modele: 'CERTIFICATS'; periode: PeriodeRapport; certificats: CertificatRegistre[] };

/** « du 01/10/2026 au 31/10/2026 » (jours inclus). */
export function libellePeriode(p: PeriodeRapport): string {
  const fr = (j: string): string => j.split('-').reverse().join('/');
  return `du ${fr(p.du)} au ${fr(p.au)}`;
}

/** Taux de réussite en %, 1 décimale ; null sans tentative. */
export function tauxReussite(reussies: number, notees: number): number | null {
  return notees > 0 ? Math.round((reussies / notees) * 1000) / 10 : null;
}

const sur100 = (v: number | null): string => (v === null ? '—' : `${nombre(v)} / 100`);
const pct = (v: number | null): string => (v === null ? '—' : `${nombre(v)} %`);

/** Indicateurs de la synthèse, en paires libellé / valeur (CSV et PDF). */
function pairesSynthese(t: TableauDeBordGlobal): Array<[string, Array<[string, string]>]> {
  const rep = (r: Record<string, number>): string =>
    Object.entries(r)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
  const q = t.evaluations.qcm;
  const a = t.evaluations.ateliers;
  return [
    [
      'Utilisateurs',
      [
        ['Total', String(t.utilisateurs.total)],
        ['Par rôle', rep(t.utilisateurs.parRole)],
        ['Nouveaux sur la période', String(t.utilisateurs.nouveaux)],
        ['Connectés sur la période', String(t.utilisateurs.connectes)],
      ],
    ],
    [
      'Formations et inscriptions',
      [
        ['Formations', `${t.formations.total} (${rep(t.formations.parStatut)})`],
        ['Nouvelles formations', String(t.formations.nouvelles)],
        ['Inscriptions', `${t.inscriptions.total} (${rep(t.inscriptions.parStatut)})`],
        ['Nouvelles inscriptions', String(t.inscriptions.nouvelles)],
      ],
    ],
    [
      'Évaluations sur la période',
      [
        ['Tentatives de QCM notées', String(q.tentativesNotees)],
        ['Taux de réussite QCM', pct(q.tauxReussite)],
        ['Score moyen QCM', sur100(q.scoreMoyen)],
        ['Livrables soumis', String(a.livrablesSoumis)],
        ['Corrections finalisées', String(a.correctionsFinalisees)],
        ['Note moyenne des ateliers', sur100(a.noteMoyenne)],
      ],
    ],
    [
      'Certificats',
      [
        ['Émis sur la période', String(t.certificats.emis)],
        ['Révoqués sur la période', String(t.certificats.revoques)],
        ['Consultations publiques', String(t.certificats.consultations)],
        ['Par statut', rep(t.certificats.parStatut)],
      ],
    ],
  ];
}

const ENTETE_FORMATIONS = [
  'formation',
  'statut',
  'inscrits',
  'nouvelles_inscriptions',
  'terminees',
  'suspendues',
  'tentatives_notees',
  'taux_reussite_qcm_pct',
  'score_moyen_qcm',
  'corrections_finalisees',
  'note_moyenne_ateliers',
  'certificats_emis',
  'certificats_revoques',
];

const ENTETE_CERTIFICATS = [
  'certificat',
  'titulaire',
  'email',
  'formation',
  'score_final',
  'mention',
  'statut',
  'date_emission',
  'consultations_publiques',
];

/** Rapport institutionnel au format CSV. */
export function csvInstitutionnel(c: ContenuInstitutionnel): string {
  if (c.modele === 'SYNTHESE') {
    const lignes: unknown[][] = [['Période', '', libellePeriode(c.periode)]];
    for (const [bloc, paires] of pairesSynthese(c.tdb)) {
      for (const [cle, valeur] of paires) lignes.push([bloc, cle, valeur]);
    }
    return csv(['bloc', 'indicateur', 'valeur'], lignes);
  }
  if (c.modele === 'FORMATIONS') {
    return csv(
      ENTETE_FORMATIONS,
      c.formations.map((f) => [
        f.titre,
        f.statut,
        f.inscrits,
        f.nouvellesInscriptions,
        f.terminees,
        f.suspendues,
        f.tentativesNotees,
        tauxReussite(f.tentativesReussies, f.tentativesNotees),
        f.scoreMoyen,
        f.correctionsFinalisees,
        f.noteMoyenneAteliers,
        f.certificatsEmis,
        f.certificatsRevoques,
      ]),
    );
  }
  return csv(
    ENTETE_CERTIFICATS,
    c.certificats.map((x) => [
      x.id,
      x.titulaire,
      x.email,
      x.formation,
      x.scoreFinal,
      x.mention ?? '',
      x.statut,
      x.dateEmission,
      x.consultations,
    ]),
  );
}

/** Rapport institutionnel au format PDF. */
export function pdfInstitutionnel(c: ContenuInstitutionnel, genereLe: Date): Promise<Buffer> {
  const sousTitre = `ESPRIT Entreprise — ${libellePeriode(c.periode)}`;
  let sections: SectionPdf[];
  if (c.modele === 'SYNTHESE') {
    sections = pairesSynthese(c.tdb).map(([titre, paires]) => ({ titre, paires }));
  } else if (c.modele === 'FORMATIONS') {
    sections = [
      {
        titre: `${c.formations.length} formation(s)`,
        vide: 'Aucune formation.',
        tableau: {
          colonnes: [
            'Formation',
            'Statut',
            'Inscrits',
            'QCM notés',
            'Réussite',
            'Ateliers',
            'Certificats',
          ],
          largeurs: [30, 11, 12, 11, 11, 13, 12],
          lignes: c.formations.map((f) => [
            f.titre,
            f.statut,
            `${f.inscrits} (+${f.nouvellesInscriptions})`,
            String(f.tentativesNotees),
            pct(tauxReussite(f.tentativesReussies, f.tentativesNotees)),
            `${f.correctionsFinalisees} · ${sur100(f.noteMoyenneAteliers)}`,
            `${f.certificatsEmis}${f.certificatsRevoques ? ` (−${f.certificatsRevoques})` : ''}`,
          ]),
        },
      },
    ];
  } else {
    sections = [
      {
        titre: `${c.certificats.length} certificat(s) émis`,
        vide: 'Aucun certificat émis sur la période.',
        tableau: {
          colonnes: ['Titulaire', 'Formation', 'Score', 'Statut', 'Émis le', 'Consult.'],
          largeurs: [28, 26, 10, 12, 16, 8],
          lignes: c.certificats.map((x) => [
            `${x.titulaire}\n${x.email}`,
            x.formation,
            nombre(x.scoreFinal),
            x.statut,
            dateHeure(x.dateEmission),
            String(x.consultations),
          ]),
        },
      },
    ];
  }
  return pdf({
    titre: `Rapport institutionnel — ${LIBELLES_MODELE[c.modele]}`,
    sousTitre,
    genereLe,
    sections,
  });
}

/** Nom du fichier : ASCII, modèle, période, extension. */
export function nomFichierInstitutionnel(
  modele: ModeleInstitutionnel,
  p: PeriodeRapport,
  format: 'CSV' | 'PDF',
): string {
  return `rapport-institutionnel-${modele.toLowerCase()}-${p.du}-${p.au}.${format.toLowerCase()}`;
}
