import {
  cosinus,
  EmbeddingsHachage,
  fnv1a,
  MODELE_HACHAGE,
  motsSignificatifs,
  normaliserPourHachage,
  vecteurHachage,
} from './embeddings-hachage';
import { DIMENSION_EMBEDDINGS, FournisseurEmbeddings } from './fournisseur-embeddings';

describe('EmbeddingsHachage (US-IA-01)', () => {
  it('normalise : minuscules, accents et ponctuation retirés', () => {
    expect(normaliserPourHachage('Sécurité, JWT : ÉLÈVE !')).toBe('securite jwt eleve');
  });

  it('garde les mots significatifs, retire mots vides et pluriel simple', () => {
    expect(motsSignificatifs('Les jetons et les questions de la sécurité')).toEqual([
      'jeton',
      'question',
      'securite',
    ]);
    expect(motsSignificatifs('!!!')).toEqual([]);
  });

  it('FNV-1a 32 bits (valeurs de référence)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  it('vecteur de dimension 384, normé, déterministe', () => {
    const v = vecteurHachage('Le jeton JWT est signé en RS256.');
    expect(v).toHaveLength(DIMENSION_EMBEDDINGS);
    expect(cosinus(v, v)).toBeCloseTo(1, 10);
    expect(vecteurHachage('Le jeton JWT est signé en RS256.')).toEqual(v);
  });

  it('hachage signé : des composantes négatives compensent les collisions', () => {
    const v = vecteurHachage('sécurité des jetons JWT et rotation des clés');
    expect(v.some((x) => x < 0)).toBe(true);
    expect(v.some((x) => x > 0)).toBe(true);
  });

  it('valeur de référence : un mot = mot (1) + trigrammes (0,25), poids ln(1 + tf), signe du hachage', () => {
    const attendu = new Array<number>(DIMENSION_EMBEDDINGS).fill(0);
    const ajouter = (cle: string, tf: number): void => {
      const h = fnv1a(cle);
      attendu[h % DIMENSION_EMBEDDINGS] += (h & 0x80000000 ? -1 : 1) * Math.log1p(tf);
    };
    ajouter('m:jwt', 1);
    for (const t of ['^jw', 'jwt', 'wt$']) ajouter(`t:${t}`, 0.25);
    const norme = Math.sqrt(attendu.reduce((s, x) => s + x * x, 0));
    const v = vecteurHachage('JWT');
    attendu.forEach((x, i) => expect(v[i]).toBeCloseTo(x / norme, 12));
  });

  it('les paires de mots voisins comptent : l’ordre change le vecteur', () => {
    const a = vecteurHachage('clé publique');
    const b = vecteurHachage('publique clé');
    expect(cosinus(a, b)).toBeLessThan(0.999);
    expect(cosinus(a, b)).toBeGreaterThan(0.5);
  });

  it('texte sans mot -> axe conventionnel (jamais de vecteur nul)', () => {
    const v = vecteurHachage('le la les ...');
    expect(v[0]).toBe(1);
    expect(v.slice(1).every((x) => x === 0)).toBe(true);
  });

  it('rapproche les passages qui partagent le vocabulaire de la requête', () => {
    const requete = vecteurHachage('sécurité des jetons JWT');
    const proche = vecteurHachage(
      'Un jeton JWT signé garantit la sécurité : la signature RS256 protège les jetons.',
    );
    const loin = vecteurHachage('La photosynthèse transforme la lumière en énergie chimique.');
    expect(cosinus(requete, proche)).toBeGreaterThan(0.3);
    expect(cosinus(requete, proche)).toBeGreaterThan(cosinus(requete, loin) + 0.2);
  });

  it('les trigrammes rapprochent les variantes d’un même mot', () => {
    const a = vecteurHachage('sécuriser');
    expect(cosinus(a, vecteurHachage('sécurité'))).toBeGreaterThan(
      cosinus(a, vecteurHachage('photosynthèse')),
    );
  });

  it('le fournisseur vectorise dans l’ordre et annonce son modèle', async () => {
    const f: FournisseurEmbeddings = new EmbeddingsHachage();
    expect(f.modele).toBe(MODELE_HACHAGE);
    const [a, b] = await f.vectoriser(['jeton', 'session'], 'passage');
    expect(a).toEqual(vecteurHachage('jeton'));
    expect(b).toEqual(vecteurHachage('session'));
  });
});
