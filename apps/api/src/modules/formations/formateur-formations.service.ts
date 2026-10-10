import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AffectationFormateur } from '../../database/entities/affectation-formateur.entity';
import { Formation } from '../../database/entities/formation.entity';
import {
  FormationDetailVue,
  FormationVue,
  versFormationVue,
  versModuleVue,
} from './formations.service';

/** Une formation vue par le formateur qui y est affecté. */
export interface MaFormationVue extends FormationVue {
  affecteLe: Date;
}

/**
 * Espace formateur — ses formations (US-AUTH-16).
 *
 * Le catalogue (`GET /formations`) ne montre que les formations OUVERTE. Un
 * formateur, lui, doit voir TOUTES les formations auxquelles il est affecté,
 * fermées et archivées comprises (en lecture). L'autorisation est faite en
 * amont : la liste ne lit que SES lignes d'affectation, et le détail est
 * protégé par @FormateurDeLaFormation.
 */
@Injectable()
export class FormateurFormationsService {
  constructor(
    @InjectRepository(AffectationFormateur)
    private readonly affectationRepository: Repository<AffectationFormateur>,
    @InjectRepository(Formation)
    private readonly formationRepository: Repository<Formation>,
  ) {}

  /** Formations du formateur, de la plus récemment affectée à la plus ancienne. */
  async mesFormations(formateurId: string): Promise<MaFormationVue[]> {
    const affectations = await this.affectationRepository.find({
      where: { formateurId },
      relations: { formation: true },
      order: { createdAt: 'DESC' },
    });
    return affectations.map((a) => ({
      ...versFormationVue(a.formation),
      affecteLe: a.createdAt,
    }));
  }

  /**
   * Détail d'une formation avec ses modules triés, quel que soit son statut.
   * Appelé derrière le garde : l'appelant est un administrateur ou un
   * formateur affecté. Le 404 ne sert ici qu'au cas où la formation
   * disparaîtrait entre le garde et la lecture.
   */
  async detail(formationId: string): Promise<FormationDetailVue> {
    const formation = await this.formationRepository.findOne({
      where: { id: formationId },
      relations: { modules: true },
      order: { modules: { ordre: 'ASC' } },
    });
    if (!formation) {
      throw new NotFoundException('Formation introuvable.');
    }
    return {
      ...versFormationVue(formation),
      modules: (formation.modules ?? []).map((m) => versModuleVue(m)),
    };
  }
}
