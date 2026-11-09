import { inflateRawSync } from 'zlib';
import { ErreurExtraction } from './erreur-extraction';

/**
 * Lecteur ZIP minimal pour les conteneurs Office Open XML (PPTX, DOCX), sans
 * dépendance : répertoire central, puis entrées « stockées » (0) ou
 * « deflate » (8) décompressées par zlib.
 *
 * Défenses (fichier hostile, « bombe zip ») :
 *  - nombre d'entrées borné ; ZIP64, chiffrement et autres méthodes refusés ;
 *  - chaque décompression est plafonnée (`maxOutputLength`) et le total
 *    décompressé aussi ;
 *  - tous les décalages sont vérifiés contre la taille du tampon.
 * Toute anomalie lève ErreurExtraction (contenu en cause, pas de reprise).
 */
export const BORNES_ZIP = {
  entreesMax: 5000,
  /** Plafond par entrée et pour l'ensemble des entrées lues. */
  octetsDecompressesMax: 64 * 1024 * 1024,
} as const;

const SIG_FIN_REPERTOIRE = 0x06054b50;
const SIG_REPERTOIRE = 0x02014b50;
const SIG_ENTREE_LOCALE = 0x04034b50;
const ARCHIVE_INVALIDE = 'Archive Office illisible ou endommagée.';

interface EntreeZip {
  nom: string;
  methode: number;
  tailleCompressee: number;
  tailleDecompressee: number;
  decalageLocal: number;
  chiffree: boolean;
}

function lireRepertoire(zip: Buffer): EntreeZip[] {
  // La fin du répertoire central est dans les 64 Kio + 22 derniers octets.
  const debutRecherche = Math.max(0, zip.length - 65557);
  let fin = -1;
  for (let i = zip.length - 22; i >= debutRecherche; i--) {
    if (zip.readUInt32LE(i) === SIG_FIN_REPERTOIRE) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErreurExtraction(ARCHIVE_INVALIDE);
  const nbEntrees = zip.readUInt16LE(fin + 10);
  const decalage = zip.readUInt32LE(fin + 16);
  if (nbEntrees === 0xffff || decalage === 0xffffffff) {
    throw new ErreurExtraction('Archive ZIP64 non prise en charge.');
  }
  if (nbEntrees > BORNES_ZIP.entreesMax) throw new ErreurExtraction(ARCHIVE_INVALIDE);

  const entrees: EntreeZip[] = [];
  let p = decalage;
  for (let n = 0; n < nbEntrees; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== SIG_REPERTOIRE) {
      throw new ErreurExtraction(ARCHIVE_INVALIDE);
    }
    const drapeaux = zip.readUInt16LE(p + 8);
    const longueurNom = zip.readUInt16LE(p + 28);
    const longueurExtra = zip.readUInt16LE(p + 30);
    const longueurCommentaire = zip.readUInt16LE(p + 32);
    if (p + 46 + longueurNom > zip.length) throw new ErreurExtraction(ARCHIVE_INVALIDE);
    entrees.push({
      nom: zip.toString('utf8', p + 46, p + 46 + longueurNom),
      methode: zip.readUInt16LE(p + 10),
      tailleCompressee: zip.readUInt32LE(p + 20),
      tailleDecompressee: zip.readUInt32LE(p + 24),
      decalageLocal: zip.readUInt32LE(p + 42),
      chiffree: (drapeaux & 0x1) === 1,
    });
    p += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return entrees;
}

function lireEntree(zip: Buffer, entree: EntreeZip, plafond: number): Buffer {
  if (entree.chiffree) throw new ErreurExtraction('Document protégé par mot de passe.');
  const p = entree.decalageLocal;
  if (p + 30 > zip.length || zip.readUInt32LE(p) !== SIG_ENTREE_LOCALE) {
    throw new ErreurExtraction(ARCHIVE_INVALIDE);
  }
  const debut = p + 30 + zip.readUInt16LE(p + 26) + zip.readUInt16LE(p + 28);
  const finDonnees = debut + entree.tailleCompressee;
  if (finDonnees > zip.length) throw new ErreurExtraction(ARCHIVE_INVALIDE);
  const donnees = zip.subarray(debut, finDonnees);
  if (entree.methode === 0) {
    if (donnees.length > plafond) throw new ErreurExtraction('Document trop volumineux.');
    return donnees;
  }
  if (entree.methode !== 8) throw new ErreurExtraction(ARCHIVE_INVALIDE);
  try {
    return inflateRawSync(donnees, { maxOutputLength: plafond });
  } catch (erreur) {
    const code = (erreur as { code?: string }).code;
    if (code === 'ERR_BUFFER_TOO_LARGE') throw new ErreurExtraction('Document trop volumineux.');
    throw new ErreurExtraction(ARCHIVE_INVALIDE);
  }
}

/**
 * Contenu des entrées dont le nom satisfait `garder`, dans l'ordre du
 * répertoire. Le total décompressé est plafonné.
 */
export function lireEntreesZip(
  zip: Buffer,
  garder: (nom: string) => boolean,
): Array<{ nom: string; contenu: Buffer }> {
  if (zip.length < 22) throw new ErreurExtraction(ARCHIVE_INVALIDE);
  let restant: number = BORNES_ZIP.octetsDecompressesMax;
  const resultat: Array<{ nom: string; contenu: Buffer }> = [];
  for (const entree of lireRepertoire(zip)) {
    if (!garder(entree.nom)) continue;
    const contenu = lireEntree(zip, entree, restant);
    restant -= contenu.length;
    if (restant <= 0) throw new ErreurExtraction('Document trop volumineux.');
    resultat.push({ nom: entree.nom, contenu });
  }
  return resultat;
}
