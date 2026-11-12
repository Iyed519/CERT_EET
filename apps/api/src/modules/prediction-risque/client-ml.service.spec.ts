import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { NiveauRisque } from '../../database/enums/niveau-risque.enum';
import { ClientMlService } from './client-ml.service';
import { Variables } from './risque.variables';

const VARIABLES: Variables = {
  jours_actifs: 3,
  taux_jours_actifs: 0.1,
  jours_depuis_derniere_activite: 9,
  jours_actifs_14_derniers: 1,
  delai_inscription: -2,
  nb_evaluations_echues: 1,
  taux_remise: 0,
  nb_non_rendues: 1,
  nb_remises_en_retard: 0,
  nb_notes: 0,
  score_moyen: null,
  nb_echecs: 0,
  echecs_consecutifs_fin: 0,
  tendance_score: null,
  a_au_moins_une_note: 0,
  coupure: 21,
};

/** Faux service ml : le comportement de chaque test est fourni par `repondre`. */
describe('ClientMlService (repli silencieux)', () => {
  let serveur: Server;
  let url: string;
  let repondre: (req: IncomingMessage, corps: string, res: ServerResponse) => void;
  let avertissement: jest.SpyInstance;

  const client = (delaiMs = 500, mlUrl = url): ClientMlService =>
    new ClientMlService({
      getOrThrow: () => ({ mlUrl, delaiMs, balayageActif: false, intervalleMinutes: 60 }),
    } as unknown as ConfigService);

  const json = (res: ServerResponse, statut: number, corps: unknown): void => {
    res.writeHead(statut, { 'content-type': 'application/json' });
    res.end(JSON.stringify(corps));
  };

  beforeAll(async () => {
    serveur = createServer((req, res) => {
      let corps = '';
      req.on('data', (m: Buffer) => (corps += m.toString()));
      req.on('end', () => repondre(req, corps, res));
    });
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    serveur.closeAllConnections();
    await new Promise((ok) => serveur.close(ok));
  });

  beforeEach(() => {
    avertissement = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('envoie les 16 variables à plat et lit les prédictions (niveaux convertis)', async () => {
    let recu: { apprenants: Array<Record<string, unknown>> } | null = null;
    let chemin = '';
    repondre = (req, corps, res): void => {
      chemin = req.url ?? '';
      recu = JSON.parse(corps) as typeof recu;
      json(res, 200, {
        version_modele: 'risque_v1',
        seuil: 0.355,
        predictions: [
          { identifiant: 'i1', probabilite: 0.91, niveau: 'élevé', raisons: ['A', 'B', 'C'] },
          { identifiant: 'i2', probabilite: 0.4, niveau: 'moyen', raisons: ['D'] },
        ],
      });
    };
    const r = await client().predire([
      { identifiant: 'i1', variables: VARIABLES },
      { identifiant: 'i2', variables: { ...VARIABLES, score_moyen: 55 } },
    ]);
    expect(chemin).toBe('/predire');
    expect(recu!.apprenants[0]).toEqual({ identifiant: 'i1', ...VARIABLES });
    expect(recu!.apprenants[1].score_moyen).toBe(55);
    expect(r).toEqual({
      versionModele: 'risque_v1',
      predictions: [
        { identifiant: 'i1', probabilite: 0.91, niveau: NiveauRisque.ELEVE, raisons: ['A', 'B', 'C'] },
        { identifiant: 'i2', probabilite: 0.4, niveau: NiveauRisque.MOYEN, raisons: ['D'] },
      ],
    });
    expect(avertissement).not.toHaveBeenCalled();
  });

  it('lot vide : aucun appel', async () => {
    repondre = (): void => {
      throw new Error('ne doit pas être appelé');
    };
    await expect(client().predire([])).resolves.toEqual({ versionModele: '', predictions: [] });
  });

  it.each([
    ['erreur HTTP 500', (res: ServerResponse): void => json(res, 500, { detail: 'boom' })],
    ['erreur HTTP 422', (res: ServerResponse): void => json(res, 422, { erreur: 'Entrées invalides' })],
    ['réponse non JSON', (res: ServerResponse): void => void res.end('<html>')],
    ['réponse mal formée', (res: ServerResponse): void => json(res, 200, { ok: true })],
    [
      'nombre de prédictions inattendu',
      (res: ServerResponse): void => json(res, 200, { version_modele: 'v', predictions: [] }),
    ],
    [
      'niveau inconnu',
      (res: ServerResponse): void =>
        json(res, 200, {
          version_modele: 'v',
          predictions: [{ identifiant: 'i1', probabilite: 0.5, niveau: 'critique', raisons: [] }],
        }),
    ],
    [
      'identifiant différent',
      (res: ServerResponse): void =>
        json(res, 200, {
          version_modele: 'v',
          predictions: [{ identifiant: 'autre', probabilite: 0.5, niveau: 'moyen', raisons: [] }],
        }),
    ],
    [
      'probabilité hors bornes',
      (res: ServerResponse): void =>
        json(res, 200, {
          version_modele: 'v',
          predictions: [{ identifiant: 'i1', probabilite: 3, niveau: 'moyen', raisons: [] }],
        }),
    ],
  ])('%s → null et un avertissement, sans exception', async (_cas, agir): Promise<void> => {
    repondre = (_req, _corps, res): void => agir(res);
    await expect(client().predire([{ identifiant: 'i1', variables: VARIABLES }])).resolves.toBeNull();
    expect(avertissement).toHaveBeenCalledTimes(1);
    expect(String(avertissement.mock.calls[0][0])).toContain('repli sur les règles');
  });

  it('service trop lent → null après le délai, sans nouvelle tentative', async () => {
    let appels = 0;
    repondre = (): void => {
      appels += 1; // ne répond jamais
    };
    const debut = Date.now();
    await expect(client(300).predire([{ identifiant: 'i1', variables: VARIABLES }])).resolves.toBeNull();
    expect(Date.now() - debut).toBeLessThan(2000);
    expect(appels).toBe(1);
    expect(String(avertissement.mock.calls[0][0])).toMatch(/Timeout|abort/i);
  });

  it('service arrêté (connexion refusée) → null', async () => {
    const ferme = createServer();
    await new Promise<void>((ok) => ferme.listen(0, '127.0.0.1', ok));
    const port = (ferme.address() as AddressInfo).port;
    await new Promise((ok) => ferme.close(ok));
    await expect(
      client(500, `http://127.0.0.1:${port}`).predire([{ identifiant: 'i1', variables: VARIABLES }]),
    ).resolves.toBeNull();
    expect(avertissement).toHaveBeenCalledTimes(1);
  });

  it('ne journalise jamais les variables envoyées', async () => {
    repondre = (_req, _corps, res): void => json(res, 500, {});
    await client().predire([{ identifiant: 'i1', variables: { ...VARIABLES, jours_actifs: 4242 } }]);
    expect(String(avertissement.mock.calls[0][0])).not.toContain('4242');
  });
});
