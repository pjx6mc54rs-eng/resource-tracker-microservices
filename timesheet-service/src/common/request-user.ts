import { UnauthorizedException } from '@nestjs/common';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

export enum UserRole {
  ADMIN = 'admin',
  RESPONSABLE = 'responsable',
  COLLABORATEUR = 'collaborateur',
}

/** Caller identity as reconstructed from the gateway-injected headers. */
export interface RequestUser {
  userId: string;
  role?: UserRole;
  /** Raw bearer token, forwarded on to auth-service / project-service. */
  token: string;
}

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Accepts both the gateway header (`x-user-id`) and the bare contract alias
 * (`user-id`). The gateway spelling MUST win: the api-gateway strips every
 * inbound identity header and re-injects `x-user-*` from the verified JWT, so
 * `x-user-id` is the only value known to be authenticated. Reading the bare
 * alias first would let a caller-supplied `user-id` shadow it.
 */
export function extractUserId(headers: IncomingHeaders): string | undefined {
  const raw = firstHeaderValue(headers['x-user-id'] ?? headers['user-id']);
  return raw?.trim() || undefined;
}

export function requireUserId(headers: IncomingHeaders): string {
  const userId = extractUserId(headers);
  if (!userId) {
    throw new UnauthorizedException('Missing x-user-id header');
  }
  return userId;
}

export function extractUserRole(
  headers: IncomingHeaders,
): UserRole | undefined {
  // Gateway spelling first, for the same reason as extractUserId above.
  const raw = firstHeaderValue(headers['x-user-role'] ?? headers['user-role']);
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return (Object.values(UserRole) as string[]).includes(normalized)
    ? (normalized as UserRole)
    : undefined;
}

export function extractToken(headers: IncomingHeaders): string {
  const raw = firstHeaderValue(headers['authorization']) ?? '';
  const [type, token] = raw.split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token : '';
}

export function requireRequestUser(headers: IncomingHeaders): RequestUser {
  return {
    userId: requireUserId(headers),
    role: extractUserRole(headers),
    token: extractToken(headers),
  };
}
