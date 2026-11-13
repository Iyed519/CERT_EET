import * as PDFDocument from 'pdfkit';

/**
 * Outils PURS de mise en forme des rapports exportés (US-RPT-01, US-RPT-02) :
 * CSV pour Excel (séparateur `;`, BOM UTF-8, décimales à virgule, CRLF) et
 * PDF tabulaire (PDFKit). Aucune base, aucune E/S hors du tampon produit.
 */

/** BOM UTF-8 : Excel lit alors correctement les accents. */
export const BOM = '﻿';
export const SEPARATEUR = ';';

/** Fuseau d'affichage des dates (institution). */
const FUSEAU = 'Africa/Tunis';

/**
 * Une cellule CSV. Neutralise l'injection de formule (une cellule qui
 * commence par = + - @ ou une tabulation est préfixée d'une apostrophe) et
 * met entre guillemets ce qui contient le séparateur, un guillemet ou un saut
 * de ligne (guillemets doublés).
 */
export function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  let s: string;
  if (typeof valeur === 'number') s = Number.isFinite(valeur) ? nombre(valeur) : '';
  else if (typeof valeur === 'boolean') s = valeur ? 'oui' : 'non';
  else if (valeur instanceof Date) s = dateHeure(valeur);
  else s = String(valeur);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Nombre à la française : 2 décimales au plus, virgule décimale, sans séparateur de milliers. */
export function nombre(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** JJ/MM/AAAA HH:MM, heure de Tunis. */
export function dateHeure(d: Date): string {
  return d.toLocaleString('fr-FR', {
    timeZone: FUSEAU,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** JJ/MM/AAAA, heure de Tunis. */
export function jour(d: Date): string {
  return d.toLocaleDateString('fr-FR', { timeZone: FUSEAU });
}

/** En-tête + lignes -> CSV complet (BOM, CRLF, ligne finale). */
export function csv(entete: string[], lignes: unknown[][]): string {
  const rangs = [entete, ...lignes].map((l) => l.map(cellule).join(SEPARATEUR));
  return `${BOM}${rangs.join('\r\n')}\r\n`;
}

/** Une section d'un PDF : titre, paires clé / valeur, puis un tableau. */
export interface SectionPdf {
  titre: string;
  paires?: Array<[string, string]>;
  tableau?: { colonnes: string[]; largeurs: number[]; lignes: string[][] };
  vide?: string;
  /** US-IA-10 — Contenu libre dessiné sous le titre (analyse IA). */
  dessin?: (doc: PDFKit.PDFDocument, gauche: number, largeur: number) => void;
}

/**
 * PDF A4 tabulaire : en-tête (titre, sous-titre, date de génération), puis
 * les sections ; un tableau trop long continue sur la page suivante avec ses
 * en-têtes. Polices standard (Helvetica) : aucun fichier externe.
 */
export function pdf(document: {
  titre: string;
  sousTitre: string;
  genereLe: Date;
  sections: SectionPdf[];
}): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: document.titre, Author: 'Cert_EET — ESPRIT Entreprise' },
    });
    const morceaux: Buffer[] = [];
    doc.on('data', (m: Buffer) => morceaux.push(m));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);

    const gauche = doc.page.margins.left;
    const largeurUtile = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bas = (): number => doc.page.height - doc.page.margins.bottom;

    doc.fillColor('#1b5e45').font('Helvetica-Bold').fontSize(18).text(document.titre);
    doc.moveDown(0.2).fillColor('#333333').font('Helvetica').fontSize(11).text(document.sousTitre);
    doc
      .moveDown(0.2)
      .fillColor('#777777')
      .fontSize(9)
      .text(`Généré le ${dateHeure(document.genereLe)} (heure de Tunis) — Cert_EET`);

    for (const section of document.sections) {
      doc
        .moveDown(1)
        .fillColor('#1b5e45')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(section.titre, gauche);
      doc.moveDown(0.3).fillColor('#222222').font('Helvetica').fontSize(10);
      if (section.dessin) {
        section.dessin(doc, gauche, largeurUtile);
        continue;
      }
      for (const [cle, valeur] of section.paires ?? []) {
        doc.font('Helvetica-Bold').text(`${cle} : `, gauche, undefined, { continued: true });
        doc.font('Helvetica').text(valeur);
      }
      const t = section.tableau;
      if (t && t.lignes.length > 0) {
        const total = t.largeurs.reduce((a, b) => a + b, 0);
        const larg = t.largeurs.map((l) => (l / total) * largeurUtile);
        const enTete = (): void => {
          doc.moveDown(0.4).font('Helvetica-Bold').fontSize(8).fillColor('#1b5e45');
          ligneTableau(doc, t.colonnes, larg, gauche);
          doc.fillColor('#222222').font('Helvetica').fontSize(8);
        };
        enTete();
        for (const l of t.lignes) {
          if (doc.y + 24 > bas()) {
            doc.addPage();
            enTete();
          }
          ligneTableau(doc, l, larg, gauche);
        }
      } else if (section.vide) {
        doc.font('Helvetica-Oblique').fillColor('#777777').text(section.vide, gauche);
      }
    }
    doc.end();
  });
}

/** Une ligne de tableau : cellules côte à côte, hauteur = la plus haute. */
function ligneTableau(
  doc: PDFKit.PDFDocument,
  cellules: string[],
  largeurs: number[],
  gauche: number,
): void {
  const y = doc.y;
  let x = gauche;
  let hauteur = 0;
  cellules.forEach((c, i) => {
    const h = doc.heightOfString(c, { width: largeurs[i] - 4 });
    doc.text(c, x, y, { width: largeurs[i] - 4 });
    hauteur = Math.max(hauteur, h);
    x += largeurs[i];
  });
  doc.x = gauche;
  doc.y = y + hauteur + 3;
}
