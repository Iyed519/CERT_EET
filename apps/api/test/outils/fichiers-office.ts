import { deflateRawSync } from 'zlib';

/**
 * Fabrique de fichiers Office Open XML MINIMAUX pour les tests (US-IA-01) :
 * une archive ZIP écrite à la main (en-têtes locaux, répertoire central, fin
 * de répertoire), entrées compressées (deflate) ou stockées. Suffisant pour
 * éprouver l'extraction du texte des PPTX et DOCX sans dépendance.
 */

const TABLE_CRC = Array.from({ length: 256 }, (_v, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(donnees: Buffer): number {
  let c = 0xffffffff;
  for (const octet of donnees) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive ZIP des entrées données (nom -> contenu). */
export function zip(entrees: Record<string, string | Buffer>, compresser = true): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const [nom, valeur] of Object.entries(entrees)) {
    const brut = Buffer.isBuffer(valeur) ? valeur : Buffer.from(valeur, 'utf8');
    const donnees = compresser ? deflateRawSync(brut) : brut;
    const nomOctets = Buffer.from(nom, 'utf8');
    const crc = crc32(brut);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(compresser ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nomOctets.length, 26);
    locaux.push(local, nomOctets, donnees);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(compresser ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(donnees.length, 20);
    central.writeUInt32LE(brut.length, 24);
    central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nomOctets);
    decalage += 30 + nomOctets.length + donnees.length;
  }
  const repertoire = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(entrees).length, 8);
  fin.writeUInt16LE(Object.keys(entrees).length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, repertoire, fin]);
}

const echapper = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** PPTX : une diapositive par élément, chaque ligne = un paragraphe. */
export function pptx(diapositives: string[]): Buffer {
  const entrees: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
  };
  diapositives.forEach((texte, i) => {
    const paragraphes = texte
      .split('\n')
      .map((l) => `<a:p><a:r><a:rPr lang="fr-FR"/><a:t>${echapper(l)}</a:t></a:r></a:p>`)
      .join('');
    entrees[`ppt/slides/slide${i + 1}.xml`] =
      `<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody>${paragraphes}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  });
  return zip(entrees);
}

/** DOCX : un paragraphe par élément. */
export function docx(paragraphes: string[]): Buffer {
  const corps = paragraphes
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${echapper(p)}</w:t></w:r></w:p>`)
    .join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document><w:body>${corps}</w:body></w:document>`,
  });
}
