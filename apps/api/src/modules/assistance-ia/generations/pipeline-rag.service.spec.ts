import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { GenerationIa } from '../../../database/entities/generation-ia.entity';
import { SupportPedagogique } from '../../../database/entities/support-pedagogique.entity';
import { User } from '../../../database/entities/user.entity';
import { StatutGeneration } from '../../../database/enums/statut-generation.enum';
import { MailService } from '../../../mail/mail.service';
import { AuditService } from '../../audit/audit.service';
import { FOURNISSEUR_EMBEDDINGS } from '../embeddings/fournisseur-embeddings';
import { FileIaService } from '../file-ia.service';
import { ErreurLlm, FOURNISSEUR_LLM } from '../llm/fournisseur-llm';
import {
  MESSAGE_AUCUNE_VALIDE,
  MESSAGE_ECHEC_GENERATION,
  MESSAGE_MODELE_EMBEDDINGS,
  MESSAGE_REPONSE_ILLISIBLE,
  MESSAGE_SUPPORT_SANS_PASSAGE,
  PipelineRagService,
} from './pipeline-rag.service';

/**
 * PipelineRagService (US-IA-03) : base, embeddings, LLM, email et audit
 * simulés. La vraie recherche pgvector, les CHECK, la file et la concurrence
 * sont éprouvées par l'e2e (E2E-IARAG).
 */
describe('PipelineRagService (US-IA-03)', () => {
  let service: PipelineRagService;

  const question = (n: number): Record<string, unknown> => ({
    enonce: `Question numéro ${n} sur les jetons JWT ?`,
    type: 'QCU',
    options: [
      { texte: 'Bonne', estCorrecte: true },
      { texte: 'Mauvaise', estCorrecte: false },
    ],
    explication: 'Passage 4.',
    passages: [4],
    scoreConfiance: 0.7,
  });

  let generation: Partial<GenerationIa> | null;
  let support: Partial<SupportPedagogique>;
  let segments: Array<{ ordre: number; texte: string }>;

  const mockManager = {
    findOne: jest.fn(async (entite: unknown) => {
      if (entite === GenerationIa) return generation;
      if (entite === SupportPedagogique) return support;
      if (entite === User) return { id: 'u-1', prenom: 'Sami', email: 'sami@esprit.tn' };
      return null;
    }),
    findOneOrFail: jest.fn(async () => support),
    update: jest.fn(),
    query: jest.fn(),
  };
  const mockDataSource = {
    manager: mockManager,
    query: jest.fn(async (sql: string): Promise<unknown> => {
      if (sql.includes('FROM segments_support')) return segments;
      if (sql.includes('FROM modules')) return [{ formation_id: 'f-1' }];
      if (sql.includes("statut = 'ECHEC'")) {
        return [[{ support_id: 's-1', formateur_id: 'u-1', module_id: 'm-1' }], 1];
      }
      return [];
    }),
    transaction: jest.fn(async (travail: (m: typeof mockManager) => Promise<unknown>) =>
      travail(mockManager),
    ),
  };
  const mockEmbeddings = {
    modele: 'hachage-lexical-v1',
    vectoriser: jest.fn(async () => [[0.6, 0.8]]),
  };
  const mockLlm = { modele: 'factice-v1', genererQuestions: jest.fn() };
  const mockFile = { demarrerWorkerGeneration: jest.fn() };
  const mockMail = { sendGenerationTermineeEmail: jest.fn() };
  const mockAudit = { record: jest.fn() };
  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue({ delaiMs: 5000, promptMaxCaracteres: 24000 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    generation = {
      id: 'g-1',
      moduleId: 'm-1',
      supportId: 's-1',
      formateurId: 'u-1',
      nbQuestionsDemandees: 2,
      typesQuestions: ['QCU'],
      niveau: 'INTERMEDIAIRE',
      focusThematique: 'refresh token',
      statut: StatutGeneration.EN_COURS,
      nbTentatives: 0,
    };
    support = { id: 's-1', titre: 'Cours JWT', modeleEmbeddings: 'hachage-lexical-v1' };
    segments = [
      { ordre: 4, texte: 'Le refresh token est renouvelé à chaque usage.' },
      { ordre: 1, texte: 'Un jeton JWT est signé.' },
    ];
    mockLlm.genererQuestions.mockResolvedValue({
      questions: [question(1), { type: 'QCU' }, question(2), question(3)],
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineRagService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: FileIaService, useValue: mockFile },
        { provide: FOURNISSEUR_EMBEDDINGS, useValue: mockEmbeddings },
        { provide: FOURNISSEUR_LLM, useValue: mockLlm },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(PipelineRagService);
  });

  const requetes = (fragment: string): unknown[][] =>
    [...mockManager.query.mock.calls, ...mockDataSource.query.mock.calls].filter((c) =>
      String(c[0]).includes(fragment),
    );

  it('démarre le worker de la file ia-generation au démarrage', async () => {
    service.onApplicationBootstrap();
    const traitements = mockFile.demarrerWorkerGeneration.mock.calls[0][0];
    jest.spyOn(service, 'generer').mockResolvedValue();
    jest.spyOn(service, 'echecDefinitif').mockResolvedValue();
    await traitements.generer('g-9');
    await traitements.echecDefinitif('g-9', new Error('x'));
    expect(service.generer).toHaveBeenCalledWith('g-9');
    expect(service.echecDefinitif).toHaveBeenCalledWith('g-9', expect.any(Error));
  });

  it('chemin nominal : tentative comptée, top-8 du support ciblé, suggestions, TERMINEE, audit, email', async () => {
    await service.generer('g-1');

    expect(mockManager.findOne).toHaveBeenCalledWith(GenerationIa, {
      where: { id: 'g-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(mockManager.update).toHaveBeenCalledWith(
      GenerationIa,
      { id: 'g-1' },
      { nbTentatives: 1 },
    );
    expect(mockEmbeddings.vectoriser).toHaveBeenCalledWith(['refresh token'], 'requete');
    const [recherche] = requetes('FROM segments_support');
    expect(recherche[1]).toEqual(['s-1', '[0.6,0.8]', 8]);
    expect(String(recherche[0])).toMatch(
      /WHERE support_id = \$1[\s\S]*ORDER BY embedding <=> \$2::vector/,
    );

    const [prompt, options] = mockLlm.genererQuestions.mock.calls[0];
    expect(options).toEqual({ delaiMs: 5000 });
    expect(prompt.utilisateur).toContain('Nombre de questions : 2');
    expect(prompt.utilisateur.indexOf('numero="4"')).toBeLessThan(
      prompt.utilisateur.indexOf('numero="1"'),
    );

    expect(requetes('DELETE FROM suggestions_questions_ia')).toHaveLength(1);
    const inserts = requetes('INSERT INTO suggestions_questions_ia');
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual([
      'g-1',
      1,
      'Question numéro 1 sur les jetons JWT ?',
      'QCU',
      JSON.stringify(question(1).options),
      'Passage 4.',
      0.7,
      [4],
    ]);
    expect(inserts[1][1]).toEqual(expect.arrayContaining(['g-1', 2]));
    const [fin] = requetes("SET statut = 'TERMINEE'");
    expect(fin[1]).toEqual(['g-1', 2, 1, 'factice-v1']); // la 3e conforme dépasse le nombre demandé : écartée, pas invalide

    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GENERATION_IA_TERMINEE',
        acteur: null,
        cible: 'g-1',
        resultat: 'Succès',
        detailsAvantApres: expect.objectContaining({
          nbSuggestions: 2,
          nbInvalides: 1,
          passages: [4, 1],
          modeleLlm: 'factice-v1',
          tentative: 1,
        }),
      }),
    );
    expect(mockMail.sendGenerationTermineeEmail).toHaveBeenCalledWith('sami@esprit.tn', {
      prenom: 'Sami',
      titreSupport: 'Cours JWT',
      formationId: 'f-1',
      reussie: true,
      nbSuggestions: 2,
      motif: undefined,
    });
  });

  it('sans thème : la requête vectorisée est le titre du support', async () => {
    generation = { ...generation, focusThematique: null };
    await service.generer('g-1');
    expect(mockEmbeddings.vectoriser).toHaveBeenCalledWith(
      ['Cours JWT : notions essentielles du cours'],
      'requete',
    );
  });

  it.each([
    ['absente', null],
    ['déjà terminée', StatutGeneration.TERMINEE],
    ['en échec', StatutGeneration.ECHEC],
  ])('génération %s : rien (idempotent)', async (_cas, statut) => {
    generation = statut === null ? null : { ...generation, statut };
    await service.generer('g-1');
    expect(mockManager.update).not.toHaveBeenCalled();
    expect(mockLlm.genererQuestions).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('terminée pendant l’appel au modèle : rien n’est écrit', async () => {
    mockLlm.genererQuestions.mockImplementation(async () => {
      generation = { ...generation, statut: StatutGeneration.ECHEC };
      return { questions: [question(1)] };
    });
    await service.generer('g-1');
    expect(requetes('INSERT INTO suggestions_questions_ia')).toHaveLength(0);
    expect(requetes("SET statut = 'TERMINEE'")).toHaveLength(0);
    expect(mockAudit.record).not.toHaveBeenCalled();
    expect(mockMail.sendGenerationTermineeEmail).not.toHaveBeenCalled();
  });

  it('autre modèle d’embeddings : échec définitif, aucun appel au modèle', async () => {
    support = { ...support, modeleEmbeddings: 'autre-modele' };
    const erreur = await service.generer('g-1').catch((e) => e);
    expect(erreur).toBeInstanceOf(UnrecoverableError);
    expect(erreur.message).toBe(MESSAGE_MODELE_EMBEDDINGS);
    expect(mockLlm.genererQuestions).not.toHaveBeenCalled();
  });

  it('aucun passage : échec définitif', async () => {
    segments = [];
    const erreur = await service.generer('g-1').catch((e) => e);
    expect(erreur).toBeInstanceOf(UnrecoverableError);
    expect(erreur.message).toBe(MESSAGE_SUPPORT_SANS_PASSAGE);
  });

  it('réponse illisible : erreur récupérable (nouvelle tentative)', async () => {
    mockLlm.genererQuestions.mockResolvedValue('du texte');
    const erreur = await service.generer('g-1').catch((e) => e);
    expect(erreur).not.toBeInstanceOf(UnrecoverableError);
    expect(erreur.message).toBe(MESSAGE_REPONSE_ILLISIBLE);
  });

  it('aucune question conforme : motif noté, erreur récupérable', async () => {
    mockLlm.genererQuestions.mockResolvedValue({ questions: [{ type: 'QCU' }] });
    const erreur = await service.generer('g-1').catch((e) => e);
    expect(erreur).not.toBeInstanceOf(UnrecoverableError);
    expect(erreur.message).toBe(MESSAGE_AUCUNE_VALIDE);
    const [note] = requetes('SET derniere_erreur');
    expect(note[1]).toEqual(['g-1', MESSAGE_AUCUNE_VALIDE]);
    expect(String(note[0])).toContain("statut = 'EN_COURS'");
  });

  it('erreur du fournisseur : définitive si non récupérable, sinon relancée telle quelle', async () => {
    mockLlm.genererQuestions.mockRejectedValueOnce(new ErreurLlm('Clé refusée.', false));
    const definitive = await service.generer('g-1').catch((e) => e);
    expect(definitive).toBeInstanceOf(UnrecoverableError);
    expect(definitive.message).toBe('Clé refusée.');

    const passagere = new ErreurLlm('Saturé.', true);
    mockLlm.genererQuestions.mockRejectedValueOnce(passagere);
    await expect(service.generer('g-1')).rejects.toBe(passagere);
  });

  it('email en échec : la génération reste terminée (au mieux)', async () => {
    mockMail.sendGenerationTermineeEmail.mockRejectedValue(new Error('SMTP'));
    await expect(service.generer('g-1')).resolves.toBeUndefined();
    expect(requetes("SET statut = 'TERMINEE'")).toHaveLength(1);
  });

  describe('echecDefinitif', () => {
    it.each<[string, unknown, string]>([
      [
        'définitif : motif précis',
        new UnrecoverableError(MESSAGE_MODELE_EMBEDDINGS),
        MESSAGE_MODELE_EMBEDDINGS,
      ],
      [
        'tentatives épuisées : motif générique',
        new ErreurLlm('Saturé (429) détail', true),
        MESSAGE_ECHEC_GENERATION,
      ],
      ['aucune conforme : motif précis', new Error(MESSAGE_AUCUNE_VALIDE), MESSAGE_AUCUNE_VALIDE],
      [
        'erreur nommée UnrecoverableError (worker)',
        Object.assign(new Error('Clé refusée.'), { name: 'UnrecoverableError' }),
        'Clé refusée.',
      ],
    ])('%s', async (_cas, erreur, motif) => {
      await service.echecDefinitif('g-1', erreur);
      const [maj] = requetes("SET statut = 'ECHEC'");
      expect(maj[1]).toEqual(['g-1', motif]);
      expect(String(maj[0])).toContain("WHERE id = $1 AND statut = 'EN_COURS'");
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GENERATION_IA_ECHEC',
          cible: 'g-1',
          resultat: 'Échec',
          detailsAvantApres: expect.objectContaining({ motif }),
        }),
      );
      expect(mockMail.sendGenerationTermineeEmail).toHaveBeenCalledWith(
        'sami@esprit.tn',
        expect.objectContaining({ reussie: false, motif, titreSupport: 'Cours JWT' }),
      );
    });

    it('génération plus EN_COURS : ni audit ni email', async () => {
      mockDataSource.query.mockResolvedValueOnce([[], 0]);
      await service.echecDefinitif('g-1', new Error('x'));
      expect(mockAudit.record).not.toHaveBeenCalled();
      expect(mockMail.sendGenerationTermineeEmail).not.toHaveBeenCalled();
    });
  });
});
