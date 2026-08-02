import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RequestUser, UserRole } from '../common/request-user';
import {
  DirectoryUser,
  PeriodStatus,
  ServiceHealth,
  StatsHoursRow,
  StatsPeriodRow,
  StatsUserMonthRow,
  UpstreamPeriodView,
  UpstreamProject,
  UpstreamService,
  UpstreamTask,
  UpstreamTaskStatus,
} from './upstream.service';

/** Une journée pleine, comme dans timesheet-service. */
const HOURS_PER_DAY = 8;

/** Profondeur de l'historique « mes 12 derniers mois ». */
const HISTORY_MONTHS = 12;

/** Profondeur de la courbe de tendance admin. */
const TREND_MONTHS = 6;

/** Nombre de tâches ouvertes remontées dans `me.tasks.open`. */
const OPEN_TASKS_LIMIT = 8;

/** Nombre de projets dans `admin.hours.topProjects`. */
const TOP_PROJECTS_LIMIT = 5;

/** Libellé imposé par le contrat pour une saisie sans projet. */
const UNASSIGNED_PROJECT_NAME = 'Unassigned';

/**
 * Services amont dont la panne dégrade la réponse.
 *
 * Pas de `health` ici : le bandeau de santé ne peut PAS échouer globalement —
 * `checkServices()` rattrape chaque sonde individuellement et renvoie
 * `status: 'down'` (ou `'skipped'`) pour la cible muette. Le signal de panne
 * d'un service est donc son propre statut dans `admin.services`, bien plus
 * précis qu'un drapeau global qui n'était de toute façon jamais levé.
 */
export type DegradedUpstream = 'auth' | 'projects' | 'timesheets';

/** Ordre stable de sortie du tableau `degraded`. */
const DEGRADED_ORDER: DegradedUpstream[] = ['auth', 'projects', 'timesheets'];

// ── Forme de la réponse (contrat B1) ───────────────────────────────────────

export interface MonthKey {
  year: number;
  month: number;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface ProjectShare {
  projectId: string | null;
  projectName: string;
  hours: number;
  share: number;
}

export interface MyPeriod {
  status: PeriodStatus;
  totalHours: number;
  workHours: number;
  totalDays: number;
  holidayDays: number;
  filledDays: number;
  entriesCount: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  canSubmit: boolean;
  canRecall: boolean;
  canDownload: boolean;
  reviewers: NamedRef[];
}

export interface MyHistoryEntry {
  year: number;
  month: number;
  status: PeriodStatus;
  totalHours: number;
  totalDays: number;
}

export interface OpenTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress';
  projectId: string;
  projectName: string;
}

export interface TaskCounts {
  todo: number;
  in_progress: number;
  done: number;
  total: number;
}

export interface MyTasks extends TaskCounts {
  open: OpenTask[];
}

export interface DashboardMe {
  period: MyPeriod;
  history: MyHistoryEntry[];
  hoursByProject: ProjectShare[];
  tasks: MyTasks;
  projectsCount: number;
}

export interface PendingItem {
  periodId: string;
  userId: string;
  userName: string;
  jobTitle: string | null;
  year: number;
  month: number;
  totalHours: number;
  totalDays: number;
  submittedAt: string | null;
}

export interface ComplianceRow {
  userId: string;
  name: string;
  status: PeriodStatus;
  totalHours: number;
  filledDays: number;
}

export interface DashboardManager {
  pending: {
    count: number;
    oldestSubmittedAt: string | null;
    items: PendingItem[];
  };
  reviewedThisMonth: { approved: number; rejected: number };
  team: {
    size: number;
    hours: number;
    avgHours: number;
    compliance: ComplianceRow[];
  };
}

export interface DashboardAdmin {
  users: {
    total: number;
    /**
     * Décomptes PAR APPARTENANCE au tableau `roles` : un utilisateur
     * multi-rôles est compté dans chaque seau qui le concerne, donc
     * `admins + responsables + collaborateurs >= total`. Ne pas s'en servir
     * pour reconstituer une répartition exclusive.
     */
    admins: number;
    responsables: number;
    collaborateurs: number;
    newThisMonth: number;
    withoutResponsable: NamedRef[];
  };
  projects: {
    total: number;
    withoutAssignees: number;
    withoutTasks: number;
    newThisMonth: number;
  };
  tasks: TaskCounts;
  validation: {
    not_validated: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  hours: {
    total: number;
    byProject: ProjectShare[];
    trend: { year: number; month: number; hours: number }[];
    topProjects: ProjectShare[];
  };
  services: ServiceHealth[];
}

export interface DashboardResponse {
  generatedAt: string;
  period: MonthKey;
  role: 'admin' | 'responsable' | 'collaborateur';
  flags: { isAdmin: boolean; isManager: boolean };
  me: DashboardMe;
  manager: DashboardManager | null;
  admin: DashboardAdmin | null;
  degraded: DegradedUpstream[];
}

// ── Petits utilitaires ─────────────────────────────────────────────────────

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Postgres renvoie les numériques en chaîne : on force le typage partout. */
function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Les parts sont des flottants 0..1 arrondis à 4 décimales. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isValidPeriod(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2000 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  );
}

function monthKeyString(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function monthParam(key: MonthKey): string {
  return monthKeyString(key.year, key.month);
}

function addMonths(key: MonthKey, delta: number): MonthKey {
  const index = key.year * 12 + (key.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Suite croissante de mois, bornes incluses. */
function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = from;
  const last = to.year * 12 + (to.month - 1);
  while (cursor.year * 12 + (cursor.month - 1) <= last) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/**
 * `2026-08-01T01:00:00+02:00` → `2026-08` dans le calendrier LOCAL du process.
 *
 * Le mois demandé vient de `new Date().getMonth()`, donc du calendrier local ;
 * il faut ranger les horodatages amont dans ce même calendrier, sinon les deux
 * ne parlent pas du même « mois ». Prendre le mois UTC de la chaîne ISO faisait
 * sortir de août une validation du 2026-08-01 01:00 (heure de Paris), qui se
 * sérialise en `2026-07-31T23:00:00.000Z`.
 *
 * HYPOTHÈSE assumée : `submitted_at` / `reviewed_at` / `created_at` sont des
 * `timestamp without time zone`, matérialisés par node-postgres dans le fuseau
 * du process amont puis re-sérialisés par `toISOString()`. Les services et la
 * base tournent donc dans le même fuseau — c'est déjà ce que suppose tout le
 * système en stockant des `timestamp` sans fuseau. Si un jour ces colonnes
 * passent en `timestamptz`, cette fonction reste juste : elle rebascule
 * simplement l'instant réel dans le calendrier de l'utilisateur du rapport.
 *
 * Une date seule (`2026-08-01`, sans partie horaire) est prise telle quelle :
 * `new Date()` la lirait à minuit UTC, ce qui la ferait changer de mois dans
 * tous les fuseaux à décalage négatif.
 */
function localMonthOfIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dateOnly = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso.trim());
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return monthKeyString(parsed.getFullYear(), parsed.getMonth() + 1);
}

function rolesOf(user: DirectoryUser | undefined): UserRole[] {
  if (!user) return [];
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  return user.role ? [user.role] : [];
}

/**
 * Rôles effectifs d'un utilisateur d'annuaire, tous retenus.
 *
 * Un annuaire muet sur les rôles (`roles` vide ET `role` absent) est traité
 * comme `collaborateur` : c'est le rôle par défaut du système, et l'utilisateur
 * doit rester comptabilisé quelque part.
 */
function effectiveRolesOf(user: DirectoryUser): UserRole[] {
  const roles = rolesOf(user);
  return roles.length > 0 ? roles : [UserRole.COLLABORATEUR];
}

function displayName(
  user: DirectoryUser | undefined,
  fallback: string,
): string {
  if (!user) return fallback;
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email || fallback;
}

/**
 * Compose le tableau de bord à partir des données amont vivantes. Chaque
 * section est indépendamment tolérante aux pannes : un service mort dégrade la
 * section concernée et n'empêche jamais la réponse 200.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly upstream: UpstreamService) {}

  async getDashboard(
    user: RequestUser,
    rawYear?: string,
    rawMonth?: string,
  ): Promise<DashboardResponse> {
    const period = DashboardService.resolvePeriod(rawYear, rawMonth);
    const degraded = new Set<DegradedUpstream>();

    // Une seule fenêtre de 12 mois finissant sur le mois demandé : elle couvre
    // à la fois l'historique (12 mois) et la tendance (6 mois), donc un seul
    // aller-retour vers timesheet-service.
    const windowStart = addMonths(period, -(HISTORY_MONTHS - 1));
    const from = monthParam(windowStart);
    const to = monthParam(period);

    const [usersResult, hoursResult, periodsResult, myPeriodResult] =
      await Promise.allSettled([
        this.upstream.getUsers(user.token),
        this.upstream.getHoursStats(
          user.token,
          user.userId,
          user.role,
          from,
          to,
        ),
        this.upstream.getPeriodStats(
          user.token,
          user.userId,
          user.role,
          from,
          to,
        ),
        // `me.period` décrit UN mois pour UN utilisateur : c'est exactement ce
        // que sert /timesheets/periods/me, la vue de référence du service qui
        // détient la règle. Les agrégats /stats/* restent utilisés pour
        // `me.history` et `me.hoursByProject` (plusieurs mois, plusieurs
        // projets), mais ils ne savent pas répondre ici : ils n'exposent pas le
        // motif de refus, ne portent pas les droits canSubmit/canRecall/
        // canDownload, et leur `filledDays` est compté par projet — une journée
        // partagée entre deux projets y serait comptée deux fois.
        this.upstream.getMyPeriod(
          user.token,
          user.userId,
          period.year,
          period.month,
        ),
      ]);

    // `directoryTrusted` = l'annuaire vient d'être lu avec succès. Un annuaire
    // servi depuis le cache après une panne (ou un jeton refusé) reste
    // exploitable pour afficher des noms, mais ne fait plus autorité : aucune
    // décision de droits ne s'appuie dessus, et la réponse est dégradée.
    let users: DirectoryUser[] = [];
    let directoryTrusted = false;
    if (usersResult.status === 'fulfilled') {
      users = usersResult.value.users;
      directoryTrusted = !usersResult.value.stale;
      if (usersResult.value.stale) {
        degraded.add('auth');
        this.logger.warn(
          'auth-service indisponible : annuaire servi depuis le cache (données périmées)',
        );
      }
    } else {
      degraded.add('auth');
      this.logger.warn(
        `auth-service indisponible : ${String(usersResult.reason?.message ?? usersResult.reason)}`,
      );
    }

    let hoursRows: StatsHoursRow[] = [];
    let userMonths: StatsUserMonthRow[] = [];
    if (hoursResult.status === 'fulfilled') {
      hoursRows = hoursResult.value.rows;
      userMonths = hoursResult.value.userMonths;
    } else {
      degraded.add('timesheets');
      this.logger.warn(
        `timesheet-service (heures) indisponible : ${String(hoursResult.reason?.message ?? hoursResult.reason)}`,
      );
    }

    let periodRows: StatsPeriodRow[] = [];
    if (periodsResult.status === 'fulfilled') {
      periodRows = periodsResult.value.rows;
    } else {
      degraded.add('timesheets');
      this.logger.warn(
        `timesheet-service (périodes) indisponible : ${String(periodsResult.reason?.message ?? periodsResult.reason)}`,
      );
    }

    let myPeriodView: UpstreamPeriodView | null = null;
    if (myPeriodResult.status === 'fulfilled') {
      myPeriodView = myPeriodResult.value;
    } else {
      degraded.add('timesheets');
      this.logger.warn(
        `timesheet-service (ma période) indisponible : ${String(myPeriodResult.reason?.message ?? myPeriodResult.reason)}`,
      );
    }

    const usersById = new Map(users.map((u) => [u.id, u]));
    // Recherche annuaire TOUJOURS clefée sur l'identifiant de l'appelant : on
    // ne regarde jamais un autre enregistrement que le sien.
    const me = usersById.get(user.userId);
    const myRoles = rolesOf(me);

    // Triple condition volontaire, toutes obligatoires :
    //   1. le rôle porté par le jeton — dont VerifiedUserGuard a vérifié la
    //      signature ici même, sans faire confiance à `x-user-role` — dit
    //      « admin ». Nécessaire, jamais suffisant : un jeton reste une photo
    //      prise à la connexion, le rôle a pu être retiré depuis ;
    //   2. l'enregistrement d'annuaire de CET appelant existe et son tableau
    //      `roles` contient bien `admin` ;
    //   3. cet annuaire est frais. Un annuaire dégradé (auth-service muet,
    //      jeton refusé, cache périmé) ne prouve plus rien : il refuse le
    //      privilège au lieu de le confirmer.
    // Conséquence voulue : une panne annuaire donne `admin: null` + `auth`
    // dans `degraded`, jamais une section admin peuplée.
    const isAdmin =
      user.role === UserRole.ADMIN &&
      directoryTrusted &&
      me !== undefined &&
      me.id === user.userId &&
      myRoles.includes(UserRole.ADMIN);

    const managedIds = users
      .filter(
        (u) =>
          u.id !== user.userId &&
          Array.isArray(u.responsableIds) &&
          u.responsableIds.includes(user.userId),
      )
      .map((u) => u.id);

    const isManager =
      isAdmin || myRoles.includes(UserRole.RESPONSABLE) || managedIds.length > 0;

    // Le rôle admin n'est demandé à project-service / timesheet-service que
    // s'il a été confirmé ci-dessus ; sinon l'appel part sous l'identité réelle
    // de l'appelant.
    //
    // La file de validation se lit sur /timesheets/periods/review, qui n'est
    // borné par AUCUNE fenêtre de mois : une feuille en attente reste en
    // attente, qu'on consulte janvier ou décembre. Elle n'est demandée que pour
    // un valideur.
    const [projectsResult, pendingResult, decidedResult] =
      await Promise.allSettled([
        this.upstream.getProjects(user.token, user.userId, isAdmin),
        isManager
          ? this.upstream.getPeriodsForReview(
              user.token,
              user.userId,
              isAdmin,
              ['pending'],
            )
          : Promise.resolve<UpstreamPeriodView[]>([]),
        isManager
          ? this.upstream.getPeriodsForReview(
              user.token,
              user.userId,
              isAdmin,
              ['approved', 'rejected'],
            )
          : Promise.resolve<UpstreamPeriodView[]>([]),
      ]);

    let projects: UpstreamProject[] = [];
    if (projectsResult.status === 'fulfilled') {
      projects = projectsResult.value;
    } else {
      degraded.add('projects');
      this.logger.warn(
        `project-service indisponible : ${String(projectsResult.reason?.message ?? projectsResult.reason)}`,
      );
    }

    // `null` = file indisponible → repli sur les lignes fenêtrées, forcément
    // partiel, et « timesheets » marqué dégradé.
    let reviewPending: UpstreamPeriodView[] | null = null;
    let reviewDecided: UpstreamPeriodView[] | null = null;
    if (isManager) {
      if (pendingResult.status === 'fulfilled') {
        reviewPending = pendingResult.value;
      } else {
        degraded.add('timesheets');
        this.logger.warn(
          `timesheet-service (file de validation) indisponible : ${String(pendingResult.reason?.message ?? pendingResult.reason)}`,
        );
      }
      if (decidedResult.status === 'fulfilled') {
        reviewDecided = decidedResult.value;
      } else {
        degraded.add('timesheets');
        this.logger.warn(
          `timesheet-service (validations traitées) indisponible : ${String(decidedResult.reason?.message ?? decidedResult.reason)}`,
        );
      }
    }

    const projectNames = new Map(projects.map((p) => [p.id, p.name]));

    const meSection = DashboardService.buildMe(
      user.userId,
      me,
      usersById,
      period,
      hoursRows,
      userMonths,
      periodRows,
      myPeriodView,
      projects,
      projectNames,
    );

    const managerSection = isManager
      ? DashboardService.buildManager(
          user.userId,
          isAdmin,
          users,
          usersById,
          managedIds,
          period,
          userMonths,
          periodRows,
          reviewPending,
          reviewDecided,
        )
      : null;

    let adminSection: DashboardAdmin | null = null;
    if (isAdmin) {
      // `checkServices()` ne rejette pas : chaque sonde est rattrapée sur place
      // et ressort en `down` / `skipped`. Le try/catch reste par prudence (une
      // panne du bandeau ne doit pas faire tomber tout le tableau de bord) mais
      // ne lève AUCUN drapeau global : le statut par service est le vrai signal.
      let services: ServiceHealth[] = [];
      try {
        services = await this.upstream.checkServices();
      } catch (error: any) {
        this.logger.warn(`bandeau de santé indisponible : ${error?.message}`);
      }
      adminSection = DashboardService.buildAdmin(
        users,
        period,
        hoursRows,
        userMonths,
        periodRows,
        projects,
        projectNames,
        services,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      period,
      role: isAdmin ? 'admin' : isManager ? 'responsable' : 'collaborateur',
      flags: { isAdmin, isManager },
      me: meSection,
      manager: managerSection,
      admin: adminSection,
      degraded: DEGRADED_ORDER.filter((name) => degraded.has(name)),
    };
  }

  // ── Paramètres ───────────────────────────────────────────────────────────

  private static resolvePeriod(
    rawYear?: string,
    rawMonth?: string,
  ): MonthKey {
    const now = new Date();
    const year =
      rawYear === undefined || rawYear === ''
        ? now.getFullYear()
        : Number(rawYear);
    const month =
      rawMonth === undefined || rawMonth === ''
        ? now.getMonth() + 1
        : Number(rawMonth);

    if (!isValidPeriod(year, month)) {
      throw new BadRequestException(
        'Période invalide : année (2000-2100) et mois (1-12) requis.',
      );
    }
    return { year, month };
  }

  // ── Agrégations partagées ────────────────────────────────────────────────

  private static rowsFor(
    rows: StatsHoursRow[],
    key: MonthKey,
    userId?: string,
  ): StatsHoursRow[] {
    return rows.filter(
      (r) =>
        r.year === key.year &&
        r.month === key.month &&
        (userId === undefined || r.userId === userId),
    );
  }

  /**
   * La ligne (utilisateur, mois) de `userMonths`, ou `undefined` si le mois est
   * vide. On ne cherche JAMAIS ces grandeurs dans `rows` : celles-ci sont
   * groupées par projet, et `filledDays` y est un COUNT(DISTINCT date) par
   * projet — les sommer compte deux fois une journée répartie sur deux projets.
   */
  private static userMonthFor(
    userMonths: StatsUserMonthRow[],
    key: MonthKey,
    userId: string,
  ): StatsUserMonthRow | undefined {
    return userMonths.find(
      (row) =>
        row.userId === userId &&
        row.year === key.year &&
        row.month === key.month,
    );
  }

  /** Toutes les lignes (utilisateur, mois) d'un mois donné, tous users. */
  private static userMonthsOf(
    userMonths: StatsUserMonthRow[],
    key: MonthKey,
  ): StatsUserMonthRow[] {
    return userMonths.filter(
      (row) => row.year === key.year && row.month === key.month,
    );
  }

  /**
   * Projette une ligne `userMonths` sur le vocabulaire du tableau de bord.
   * Aucune addition n'est faite ici : la ligne EST déjà l'agrégat du mois pour
   * cet utilisateur, tous projets confondus.
   */
  private static summarizeUserMonth(row: StatsUserMonthRow | undefined) {
    const totalHours = round2(num(row?.hours));
    return {
      totalHours,
      workHours: round2(num(row?.workHours)),
      totalDays: round2(totalHours / HOURS_PER_DAY),
      holidayDays: Math.round(num(row?.holidayDays)),
      filledDays: Math.round(num(row?.filledDays)),
      entriesCount: Math.round(num(row?.entries)),
    };
  }

  /** Somme d'heures sur un ensemble de lignes (utilisateur, mois). */
  private static sumUserMonthHours(rows: StatsUserMonthRow[]): number {
    return round2(rows.reduce((sum, row) => sum + num(row.hours), 0));
  }

  private static projectLabel(
    projectId: string | null,
    names: Map<string, string>,
  ): string {
    if (!projectId) return UNASSIGNED_PROJECT_NAME;
    // project-service muet : on garde un libellé lisible plutôt qu'un vide.
    return names.get(projectId) ?? `Projet ${projectId.slice(0, 8)}`;
  }

  /** Regroupe par projet, calcule les parts et trie par heures décroissantes. */
  private static byProject(
    rows: StatsHoursRow[],
    names: Map<string, string>,
  ): ProjectShare[] {
    const buckets = new Map<string, { projectId: string | null; hours: number }>();
    for (const row of rows) {
      const projectId = row.projectId ?? null;
      const key = projectId ?? '__unassigned__';
      const bucket = buckets.get(key) ?? { projectId, hours: 0 };
      bucket.hours += num(row.hours);
      buckets.set(key, bucket);
    }

    const total = Array.from(buckets.values()).reduce(
      (sum, bucket) => sum + bucket.hours,
      0,
    );

    return Array.from(buckets.values())
      .map((bucket) => ({
        projectId: bucket.projectId,
        projectName: DashboardService.projectLabel(bucket.projectId, names),
        hours: round2(bucket.hours),
        share: total > 0 ? round4(bucket.hours / total) : 0,
      }))
      .sort((a, b) => b.hours - a.hours);
  }

  private static countTasks(tasks: UpstreamTask[]): TaskCounts {
    const counts: TaskCounts = {
      todo: 0,
      in_progress: 0,
      done: 0,
      total: tasks.length,
    };
    for (const task of tasks) {
      if (task.status === 'todo') counts.todo += 1;
      else if (task.status === 'in_progress') counts.in_progress += 1;
      else if (task.status === 'done') counts.done += 1;
    }
    return counts;
  }

  /** Toutes les tâches des projets, éventuellement filtrées sur un assigné. */
  private static collectTasks(
    projects: UpstreamProject[],
    assigneeId: string | null,
  ): { task: UpstreamTask; project: UpstreamProject }[] {
    const collected: { task: UpstreamTask; project: UpstreamProject }[] = [];
    for (const project of projects) {
      for (const task of project.tasks ?? []) {
        if (assigneeId) {
          const assignees = task.assignees ?? [];
          if (!assignees.some((a) => a.userId === assigneeId)) continue;
        }
        collected.push({ task, project });
      }
    }
    return collected;
  }

  private static isOpenStatus(
    status: UpstreamTaskStatus,
  ): status is 'todo' | 'in_progress' {
    return status === 'todo' || status === 'in_progress';
  }

  private static periodIndex(
    rows: StatsPeriodRow[],
  ): Map<string, StatsPeriodRow> {
    const index = new Map<string, StatsPeriodRow>();
    for (const row of rows) {
      index.set(`${row.userId}|${monthKeyString(row.year, row.month)}`, row);
    }
    return index;
  }

  // ── Section « me » (toujours présente, admins compris) ───────────────────

  /** L'amont sérialise ses `Date` en ISO ; tout le reste devient null. */
  private static isoOrNull(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
  }

  private static asPeriodStatus(value: unknown): PeriodStatus {
    return value === 'pending' || value === 'approved' || value === 'rejected'
      ? value
      : 'not_validated';
  }

  /**
   * Projette la `PeriodView` amont sur le contrat du tableau de bord. Aucun
   * calcul ici : les heures, les compteurs, les droits et le motif de refus
   * sont ceux de timesheet-service, seul le nommage des champs est adapté.
   */
  private static periodFromView(view: UpstreamPeriodView): MyPeriod {
    return {
      status: DashboardService.asPeriodStatus(view.status),
      totalHours: round2(num(view.totalHours)),
      workHours: round2(num(view.workHours)),
      totalDays: round2(num(view.totalDays)),
      holidayDays: Math.round(num(view.holidayDays)),
      filledDays: Math.round(num(view.filledDays)),
      entriesCount: Math.round(num(view.entriesCount)),
      submittedAt: DashboardService.isoOrNull(view.submittedAt),
      reviewedAt: DashboardService.isoOrNull(view.reviewedAt),
      reviewComment:
        typeof view.reviewComment === 'string' && view.reviewComment !== ''
          ? view.reviewComment
          : null,
      canSubmit: view.canSubmit === true,
      canRecall: view.canRecall === true,
      canDownload: view.canDownload === true,
      reviewers: (Array.isArray(view.reviewers) ? view.reviewers : []).map(
        (reviewer) => ({
          id: reviewer.id,
          name: reviewer.name || reviewer.id,
        }),
      ),
    };
  }

  /**
   * Repli quand /timesheets/periods/me est muet : on redérive ce qu'on peut
   * depuis les agrégats. `reviewComment` reste null (les agrégats ne le
   * portent pas), mais les compteurs sont justes : ils viennent de la ligne
   * `userMonths` du mois, où `filledDays` est déjà dédoublonné côté SQL.
   */
  private static periodFromStats(
    currentUserMonth: StatsUserMonthRow | undefined,
    currentPeriod: StatsPeriodRow | undefined,
    directoryUser: DirectoryUser | undefined,
    usersById: Map<string, DirectoryUser>,
  ): MyPeriod {
    const summary = DashboardService.summarizeUserMonth(currentUserMonth);
    const status: PeriodStatus = currentPeriod?.status ?? 'not_validated';
    const locked = status === 'pending' || status === 'approved';

    return {
      status,
      totalHours: summary.totalHours,
      workHours: summary.workHours,
      totalDays: summary.totalDays,
      holidayDays: summary.holidayDays,
      filledDays: summary.filledDays,
      entriesCount: summary.entriesCount,
      submittedAt: currentPeriod?.submittedAt ?? null,
      reviewedAt: currentPeriod?.reviewedAt ?? null,
      reviewComment: null,
      canSubmit: !locked && summary.entriesCount > 0,
      canRecall: status === 'pending',
      canDownload: status === 'approved',
      reviewers: (directoryUser?.responsableIds ?? []).map((id) => ({
        id,
        name: displayName(usersById.get(id), id),
      })),
    };
  }

  private static buildMe(
    userId: string,
    directoryUser: DirectoryUser | undefined,
    usersById: Map<string, DirectoryUser>,
    period: MonthKey,
    hoursRows: StatsHoursRow[],
    userMonths: StatsUserMonthRow[],
    periodRows: StatsPeriodRow[],
    myPeriodView: UpstreamPeriodView | null,
    projects: UpstreamProject[],
    projectNames: Map<string, string>,
  ): DashboardMe {
    const myHours = hoursRows.filter((r) => r.userId === userId);
    const myPeriods = periodRows.filter((r) => r.userId === userId);
    const periodsByMonth = DashboardService.periodIndex(myPeriods);

    // `currentRows` ne sert QUE à la ventilation par projet ci-dessous ; tous
    // les compteurs du mois se lisent sur `userMonths`.
    const currentRows = DashboardService.rowsFor(myHours, period);
    const currentUserMonth = DashboardService.userMonthFor(
      userMonths,
      period,
      userId,
    );
    const currentPeriod = periodsByMonth.get(
      `${userId}|${monthParam(period)}`,
    );

    // `me.period` est la vue de validation d'un seul mois pour l'appelant :
    // elle est lue sur /timesheets/periods/me, l'endpoint nominatif du service
    // qui détient la règle métier, et non recomposée depuis /timesheets/stats/*.
    // Les agrégats ne portent ni le motif de refus (reviewComment), ni les
    // droits canSubmit / canRecall / canDownload, et leur `filledDays` est
    // compté par projet : une journée répartie sur deux projets y compte
    // double. L'historique et la répartition par projet, eux, restent sur les
    // agrégats — c'est le bon outil pour un cumul multi-mois.
    // Si l'endpoint est muet, on retombe sur les valeurs dérivées ci-dessous et
    // « timesheets » est marqué dégradé par l'appelant.
    const myPeriod: MyPeriod =
      myPeriodView !== null
        ? DashboardService.periodFromView(myPeriodView)
        : DashboardService.periodFromStats(
            currentUserMonth,
            currentPeriod,
            directoryUser,
            usersById,
          );

    // Historique : 12 mois finissant sur le mois demandé, du plus récent au
    // plus ancien, en ne gardant que les mois réellement renseignés.
    const history: MyHistoryEntry[] = [];
    const months = monthsBetween(
      addMonths(period, -(HISTORY_MONTHS - 1)),
      period,
    );
    for (const month of months.slice().reverse()) {
      const monthHours = DashboardService.userMonthFor(
        userMonths,
        month,
        userId,
      );
      const row = periodsByMonth.get(`${userId}|${monthParam(month)}`);
      if (!monthHours && !row) continue;
      const monthSummary = DashboardService.summarizeUserMonth(monthHours);
      history.push({
        year: month.year,
        month: month.month,
        status: row?.status ?? 'not_validated',
        totalHours: monthSummary.totalHours,
        totalDays: monthSummary.totalDays,
      });
    }

    const myTasks = DashboardService.collectTasks(projects, userId);
    const counts = DashboardService.countTasks(myTasks.map((t) => t.task));
    const open = myTasks
      .filter((entry) => DashboardService.isOpenStatus(entry.task.status))
      .sort((a, b) => {
        if (a.task.status !== b.task.status) {
          return a.task.status === 'in_progress' ? -1 : 1;
        }
        return a.task.title.localeCompare(b.task.title);
      })
      .slice(0, OPEN_TASKS_LIMIT)
      .map((entry) => ({
        id: entry.task.id,
        title: entry.task.title,
        status: entry.task.status as 'todo' | 'in_progress',
        projectId: entry.task.projectId ?? entry.project.id,
        projectName: entry.project.name,
      }));

    // project-service peut renvoyer tous les projets à un admin : on ne compte
    // ici que ceux où l'utilisateur est réellement partie prenante.
    const projectsCount = projects.filter(
      (p) =>
        p.createdBy === userId ||
        (p.assignments ?? []).some((a) => a.userId === userId),
    ).length;

    return {
      period: myPeriod,
      history,
      hoursByProject: DashboardService.byProject(currentRows, projectNames),
      tasks: { ...counts, open },
      projectsCount,
    };
  }

  // ── Section « manager » ──────────────────────────────────────────────────

  /** Projette une `PeriodView` amont sur la ligne de file d'attente du contrat. */
  private static pendingFromView(view: UpstreamPeriodView): PendingItem {
    const owner = view.owner;
    const ownerId = owner?.id ?? '';
    return {
      periodId: view.id ?? '',
      userId: ownerId,
      userName: owner?.name || ownerId,
      jobTitle: owner?.jobTitle ?? null,
      year: Math.round(num(view.year)),
      month: Math.round(num(view.month)),
      totalHours: round2(num(view.totalHours)),
      totalDays: round2(num(view.totalDays)),
      submittedAt: DashboardService.isoOrNull(view.submittedAt),
    };
  }

  /** Les plus anciennes demandes d'abord : c'est une file d'attente. */
  private static byOldestSubmission(
    this: void,
    a: PendingItem,
    b: PendingItem,
  ): number {
    if (!a.submittedAt) return 1;
    if (!b.submittedAt) return -1;
    return a.submittedAt.localeCompare(b.submittedAt);
  }

  private static buildManager(
    userId: string,
    isAdmin: boolean,
    users: DirectoryUser[],
    usersById: Map<string, DirectoryUser>,
    managedIds: string[],
    period: MonthKey,
    userMonths: StatsUserMonthRow[],
    periodRows: StatsPeriodRow[],
    reviewPending: UpstreamPeriodView[] | null,
    reviewDecided: UpstreamPeriodView[] | null,
  ): DashboardManager {
    // Un admin peut valider n'importe quelle feuille : son « équipe » est donc
    // l'ensemble des utilisateurs, lui excepté. Un responsable ne voit que les
    // collaborateurs qui le déclarent comme responsable.
    const scopeIds = isAdmin
      ? users.filter((u) => u.id !== userId).map((u) => u.id)
      : managedIds;
    const scope = new Set(scopeIds);
    const requestedMonth = monthParam(period);

    // ── File d'attente : NON bornée dans le temps ──
    // Elle vient de /timesheets/periods/review, qui applique déjà les règles de
    // visibilité du valideur. La dériver des lignes /stats/* était faux par
    // construction : celles-ci s'arrêtent à la fenêtre de 12 mois finissant sur
    // le mois consulté, si bien qu'un responsable qui regardait février 2026
    // voyait « 0 en attente » alors qu'une feuille de juillet 2026 l'attendait.
    // Un mois consulté n'a rien à voir avec l'ancienneté d'une demande.
    const pendingItems: PendingItem[] =
      reviewPending !== null
        ? reviewPending
            .map((view) => DashboardService.pendingFromView(view))
            .sort(DashboardService.byOldestSubmission)
        : // Repli (endpoint muet) : forcément partiel, borné à la fenêtre.
          periodRows
            .filter((row) => row.status === 'pending' && scope.has(row.userId))
            .map((row) => {
              const summary = DashboardService.summarizeUserMonth(
                DashboardService.userMonthFor(userMonths, row, row.userId),
              );
              const owner = usersById.get(row.userId);
              return {
                periodId: row.id,
                userId: row.userId,
                userName: displayName(owner, row.userId),
                jobTitle: owner?.jobTitle ?? null,
                year: row.year,
                month: row.month,
                totalHours: summary.totalHours,
                totalDays: summary.totalDays,
                submittedAt: row.submittedAt ?? null,
              };
            })
            .sort(DashboardService.byOldestSubmission);

    const submittedDates = pendingItems
      .map((item) => item.submittedAt)
      .filter((value): value is string => value !== null);

    // ── Traité ce mois-ci ──
    // Même source non bornée : une décision prise ce mois-ci peut porter sur
    // une feuille de n'importe quel mois. Le tri se fait donc sur `reviewedAt`,
    // rangé dans le calendrier local (cf. localMonthOfIso).
    let approved = 0;
    let rejected = 0;
    if (reviewDecided !== null) {
      for (const view of reviewDecided) {
        const reviewedAt = DashboardService.isoOrNull(view.reviewedAt);
        if (localMonthOfIso(reviewedAt) !== requestedMonth) continue;
        if (view.status === 'approved') approved += 1;
        else if (view.status === 'rejected') rejected += 1;
      }
    } else {
      for (const row of periodRows) {
        if (!scope.has(row.userId)) continue;
        if (localMonthOfIso(row.reviewedAt) !== requestedMonth) continue;
        if (row.status === 'approved') approved += 1;
        else if (row.status === 'rejected') rejected += 1;
      }
    }

    // ── Conformité de l'équipe ──
    // Celle-ci EST mensuelle par nature (« qui a rempli le mois consulté ? ») :
    // elle reste donc sur les agrégats fenêtrés, lus sur `userMonths` pour que
    // `filledDays` soit le vrai nombre de journées distinctes.
    const periodsByMonth = DashboardService.periodIndex(periodRows);
    let teamHours = 0;
    const compliance: ComplianceRow[] = scopeIds.map((id) => {
      const summary = DashboardService.summarizeUserMonth(
        DashboardService.userMonthFor(userMonths, period, id),
      );
      teamHours += summary.totalHours;
      return {
        userId: id,
        name: displayName(usersById.get(id), id),
        status:
          periodsByMonth.get(`${id}|${requestedMonth}`)?.status ??
          'not_validated',
        totalHours: summary.totalHours,
        filledDays: summary.filledDays,
      };
    });
    compliance.sort((a, b) => a.name.localeCompare(b.name));

    const size = scopeIds.length;
    return {
      pending: {
        count: pendingItems.length,
        oldestSubmittedAt: submittedDates.length > 0 ? submittedDates[0] : null,
        items: pendingItems,
      },
      reviewedThisMonth: { approved, rejected },
      team: {
        size,
        hours: round2(teamHours),
        avgHours: size > 0 ? round2(teamHours / size) : 0,
        compliance,
      },
    };
  }

  // ── Section « admin » (jamais servie à un non-admin) ─────────────────────

  private static buildAdmin(
    users: DirectoryUser[],
    period: MonthKey,
    hoursRows: StatsHoursRow[],
    userMonths: StatsUserMonthRow[],
    periodRows: StatsPeriodRow[],
    projects: UpstreamProject[],
    projectNames: Map<string, string>,
    services: ServiceHealth[],
  ): DashboardAdmin {
    const requestedMonth = monthParam(period);

    // ── Utilisateurs ──
    // ATTENTION : ces trois compteurs se lisent PAR APPARTENANCE au tableau
    // `roles`, pas par « rôle principal ». Un même utilisateur peut donc être
    // compté dans plusieurs seaux — quelqu'un qui est à la fois collaborateur
    // et responsable incrémente les deux — et `admins + responsables +
    // collaborateurs` NE VAUT PAS `total`. C'est voulu : le décompte par rôle
    // principal renvoyait `responsables: 0` alors que des responsables
    // existaient (leur rôle principal restait `collaborateur`, premier élément
    // du tableau), et la même réponse annonçait pourtant `role:
    // 'responsable'` pour l'un d'eux — elle se contredisait.
    let admins = 0;
    let responsables = 0;
    let collaborateurs = 0;
    let newUsersThisMonth = 0;
    const withoutResponsable: NamedRef[] = [];

    for (const user of users) {
      const roles = effectiveRolesOf(user);
      const isUserAdmin = roles.includes(UserRole.ADMIN);
      if (isUserAdmin) admins += 1;
      if (roles.includes(UserRole.RESPONSABLE)) responsables += 1;
      if (roles.includes(UserRole.COLLABORATEUR)) collaborateurs += 1;

      // Calendrier local, comme le mois demandé (cf. localMonthOfIso) : un
      // compte créé le 1er du mois à 01:00 à Paris appartient bien à ce mois.
      if (localMonthOfIso(user.createdAt) === requestedMonth) {
        newUsersThisMonth += 1;
      }

      // Un admin n'est pas tenu d'avoir un responsable désigné.
      const responsableIds = Array.isArray(user.responsableIds)
        ? user.responsableIds
        : [];
      if (!isUserAdmin && responsableIds.length === 0) {
        withoutResponsable.push({
          id: user.id,
          name: displayName(user, user.id),
        });
      }
    }

    // ── Projets & tâches ──
    let withoutAssignees = 0;
    let withoutTasks = 0;
    let newProjectsThisMonth = 0;
    for (const project of projects) {
      if ((project.assignments ?? []).length === 0) withoutAssignees += 1;
      if ((project.tasks ?? []).length === 0) withoutTasks += 1;
      if (localMonthOfIso(project.createdAt) === requestedMonth) {
        newProjectsThisMonth += 1;
      }
    }
    const taskCounts = DashboardService.countTasks(
      DashboardService.collectTasks(projects, null).map((t) => t.task),
    );

    // ── Validation du mois demandé, sur tout le périmètre admin ──
    const periodsByMonth = DashboardService.periodIndex(periodRows);
    const validation = {
      not_validated: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    if (users.length > 0) {
      for (const user of users) {
        const status =
          periodsByMonth.get(`${user.id}|${requestedMonth}`)?.status ??
          'not_validated';
        validation[status] += 1;
      }
    } else {
      // Annuaire indisponible : on ne sait compter que les lignes existantes.
      for (const row of periodRows) {
        if (monthKeyString(row.year, row.month) !== requestedMonth) continue;
        validation[row.status] += 1;
      }
    }

    // ── Heures ──
    // Ventilation par projet : c'est le seul usage légitime des lignes `rows`,
    // qui sont justement groupées par projet. Les totaux, eux, se somment sur
    // `userMonths`, l'agrégat sans projet du même périmètre.
    const currentRows = DashboardService.rowsFor(hoursRows, period);
    const byProject = DashboardService.byProject(currentRows, projectNames);
    const total = DashboardService.sumUserMonthHours(
      DashboardService.userMonthsOf(userMonths, period),
    );

    // La tendance a toujours exactement 6 points, mois vides compris.
    const trend = monthsBetween(
      addMonths(period, -(TREND_MONTHS - 1)),
      period,
    ).map((month) => ({
      year: month.year,
      month: month.month,
      hours: DashboardService.sumUserMonthHours(
        DashboardService.userMonthsOf(userMonths, month),
      ),
    }));

    return {
      users: {
        total: users.length,
        admins,
        responsables,
        collaborateurs,
        newThisMonth: newUsersThisMonth,
        withoutResponsable,
      },
      projects: {
        total: projects.length,
        withoutAssignees,
        withoutTasks,
        newThisMonth: newProjectsThisMonth,
      },
      tasks: taskCounts,
      validation,
      hours: {
        total,
        byProject,
        trend,
        topProjects: byProject.slice(0, TOP_PROJECTS_LIMIT),
      },
      services,
    };
  }
}
