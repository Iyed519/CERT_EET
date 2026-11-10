import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StatutFormation } from '../../database/enums/statut-formation.enum';
import { AuditService } from '../audit/audit.service';
import { MESSAGE_CONFIRMATION_REQUISE } from './cycle-formation.regles';
import { CycleFormationService } from './cycle-formation.service';

const F = 'f0000000-0000-4000-8000-000000000001';
const ADMIN = 'a0000000-0000-4000-8000-000000000001';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- banc de test : type inféré
function monter(
  o: { statut?: string | null; enCours?: number; maj?: number; statutApres?: string } = {},
) {
  const { statut = 'OUVERTE', enCours = 0, maj = 1, statutApres } = o;
  let lectures = 0;
  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown> => {
    void params;
    if (sql.includes('SELECT statut::text AS statut FROM formations')) {
      lectures += 1;
      const s = lectures > 1 && statutApres ? statutApres : statut;
      return s ? [{ statut: s }] : [];
    }
    if (sql.includes('AS inscriptions')) {
      return [
        {
          inscriptions: 3,
          tentatives: enCours,
          livrables: 0,
          corrections: 0,
          emission: 0,
          actifs: 2,
        },
      ];
    }
    if (sql.includes('UPDATE formations'))
      return [Array.from({ length: maj }, () => ({ id: F })), maj];
    return [];
  });
  const findOneOrFail = jest.fn(async () => ({ id: F, titre: 'T', statut: 'FERMEE' }));
  const record = jest.fn();
  const service = new CycleFormationService(
    { query, manager: { findOneOrFail } } as unknown as DataSource,
    { record } as unknown as AuditService,
  );
  return { service, query, record };
}

describe('CycleFormationService (US-FORM-02)', () => {
  it('impact : statut, transitions, compteurs', async () => {
    const i = await monter({ enCours: 2 }).service.impact(F);
    expect(i).toEqual({
      statut: 'OUVERTE',
      transitionsPossibles: ['FERMEE'],
      inscriptionsEnCours: 3,
      evaluationsEnCours: {
        tentativesEnCours: 2,
        livrablesACorriger: 0,
        correctionsEnCours: 0,
        certificatsEnEmission: 0,
      },
      certificatsActifs: 2,
    });
  });

  it('404 formation inconnue', async () => {
    await expect(monter({ statut: null }).service.impact(F)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('clôture : UPDATE conditionnel, audit avec avant / après', async () => {
    const m = monter();
    await m.service.changerStatut(ADMIN, F, StatutFormation.FERMEE, false, {
      adresseIp: '1.1.1.1',
    });
    const maj = m.query.mock.calls.find((c) => String(c[0]).includes('UPDATE formations'));
    expect(String(maj?.[0])).toContain('AND statut = $2');
    expect(maj?.[1]).toEqual([F, 'OUVERTE', 'FERMEE']);
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FORMATION_CLOTUREE',
        acteur: ADMIN,
        cible: F,
        detailsAvantApres: expect.objectContaining({
          avant: 'OUVERTE',
          apres: 'FERMEE',
          confirme: false,
        }),
      }),
    );
  });

  it('409 transition impossible, sans écriture', async () => {
    const m = monter({ statut: 'ARCHIVEE' });
    await expect(
      m.service.changerStatut(ADMIN, F, StatutFormation.OUVERTE, true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(m.query.mock.calls.some((c) => String(c[0]).includes('UPDATE'))).toBe(false);
    expect(m.record).not.toHaveBeenCalled();
  });

  it('409 CONFIRMATION_REQUISE avec le détail ; passe avec confirmer', async () => {
    const m = monter({ enCours: 1 });
    const e = (await m.service
      .changerStatut(ADMIN, F, StatutFormation.FERMEE, false)
      .catch((x: unknown) => x)) as ConflictException;
    expect(e).toBeInstanceOf(ConflictException);
    expect(e.getResponse()).toMatchObject({
      code: 'CONFIRMATION_REQUISE',
      message: MESSAGE_CONFIRMATION_REQUISE,
      evaluationsEnCours: { tentativesEnCours: 1 },
    });
    expect(m.record).not.toHaveBeenCalled();
    await m.service.changerStatut(ADMIN, F, StatutFormation.FERMEE, true);
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ detailsAvantApres: expect.objectContaining({ confirme: true }) }),
    );
  });

  it('réouverture sans confirmation même avec des évaluations en cours', async () => {
    const m = monter({ statut: 'FERMEE', enCours: 4 });
    await m.service.changerStatut(ADMIN, F, StatutFormation.OUVERTE, false);
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FORMATION_ROUVERTE' }),
    );
  });

  it('course perdue (aucune ligne modifiée) : 409 selon le statut relu, sans trace', async () => {
    const m = monter({ statut: 'OUVERTE', maj: 0, statutApres: 'FERMEE' });
    await expect(m.service.changerStatut(ADMIN, F, StatutFormation.FERMEE, false)).rejects.toThrow(
      'La formation est déjà fermée.',
    );
    expect(m.record).not.toHaveBeenCalled();
  });
});
