import { execFile } from 'child_process';
import { ErreurExtraction } from './erreur-extraction';

/**
 * Extraction du texte d'un PDF (pdf-parse 2, moteur pdf.js) dans un
 * PROCESSUS NODE ENFANT, éphémère :
 *  - un PDF hostile (boucle, mémoire) ne peut ni bloquer ni faire tomber
 *    l'api : délai maximal (60 s) et tas mémoire plafonné (256 Mo) ;
 *  - pdf.js charge son « worker » par un import dynamique de module ES, que
 *    l'environnement des tests (Jest, CommonJS) ne sait pas faire ; dans un
 *    processus Node ordinaire, il fonctionne.
 * Le PDF passe par l'entrée standard, le texte revient en JSON sur la sortie
 * standard (les journaux de pdf.js sont coupés pour ne pas la polluer).
 */
export const BORNES_PDF = {
  delaiMs: 60_000,
  memoireMo: 256,
  sortieMaxOctets: 64 * 1024 * 1024,
} as const;

const SCRIPT_ENFANT = `
console.log = console.info = console.warn = console.error = () => {};
const morceaux = [];
process.stdin.on('data', (m) => morceaux.push(m));
process.stdin.on('end', async () => {
  try {
    const { PDFParse } = require(process.argv[1]);
    const analyseur = new PDFParse({ data: Buffer.concat(morceaux) });
    const resultat = await analyseur.getText();
    await analyseur.destroy();
    process.stdout.write(JSON.stringify({ ok: true, pages: resultat.pages.map((p) => p.text) }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, nom: e && e.name, message: String(e && e.message) }));
  }
});
`;

type ReponseEnfant = { ok: true; pages: string[] } | { ok: false; nom?: string; message?: string };

/** Erreur pdf.js -> message français pour le formateur. */
export function messagePdf(nom: string | undefined): string {
  if (nom === 'PasswordException')
    return 'PDF protégé par mot de passe : déposez-le sans protection.';
  if (nom === 'InvalidPDFException') return 'PDF illisible ou endommagé.';
  return 'PDF illisible : son texte n’a pas pu être extrait.';
}

/** Texte de chaque page, dans l'ordre. */
export function extrairePagesPdf(pdf: Buffer): Promise<string[]> {
  const chemin = require.resolve('pdf-parse');
  return new Promise<string[]>((resoudre, rejeter) => {
    const enfant = execFile(
      process.execPath,
      [`--max-old-space-size=${BORNES_PDF.memoireMo}`, '-e', SCRIPT_ENFANT, chemin],
      { timeout: BORNES_PDF.delaiMs, maxBuffer: BORNES_PDF.sortieMaxOctets, encoding: 'utf8' },
      (erreur, sortie) => {
        if (erreur) {
          // Délai dépassé, mémoire épuisée ou sortie trop grosse : le PDF est en cause.
          rejeter(new ErreurExtraction('PDF trop complexe : son texte n’a pas pu être extrait.'));
          return;
        }
        let reponse: ReponseEnfant;
        try {
          reponse = JSON.parse(sortie) as ReponseEnfant;
        } catch {
          rejeter(new ErreurExtraction(messagePdf(undefined)));
          return;
        }
        if (reponse.ok) resoudre(reponse.pages);
        else rejeter(new ErreurExtraction(messagePdf(reponse.nom)));
      },
    );
    enfant.stdin?.on('error', () => undefined);
    enfant.stdin?.end(pdf);
  });
}
