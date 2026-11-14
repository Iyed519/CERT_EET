import { Icone, NomIcone } from './Icone';
import { TonStatut, pastilleDuStatut } from '../lib/libelles';

const ICONE_TON: Record<TonStatut, NomIcone> = {
  succes: 'succes',
  attention: 'horloge',
  danger: 'erreur',
  info: 'info',
  neutre: 'attente',
  brouillon: 'brouillon',
};

/**
 * US-UX-01 — Pastille de statut : couleur + icône + texte (jamais la couleur
 * seule). Soit `statut` (code de l'API, libellé et ton déduits par
 * `pastilleDuStatut`), soit `libelle` et `ton` explicites.
 */
export function PastilleStatut({
  statut,
  libelle,
  ton,
  icone,
}: {
  statut?: string;
  libelle?: string;
  ton?: TonStatut;
  icone?: NomIcone;
}): JSX.Element {
  const deduit = statut ? pastilleDuStatut(statut) : null;
  const t = ton ?? deduit?.ton ?? 'neutre';
  const texte = libelle ?? deduit?.libelle ?? statut ?? '';
  return (
    <span className={`pastille pastille-${t}`}>
      <Icone nom={icone ?? ICONE_TON[t]} taille={14} />
      {texte}
    </span>
  );
}
