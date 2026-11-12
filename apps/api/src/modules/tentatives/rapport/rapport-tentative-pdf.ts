import * as PDFDocument from 'pdfkit';
import {
  ClotureTentative,
  dureeFr,
  LIBELLES_CLOTURE,
  LIBELLES_TYPE,
  LigneRapport,
  MENTION_GENERATEUR,
  nombreFr,
  SyntheseRapport,
} from './rapport-tentative.regles';

/** Ce que le rapport imprime (liste blanche : rien d'autre n'entre dans le PDF). */
export interface ContenuRapport {
  tentativeId: string;
  formationTitre: string;
  moduleTitre: string;
  qcmTitre: string;
  apprenant: { prenom: string | null; nom: string | null; email: string };
  numero: number;
  nbTentativesMax: number;
  dateDebut: Date;
  dateFin: Date | null;
  dureeSecondes: number | null;
  cloture: ClotureTentative;
  score: number;
  scoreMinValidation: number;
  estReussie: boolean;
  synthese: SyntheseRapport;
  lignes: LigneRapport[];
  /** Corrigé absent : la phrase qui le dit (et sa date de disponibilité) ; null sinon. */
  corrigeAbsent: string | null;
  dateGeneration: Date;
}

const VERT = '#1e8449';
const ROUGE = '#b03a2e';
const GRIS = '#56657a';
const ENCRE = '#1b2631';
const FILET = '#d5dbe3';
const MARGE = 50;
const PIED = 40;

/** Date et heure de Tunis, « 12/11/2026 14:05 ». */
export const dateHeureTunis = (d: Date): string => {
  // Assemblé pièce par pièce : la ponctuation de toLocaleString varie selon la version d'ICU.
  const parties = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Africa/Tunis',
  }).formatToParts(new Date(d));
  const p = (type: Intl.DateTimeFormatPartTypes): string =>
    parties.find((x) => x.type === type)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} à ${p('hour')}:${p('minute')}`;
};

/**
 * Caractères hors de l'encodage WinAnsi des polices standard du PDF
 * (Helvetica) : sans police embarquée, ils sortiraient en caractères
 * illisibles. Je remplace les plus courants par un équivalent, les autres par
 * « ? » (le texte saisi par le formateur reste lisible).
 */
const WINANSI_HORS_LATIN1 = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
const EQUIVALENTS: Record<string, string> = {
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '→': '->',
  '←': '<-',
  '⇒': '=>',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '✘': 'x',
  ' ': ' ',
  ' ': ' ',
  '​': '',
};
export const texteImprimable = (texte: string): string =>
  Array.from(texte.normalize('NFC'))
    .map((c) => {
      const code = c.codePointAt(0) as number;
      if (c === '\n' || c === '\t') return c;
      if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return c;
      if (WINANSI_HORS_LATIN1.has(c)) return c;
      return EQUIVALENTS[c] ?? '?';
    })
    .join('');

const nomComplet = (a: ContenuRapport['apprenant']): string =>
  [a.prenom, a.nom].filter((x) => x && x.trim() !== '').join(' ') || a.email;

/**
 * Construit le rapport PDF détaillé d'une tentative notée (US-QCM-13), avec le
 * moteur du certificat (PDFKit, US-CERT-01) : A4 portrait, en-tête, synthèse,
 * détail par question dans l'ordre du tirage, pied de page paginé. Produit EN
 * MÉMOIRE (un document court, généré à la demande, jamais stocké).
 */
export function genererPdfRapport(c: ContenuRapport): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGE, left: MARGE, right: MARGE, bottom: MARGE + PIED },
      bufferPages: true,
      info: {
        Title: texteImprimable(`Rapport de tentative — ${c.qcmTitre}`),
        Author: 'Cert_EET — ESPRIT Entreprise',
        Subject: `Tentative ${c.tentativeId}`,
      },
    });
    const morceaux: Buffer[] = [];
    doc.on('data', (m: Buffer) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);

    const largeur = doc.page.width - 2 * MARGE;
    const t = texteImprimable;
    const filet = (): void => {
      doc.moveDown(0.4);
      doc
        .moveTo(MARGE, doc.y)
        .lineTo(MARGE + largeur, doc.y)
        .lineWidth(0.6)
        .stroke(FILET);
      doc.moveDown(0.6);
    };
    const champ = (libelle: string, valeur: string): void => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(GRIS)
        .text(`${t(libelle)} : `, {
          continued: true,
        });
      doc.font('Helvetica').fillColor(ENCRE).text(t(valeur));
    };

    // --- En-tête --------------------------------------------------------
    doc.font('Helvetica-Bold').fontSize(11).fillColor(VERT).text('ESPRIT ENTREPRISE — CERT_EET');
    doc.moveDown(0.2);
    doc.fontSize(20).fillColor(ENCRE).text('Rapport de tentative de QCM');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(13).fillColor(ENCRE).text(t(c.qcmTitre));
    filet();
    champ('Formation', c.formationTitre);
    champ('Module', c.moduleTitre);
    champ('Apprenant', nomComplet(c.apprenant));
    champ(
      'Tentative',
      `n° ${c.numero} sur ${c.nbTentativesMax} autorisée${c.nbTentativesMax > 1 ? 's' : ''}`,
    );
    champ('Début', dateHeureTunis(c.dateDebut));
    champ('Fin', c.dateFin ? dateHeureTunis(c.dateFin) : '—');
    champ('Durée effective', dureeFr(c.dureeSecondes));
    champ('Clôture', LIBELLES_CLOTURE[c.cloture]);
    filet();

    // --- Synthèse -------------------------------------------------------
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ENCRE).text('Synthèse');
    doc.moveDown(0.3);
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(c.estReussie ? VERT : ROUGE);
    doc.text(`Score : ${nombreFr(c.score)} / 100 — ${c.estReussie ? 'Réussi' : 'Échoué'}`);
    doc.moveDown(0.3);
    const s = c.synthese;
    champ('Seuil de validation', `${nombreFr(c.scoreMinValidation)} / 100`);
    champ('Points', `${nombreFr(s.pointsObtenus)} / ${nombreFr(s.pointsPossibles)}`);
    champ(
      'Questions',
      `${s.nbQuestions} — justes : ${s.nbJustes} · fausses : ${s.nbFausses} · ` +
        `sans réponse : ${s.nbSansReponse}${s.nbSansReponse > 0 ? ' (comptées fausses)' : ''}`,
    );
    if (c.corrigeAbsent !== null) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(GRIS).text(t(c.corrigeAbsent), {
        width: largeur,
      });
    }
    filet();

    // --- Détail par question ---------------------------------------------
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ENCRE).text('Détail par question');
    doc.moveDown(0.4);
    for (const l of c.lignes) {
      // Une question ne commence pas tout en bas d'une page.
      if (doc.y > doc.page.height - MARGE - PIED - 90) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ENCRE);
      doc.text(`${l.rang}. ${t(l.enonce)}`, { width: largeur });
      doc.font('Helvetica').fontSize(9).fillColor(GRIS);
      const verdict = l.estCorrecte ? 'Juste' : l.repondue ? 'Faux' : 'Faux (sans réponse)';
      doc.text(
        `${LIBELLES_TYPE[l.type]} · ${verdict} · ${nombreFr(l.pointsObtenus)} / ${nombreFr(
          l.ponderation,
        )} point${l.ponderation > 1 ? 's' : ''}`,
      );
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor(l.estCorrecte ? VERT : ROUGE);
      doc.text(
        `Votre réponse : ${l.optionsCochees.length > 0 ? t(l.optionsCochees.join(' ; ')) : 'aucune'}`,
        { width: largeur },
      );
      if (l.bonnesReponses !== null) {
        doc.fillColor(ENCRE).text(`Bonne réponse : ${t(l.bonnesReponses.join(' ; '))}`, {
          width: largeur,
        });
      }
      if (l.explication) {
        doc
          .font('Helvetica-Oblique')
          .fillColor(GRIS)
          .text(`Explication : ${t(l.explication)}`, {
            width: largeur,
          });
      }
      doc.moveDown(0.8);
    }

    // --- Pied de page, sur chaque page ------------------------------------
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      // Écrire dans la marge basse sans déclencher de nouvelle page.
      const basse = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGE - 18;
      doc
        .moveTo(MARGE, y - 6)
        .lineTo(MARGE + largeur, y - 6)
        .lineWidth(0.6)
        .stroke(FILET);
      doc.font('Helvetica').fontSize(8).fillColor(GRIS);
      doc.text(`${MENTION_GENERATEUR} · généré le ${dateHeureTunis(c.dateGeneration)}`, MARGE, y, {
        width: largeur - 70,
        lineBreak: false,
      });
      doc.text(`Tentative ${c.tentativeId}`, MARGE, y + 10, {
        width: largeur - 70,
        lineBreak: false,
      });
      doc.text(`Page ${i + 1} / ${pages.count}`, MARGE + largeur - 70, y, {
        width: 70,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = basse;
    }
    doc.end();
  });
}
