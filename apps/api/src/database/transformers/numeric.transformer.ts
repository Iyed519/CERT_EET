import { ValueTransformer } from 'typeorm';

/**
 * Convertit les colonnes PostgreSQL `numeric` en `number` TypeScript.
 *
 * Le pilote `pg` renvoie un `numeric` sous forme de CHAÎNE (pour ne pas perdre
 * de précision sur les très grands nombres). Sans ce transformateur, un score
 * lu en base vaudrait "75.50" et non 75.5 : les comparaisons au seuil
 * (score >= scoreMinValidation) se feraient alors sur des chaînes. Je
 * centralise la conversion ici pour que toutes les notes, seuils et
 * pondérations du modèle soient de vrais nombres côté service.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : parseFloat(value),
};
