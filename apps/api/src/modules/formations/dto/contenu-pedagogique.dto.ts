import { PickType } from '@nestjs/swagger';
import { ValidationOptions, registerDecorator } from 'class-validator';
import { UpdateFormationDto } from './update-formation.dto';

/** Réglages institutionnels : réservés à l'administrateur (US-FORM-04, ADR-11). */
export const CHAMPS_INSTITUTIONNELS = [
  'titre',
  'dateDebut',
  'dateFin',
  'dureeHeures',
  'capaciteMax',
  'noteMinCertification',
  'modeleCertificat',
  'statut',
] as const;

export const messageChampInstitutionnel = (champ: string): string =>
  `Le champ ${champ} est un réglage institutionnel réservé à l’administrateur.`;

/**
 * Refuse toute valeur (même `null`) : le champ ne doit pas figurer dans le
 * corps. Donne un 400 en français, avec le nom du champ, au lieu du message
 * générique « property … should not exist ».
 */
function ChampInstitutionnel(options?: ValidationOptions): PropertyDecorator {
  return (cible: object, propriete: string | symbol): void => {
    registerDecorator({
      name: 'champInstitutionnel',
      target: cible.constructor,
      propertyName: String(propriete),
      options: { message: messageChampInstitutionnel(String(propriete)), ...options },
      validator: { validate: (valeur: unknown): boolean => valeur === undefined },
    });
  };
}

/**
 * US-FORM-04 — Contenu pédagogique modifiable par le formateur affecté :
 * description, objectifs, prérequis (mêmes règles que l'administrateur,
 * reprises d'US-FORM-01). Tout réglage institutionnel -> 400.
 */
export class ContenuPedagogiqueDto extends PickType(UpdateFormationDto, [
  'description',
  'objectifs',
  'prerequis',
] as const) {
  @ChampInstitutionnel() titre?: never;
  @ChampInstitutionnel() dateDebut?: never;
  @ChampInstitutionnel() dateFin?: never;
  @ChampInstitutionnel() dureeHeures?: never;
  @ChampInstitutionnel() capaciteMax?: never;
  @ChampInstitutionnel() noteMinCertification?: never;
  @ChampInstitutionnel() modeleCertificat?: never;
  @ChampInstitutionnel() statut?: never;
}
