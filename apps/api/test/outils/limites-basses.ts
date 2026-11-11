/**
 * E2E-AUTH13 — limites de débit basses, posées AVANT l'import d'AppModule (la
 * configuration est lue à ce moment-là). Importé en tout premier par la suite
 * de durcissement, et retiré par elle en fin de suite (`retirerLimitesBasses`).
 */
export const LIMITES_BASSES: Record<string, string> = {
  LIMITE_CONNEXION: '3',
  LIMITE_MFA: '2',
  LIMITE_RAFRAICHISSEMENT: '2',
  LIMITE_INSCRIPTION: '2',
  LIMITE_VERIFICATION_EMAIL: '2',
};

for (const [cle, valeur] of Object.entries(LIMITES_BASSES)) {
  process.env[cle] = valeur;
}

export function retirerLimitesBasses(): void {
  for (const cle of Object.keys(LIMITES_BASSES)) {
    delete process.env[cle];
  }
}
