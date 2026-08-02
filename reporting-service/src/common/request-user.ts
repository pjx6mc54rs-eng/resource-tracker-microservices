export type IncomingHeaders = Record<string, string | string[] | undefined>;

export enum UserRole {
  ADMIN = 'admin',
  RESPONSABLE = 'responsable',
  COLLABORATEUR = 'collaborateur',
}

/**
 * Identité de l'appelant, telle que reconstruite par `VerifiedUserGuard`.
 *
 * `userId` et `role` proviennent des revendications d'un jeton dont la
 * SIGNATURE a été vérifiée localement — jamais d'un en-tête. Les en-têtes
 * `x-user-*` ne servent plus qu'à une chose : détecter un désaccord avec le
 * jeton, qui vaut refus.
 */
export interface RequestUser {
  userId: string;
  role?: UserRole;
  /** Jeton porteur brut, réémis vers auth-service / project-service. */
  token: string;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Identité prétendue par les en-têtes, uniquement pour la comparer au jeton.
 *
 * Accepte l'orthographe passerelle (`x-user-id`) et l'alias nu (`user-id`), la
 * première l'emportant : l'api-gateway supprime tout en-tête d'identité entrant
 * et réinjecte `x-user-*` depuis un JWT vérifié. AUCUNE décision ne se prend
 * sur cette valeur — elle n'est qu'un candidat à confronter aux revendications.
 */
export function extractUserId(headers: IncomingHeaders): string | undefined {
  const raw = firstHeaderValue(headers['x-user-id'] ?? headers['user-id']);
  return raw?.trim() || undefined;
}

export function extractToken(headers: IncomingHeaders): string {
  const raw = firstHeaderValue(headers['authorization']) ?? '';
  const [type, token] = raw.split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token : '';
}
