import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CHAMPS_INSTITUTIONNELS,
  ContenuPedagogiqueDto,
  messageChampInstitutionnel,
} from './contenu-pedagogique.dto';

const erreurs = async (corps: object): Promise<string[]> =>
  (
    await validate(plainToInstance(ContenuPedagogiqueDto, corps), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).flatMap((e) => Object.values(e.constraints ?? {}));

describe('ContenuPedagogiqueDto (US-FORM-04)', () => {
  it('accepte description, objectifs, prérequis', async () => {
    expect(await erreurs({ description: 'D', objectifs: 'O', prerequis: 'P' })).toEqual([]);
    expect(await erreurs({ prerequis: null })).toEqual([]);
  });

  it('refuse chaque réglage institutionnel, même à null, avec un message nommant le champ', async () => {
    expect(CHAMPS_INSTITUTIONNELS).toHaveLength(8);
    for (const champ of CHAMPS_INSTITUTIONNELS) {
      for (const valeur of ['x', 10, null]) {
        expect(await erreurs({ [champ]: valeur })).toContain(messageChampInstitutionnel(champ));
      }
    }
  });

  it('refuse un champ inconnu', async () => {
    expect((await erreurs({ couleur: 'bleu' })).join(' ')).toContain('should not exist');
  });
});
