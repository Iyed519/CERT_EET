import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { Atelier } from '../../../database/entities/atelier.entity';
import { Critere } from '../../../database/entities/critere.entity';
import { Grille } from '../../../database/entities/grille.entity';
import { NiveauPerformance } from '../../../database/entities/niveau-performance.entity';
import { Role } from '../../../database/enums/role.enum';
import { StatutAtelier } from '../../../database/enums/statut-atelier.enum';
import { AuditService } from '../../audit/audit.service';
import { AteliersService } from '../ateliers.service';
import { CopierModeleDto, EnregistrerModeleDto, OrdreCriteresDto } from './dto/grille-actions.dto';
import { CreateCritereDto, UpdateCritereDto } from './dto/critere.dto';
import {
  BORNES_GRILLE,
  NiveauNormalise,
  nettoyerNomModele,
  normaliserNiveaux,
  texteOuNull,
  totalPonderations,
  valideeApres,
  verifierGrilleModifiable,
  verifierModeleComplet,
  verifierNombreCriteres,
  verifierPermutation,
  verifierPlafond,
  verifierValidable,
} from './grille.regles';

/** Contexte de la requête transmis pour l'audit. */
interface Contexte {
  adresseIp: string | null;
}

/** L'acteur, tel que le jeton le décrit (identifiant et rôle). */
interface Acteur {
  sub: string;
  role: Role;
}

/** Code PostgreSQL d'une violation de contrainte d'unicité. */
const VIOLATION_UNICITE = '23505';

export interface NiveauVue {
  ordre: number;
  libelle: string;
  pointsMinPct: number;
  pointsMaxPct: number;
  descripteur: string | null;
}

export interface CritereVue {
  id: string;
  ordre: number;
  intitule: string;
  ponderation: number;
  description: string | null;
  niveaux: NiveauVue[];
}

/** La grille d'un atelier, pour son formateur. */
export interface GrilleVue {
  /** null tant qu'aucun critère n'a jamais été écrit (GET n'écrit rien). */
  id: string | null;
  atelierId: string;
  statutAtelier: StatutAtelier;
  /** Vrai tant que l'atelier est en brouillon. */
  modifiable: boolean;
  validee: boolean;
  totalPonderations: number;
  criteres: CritereVue[];
  updatedAt: Date | null;
}

/** Un modèle de grille dans la liste « Partir d'un modèle ». */
export interface ModeleVue {
  id: string;
  nomModele: string;
  nbCriteres: number;
  totalPonderations: number;
  criteres: Array<{ intitule: string; ponderation: number }>;
  estAMoi: boolean;
  createdAt: Date;
}

/** Ce qu'une écriture demande de tracer après le COMMIT (rien si sans effet). */
interface Trace {
  action: string;
  details: Record<string, unknown>;
}

/** L'état verrouillé sur lequel travaille une écriture. */
interface Etat {
  atelier: Atelier;
  grille: Grille;
  criteres: Critere[];
}

/**
 * Grille de notation pondérée d'un atelier (US-ATEL-02, DS-13 partie 2,
 * UC4 Formateur) et modèles réutilisables.
 *
 * Qui : le contrôleur pose @FormateurDeLaFormation({ atelierId }) sur les
 * routes de l'atelier ; les routes de modèles (sans atelier) vérifient ici
 * que le modèle appartient à l'acteur (l'administrateur voit tout).
 *
 * Concurrence : toute écriture verrouille la ligne de l'ATELIER (FOR UPDATE,
 * via AteliersService.verrouiller) avant de lire les pondérations. L'atelier
 * est le parent unique de sa grille : deux ajouts simultanés passent l'un
 * après l'autre (le second voit la somme du premier, le total ne dépasse
 * jamais 100 %), la création de la grille au premier critère ne peut pas
 * se dédoubler, et la publication (US-ATEL-03) prendra le même verrou.
 */
@Injectable()
export class GrillesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ateliersService: AteliersService,
    // Writer d'audit UNIQUE (@Global, US-AUTH-12).
    private readonly auditService: AuditService,
  ) {}

  // ===================================================================
  //  Lecture
  // ===================================================================

  /**
   * La grille de l'atelier. Un GET n'écrit jamais : tant qu'aucun critère n'a
   * été ajouté, la grille est renvoyée vide avec `id: null`.
   */
  async lire(atelierId: string): Promise<GrilleVue> {
    const manager = this.dataSource.manager;
    const atelier = await manager.findOne(Atelier, {
      where: { id: atelierId },
      select: { id: true, statut: true },
    });
    if (!atelier) {
      throw new NotFoundException('Atelier introuvable.');
    }
    const grille = await manager.findOne(Grille, { where: { atelierId } });
    const criteres = grille ? await this.chargerCriteres(manager, grille.id) : [];
    return this.versVue(atelier, grille, criteres);
  }

  /**
   * Les critères d'une grille, pour la fiche d'un atelier PUBLIÉ côté
   * apprenant (US-ATEL-03, UC4 : « la grille est affichée à l'apprenant dès
   * l'ouverture »). Même contenu que pour le formateur, sans l'état
   * d'édition. L'appelant a déjà vérifié le statut et l'inscription.
   */
  async criteresDeLAtelier(atelierId: string): Promise<CritereVue[]> {
    const manager = this.dataSource.manager;
    const grille = await manager.findOne(Grille, { where: { atelierId }, select: { id: true } });
    const criteres = grille ? await this.chargerCriteres(manager, grille.id) : [];
    return this.versVue({ id: atelierId, statut: StatutAtelier.PUBLIE }, grille, criteres).criteres;
  }

  // ===================================================================
  //  Critères
  // ===================================================================

  /** Ajoute un critère ; le total ne doit pas dépasser 100 % (400 sinon). */
  async ajouterCritere(
    acteur: Acteur,
    atelierId: string,
    dto: CreateCritereDto,
    contexte: Contexte,
  ): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const intitule = this.intitule(dto.intitule);
      const niveaux = normaliserNiveaux(dto.niveaux);
      verifierNombreCriteres(criteres.length + 1);
      const total = totalPonderations([...criteres.map((c) => c.ponderation), dto.ponderation]);
      verifierPlafond(total);

      const critere = await manager.save(
        manager.create(Critere, {
          grilleId: grille.id,
          ordre: criteres.length + 1,
          intitule,
          ponderation: dto.ponderation,
          description: texteOuNull(dto.description),
        }),
      );
      await this.ecrireNiveaux(manager, critere.id, niveaux);
      const invalidee = await this.apresChangement(manager, grille);

      return {
        action: 'GRILLE_CRITERE_AJOUTE',
        details: {
          grilleId: grille.id,
          critereId: critere.id,
          intitule,
          ponderation: dto.ponderation,
          totalPonderations: total,
          invalidee,
        },
      };
    });
  }

  /**
   * Modifie un critère. Une modification sans effet n'écrit rien, ne trace
   * rien et ne retire pas la validation.
   */
  async modifierCritere(
    acteur: Acteur,
    atelierId: string,
    critereId: string,
    dto: UpdateCritereDto,
    contexte: Contexte,
  ): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const critere = this.trouverCritere(criteres, critereId);
      const saisie = dto as Record<string, unknown>;
      for (const champ of ['intitule', 'ponderation', 'niveaux']) {
        if (saisie[champ] === null) {
          throw new BadRequestException(`Le champ ${champ} ne peut pas être vidé.`);
        }
      }
      const fournis = ['intitule', 'ponderation', 'description', 'niveaux'].filter(
        (c) => saisie[c] !== undefined,
      );
      if (fournis.length === 0) {
        throw new BadRequestException('Aucune modification fournie.');
      }

      const avant: Record<string, unknown> = {};
      const apres: Record<string, unknown> = {};
      const champs: Partial<Pick<Critere, 'intitule' | 'ponderation' | 'description'>> = {};

      if (dto.intitule !== undefined) {
        const intitule = this.intitule(dto.intitule);
        if (intitule !== critere.intitule) {
          avant.intitule = critere.intitule;
          apres.intitule = champs.intitule = intitule;
        }
      }
      if (dto.description !== undefined) {
        const description = texteOuNull(dto.description);
        if (description !== critere.description) {
          avant.description = critere.description;
          apres.description = champs.description = description;
        }
      }
      let total = totalPonderations(criteres.map((c) => c.ponderation));
      if (dto.ponderation !== undefined && dto.ponderation !== critere.ponderation) {
        total = total - critere.ponderation + dto.ponderation;
        verifierPlafond(total);
        avant.ponderation = critere.ponderation;
        apres.ponderation = champs.ponderation = dto.ponderation;
      }
      let niveaux: NiveauNormalise[] | null = null;
      if (dto.niveaux !== undefined) {
        const nouveaux = normaliserNiveaux(dto.niveaux);
        const actuels = this.versNiveauxVue(critere.niveaux);
        if (JSON.stringify(nouveaux) !== JSON.stringify(actuels)) {
          niveaux = nouveaux;
          avant.niveaux = actuels;
          apres.niveaux = nouveaux;
        }
      }

      if (Object.keys(apres).length === 0) {
        return null;
      }
      if (Object.keys(champs).length > 0) {
        await manager.update(Critere, { id: critere.id }, champs);
      }
      if (niveaux) {
        await manager.delete(NiveauPerformance, { critereId: critere.id });
        await this.ecrireNiveaux(manager, critere.id, niveaux);
      }
      const invalidee = await this.apresChangement(manager, grille);

      return {
        action: 'GRILLE_CRITERE_MODIFIE',
        details: {
          grilleId: grille.id,
          critereId,
          avant,
          apres,
          totalPonderations: total,
          invalidee,
        },
      };
    });
  }

  /** Supprime un critère et resserre les rangs des suivants. */
  async supprimerCritere(
    acteur: Acteur,
    atelierId: string,
    critereId: string,
    contexte: Contexte,
  ): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const critere = this.trouverCritere(criteres, critereId);
      await manager.delete(Critere, { id: critere.id });
      const restants = criteres.filter((c) => c.id !== critere.id);
      await this.renumeroter(manager, restants);
      const invalidee = await this.apresChangement(manager, grille);

      return {
        action: 'GRILLE_CRITERE_SUPPRIME',
        details: {
          grilleId: grille.id,
          critereId,
          intitule: critere.intitule,
          ponderation: critere.ponderation,
          totalPonderations: totalPonderations(restants.map((c) => c.ponderation)),
          invalidee,
        },
      };
    });
  }

  /**
   * Réordonne les critères (liste complète). L'ordre n'entre pas dans le
   * calcul de la note : il ne retire pas la validation.
   */
  async reordonner(
    acteur: Acteur,
    atelierId: string,
    dto: OrdreCriteresDto,
    contexte: Contexte,
  ): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const actuels = criteres.map((c) => c.id);
      verifierPermutation(actuels, dto.critereIds);
      if (actuels.every((id, i) => id === dto.critereIds[i])) {
        return null;
      }
      const parId = new Map(criteres.map((c) => [c.id, c]));
      await this.renumeroter(
        manager,
        dto.critereIds.map((id) => parId.get(id) as Critere),
      );
      return {
        action: 'GRILLE_CRITERES_REORDONNES',
        details: { grilleId: grille.id, avant: actuels, apres: dto.critereIds },
      };
    });
  }

  /**
   * Valide la grille : au moins un critère et Σ = 100 % (400 sinon, DS-13).
   * Déjà validée : 200 sans nouvelle écriture ni trace.
   */
  async valider(acteur: Acteur, atelierId: string, contexte: Contexte): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const total = totalPonderations(criteres.map((c) => c.ponderation));
      verifierValidable(criteres.length, total);
      if (grille.validee) {
        return null;
      }
      await manager.update(Grille, { id: grille.id }, { validee: true });
      return {
        action: 'GRILLE_VALIDEE',
        details: { grilleId: grille.id, nbCriteres: criteres.length, totalPonderations: total },
      };
    });
  }

  // ===================================================================
  //  Modèles
  // ===================================================================

  /**
   * Enregistre une COPIE de la grille de l'atelier comme modèle du formateur
   * (DS-13 : « enregistrer comme modèle »). La grille de l'atelier reste
   * inchangée ; le modèle vit sans atelier et lui survit. Permis quel que soit
   * le statut de l'atelier : on peut réutiliser la grille d'un atelier publié.
   */
  async enregistrerModele(
    acteur: Acteur,
    atelierId: string,
    dto: EnregistrerModeleDto,
    contexte: Contexte,
  ): Promise<ModeleVue> {
    const nomModele = nettoyerNomModele(dto.nomModele);

    let modele: Grille;
    let criteres: Critere[];
    try {
      ({ modele, criteres } = await this.dataSource.transaction(async (manager) => {
        const atelier = await manager.findOne(Atelier, {
          where: { id: atelierId },
          select: { id: true },
        });
        if (!atelier) {
          throw new NotFoundException('Atelier introuvable.');
        }
        const grille = await manager.findOne(Grille, { where: { atelierId } });
        // Une seule requête (jointure) : un instantané cohérent des critères.
        const source = grille ? await this.chargerCriteres(manager, grille.id) : [];
        verifierModeleComplet(source.length, totalPonderations(source.map((c) => c.ponderation)));
        await this.verifierNomLibre(manager, acteur.sub, nomModele);

        const cree = await manager.save(
          manager.create(Grille, {
            atelierId: null,
            formateurId: acteur.sub,
            estModele: true,
            nomModele,
            validee: false,
          }),
        );
        await this.copierCriteres(manager, source, cree.id);
        return { modele: cree, criteres: source };
      }));
    } catch (erreur) {
      // Deux enregistrements simultanés du même nom : l'index unique tranche.
      if (
        erreur instanceof QueryFailedError &&
        (erreur.driverError as { code?: string } | undefined)?.code === VIOLATION_UNICITE
      ) {
        throw new ConflictException(this.messageNomPris(nomModele));
      }
      throw erreur;
    }

    await this.auditService.record({
      action: 'GRILLE_MODELE_ENREGISTRE',
      acteur: acteur.sub,
      cible: modele.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { atelierId, nomModele, nbCriteres: criteres.length },
    });
    return this.versModeleVue(modele, criteres, acteur);
  }

  /**
   * Remplace la grille (brouillon) de l'atelier par une copie profonde d'un
   * modèle : critères et niveaux deviennent indépendants du modèle. La copie
   * est NON validée (le formateur l'ajuste puis la valide).
   */
  async copierModele(
    acteur: Acteur,
    atelierId: string,
    dto: CopierModeleDto,
    contexte: Contexte,
  ): Promise<GrilleVue> {
    return this.ecrire(acteur, atelierId, contexte, async (manager, { grille, criteres }) => {
      const modele = await this.chargerModele(manager, dto.modeleId, acteur);
      const source = await this.chargerCriteres(manager, modele.id);
      if (criteres.length > 0) {
        await manager.delete(Critere, { grilleId: grille.id });
      }
      await this.copierCriteres(manager, source, grille.id);
      await manager.update(Grille, { id: grille.id }, { validee: false });

      return {
        action: 'GRILLE_MODELE_COPIE',
        details: {
          grilleId: grille.id,
          modeleId: modele.id,
          nomModele: modele.nomModele,
          criteresRemplaces: criteres.length,
          nbCriteres: source.length,
        },
      };
    });
  }

  /** Mes modèles (l'administrateur : tous), par nom. */
  async listerModeles(acteur: Acteur): Promise<ModeleVue[]> {
    const modeles = await this.dataSource.manager.find(Grille, {
      where:
        acteur.role === Role.ADMINISTRATEUR
          ? { estModele: true }
          : { estModele: true, formateurId: acteur.sub },
      relations: { criteres: true },
      order: { nomModele: 'ASC', id: 'ASC', criteres: { ordre: 'ASC' } },
    });
    return modeles.map((m) => this.versModeleVue(m, m.criteres, acteur));
  }

  /** Supprime un modèle (les grilles déjà copiées n'en dépendent pas). */
  async supprimerModele(acteur: Acteur, modeleId: string, contexte: Contexte): Promise<void> {
    const modele = await this.chargerModele(this.dataSource.manager, modeleId, acteur);
    await this.dataSource.manager.delete(Grille, { id: modele.id });
    await this.auditService.record({
      action: 'GRILLE_MODELE_SUPPRIME',
      acteur: acteur.sub,
      cible: modele.id,
      adresseIp: contexte.adresseIp,
      resultat: 'Succès',
      detailsAvantApres: { nomModele: modele.nomModele },
    });
  }

  // ===================================================================
  //  Outils
  // ===================================================================

  /**
   * Cadre commun des écritures sur la grille d'un atelier : transaction,
   * verrou de l'atelier (404, 409 formation archivée), 409 hors brouillon,
   * grille créée vide au premier besoin (annulée avec le reste si l'écriture
   * échoue), audit APRÈS le COMMIT, puis la grille à jour.
   */
  private async ecrire(
    acteur: Acteur,
    atelierId: string,
    contexte: Contexte,
    travail: (manager: EntityManager, etat: Etat) => Promise<Trace | null>,
  ): Promise<GrilleVue> {
    const trace = await this.dataSource.transaction(async (manager) => {
      const atelier = await this.ateliersService.verrouiller(manager, atelierId);
      verifierGrilleModifiable(atelier.statut);
      const grille =
        (await manager.findOne(Grille, { where: { atelierId } })) ??
        (await manager.save(
          manager.create(Grille, {
            atelierId,
            formateurId: acteur.sub,
            estModele: false,
            nomModele: null,
            validee: false,
          }),
        ));
      const criteres = await this.chargerCriteres(manager, grille.id);
      return travail(manager, { atelier, grille, criteres });
    });

    if (trace) {
      await this.auditService.record({
        action: trace.action,
        acteur: acteur.sub,
        cible: atelierId,
        adresseIp: contexte.adresseIp,
        resultat: 'Succès',
        detailsAvantApres: trace.details,
      });
    }
    return this.lire(atelierId);
  }

  /** Les critères d'une grille et leurs niveaux, dans l'ordre (une requête). */
  private chargerCriteres(manager: EntityManager, grilleId: string): Promise<Critere[]> {
    return manager.find(Critere, {
      where: { grilleId },
      relations: { niveaux: true },
      order: { ordre: 'ASC', niveaux: { ordre: 'ASC' } },
    });
  }

  /**
   * Un modèle visible par l'acteur : le sien (l'administrateur : tous).
   * Celui d'un autre formateur répond 404, comme s'il n'existait pas.
   */
  private async chargerModele(
    manager: EntityManager,
    modeleId: string,
    acteur: Acteur,
  ): Promise<Grille> {
    const modele = await manager.findOne(Grille, { where: { id: modeleId, estModele: true } });
    if (!modele || (acteur.role !== Role.ADMINISTRATEUR && modele.formateurId !== acteur.sub)) {
      throw new NotFoundException('Modèle introuvable.');
    }
    return modele;
  }

  private trouverCritere(criteres: Critere[], critereId: string): Critere {
    const critere = criteres.find((c) => c.id === critereId);
    if (!critere) {
      throw new NotFoundException('Critère introuvable dans cette grille.');
    }
    return critere;
  }

  /** Intitulé rogné : 3 caractères au moins APRÈS rognage. */
  private intitule(saisi: string): string {
    const propre = saisi.trim();
    if (propre.length < BORNES_GRILLE.intitule.min) {
      throw new BadRequestException('L’intitulé doit contenir au moins 3 caractères.');
    }
    return propre;
  }

  /**
   * Après une modification réelle : la grille n'est plus validée (règle D6)
   * et sa date de mise à jour avance. Renvoie vrai si une validation a sauté.
   */
  private async apresChangement(manager: EntityManager, grille: Grille): Promise<boolean> {
    const validee = valideeApres(grille.validee, true);
    await manager.update(Grille, { id: grille.id }, { validee });
    return grille.validee && !validee;
  }

  /** Rangs 1..n dans l'ordre donné (contrainte d'unicité DIFFÉRÉE au COMMIT). */
  private async renumeroter(manager: EntityManager, criteres: Critere[]): Promise<void> {
    for (const [i, critere] of criteres.entries()) {
      if (critere.ordre !== i + 1) {
        await manager.update(Critere, { id: critere.id }, { ordre: i + 1 });
      }
    }
  }

  private async ecrireNiveaux(
    manager: EntityManager,
    critereId: string,
    niveaux: NiveauNormalise[],
  ): Promise<void> {
    await manager.insert(
      NiveauPerformance,
      niveaux.map((n) => ({ ...n, critereId })),
    );
  }

  /** Copie profonde (critères + niveaux) vers une autre grille. */
  private async copierCriteres(
    manager: EntityManager,
    source: Critere[],
    grilleId: string,
  ): Promise<void> {
    for (const critere of source) {
      const copie = await manager.save(
        manager.create(Critere, {
          grilleId,
          ordre: critere.ordre,
          intitule: critere.intitule,
          ponderation: critere.ponderation,
          description: critere.description,
        }),
      );
      await this.ecrireNiveaux(
        manager,
        copie.id,
        this.versNiveauxVue(critere.niveaux) as NiveauNormalise[],
      );
    }
  }

  private async verifierNomLibre(
    manager: EntityManager,
    formateurId: string,
    nomModele: string,
  ): Promise<void> {
    const [{ pris }] = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM grilles
          WHERE est_modele AND formateur_id = $1 AND lower(nom_modele) = lower($2)
       ) AS pris`,
      [formateurId, nomModele],
    )) as Array<{ pris: boolean }>;
    if (pris) {
      throw new ConflictException(this.messageNomPris(nomModele));
    }
  }

  private messageNomPris(nomModele: string): string {
    return `Vous avez déjà un modèle nommé « ${nomModele} ».`;
  }

  private versNiveauxVue(niveaux: NiveauPerformance[]): NiveauVue[] {
    return [...niveaux]
      .sort((a, b) => a.ordre - b.ordre)
      .map((n) => ({
        ordre: n.ordre,
        libelle: n.libelle,
        pointsMinPct: n.pointsMinPct,
        pointsMaxPct: n.pointsMaxPct,
        descripteur: n.descripteur,
      }));
  }

  private versVue(
    atelier: Pick<Atelier, 'id' | 'statut'>,
    grille: Grille | null,
    criteres: Critere[],
  ): GrilleVue {
    return {
      id: grille?.id ?? null,
      atelierId: atelier.id,
      statutAtelier: atelier.statut,
      modifiable: atelier.statut === StatutAtelier.BROUILLON,
      validee: grille?.validee ?? false,
      totalPonderations: totalPonderations(criteres.map((c) => c.ponderation)),
      criteres: criteres.map((c) => ({
        id: c.id,
        ordre: c.ordre,
        intitule: c.intitule,
        ponderation: c.ponderation,
        description: c.description,
        niveaux: this.versNiveauxVue(c.niveaux),
      })),
      updatedAt: grille?.updatedAt ?? null,
    };
  }

  private versModeleVue(modele: Grille, criteres: Critere[], acteur: Acteur): ModeleVue {
    const tries = [...criteres].sort((a, b) => a.ordre - b.ordre);
    return {
      id: modele.id,
      nomModele: modele.nomModele as string,
      nbCriteres: tries.length,
      totalPonderations: totalPonderations(tries.map((c) => c.ponderation)),
      criteres: tries.map((c) => ({ intitule: c.intitule, ponderation: c.ponderation })),
      estAMoi: modele.formateurId === acteur.sub,
      createdAt: modele.createdAt,
    };
  }
}
