import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { StatutCertificat } from '../../database/enums/statut-certificat.enum';
import { CreateFormationDto } from '../formations/dto/create-formation.dto';
import { estEmis, verifierTelechargeable } from './certificat.regles';
import { CertificatsService } from './certificats.service';
import { estPublic, verdict } from './verification.regles';

/** US-CERT-07 — Expiration automatique : règles, balayage, durée de validité. */
describe('Expiration des certificats (US-CERT-07)', () => {
  it('règles : EXPIRE est émis, public, téléchargeable, verdict EXPIRE (même intègre)', () => {
    expect(estEmis(StatutCertificat.EXPIRE)).toBe(true);
    expect(estEmis(StatutCertificat.EN_GENERATION)).toBe(false);
    expect(estPublic(StatutCertificat.EXPIRE)).toBe(true);
    expect(verdict(StatutCertificat.EXPIRE, 'VERIFIEE')).toBe('EXPIRE');
    expect(verdict(StatutCertificat.ACTIF, 'VERIFIEE')).toBe('VALIDE');
    expect(() => verifierTelechargeable(StatutCertificat.EXPIRE)).not.toThrow();
    expect(() => verifierTelechargeable(StatutCertificat.REVOQUE)).toThrow(ConflictException);
    expect(() => verifierTelechargeable(StatutCertificat.EN_ATTENTE_GENERATION)).toThrow(
      ConflictException,
    );
  });

  it('balayage : UPDATE conditionnel ACTIF + échu -> EXPIRE, une trace par certificat', async () => {
    const query = jest.fn().mockResolvedValue([
      [
        { id: 'c1', apprenantId: 'a1', formationId: 'f1', dateExpiration: new Date(0) },
        { id: 'c2', apprenantId: 'a2', formationId: 'f1', dateExpiration: new Date(0) },
      ],
      2,
    ]);
    const record = jest.fn();
    const service = new CertificatsService(
      { query } as unknown as DataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record } as never,
    );
    await expect(service.expirerEchus()).resolves.toEqual(['c1', 'c2']);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("SET statut = 'EXPIRE'");
    expect(sql).toContain(
      "WHERE statut = 'ACTIF' AND date_expiration IS NOT NULL AND date_expiration <= now()",
    );
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICAT_EXPIRE',
        cible: 'c2',
        acteur: null,
        detailsAvantApres: expect.objectContaining({
          avant: { statut: 'ACTIF' },
          apres: { statut: 'EXPIRE' },
        }),
      }),
    );
  });

  it('durée de validité de la formation : entier de 1 à 120 mois, facultative', async () => {
    const base = { titre: 'T', capaciteMax: 10, noteMinCertification: 60 };
    const erreurs = async (v: unknown): Promise<string[]> =>
      (
        await validate(plainToInstance(CreateFormationDto, { ...base, dureeValiditeMois: v }))
      ).flatMap((e) => Object.values(e.constraints ?? {}));
    expect(await erreurs(undefined)).toEqual([]);
    expect(await erreurs(null)).toEqual([]);
    expect(await erreurs(24)).toEqual([]);
    expect(await erreurs(0)).toContain(
      'La durée de validité doit être comprise entre 1 et 120 mois.',
    );
    expect(await erreurs(121)).toContain(
      'La durée de validité doit être comprise entre 1 et 120 mois.',
    );
    expect(await erreurs(1.5)).toContain(
      'La durée de validité doit être un nombre entier de mois.',
    );
  });
});
