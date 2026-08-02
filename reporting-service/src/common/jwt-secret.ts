import { Logger } from '@nestjs/common';

/**
 * Nom exact de la variable d'environnement portant le secret HMAC. C'est la
 * MÊME que celle d'auth-service (qui signe) et d'api-gateway (qui vérifie) :
 * `JWT_SECRET`. Un secret différent ici ne rejetterait pas « un peu » — il
 * rejetterait tout le monde.
 */
export const JWT_SECRET_ENV = 'JWT_SECRET';

/**
 * Repli identique à celui d'api-gateway (`jwt-auth.guard.ts`), d'auth-service
 * (`jwt.strategy.ts`, `auth.module.ts`) et de docker-compose.
 *
 * Une version precedente refusait tout repli et repondait 503 quand la variable
 * manquait. C'etait plus strict sans etre plus sur : api-gateway retombe deja
 * sur cette meme valeur, donc un jeton forge avec le secret public du depot
 * franchit de toute facon la porte d'entree et atteint tous les services.
 * Echouer ici ne fermait aucune brehe — cela cassait seulement le lancement en
 * local, ou personne n'exporte JWT_SECRET.
 */
const DEV_FALLBACK_SECRET = 'change_this_secret';

const logger = new Logger('JwtSecret');

/** Le secret configuré, ou le repli de développement. */
export function readJwtSecret(): string {
  const raw = process.env[JWT_SECRET_ENV];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : DEV_FALLBACK_SECRET;
}

/** `true` si le secret vient bien de l'environnement, `false` si c'est le repli. */
export function isJwtSecretConfigured(): boolean {
  const raw = process.env[JWT_SECRET_ENV];
  return typeof raw === 'string' && raw.trim().length > 0;
}

/**
 * Contrôle au démarrage. On avertit sans bloquer : le service reste utilisable
 * en local, mais un déploiement qui a oublié la variable le voit dans ses logs.
 */
export function assertJwtSecretConfigured(): boolean {
  if (isJwtSecretConfigured()) return true;

  logger.warn(
    `${JWT_SECRET_ENV} n'est pas défini : repli sur le secret de développement ` +
      `partagé avec api-gateway et auth-service. Acceptable en local, à corriger ` +
      `en production — définissez ${JWT_SECRET_ENV} avec la même valeur ` +
      `qu'auth-service et api-gateway.`,
  );
  return false;
}
