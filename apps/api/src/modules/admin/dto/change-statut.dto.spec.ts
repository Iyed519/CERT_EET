import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ChangeStatutDto } from './change-statut.dto';
import { StatutCompte } from '../../../database/enums/statut-compte.enum';

/**
 * Tests de validation du ChangeStatutDto (US-CPT-03).
 *
 * On valide la couche DTO isolément (même moteur class-validator que le
 * ValidationPipe global) : c'est ELLE qui rejette en 400 un motif manquant à la
 * désactivation, avant même d'atteindre le contrôleur/service.
 */
describe('ChangeStatutDto', () => {
  const valider = (
    payload: Record<string, unknown>,
  ): Promise<ValidationError[]> =>
    validate(plainToInstance(ChangeStatutDto, payload));

  it('accepte une désactivation avec motif', async () => {
    const erreurs = await valider({
      statut: StatutCompte.DESACTIVE,
      motif: 'Départ de l’entreprise',
    });
    expect(erreurs).toHaveLength(0);
  });

  it('rejette une désactivation SANS motif (motif requis)', async () => {
    const erreurs = await valider({ statut: StatutCompte.DESACTIVE });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].property).toBe('motif');
  });

  it('rejette une désactivation au motif vide (chaîne vide)', async () => {
    const erreurs = await valider({ statut: StatutCompte.DESACTIVE, motif: '' });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].property).toBe('motif');
  });

  it('accepte une réactivation SANS motif', async () => {
    const erreurs = await valider({ statut: StatutCompte.ACTIF });
    expect(erreurs).toHaveLength(0);
  });

  it('rejette un statut non administrable (EN_ATTENTE_ACTIVATION)', async () => {
    const erreurs = await valider({
      statut: StatutCompte.EN_ATTENTE_ACTIVATION,
    });
    expect(erreurs.length).toBeGreaterThan(0);
    expect(erreurs[0].property).toBe('statut');
  });

  it('rejette un motif trop long (> 500 caractères)', async () => {
    const erreurs = await valider({
      statut: StatutCompte.DESACTIVE,
      motif: 'x'.repeat(501),
    });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].property).toBe('motif');
  });
});
