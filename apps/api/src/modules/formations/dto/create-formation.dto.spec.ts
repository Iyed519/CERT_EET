import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateFormationDto } from './create-formation.dto';

/**
 * Tests de validation du CreateFormationDto (US-FORM-01).
 *
 * Je valide la couche DTO isolément (même moteur class-validator que le
 * ValidationPipe global) : c'est ELLE qui produit le 400 du Gherkin
 * (capacité ≤ 0, seuil hors [0,100]) avant d'atteindre le service.
 */
describe('CreateFormationDto', () => {
  const minimal = { titre: 'Full-Stack JS', capaciteMax: 25, noteMinCertification: 60 };

  const valider = (payload: Record<string, unknown>): Promise<ValidationError[]> =>
    validate(plainToInstance(CreateFormationDto, payload));

  const proprietesEnErreur = async (payload: Record<string, unknown>): Promise<string[]> =>
    (await valider(payload)).map((erreur) => erreur.property);

  it('accepte le minimum requis (titre, capacité, seuil)', async () => {
    expect(await valider(minimal)).toHaveLength(0);
  });

  it('accepte une formation complète', async () => {
    const erreurs = await valider({
      ...minimal,
      description: 'Parcours certifiant.',
      objectifs: 'Concevoir une API REST.',
      prerequis: 'Bases de JavaScript.',
      dateDebut: '2026-11-02',
      dateFin: '2026-12-18',
      dureeHeures: 120,
      noteMinCertification: 62.5,
      modeleCertificat: 'modele-esprit-standard',
    });
    expect(erreurs).toHaveLength(0);
  });

  it('rejette une capacité nulle, négative ou non entière', async () => {
    expect(await proprietesEnErreur({ ...minimal, capaciteMax: 0 })).toEqual(['capaciteMax']);
    expect(await proprietesEnErreur({ ...minimal, capaciteMax: -5 })).toEqual(['capaciteMax']);
    expect(await proprietesEnErreur({ ...minimal, capaciteMax: 2.5 })).toEqual(['capaciteMax']);
  });

  it('rejette un seuil de certification hors [0,100]', async () => {
    expect(await proprietesEnErreur({ ...minimal, noteMinCertification: 101 })).toEqual([
      'noteMinCertification',
    ]);
    expect(await proprietesEnErreur({ ...minimal, noteMinCertification: -1 })).toEqual([
      'noteMinCertification',
    ]);
  });

  it('accepte les bornes 0 et 100 du seuil', async () => {
    expect(await valider({ ...minimal, noteMinCertification: 0 })).toHaveLength(0);
    expect(await valider({ ...minimal, noteMinCertification: 100 })).toHaveLength(0);
  });

  it('rejette un titre absent, vide ou fait uniquement d’espaces', async () => {
    const sansTitre = { capaciteMax: 25, noteMinCertification: 60 };
    expect(await proprietesEnErreur(sansTitre)).toEqual(['titre']);
    expect(await proprietesEnErreur({ ...minimal, titre: '' })).toEqual(['titre']);
    expect(await proprietesEnErreur({ ...minimal, titre: '   ' })).toEqual(['titre']);
  });

  it('retire les espaces de bord du titre', () => {
    const dto = plainToInstance(CreateFormationDto, { ...minimal, titre: '  DevOps  ' });
    expect(dto.titre).toBe('DevOps');
  });

  it('rejette une date mal formée ou inexistante', async () => {
    expect(await proprietesEnErreur({ ...minimal, dateDebut: '02/11/2026' })).toEqual([
      'dateDebut',
    ]);
    expect(
      await proprietesEnErreur({ ...minimal, dateFin: '2026-12-18T10:00:00Z' }),
    ).toEqual(['dateFin']);
    // Format correct, mais le 30 février n'existe pas.
    expect(await proprietesEnErreur({ ...minimal, dateDebut: '2026-02-30' })).toEqual([
      'dateDebut',
    ]);
  });

  it('rejette une durée nulle', async () => {
    expect(await proprietesEnErreur({ ...minimal, dureeHeures: 0 })).toEqual(['dureeHeures']);
  });
});
