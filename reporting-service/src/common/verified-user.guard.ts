import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { readJwtSecret } from './jwt-secret';
import {
  extractToken,
  extractUserId,
  RequestUser,
  UserRole,
} from './request-user';
import type { IncomingHeaders } from './request-user';

/** Clé sous laquelle le garde dépose l'identité VÉRIFIÉE sur la requête. */
const VERIFIED_USER_KEY = 'verifiedUser';

/**
 * Charge utile signée par auth-service (`AuthService.login()`), reproduite ici
 * à l'identique. Les noms de revendications sont vérifiés, pas devinés :
 *   - `sub`   : identifiant de l'utilisateur (`user.id`) — c'est la revendication
 *               que lit `JwtStrategy.validate()` d'auth-service (`userId:
 *               payload.sub`) ;
 *   - `id`    : le MÊME identifiant, dupliqué par auth-service ;
 *   - `role`  : rôle principal, tel que calculé par `UsersService.sanitize()` ;
 *   - `roles` : tous les rôles de l'utilisateur ;
 *   - `email`, `firstName`, `lastName` : informatifs, jamais utilisés ici.
 * Tout est optionnel côté types : un jeton est une entrée, pas un contrat.
 */
interface VerifiedJwtPayload {
  sub?: unknown;
  id?: unknown;
  email?: unknown;
  role?: unknown;
  roles?: unknown;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function asRole(value: unknown): UserRole | undefined {
  const raw = asNonEmptyString(value)?.toLowerCase();
  if (!raw) return undefined;
  return (Object.values(UserRole) as string[]).includes(raw)
    ? (raw as UserRole)
    : undefined;
}

function rolesFromPayload(payload: VerifiedJwtPayload): UserRole[] {
  const raw = Array.isArray(payload.roles) ? payload.roles : [];
  const roles = raw
    .map((entry) => asRole(entry))
    .filter((role): role is UserRole => role !== undefined);
  return roles;
}

/**
 * Rôle principal DÉDUIT DU JETON, jamais de `x-user-role`.
 *
 * Même règle que `UsersService.sanitize()` en amont : `admin` l'emporte dès
 * qu'il figure dans `roles`, sinon on prend la revendication `role`.
 */
function primaryRoleFromPayload(
  payload: VerifiedJwtPayload,
): UserRole | undefined {
  const roles = rolesFromPayload(payload);
  if (roles.includes(UserRole.ADMIN)) return UserRole.ADMIN;
  return asRole(payload.role) ?? roles[0];
}

/**
 * Vérifie la SIGNATURE du jeton porteur et fabrique l'identité de l'appelant à
 * partir des revendications vérifiées.
 *
 * Pourquoi ici, alors que l'api-gateway vérifie déjà ? Parce que
 * reporting-service est joignable en direct sur le réseau interne et qu'il est
 * le seul endpoint à renvoyer des agrégats à l'échelle de l'entreprise. Se
 * contenter de `x-user-id` suffisait à obtenir la section admin complète avec
 * un jeton de collaborateur parfaitement valide, en changeant un seul en-tête.
 *
 * Deux règles, dans cet ordre :
 *   1. signature invalide, expirée ou jeton absent → 401 ;
 *   2. `x-user-id` présent ET différent de l'identité du jeton → 401. On ne
 *      choisit silencieusement ni l'un ni l'autre : un désaccord est soit une
 *      tentative d'usurpation, soit une passerelle mal configurée, et les deux
 *      méritent un refus franc plutôt qu'une réponse plausible.
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  private readonly logger = new Logger(VerifiedUserGuard.name);

  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: IncomingHeaders } & Record<string, unknown>>();
    const headers: IncomingHeaders = request.headers ?? {};

    // Même secret que celui d'api-gateway et d'auth-service, repli de
    // développement compris (cf. jwt-secret.ts).
    const secret = readJwtSecret();

    const token = extractToken(headers);
    if (!token) {
      throw new UnauthorizedException('Jeton porteur absent');
    }

    let payload: VerifiedJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<VerifiedJwtPayload>(token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }

    // `sub` d'abord (revendication standard, celle que lit auth-service), `id`
    // en second : auth-service émet les deux avec la même valeur.
    const tokenUserId =
      asNonEmptyString(payload.sub) ?? asNonEmptyString(payload.id);
    if (!tokenUserId) {
      throw new UnauthorizedException("Jeton sans identifiant d'appelant");
    }

    const headerUserId = extractUserId(headers);
    if (headerUserId && headerUserId !== tokenUserId) {
      this.logger.warn(
        `x-user-id (${headerUserId}) en désaccord avec le jeton (${tokenUserId}) : requête refusée.`,
      );
      throw new UnauthorizedException(
        "L'en-tête d'identité contredit le jeton porteur",
      );
    }

    const user: RequestUser = {
      // Identité issue des revendications VÉRIFIÉES, pas de l'en-tête.
      userId: tokenUserId,
      role: primaryRoleFromPayload(payload),
      token,
    };
    request[VERIFIED_USER_KEY] = user;
    return true;
  }
}

/**
 * Injecte l'identité déposée par `VerifiedUserGuard`. Absente = le garde n'a
 * pas tourné : on refuse plutôt que de laisser passer une requête non vérifiée.
 */
export const VerifiedUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const user = request[VERIFIED_USER_KEY] as RequestUser | undefined;
    if (!user) {
      throw new UnauthorizedException('Appelant non vérifié');
    }
    return user;
  },
);
