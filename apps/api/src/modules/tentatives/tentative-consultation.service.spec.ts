import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { StatutTentative } from '../../database/enums/statut-tentative.enum';
import { TentativeConsultationService } from './tentative-consultation.service';

/**
 * Tests unitaires de la consultation d'une tentative (US-QCM-05, D14) :
 * seul son apprenant la voit (404 sinon), rang calculé, heure du serveur
 * renvoyée, aucune écriture.
 */
describe('TentativeConsultationService', () => {
  const MAINTENANT = new Date('2026-11-02T10:05:00Z');
  const DEBUT = new Date('2026-11-02T10:00:00Z');

  let service: TentativeConsultationService;
  let tentativeRepository: { findOne: jest.Mock; countBy: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };

  const tentative = {
    id: 't-1',
    apprenantId: 'appr-1',
    qcmId: 'qcm-1',
    statut: StatutTentative.EN_COURS,
    dateDebut: DEBUT,
    dateLimite: new Date('2026-11-02T10:30:00Z'),
    dateFin: null,
    qcm: {
      titre: 'Quiz Docker',
      module: { formationId: 'form-1' },
      configuration: { dureeMaxMinutes: 30, nbTentativesMax: 3 },
    },
  };

  beforeEach(async () => {
    tentativeRepository = {
      findOne: jest.fn().mockResolvedValue(tentative),
      countBy: jest.fn().mockResolvedValue(2),
      save: jest.fn(),
    };
    dataSource = { query: jest.fn().mockResolvedValue([{ maintenant: MAINTENANT }]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TentativeConsultationService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(TentativeQcm), useValue: tentativeRepository },
      ],
    }).compile();
    service = moduleRef.get(TentativeConsultationService);
  });

  it('renvoie ma tentative, son rang et l’heure du serveur, sans rien écrire', async () => {
    await expect(service.consulter('appr-1', 't-1')).resolves.toEqual({
      id: 't-1',
      qcmId: 'qcm-1',
      qcmTitre: 'Quiz Docker',
      formationId: 'form-1',
      statut: StatutTentative.EN_COURS,
      dateDebut: DEBUT,
      dateLimite: new Date('2026-11-02T10:30:00Z'),
      dateFin: null,
      dureeMaxMinutes: 30,
      numero: 2,
      nbTentativesMax: 3,
      tentativesRestantes: 1,
      maintenant: MAINTENANT,
    });
    expect(tentativeRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-1', apprenantId: 'appr-1' } }),
    );
    expect(tentativeRepository.save).not.toHaveBeenCalled();
  });

  it('404 pour une tentative inconnue ou celle d’un autre apprenant (même réponse)', async () => {
    tentativeRepository.findOne.mockResolvedValue(null);
    await expect(service.consulter('appr-2', 't-1')).rejects.toThrow(
      new NotFoundException('Tentative introuvable.'),
    );
  });
});
