import { CustomDecorator, SetMetadata } from '@nestjs/common';

/** Clé de métadonnée marquant une route comme publique (sans authentification). */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — exclut une route du JwtAuthGuard global (login, refresh, logout,
 * health…). Sécurité par défaut : tout est protégé SAUF ce qui est marqué ici.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
