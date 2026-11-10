import {
  ApprenantSuivi,
  FicheApprenant,
  SuiviFormation,
} from '../pilotage/suivi-formation.service';
import { SectionPdf, csv, dateHeure, jour, nombre, pdf } from './rapport-format';

/**
 * Contenu PUR des rapports de session (US-RPT-01, DS-14 P3) : « global /
 * individuel / par module » (Backlog), en CSV ou en PDF. Colonnes en LISTE
 * BLANCHE : identité de l'apprenant (prénom, nom, email) et résultats ;
 * jamais de mot de passe, d'adresse IP ni de réponse à un QCM.
 */

export type PorteeRapport = 'GLOBAL' | 'INDIVIDUEL' | 'MODULE';

/** Une évaluation publiée d'un module (colonne du rapport par module). */
export interface EvaluationModule {
  id: string;
  type: 'QCM' | 'ATELIER';
  titre: string;
}

/** Données d'un rapport par module : une ligne par inscrit, une note par évaluation. */
export interface DonneesModule {
  module: { id: string; titre: string; ordre: number };
  evaluations: EvaluationModule[];
  lignes: Array<{
    prenom: string | null;
    nom: string | null;
    email: string;
    statutInscription: string;
    /** Meilleure note par évaluation (même ordre), null si aucune. */
    notes: Array<number | null>;
  }>;
}

export type ContenuSession =
  | { portee: 'GLOBAL'; suivi: SuiviFormation }
  | { portee: 'INDIVIDUEL'; formation: { titre: string }; fiche: FicheApprenant }
  | { portee: 'MODULE'; formation: { titre: string }; donnees: DonneesModule };

const STATUTS: Record<string, string> = {
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  SUSPENDUE: 'Suspendue',
};

const sur100 = (v: number | null): string => (v === null ? '—' : `${nombre(v)} / 100`);

const ENTETE_GLOBAL = [
  'nom',
  'prenom',
  'email',
  'statut_inscription',
  'avancement_pct',
  'qcm_reussis',
  'qcm_publies',
  'score_moyen_qcm',
  'ateliers_notes',
  'ateliers_publies',
  'note_moyenne_ateliers',
  'ateliers_en_retard',
  'ateliers_non_rendus',
  'moyenne',
  'derniere_activite',
  'inactif',
  'jours_sans_connexion',
  'alertes_ouvertes',
  'certificat',
];

function ligneGlobale(a: ApprenantSuivi): unknown[] {
  return [
    a.nom,
    a.prenom,
    a.email,
    STATUTS[a.statutInscription] ?? a.statutInscription,
    a.avancement,
    a.qcm.reussis,
    a.qcm.total,
    a.qcm.scoreMoyen,
    a.ateliers.notes,
    a.ateliers.total,
    a.ateliers.noteMoyenne,
    a.ateliers.enRetard,
    a.ateliers.nonRendus,
    a.moyenne,
    a.derniereActivite ? new Date(a.derniereActivite) : null,
    a.risque.inactif,
    a.risque.joursSansConnexion,
    (a.alertes ?? []).join(' '),
    a.certificat ?? '',
  ];
}

/** Rapport de session au format CSV. */
export function csvSession(c: ContenuSession): string {
  if (c.portee === 'GLOBAL') {
    return csv(ENTETE_GLOBAL, c.suivi.apprenants.map(ligneGlobale));
  }
  if (c.portee === 'INDIVIDUEL') {
    const f = c.fiche;
    const lignes: unknown[][] = [
      ...f.tentatives.map((t) => [
        'QCM',
        t.qcmTitre,
        new Date(t.dateDebut),
        t.statut,
        t.score,
        t.reussie === null ? '' : t.reussie,
        t.dureeEffective === null ? '' : Math.round(t.dureeEffective / 60),
      ]),
      ...f.livrables.map((l) => [
        'ATELIER',
        l.atelierTitre,
        new Date(l.dateSoumission),
        l.statut,
        l.note,
        l.enRetard ? 'en retard' : '',
        `v${l.version}`,
      ]),
      ...f.alertes.map((a) => [
        'ALERTE',
        a.critere,
        new Date(a.dateCreation),
        a.statut,
        '',
        '',
        '',
      ]),
    ];
    return csv(['type', 'titre', 'date', 'statut', 'note', 'detail', 'complement'], lignes);
  }
  const d = c.donnees;
  return csv(
    [
      'nom',
      'prenom',
      'email',
      'statut_inscription',
      ...d.evaluations.map((e) => `${e.type} ${e.titre}`),
    ],
    d.lignes.map((l) => [
      l.nom,
      l.prenom,
      l.email,
      STATUTS[l.statutInscription] ?? l.statutInscription,
      ...l.notes,
    ]),
  );
}

/** Rapport de session au format PDF. */
export function pdfSession(c: ContenuSession, genereLe: Date): Promise<Buffer> {
  if (c.portee === 'GLOBAL') {
    const k = c.suivi.kpis;
    const sections: SectionPdf[] = [
      {
        titre: 'Indicateurs',
        paires: [
          ['Inscrits', String(k.inscrits)],
          ['Actifs / inactifs (> 7 j)', `${k.actifs} / ${k.inactifs}`],
          ['Terminés / suspendus', `${k.termines} / ${k.suspendus}`],
          ['Taux de complétion', `${nombre(k.tauxCompletion)} %`],
          ['Score moyen QCM', sur100(k.scoreMoyenQcm)],
          ['Note moyenne ateliers', sur100(k.noteMoyenneAteliers)],
          ['Certifiés', String(k.certifies)],
          ['Alertes de décrochage ouvertes', String(k.alertesOuvertes ?? 0)],
          ['Évaluations publiées', `${k.qcmPublies} QCM, ${k.ateliersPublies} atelier(s)`],
        ],
      },
      {
        titre: 'Répartition des moyennes',
        paires: c.suivi.histogramme
          .filter((t) => t.effectif > 0)
          .map((t) => [t.tranche, `${t.effectif} apprenant(s)`] as [string, string]),
      },
      {
        titre: 'Apprenants',
        vide: 'Aucun inscrit.',
        tableau: {
          colonnes: [
            'Apprenant',
            'Statut',
            'Avanc.',
            'QCM',
            'Ateliers',
            'Moyenne',
            'Activité',
            'Risque',
          ],
          largeurs: [26, 11, 8, 11, 13, 10, 11, 10],
          lignes: c.suivi.apprenants.map((a) => [
            `${[a.prenom, a.nom].filter(Boolean).join(' ') || a.email}\n${a.email}`,
            STATUTS[a.statutInscription] ?? a.statutInscription,
            `${nombre(a.avancement)} %`,
            `${a.qcm.reussis}/${a.qcm.total}`,
            `${a.ateliers.notes}/${a.ateliers.total}${a.ateliers.nonRendus ? ` (${a.ateliers.nonRendus} non rendu)` : ''}`,
            sur100(a.moyenne),
            a.derniereActivite ? jour(new Date(a.derniereActivite)) : '—',
            a.risque.inactif
              ? `Inactif ${a.risque.joursSansConnexion} j`
              : (a.alertes ?? []).length
                ? 'Alerte'
                : '',
          ]),
        },
      },
    ];
    return pdf({
      titre: 'Rapport de session — vue globale',
      sousTitre: c.suivi.formation.titre,
      genereLe,
      sections,
    });
  }
  if (c.portee === 'INDIVIDUEL') {
    const f = c.fiche;
    const a = f.apprenant;
    return pdf({
      titre: 'Rapport de session — apprenant',
      sousTitre: `${c.formation.titre} — ${[a.prenom, a.nom].filter(Boolean).join(' ') || a.email}`,
      genereLe,
      sections: [
        {
          titre: 'Synthèse',
          paires: [
            ['Email', a.email],
            [
              'Inscription',
              `${STATUTS[a.statutInscription] ?? a.statutInscription} depuis le ${jour(new Date(a.dateInscription))}`,
            ],
            [
              'Dernière connexion',
              a.derniereConnexion ? dateHeure(new Date(a.derniereConnexion)) : 'Jamais',
            ],
            ['Avancement', `${nombre(a.avancement)} %`],
            ['Moyenne', sur100(a.moyenne)],
            [
              'Certificat',
              f.certificat
                ? `${f.certificat.statut} (${nombre(f.certificat.scoreFinal)} / 100)`
                : 'Aucun',
            ],
          ],
        },
        {
          titre: 'Tentatives de QCM',
          vide: 'Aucune tentative.',
          tableau: {
            colonnes: ['QCM', 'Date', 'Statut', 'Score', 'Durée'],
            largeurs: [36, 18, 16, 15, 15],
            lignes: f.tentatives.map((t) => [
              t.qcmTitre,
              dateHeure(new Date(t.dateDebut)),
              t.statut,
              t.score === null ? '—' : `${nombre(t.score)}${t.reussie ? ' ✓' : ''}`,
              t.dureeEffective === null ? '—' : `${Math.round(t.dureeEffective / 60)} min`,
            ]),
          },
        },
        {
          titre: 'Livrables',
          vide: 'Aucun livrable.',
          tableau: {
            colonnes: ['Atelier', 'Déposé le', 'Version', 'Statut', 'Note'],
            largeurs: [36, 18, 12, 18, 16],
            lignes: f.livrables.map((l) => [
              l.atelierTitre,
              dateHeure(new Date(l.dateSoumission)),
              `v${l.version}${l.enRetard ? ' (retard)' : ''}`,
              l.statut,
              sur100(l.note),
            ]),
          },
        },
        {
          titre: 'Alertes de décrochage',
          vide: 'Aucune alerte.',
          tableau: {
            colonnes: ['Critère', 'Créée le', 'Statut'],
            largeurs: [40, 30, 30],
            lignes: f.alertes.map((x) => [
              x.critere,
              dateHeure(new Date(x.dateCreation)),
              x.statut,
            ]),
          },
        },
      ],
    });
  }
  const d = c.donnees;
  return pdf({
    titre: 'Rapport de session — par module',
    sousTitre: `${c.formation.titre} — module ${d.module.ordre} : ${d.module.titre}`,
    genereLe,
    sections: [
      {
        titre: 'Résultats (meilleure note par évaluation publiée)',
        vide:
          d.evaluations.length === 0
            ? 'Aucune évaluation publiée dans ce module.'
            : 'Aucun inscrit.',
        tableau:
          d.evaluations.length === 0
            ? undefined
            : {
                colonnes: ['Apprenant', ...d.evaluations.map((e) => `${e.type} — ${e.titre}`)],
                largeurs: [30, ...d.evaluations.map(() => 70 / d.evaluations.length)],
                lignes: d.lignes.map((l) => [
                  `${[l.prenom, l.nom].filter(Boolean).join(' ') || l.email}`,
                  ...l.notes.map((n) => (n === null ? '—' : nombre(n))),
                ]),
              },
      },
    ],
  });
}

/** Nom du fichier téléchargé : ASCII, sans espace (en-tête Content-Disposition). */
export function nomFichier(
  base: string,
  portee: PorteeRapport,
  format: 'CSV' | 'PDF',
  le: Date,
): string {
  const propre = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  const date = le.toISOString().slice(0, 10);
  return `rapport-${propre || 'formation'}-${portee.toLowerCase()}-${date}.${format.toLowerCase()}`;
}
