import { ExtensionSupport } from '../supports/support.regles';
import { ErreurExtraction } from './erreur-extraction';
import { extrairePagesPdf } from './extraction-pdf';
import { lireEntreesZip } from './lecteur-zip';

/**
 * Texte brut d'un support selon son format (US-IA-01, DS-06 :
 * « extractText(pdfBuffer) »). Le découpage et la normalisation viennent
 * ensuite (decoupage.regles.ts).
 *  - PDF : pdf.js dans un processus enfant (extraction-pdf.ts) ;
 *  - PPTX : texte des diapositives (`<a:t>`), dans l'ordre des numéros ;
 *  - DOCX : texte du corps du document (`<w:t>`) ;
 *  - TXT / MD : UTF-8, ou Windows-1252 si l'UTF-8 est invalide (fichiers
 *    enregistrés sous Windows).
 */
export async function extraireTexte(extension: ExtensionSupport, contenu: Buffer): Promise<string> {
  switch (extension) {
    case 'pdf':
      return (await extrairePagesPdf(contenu)).join('\n\n');
    case 'pptx':
      return texteDiapositives(contenu);
    case 'docx':
      return texteDocument(contenu);
    case 'txt':
    case 'md':
      return decoderTexte(contenu);
    default:
      throw new ErreurExtraction('Format non pris en charge.');
  }
}

/** UTF-8 strict, sinon Windows-1252 ; marque d'ordre des octets retirée. */
export function decoderTexte(contenu: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(contenu);
  } catch {
    return new TextDecoder('windows-1252').decode(contenu);
  }
}

/** Entités XML -> caractères (les cinq prédéfinies et les références numériques). */
export function decoderEntitesXml(texte: string): string {
  return texte.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_t, code: string) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const n = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

/**
 * Texte d'un XML Office : contenu des balises `<prefixe:t>`, un saut de ligne
 * par paragraphe (`</prefixe:p>`), une espace par tabulation ou saut de ligne
 * forcé.
 */
export function texteXmlOffice(xml: string, prefixe: 'a' | 'w'): string {
  const jeton = new RegExp(
    `<${prefixe}:t(?:\\s[^>]*)?>([^<]*)</${prefixe}:t>|</${prefixe}:p>|<${prefixe}:(?:tab|br)\\b[^>]*/>`,
    'g',
  );
  let texte = '';
  for (const m of xml.matchAll(jeton)) {
    if (m[1] !== undefined) texte += decoderEntitesXml(m[1]);
    else if (m[0].startsWith('</')) texte += '\n';
    else texte += ' ';
  }
  return texte;
}

/** PPTX : diapositives `ppt/slides/slideN.xml`, triées par N. */
export function texteDiapositives(pptx: Buffer): string {
  const diapositives = lireEntreesZip(pptx, (nom) => /^ppt\/slides\/slide\d+\.xml$/.test(nom))
    .map((e) => ({
      n: Number(/(\d+)\.xml$/.exec(e.nom)?.[1] ?? 0),
      xml: e.contenu.toString('utf8'),
    }))
    .sort((a, b) => a.n - b.n);
  if (diapositives.length === 0) {
    throw new ErreurExtraction('Présentation PPTX sans diapositive lisible.');
  }
  return diapositives.map((d) => texteXmlOffice(d.xml, 'a')).join('\n\n');
}

/** DOCX : corps `word/document.xml`. */
export function texteDocument(docx: Buffer): string {
  const [document] = lireEntreesZip(docx, (nom) => nom === 'word/document.xml');
  if (!document) throw new ErreurExtraction('Document DOCX sans contenu lisible.');
  return texteXmlOffice(document.contenu.toString('utf8'), 'w');
}
