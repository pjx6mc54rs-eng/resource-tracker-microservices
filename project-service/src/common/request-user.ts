import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from './user-role.enum';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Accepts both contract headers (`user-role` / `user-id`) and gateway (`x-user-role` / `x-user-id`). */
export function extractUserRole(headers: IncomingHeaders): UserRole | undefined {
  const raw = firstHeaderValue(headers['user-role'] ?? headers['x-user-role']);
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === UserRole.ADMIN) return UserRole.ADMIN;
  if (normalized === UserRole.COLLABORATEUR) return UserRole.COLLABORATEUR;
  return undefined;
}

export function extractUserId(headers: IncomingHeaders): string | undefined {
  const raw = firstHeaderValue(headers['user-id'] ?? headers['x-user-id']);
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

export function requireUserId(headers: IncomingHeaders): string {
  const userId = extractUserId(headers);
  if (!userId) {
    throw new UnauthorizedException('Identifiant utilisateur manquant (header user-id)');
  }
  return userId;
}

export function requireAdmin(headers: IncomingHeaders): void {
  const role = extractUserRole(headers);
  if (role !== UserRole.ADMIN) {
    throw new UnauthorizedException('Accès réservé aux administrateurs');
  }
}
