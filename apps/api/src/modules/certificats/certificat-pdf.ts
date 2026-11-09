import * as PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

/** Ce qui est imprimé sur le certificat (liste blanche, DS-04). */
export interface ContenuCertificat {
  certificatId: string;
  nomApprenant: string;
  titreFormation: string;
  scoreFinal: number;
  mention: string;
  dateEmission: Date;
  organismeEmetteur: string;
  urlVerification: string;
}

const VERT = '#1e8449';
const GRIS = '#56657a';
const ENCRE = '#1b2631';

/**
 * Construit le PDF d'un certificat (US-CERT-01, DS-04) : A4 paysage, nom,
 * formation, score, mention, date, organisme, identifiant, et un QR code qui
 * mène à la page publique de vérification (il n'encode que l'URL, donc
 * l'identifiant). Tout est produit EN MÉMOIRE (quelques dizaines de Ko).
 *
 * L'empreinte SHA-256 est calculée sur CE document final par l'appelant et
 * conservée en base : un document ne peut pas contenir sa propre empreinte
 * (la page de vérification la publie, US-CERT-04).
 */
export async function genererPdfCertificat(contenu: ContenuCertificat): Promise<Buffer> {
  const qr = await QRCode.toBuffer(contenu.urlVerification, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });
  const date = contenu.dateEmission.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Tunis',
  });
  const score = contenu.scoreFinal.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 50,
      info: {
        Title: `Certificat — ${contenu.titreFormation}`,
        Author: contenu.organismeEmetteur,
        Subject: `Certificat ${contenu.certificatId}`,
      },
    });
    const morceaux: Buffer[] = [];
    doc.on('data', (m: Buffer) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);

    const { width, height } = doc.page;
    doc
      .rect(24, 24, width - 48, height - 48)
      .lineWidth(3)
      .stroke(VERT);
    doc
      .rect(32, 32, width - 64, height - 64)
      .lineWidth(0.8)
      .stroke(VERT);

    doc.fillColor(VERT).font('Helvetica-Bold').fontSize(14);
    doc.text(contenu.organismeEmetteur.toUpperCase(), 0, 70, { align: 'center', width });
    doc
      .fillColor(ENCRE)
      .fontSize(34)
      .text('Certificat de réussite', 0, 105, { align: 'center', width });

    doc.font('Helvetica').fontSize(14).fillColor(GRIS);
    doc.text('Ce certificat atteste que', 0, 175, { align: 'center', width });
    doc.font('Helvetica-Bold').fontSize(28).fillColor(ENCRE);
    doc.text(contenu.nomApprenant, 60, 200, { align: 'center', width: width - 120 });
    doc.font('Helvetica').fontSize(14).fillColor(GRIS);
    doc.text('a validé la formation', 0, 250, { align: 'center', width });
    doc.font('Helvetica-Bold').fontSize(20).fillColor(VERT);
    doc.text(contenu.titreFormation, 80, 275, { align: 'center', width: width - 160 });

    doc.font('Helvetica').fontSize(13).fillColor(ENCRE);
    doc.text(`Score final : ${score} / 100 — Mention : ${contenu.mention}`, 0, 330, {
      align: 'center',
      width,
    });
    doc.text(`Délivré le ${date}`, 0, 352, { align: 'center', width });

    const tailleQr = 110;
    const xQr = width - 50 - tailleQr - 20;
    const yQr = height - 50 - tailleQr - 20;
    doc.image(qr, xQr, yQr, { width: tailleQr, height: tailleQr });
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text('Scannez pour vérifier', xQr, yQr + tailleQr + 2, {
      width: tailleQr,
      align: 'center',
    });

    doc.fontSize(9).fillColor(GRIS);
    doc.text(`Identifiant : ${contenu.certificatId}`, 70, height - 120, { width: xQr - 100 });
    doc.text(`Vérification : ${contenu.urlVerification}`, 70, height - 105, { width: xQr - 100 });
    doc.text(
      'L’authenticité de ce document se vérifie en ligne : son empreinte SHA-256 y est publiée.',
      70,
      height - 90,
      { width: xQr - 100 },
    );
    doc.end();
  });
}
