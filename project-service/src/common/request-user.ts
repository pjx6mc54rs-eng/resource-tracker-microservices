import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from './user-role.enum';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Accepts both the gateway headers (`x-user-role` / `x-user-id`) and the bare
 * contract aliases (`user-role` / `user-id`). The gateway spelling MUST win:
 * the api-gateway strips every inbound identity header and re-injects the
 * `x-user-*` pair from the verified JWT, so those are the only values known to
 * be authenticated. Reading the bare aliases first would let caller-supplied
 * `user-role` / `user-id` headers shadow them and escalate privilege.
 */
export function extractUserRole(
  headers: IncomingHeaders,
): UserRole | undefined {
  const raw = firstHeaderValue(headers['x-user-role'] ?? headers['user-role']);
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === UserRole.ADMIN) return UserRole.ADMIN;
  if (normalized === UserRole.RESPONSABLE) return UserRole.RESPONSABLE;
  if (normalized === UserRole.COLLABORATEUR) return UserRole.COLLABORATEUR;
  return undefined;
}

export function extractUserId(headers: IncomingHeaders): string | undefined {
  const raw = firstHeaderValue(headers['x-user-id'] ?? headers['user-id']);
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function requireUserId(headers: IncomingHeaders): string {
  const userId = extractUserId(headers);
  if (!userId) {
    throw new UnauthorizedException(
      'Identifiant utilisateur manquant (header user-id)',
    );
  }
  return userId;
}

export function requireAdmin(headers: IncomingHeaders): void {
  const role = extractUserRole(headers);
  if (role !== UserRole.ADMIN) {
    throw new UnauthorizedException('Accès réservé aux administrateurs');
  }
}
