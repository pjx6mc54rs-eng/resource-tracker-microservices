import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { UserRole } from '../common/request-user';

export interface DirectoryUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  role: UserRole;
  roles: UserRole[];
  responsableIds: string[];
}

export interface DirectoryProject {
  id: string;
  name: string;
}

/** Cache window for the user directory — long enough to spare auth-service a
 *  burst of identical calls, short enough that a new responsable shows up fast. */
const USERS_CACHE_TTL_MS = 30_000;

/**
 * Read-only view of the data owned by auth-service and project-service:
 * who reports to whom (validation rights) and human-readable project names
 * (exports). Everything is fetched with the caller's own bearer token, so this
 * service never sees more than the caller is already allowed to see.
 */
@Injectable()
export class DirectoryService {
  private readonly logger = new Logger(DirectoryService.name);
  private usersCache: { fetchedAt: number; users: DirectoryUser[] } | null = null;

  constructor(private readonly http: HttpService) {}

  private get authBaseUrl(): string {
    return process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000';
  }

  private get projectBaseUrl(): string {
    return process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3001';
  }

  async getUsers(token: string): Promise<DirectoryUser[]> {
    const cached = this.usersCache;
    if (cached && Date.now() - cached.fetchedAt < USERS_CACHE_TTL_MS) {
      return cached.users;
    }

    try {
      const response = await firstValueFrom(
        this.http.get<DirectoryUser[]>(`${this.authBaseUrl}/auth/users`, {
          headers: { authorization: `Bearer ${token}` },
          timeout: 5000,
        }),
      );
      const users = Array.isArray(response.data) ? response.data : [];
      this.usersCache = { fetchedAt: Date.now(), users };
      return users;
    } catch (error: any) {
      this.logger.error(`auth-service directory lookup failed: ${error?.message}`);
      // A stale directory still answers "who may validate this?" correctly in
      // the common case, and beats failing the whole request.
      if (cached) return cached.users;
      throw new ServiceUnavailableException(
        "Service d'authentification indisponible : impossible de vérifier les responsables.",
      );
    }
  }

  async getUser(userId: string, token: string): Promise<DirectoryUser | undefined> {
    const users = await this.getUsers(token);
    return users.find((u) => u.id === userId);
  }

  async getResponsableIds(userId: string, token: string): Promise<string[]> {
    const user = await this.getUser(userId, token);
    return Array.isArray(user?.responsableIds) ? user.responsableIds : [];
  }

  async isAdmin(userId: string, token: string): Promise<boolean> {
    const user = await this.getUser(userId, token);
    if (!user) return false;
    const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    return roles.includes(UserRole.ADMIN);
  }

  /** Ids of every user who lists `reviewerId` among their responsables. */
  async getManagedUserIds(reviewerId: string, token: string): Promise<string[]> {
    const users = await this.getUsers(token);
    return users
      .filter((u) => Array.isArray(u.responsableIds) && u.responsableIds.includes(reviewerId))
      .map((u) => u.id);
  }

  static displayName(user: DirectoryUser | undefined, fallback = 'Utilisateur'): string {
    if (!user) return fallback;
    const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    return full || user.email || fallback;
  }

  /**
   * Project id → name for the projects `ownerId` is assigned to. Called with
   * the owner's identity (not the caller's) so a reviewer exporting someone
   * else's timesheet still resolves that person's project names.
   */
  async getProjectNames(ownerId: string, token: string): Promise<Map<string, string>> {
    try {
      const response = await firstValueFrom(
        this.http.get<DirectoryProject[]>(`${this.projectBaseUrl}/projects`, {
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': ownerId,
            'x-user-role': UserRole.COLLABORATEUR,
          },
          timeout: 5000,
        }),
      );
      const projects = Array.isArray(response.data) ? response.data : [];
      return new Map(projects.map((p) => [p.id, p.name]));
    } catch (error: any) {
      // Names are cosmetic for an export — degrade to raw ids rather than fail.
      this.logger.warn(`project-service lookup failed: ${error?.message}`);
      return new Map();
    }
  }
}
