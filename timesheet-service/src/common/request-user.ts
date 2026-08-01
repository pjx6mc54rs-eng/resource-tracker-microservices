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

/** Accepts both contract headers (`user-id`) and gateway ones (`x-user-id`). */
export function extractUserId(headers: IncomingHeaders): string | undefined {
  const raw = firstHeaderValue(headers['user-id'] ?? headers['x-user-id']);
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
  const raw = firstHeaderValue(headers['user-role'] ?? headers['x-user-role']);
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
