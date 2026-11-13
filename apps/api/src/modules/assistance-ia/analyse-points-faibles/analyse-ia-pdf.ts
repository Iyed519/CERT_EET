import { MODELE_FACTICE } from '../llm/fournisseur-llm';
import { ResultatAnalyse } from './analyse-points-faibles.regles';

/** Mise en page commune aux deux rapports (tentative, session). */
export interface StyleAnalysePdf {
  marge: number;
  largeur: number;
  encre: string;
  gris: string;
  rouge: string;
  /** Rend un texte imprimable avec les polices standard (WinAnsi). */
  imprimable: (texte: string) => string;
  /** « vos » (apprenant) ou « ses » (rapport de session lu par le formateur). */
  possessif?: 'vos' | 'ses';
  /** false : le titre est déjà imprimé par l'appelant (rapport de session). */
  avecTitre?: boolean;
}

const ROUGE_DOUX = '#fdecec';

/**
 * US-IA-10 — Section « Analyse de vos points faibles » d'un rapport PDF : la
 * synthèse, chaque axe (notion, constat, quoi faire, questions concernées),
 * l'encouragement et la mention du modèle ; ou, si l'IA n'a pas répondu, un
 * encadré qui le dit avec la cause (D6).
 */
export function dessinerAnalyseIa(
  doc: PDFKit.PDFDocument,
  resultat: ResultatAnalyse,
  style: StyleAnalysePdf,
): void {
  const t = style.imprimable;
  const { marge, largeur } = style;
  const possessif = style.possessif ?? 'vos';
  if (style.avecTitre !== false) {
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(style.encre)
      .text(
        t(`Analyse de ${possessif} points faibles — ce qu'il faut travailler`),
        marge,
        undefined,
        {
          width: largeur,
        },
      );
    doc.moveDown(0.3);
  }

  if (resultat.statut === 'INDISPONIBLE') {
    const message = t(`Analyse IA indisponible : ${resultat.message}`);
    doc.font('Helvetica-Bold').fontSize(10);
    const hauteur = doc.heightOfString(message, { width: largeur - 20 }) + 16;
    if (doc.y + hauteur > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    doc.save();
    doc.rect(marge, y, largeur, hauteur).fillAndStroke(ROUGE_DOUX, style.rouge);
    doc.restore();
    doc.fillColor(style.rouge).text(message, marge + 10, y + 8, { width: largeur - 20 });
    doc.x = marge;
    doc.y = y + hauteur + 4;
    return;
  }

  const a = resultat.analyse;
  doc.font('Helvetica').fontSize(10).fillColor(style.encre).text(t(a.synthese), marge, undefined, {
    width: largeur,
  });
  a.axes.forEach((axe, i) => {
    doc.moveDown(0.5);
    const questions =
      axe.questions.length === 0
        ? ''
        : ` (question${axe.questions.length > 1 ? 's' : ''} ${axe.questions.join(', ')})`;
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(style.rouge)
      .text(t(`${i + 1}. ${axe.notion}${questions}`), marge, undefined, { width: largeur });
    doc.moveDown(0.15);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(style.gris)
      .text('Constat : ', marge + 10, undefined, {
        continued: true,
        width: largeur - 10,
      });
    doc.font('Helvetica').fillColor(style.encre).text(t(axe.constat));
    doc
      .font('Helvetica-Bold')
      .fillColor(style.gris)
      .text('À faire : ', marge + 10, undefined, {
        continued: true,
        width: largeur - 10,
      });
    doc.font('Helvetica').fillColor(style.encre).text(t(axe.conseil));
  });
  if (a.encouragement) {
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor(style.encre)
      .text(t(a.encouragement), marge, undefined, {
        width: largeur,
      });
  }
  doc.moveDown(0.4);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .fillColor(style.gris)
    .text(
      t(
        a.modele === MODELE_FACTICE
          ? 'Analyse de démonstration (aucune IA branchée : ajoutez ANTHROPIC_API_KEY dans le fichier .env).'
          : `Analyse générée par Claude (${a.modele}) à partir des réponses et des supports du cours — à relire avec le formateur.`,
      ),
      marge,
      undefined,
      { width: largeur },
    );
  doc.x = marge;
}
