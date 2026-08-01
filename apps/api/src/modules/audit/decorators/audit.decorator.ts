import { CustomDecorator, SetMetadata } from '@nestjs/common';

/** Clé de métadonnée portant l'action d'audit déclarée sur une route. */
export const AUDIT_ACTION_KEY = 'audit_action';

/**
 * @Audit('ACTION') — déclare qu'une route doit être journalisée par
 * l'AuditInterceptor (US-AUTH-12). Ne fait qu'attacher la métadonnée ; c'est
 * l'intercepteur qui écrit l'entrée (acteur = req.user, IP = req.ip, résultat
 * selon succès/échec). À NE PAS poser sur une route déjà journalisée finement
 * par un service, sous peine de double-log.
 */
export const Audit = (action: string): CustomDecorator =>
  SetMetadata(AUDIT_ACTION_KEY, action);
