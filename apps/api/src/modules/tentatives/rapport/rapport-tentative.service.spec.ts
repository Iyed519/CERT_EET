import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AffichageResultats } from '../../../database/enums/affichage-resultats.enum';
import { Role } from '../../../database/enums/role.enum';
import { StatutTentative } from '../../../database/enums/statut-tentative.enum';
import { TypeQuestion } from '../../../database/enums/type-question.enum';
import { AuditService } from '../../audit/audit.service';
import { EtatCorrection, QuestionCorrigee } from '../tentative-correction.regles';
import { TentativeCorrectionService } from '../tentative-correction.service';
import * as generateur from './rapport-tentative-pdf';
import { RapportTentativeService } from './rapport-tentative.service';

/**
 * Service du rapport (US-QCM-13), base et générateur simulés : 404 / 409,
 * décision du corrigé déléguée à `etat` (US-QCM-09) pour l'apprenant
 * seulement, contenu passé au générateur, audit après génération.
 */
describe('RapportTentativeService (US-QCM-13)', () => {
  const TENTATIVE = {
    id: 't1',
    apprenantId: 'a1',
    qcmId: 'q1',
    statut: StatutTentative.NOTEE,
    dateDebut: new Date('2026-11-12T09:00:00Z'),
    dateLimite: new Date('2026-11-12T09:30:00Z'),
    dateFin: new Date('2026-11-12T09:30:00Z'),
    dureeEffective: 1800,
    score: 50,
    estReussie: false,
    planTirage: [{ questionId: 'x', optionIds: ['o1', 'o2'] }],
    numero: 2,
    qcmTitre: 'Évaluation',
    moduleTitre: 'M',
    formationTitre: 'F',
    prenom: 'Inès',
    nom: 'G',
    email: 'i@x',
    affichageResultats: AffichageResultats.DIFFERE,
    dateFermeture: new Date('2026-12-01T00:00:00Z'),
    nbTentativesMax: 3,
    scoreMinValidation: 60,
  };
  const QUESTION: QuestionCorrigee = {
    id: 'x',
    enonce: 'Énoncé',
    type: TypeQuestion.QCU,
    ponderation: 1,
    repondue: true,
    estCorrecte: false,
    pointsObtenus: 0,
    explication: 'Secret',
    options: [
      { id: 'o1', texte: 'Bonne', cochee: false, estCorrecte: true },
      { id: 'o2', texte: 'Fausse', cochee: true, estCorrecte: false },
    ],
  };
  const INDISPONIBLE: EtatCorrection = {
    mode: AffichageResultats.DIFFERE,
    disponible: false,
    raison: 'correction_differee',
    disponibleLe: new Date('2026-12-01T00:00:00Z'),
  };

  let lignes: unknown[];
  let query: jest.Mock;
  let etat: jest.Mock;
  let record: jest.Mock;
  let generer: jest.SpyInstance;
  let service: RapportTentativeService;

  beforeEach(() => {
    lignes = [TENTATIVE];
    query = jest.fn(async (sql: string) =>
      sql.startsWith('SELECT now()') ? [{ maintenant: new Date('2026-11-20T00:00:00Z') }] : lignes,
    );
    etat = jest.fn(async () => INDISPONIBLE);
    record = jest.fn(async () => undefined);
    generer = jest.spyOn(generateur, 'genererPdfRapport').mockResolvedValue(Buffer.from('%PDF'));
    service = new RapportTentativeService(
      { query, manager: {} } as unknown as DataSource,
      {
        etat,
        lireCorrection: jest.fn(async () => [QUESTION]),
      } as unknown as TentativeCorrectionService,
      { record } as unknown as AuditService,
    );
  });
  afterEach(() => generer.mockRestore());

  const apprenant = { id: 'a1', role: Role.APPRENANT, adresseIp: '1.2.3.4' };
  const formateur = { id: 'f1', role: Role.FORMATEUR, adresseIp: null };

  it('apprenant : sa tentative seulement (filtre sur l’apprenant du jeton)', async () => {
    await service.pourApprenant(apprenant, 't1');
    expect(query.mock.calls[0][0]).toContain('t.id = $1 AND t.apprenant_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['t1', 'a1']);
  });

  it('formateur : tentative de CE QCM seulement', async () => {
    await service.pourFormateur(formateur, 'q1', 't1');
    expect(query.mock.calls[0][0]).toContain('t.id = $1 AND t.qcm_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['t1', 'q1']);
  });

  it('introuvable : 404, rien de généré ni journalisé', async () => {
    lignes = [];
    await expect(service.pourApprenant(apprenant, 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(generer).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it.each([StatutTentative.EN_COURS, StatutTentative.SOUMISE, StatutTentative.ABANDONNEE_TIMER])(
    '%s : 409 tentative_non_notee, rien de généré ni journalisé',
    async (statut) => {
      lignes = [{ ...TENTATIVE, statut }];
      const erreur = await service.pourFormateur(formateur, 'q1', 't1').catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ConflictException);
      expect((erreur as ConflictException).getResponse()).toMatchObject({
        raison: 'tentative_non_notee',
      });
      expect(generer).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('apprenant, corrigé indisponible : la décision vient de `etat` ; ni bonne réponse ni explication', async () => {
    await service.pourApprenant(apprenant, 't1');
    expect(etat).toHaveBeenCalledWith(
      expect.objectContaining({ apprenantId: 'a1', qcmId: 'q1', statut: StatutTentative.NOTEE }),
      {
        affichageResultats: AffichageResultats.DIFFERE,
        dateFermeture: TENTATIVE.dateFermeture,
        nbTentativesMax: 3,
      },
      new Date('2026-11-20T00:00:00Z'),
    );
    const contenu = generer.mock.calls[0][0] as generateur.ContenuRapport;
    expect(JSON.stringify(contenu.lignes)).not.toContain('Bonne');
    expect(JSON.stringify(contenu.lignes)).not.toContain('Secret');
    expect(contenu.corrigeAbsent).toContain('01/12/2026');
    expect(record.mock.calls[0][0].detailsAvantApres.corrigeInclus).toBe(false);
  });

  it('apprenant, corrigé disponible : bonnes réponses et explication', async () => {
    etat.mockResolvedValue({ ...INDISPONIBLE, disponible: true, raison: null, disponibleLe: null });
    await service.pourApprenant(apprenant, 't1');
    const contenu = generer.mock.calls[0][0] as generateur.ContenuRapport;
    expect(contenu.lignes[0].bonnesReponses).toEqual(['Bonne']);
    expect(contenu.lignes[0].explication).toBe('Secret');
    expect(contenu.corrigeAbsent).toBeNull();
  });

  it('formateur : corrigé toujours inclus, sans consulter la règle de l’apprenant', async () => {
    await service.pourFormateur(formateur, 'q1', 't1');
    expect(etat).not.toHaveBeenCalled();
    const contenu = generer.mock.calls[0][0] as generateur.ContenuRapport;
    expect(contenu.lignes[0].bonnesReponses).toEqual(['Bonne']);
    expect(contenu.corrigeAbsent).toBeNull();
  });

  it('contenu : score et réussite lus en base, clôture par le temps, rang, synthèse', async () => {
    const rapport = await service.pourApprenant(apprenant, 't1');
    const contenu = generer.mock.calls[0][0] as generateur.ContenuRapport;
    expect(contenu).toMatchObject({
      score: 50,
      estReussie: false,
      scoreMinValidation: 60,
      numero: 2,
      nbTentativesMax: 3,
      cloture: 'TEMPS_ECOULE',
      synthese: { nbQuestions: 1, nbJustes: 0, nbFausses: 1, nbSansReponse: 0 },
    });
    expect(rapport).toEqual({
      pdf: Buffer.from('%PDF'),
      nomFichier: 'rapport-evaluation-tentative-2.pdf',
    });
  });

  it('audit RAPPORT_QCM_TELECHARGE : acteur = demandeur, cible = apprenant', async () => {
    await service.pourFormateur(formateur, 'q1', 't1');
    expect(record).toHaveBeenCalledWith({
      action: 'RAPPORT_QCM_TELECHARGE',
      acteur: 'f1',
      cible: 'a1',
      adresseIp: null,
      resultat: 'Succès',
      detailsAvantApres: {
        tentativeId: 't1',
        qcmId: 'q1',
        role: Role.FORMATEUR,
        corrigeInclus: true,
        score: 50,
      },
    });
  });

  it('échec de l’audit : la requête échoue (aucun téléchargement non tracé)', async () => {
    record.mockRejectedValue(new Error('base indisponible'));
    await expect(service.pourApprenant(apprenant, 't1')).rejects.toThrow(/base indisponible/);
  });
});
