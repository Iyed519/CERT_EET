/** Clé de métadonnée : où le garde trouve la ressource dans l'URL. */
export const FORMATEUR_FORMATION_KEY = 'formateur_de_la_formation';

/**
 * Où trouver, dans les paramètres de la route, la ressource dont on remonte à
 * la formation. La valeur est le NOM du paramètre d'URL :
 *  - `{ formationId: 'formationId' }` : la formation elle-même ;
 *  - `{ moduleId: 'moduleId' }`       : un module -> sa formation ;
 *  - `{ qcmId: 'qcmId' }`             : un QCM -> son module -> sa formation ;
 *  - `{ atelierId: 'atelierId' }`     : un atelier -> son module -> sa formation
 *    (US-ATEL-01) ;
 *  - `{ livrableId: 'livrableId' }`   : un livrable -> son atelier -> son
 *    module -> sa formation (US-ATEL-06) ;
 *  - `{ supportId: 'supportId' }`     : un support pédagogique -> son module
 *    -> sa formation (US-IA-01).
 *
 * Fichier séparé du décorateur et du garde : chacun des deux l'importe, sans
 * que l'un ait à importer l'autre pour cela (pas de dépendance circulaire).
 */
export type SourceFormation =
  | { formationId: string }
  | { moduleId: string }
  | { qcmId: string }
  | { atelierId: string }
  | { livrableId: string }
  | { supportId: string };
