/**
 * Visuel d'une formation (en attendant de vraies images) : un dégradé et un
 * motif déterminés par l'identifiant — toujours les mêmes pour une formation —
 * avec les initiales du titre. Purement décoratif (aria-hidden).
 */
// US-UI-02 : déclinaisons de la charte ESPRIT (rouge, noir, gris), au lieu d'un arc-en-ciel.
const PALETTES: Array<[string, string]> = [
  ['#e30613', '#8f030b'],
  ['#1d1d1b', '#3f3f46'],
  ['#3f3f46', '#18181b'],
  ['#b1040e', '#4a0105'],
  ['#52525b', '#27272a'],
  ['#c8102e', '#5c0712'],
  ['#27272a', '#b1040e'],
  ['#71717a', '#3f3f46'],
];

function empreinte(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i += 1) {
    h = (h * 31 + texte.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initialesTitre(titre: string): string {
  const mots = titre
    .split(/\s+/)
    .map((m) => m.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((m) => m.length > 2);
  const lettres = mots.slice(0, 2).map((m) => m[0]);
  return (lettres.join('') || titre.slice(0, 2)).toUpperCase();
}

export function FormationVisuel({
  id,
  titre,
  compact = false,
}: {
  id: string;
  titre: string;
  compact?: boolean;
}): JSX.Element {
  const h = empreinte(id);
  const [clair, fonce] = PALETTES[h % PALETTES.length];
  const motif = h % 3;
  return (
    <div
      className={`visuel${compact ? ' visuel-compact' : ''}`}
      style={{ background: `linear-gradient(135deg, ${clair} 0%, ${fonce} 100%)` }}
      aria-hidden="true"
    >
      <svg className="visuel-motif" viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice">
        {motif === 0 && (
          <>
            <circle cx="170" cy="18" r="46" />
            <circle cx="22" cy="104" r="30" />
          </>
        )}
        {motif === 1 && (
          <>
            <rect x="120" y="-20" width="90" height="90" rx="18" transform="rotate(18 165 25)" />
            <rect x="-14" y="70" width="60" height="60" rx="12" transform="rotate(-12 16 100)" />
          </>
        )}
        {motif === 2 && (
          <>
            <path d="M0 80 Q50 50 100 80 T200 80 V110 H0 Z" />
            <path d="M0 95 Q50 70 100 95 T200 95 V110 H0 Z" />
          </>
        )}
      </svg>
      <span className="visuel-initiales">{initialesTitre(titre)}</span>
    </div>
  );
}
