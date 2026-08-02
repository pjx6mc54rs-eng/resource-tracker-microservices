import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { UserRole } from '../common/request-user';

// ── Formes renvoyées par les services amont ────────────────────────────────

/** `GET {auth}/auth/users` — sortie de UsersService.sanitize(). */
export interface DirectoryUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  role: UserRole;
  roles: UserRole[];
  responsableIds: string[];
  /** Sérialisé en ISO par l'amont ; sert au décompte « nouveaux ce mois-ci ». */
  createdAt?: string | null;
}

export type UpstreamTaskStatus = 'todo' | 'in_progress' | 'done';

export interface UpstreamTaskAssignment {
  id: string;
  taskId: string;
  userId: string;
}

export interface UpstreamTask {
  id: string;
  title: string;
  description?: string | null;
  status: UpstreamTaskStatus;
  projectId: string;
  assignees?: UpstreamTaskAssignment[];
}

export interface UpstreamAssignment {
  id: string;
  userId: string;
  projectId: string;
}

/** `GET {project}/projects` — projets + tâches + assignations. */
export interface UpstreamProject {
  id: string;
  name: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  tasks?: UpstreamTask[];
  assignments?: UpstreamAssignment[];
}

export type StatsScope = 'admin' | 'responsable' | 'self';

export type PeriodStatus =
  | 'not_validated'
  | 'pending'
  | 'approved'
  | 'rejected';

/** Une ligne de `GET {timesheet}/timesheets/stats/hours`, groupée par projet. */
export interface StatsHoursRow {
  userId: string;
  projectId: string | null;
  year: number;
  month: number;
  hours: number;
  workHours: number;
  holidayDays: number;
  filledDays: number;
  entries: number;
}

/**
 * Une ligne de `userMonths` : le MÊME agrégat, mais groupé par
 * (utilisateur, année, mois) sans le projet.
 *
 * C'est la seule source correcte pour toute grandeur « par utilisateur et par
 * mois » : `filledDays` est un COUNT(DISTINCT date), donc sommer les lignes
 * `rows` d'un même mois compte deux fois une journée répartie sur deux projets.
 * `rows` ne sert plus qu'à la ventilation par projet.
 */
export interface StatsUserMonthRow {
  userId: string;
  year: number;
  month: number;
  hours: number;
  workHours: number;
  holidayDays: number;
  filledDays: number;
  entries: number;
}

export interface StatsHoursResponse {
  scope: StatsScope;
  from: { year: number; month: number };
  to: { year: number; month: number };
  rows: StatsHoursRow[];
  userMonths: StatsUserMonthRow[];
}

/** Une ligne de `GET {timesheet}/timesheets/stats/periods`. */
export interface StatsPeriodRow {
  id: string;
  userId: string;
  year: number;
  month: number;
  status: PeriodStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface StatsPeriodsResponse {
  scope: StatsScope;
  rows: StatsPeriodRow[];
}

/** `PeriodOwner` de timesheet-service (propriétaire, valideur, responsables). */
export interface UpstreamPeriodOwner {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
}

/**
 * `GET {timesheet}/timesheets/periods/me` — la `PeriodView` complète d'un mois,
 * telle que le service qui détient la règle métier la calcule. Les dates sont
 * des `Date` côté amont, donc des chaînes ISO une fois sérialisées en JSON.
 */
export interface UpstreamPeriodView {
  id: string | null;
  year: number;
  month: number;
  status: PeriodStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  owner: UpstreamPeriodOwner;
  reviewer: UpstreamPeriodOwner | null;
  reviewers: UpstreamPeriodOwner[];
  locked: boolean;
  canSubmit: boolean;
  canRecall: boolean;
  canDownload: boolean;
  entriesCount: number;
  totalHours: number;
  totalDays: number;
  workHours: number;
  holidayDays: number;
  filledDays: number;
}

export interface ServiceHealth {
  name: string;
  /**
   * `skipped` = service non configuré : on ne l'a pas sondé, donc on ne sait
   * rien. On ne le déclare surtout pas `up` sur la foi d'une URL par défaut.
   */
  status: 'up' | 'down' | 'skipped';
  ms: number;
}

/** Résultat d'une lecture de l'annuaire, fraîcheur comprise. */
export interface DirectoryResult {
  users: DirectoryUser[];
  /**
   * `true` = l'amont a échoué et ces données viennent du cache. L'appelant DOIT
   * le traiter comme une dégradation : jamais servir du périmé comme du frais.
   */
  stale: boolean;
  /** Instant de la dernière lecture réussie (epoch ms). */
  fetchedAt: number;
}

/** Fenêtre de cache de l'annuaire — assez longue pour épargner à auth-service
 *  une rafale d'appels identiques, assez courte pour qu'un changement de rôle
 *  soit visible rapidement. */
const USERS_CACHE_TTL_MS = 30_000;

/**
 * Âge maximal d'un annuaire servi en mode dégradé. Au-delà, on préfère échouer
 * franchement : un cache sans borne fait vivre indéfiniment une photo périmée
 * (jeton révoqué, rôle retiré, compte supprimé) sur la foi d'un seul appel
 * réussi, longtemps après.
 */
const USERS_STALE_MAX_MS = 3 * 60_000;

const UPSTREAM_TIMEOUT_MS = 5000;

/** Le bandeau de santé ne doit jamais retarder le tableau de bord. */
const HEALTH_TIMEOUT_MS = 2000;

/**
 * Unique porte de sortie HTTP du reporting-service : lecture seule des données
 * détenues par auth-service, project-service et timesheet-service. Tout part
 * avec le jeton porteur de l'appelant : ce service ne voit donc jamais plus que
 * ce que l'appelant a déjà le droit de voir.
 */
@Injectable()
export class UpstreamService {
  private readonly logger = new Logger(UpstreamService.name);
  private usersCache: { fetchedAt: number; users: DirectoryUser[] } | null =
    null;

  constructor(private readonly http: HttpService) {}

  get authBaseUrl(): string {
    return process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000';
  }

  get projectBaseUrl(): string {
    return process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3001';
  }

  get timesheetBaseUrl(): string {
    return process.env.TIMESHEET_SERVICE_URL ?? 'http://localhost:3002';
  }

  get chatBaseUrl(): string {
    return process.env.CHAT_SERVICE_URL ?? 'http://localhost:3004';
  }

  /**
   * `null` = pas de notification-service configuré. Pas de valeur par défaut
   * ici : en mode hôte, `localhost:3005` est l'api-gateway, dont `/health`
   * répond toujours 200 — on annoncerait « notifications: up » sans qu'aucun
   * notification-service ne tourne.
   */
  get notificationBaseUrl(): string | null {
    const raw = process.env.NOTIFICATION_SERVICE_URL?.trim();
    return raw ? raw : null;
  }

  // ── auth-service ─────────────────────────────────────────────────────────

  /**
   * Annuaire complet.
   *
   * En cas de panne on peut rendre le cache PÉRIMÉ plutôt qu'échouer — un
   * annuaire un peu ancien répond correctement à « qui est responsable de
   * qui ? » — mais à deux conditions strictes :
   *   1. la fenêtre est bornée (`USERS_STALE_MAX_MS`) ; au-delà on échoue ;
   *   2. le résultat est marqué `stale`, pour que l'appelant dégrade sa
   *      réponse et ne prenne aucune décision d'autorisation dessus.
   * Sans ces deux garde-fous, un unique appel réussi suffisait à servir
   * indéfiniment un annuaire mort — et sans que rien n'apparaisse dans
   * `degraded`.
   *
   * Le CACHE FRAIS, lui, est servi sans appeler auth-service : c'est tout son
   * intérêt. Ce n'était acceptable qu'à condition que l'appelant soit déjà
   * authentifié ailleurs — sinon la fenêtre de 30 s transformait
   * n'importe quel jeton en réponse d'administrateur. C'est désormais le cas :
   * `VerifiedUserGuard` vérifie la signature du jeton AVANT que cette méthode
   * soit atteinte, donc le cache n'est plus qu'une optimisation de lecture.
   */
  async getUsers(token: string): Promise<DirectoryResult> {
    const cached = this.usersCache;
    if (cached && Date.now() - cached.fetchedAt < USERS_CACHE_TTL_MS) {
      return { users: cached.users, stale: false, fetchedAt: cached.fetchedAt };
    }

    try {
      const response = await firstValueFrom(
        this.http.get<DirectoryUser[]>(`${this.authBaseUrl}/auth/users`, {
          headers: { authorization: `Bearer ${token}` },
          timeout: UPSTREAM_TIMEOUT_MS,
        }),
      );
      const users = Array.isArray(response.data) ? response.data : [];
      const fetchedAt = Date.now();
      this.usersCache = { fetchedAt, users };
      return { users, stale: false, fetchedAt };
    } catch (error: any) {
      this.logger.error(
        `auth-service directory lookup failed: ${error?.message}`,
      );

      const age = cached
        ? Date.now() - cached.fetchedAt
        : Number.POSITIVE_INFINITY;
      if (cached && age < USERS_STALE_MAX_MS) {
        this.logger.warn(
          `annuaire servi depuis le cache périmé (${Math.round(age / 1000)} s) — réponse dégradée`,
        );
        return {
          users: cached.users,
          stale: true,
          fetchedAt: cached.fetchedAt,
        };
      }

      // Hors fenêtre : la photo ne vaut plus rien, on la jette pour ne pas la
      // ressusciter au prochain échec.
      this.usersCache = null;
      throw error;
    }
  }

  // ── project-service ──────────────────────────────────────────────────────

  /**
   * Projets visibles par l'appelant, tâches et assignations incluses.
   *
   * SÉCURITÉ : project-service fait confiance aux en-têtes d'impersonation
   * `x-user-id` / `x-user-role` (il n'ouvre pas le JWT lui-même). On ne se
   * présente donc en `admin` que lorsque l'appelant a été *confirmé*
   * administrateur : rôle issu des revendications d'un JWT dont
   * reporting-service a lui-même vérifié la signature (VerifiedUserGuard) ET
   * corroboré par le tableau `roles` de l'annuaire. Pour tout
   * autre appelant on force son propre identifiant et le rôle
   * `collaborateur`, si bien que project-service ne lui renvoie que les projets
   * auxquels il est réellement assigné : impossible d'élargir sa visibilité en
   * passant par le tableau de bord.
   */
  async getProjects(
    token: string,
    callerId: string,
    isConfirmedAdmin: boolean,
  ): Promise<UpstreamProject[]> {
    const response = await firstValueFrom(
      this.http.get<UpstreamProject[]>(`${this.projectBaseUrl}/projects`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-user-id': callerId,
          'x-user-role': isConfirmedAdmin
            ? UserRole.ADMIN
            : UserRole.COLLABORATEUR,
        },
        timeout: UPSTREAM_TIMEOUT_MS,
      }),
    );
    return Array.isArray(response.data) ? response.data : [];
  }

  // ── timesheet-service ────────────────────────────────────────────────────

  /**
   * Agrégats d'heures sur une plage de mois. Le périmètre (admin / responsable
   * / soi-même) est décidé côté timesheet-service à partir des en-têtes
   * d'identité : on ne le pilote pas depuis ici.
   */
  async getHoursStats(
    token: string,
    callerId: string,
    callerRole: UserRole | undefined,
    from: string,
    to: string,
  ): Promise<StatsHoursResponse> {
    const response = await firstValueFrom(
      this.http.get<StatsHoursResponse>(
        `${this.timesheetBaseUrl}/timesheets/stats/hours`,
        {
          params: { from, to },
          headers: this.identityHeaders(token, callerId, callerRole),
          timeout: UPSTREAM_TIMEOUT_MS,
        },
      ),
    );
    const data = response.data;
    return {
      scope: data?.scope ?? 'self',
      from: data?.from ?? { year: 0, month: 0 },
      to: data?.to ?? { year: 0, month: 0 },
      rows: Array.isArray(data?.rows) ? data.rows : [],
      // Agrégat par (utilisateur, mois) servi par le même endpoint : c'est lui
      // qui porte les grandeurs mensuelles justes (`filledDays` en tête).
      userMonths: Array.isArray(data?.userMonths) ? data.userMonths : [],
    };
  }

  /** Lignes brutes de `timesheet_periods` sur la même plage. */
  async getPeriodStats(
    token: string,
    callerId: string,
    callerRole: UserRole | undefined,
    from: string,
    to: string,
  ): Promise<StatsPeriodsResponse> {
    const response = await firstValueFrom(
      this.http.get<StatsPeriodsResponse>(
        `${this.timesheetBaseUrl}/timesheets/stats/periods`,
        {
          params: { from, to },
          headers: this.identityHeaders(token, callerId, callerRole),
          timeout: UPSTREAM_TIMEOUT_MS,
        },
      ),
    );
    const data = response.data;
    return {
      scope: data?.scope ?? 'self',
      rows: Array.isArray(data?.rows) ? data.rows : [],
    };
  }

  /**
   * File de validation de l'appelant : `GET /timesheets/periods/review`.
   *
   * Endpoint NON borné dans le temps — c'est tout l'intérêt : la file d'attente
   * d'un valideur n'a pas de raison de s'arrêter au bord d'une fenêtre de 12
   * mois. Il applique déjà les règles de visibilité du valideur (jamais sa
   * propre feuille ; responsable → ses collaborateurs ; admin → tout le monde)
   * et renvoie des `PeriodView` complètes.
   *
   * SÉCURITÉ : comme pour project-service, on ne se présente en `admin` que si
   * l'annuaire l'a confirmé. La dégrade n'est pas lossy pour un vrai admin :
   * timesheet-service revérifie de toute façon le rôle contre son propre
   * annuaire quand l'en-tête ne dit pas « admin ».
   */
  async getPeriodsForReview(
    token: string,
    callerId: string,
    isConfirmedAdmin: boolean,
    statuses: PeriodStatus[],
  ): Promise<UpstreamPeriodView[]> {
    const response = await firstValueFrom(
      this.http.get<UpstreamPeriodView[]>(
        `${this.timesheetBaseUrl}/timesheets/periods/review`,
        {
          params: { status: statuses.join(',') },
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': callerId,
            'x-user-role': isConfirmedAdmin
              ? UserRole.ADMIN
              : UserRole.COLLABORATEUR,
          },
          timeout: UPSTREAM_TIMEOUT_MS,
        },
      ),
    );
    return Array.isArray(response.data) ? response.data : [];
  }

  /**
   * Vue de validation du mois de l'appelant, calculée par timesheet-service.
   *
   * Cette route est déjà nominative : `getMyPeriod()` ne lit que
   * `user.userId` et n'accepte aucun paramètre de propriétaire, donc le rôle
   * n'élargit rien. On n'envoie volontairement PAS `x-user-role` : seule
   * l'identité de l'appelant part avec le jeton.
   *
   * `x-user-id` reste indispensable : timesheet-service n'ouvre pas le JWT
   * lui-même (`requireRequestUser()` lit l'en-tête d'identité injecté par
   * l'api-gateway) et le reporting l'appelle en direct, hors passerelle. Sans
   * cet en-tête la route répondrait 401 et la section serait toujours dégradée.
   * On y réémet l'identifiant de l'appelant, jamais un autre.
   */
  async getMyPeriod(
    token: string,
    callerId: string,
    year: number,
    month: number,
  ): Promise<UpstreamPeriodView> {
    const response = await firstValueFrom(
      this.http.get<UpstreamPeriodView>(
        `${this.timesheetBaseUrl}/timesheets/periods/me`,
        {
          params: { year, month },
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': callerId,
          },
          timeout: UPSTREAM_TIMEOUT_MS,
        },
      ),
    );
    const data = response.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Réponse inattendue de /timesheets/periods/me');
    }
    return data;
  }

  /**
   * On réémet l'identité issue du jeton VÉRIFIÉ — jamais un rôle plus fort, et
   * jamais l'identité prétendue par un en-tête entrant. timesheet-service
   * recalcule de toute façon le périmètre contre l'annuaire.
   */
  private identityHeaders(
    token: string,
    callerId: string,
    callerRole: UserRole | undefined,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'x-user-id': callerId,
    };
    if (callerRole) headers['x-user-role'] = callerRole;
    return headers;
  }

  // ── Bandeau de santé (section admin uniquement) ──────────────────────────

  /**
   * Ping `/health` de chaque service. Un service muet est `down`, pas une
   * erreur ; un service dont l'URL n'est pas configurée est `skipped`.
   *
   * Une URL par défaut est piégeuse ici : en mode hôte tous les services
   * partagent `localhost`, et sonder le mauvais port revient à sonder
   * l'api-gateway — dont `/health` répond toujours 200. Le bandeau affichait
   * ainsi « notifications: up » alors qu'aucun notification-service ne
   * tournait. Mieux vaut ne rien affirmer que d'affirmer faux.
   */
  async checkServices(): Promise<ServiceHealth[]> {
    const targets: { name: string; url: string | null }[] = [
      { name: 'auth', url: this.authBaseUrl },
      { name: 'projects', url: this.projectBaseUrl },
      { name: 'timesheets', url: this.timesheetBaseUrl },
      { name: 'chat', url: this.chatBaseUrl },
      { name: 'notifications', url: this.notificationBaseUrl },
    ];

    return Promise.all(
      targets.map(async (target) => {
        if (!target.url) {
          return { name: target.name, status: 'skipped' as const, ms: 0 };
        }
        const startedAt = Date.now();
        try {
          await firstValueFrom(
            this.http.get(`${target.url}/health`, {
              timeout: HEALTH_TIMEOUT_MS,
            }),
          );
          return {
            name: target.name,
            status: 'up' as const,
            ms: Date.now() - startedAt,
          };
        } catch {
          return {
            name: target.name,
            status: 'down' as const,
            ms: Date.now() - startedAt,
          };
        }
      }),
    );
  }
}
