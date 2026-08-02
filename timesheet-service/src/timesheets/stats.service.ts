import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Timesheet } from '../entities/timesheet.entity';
import {
  TimesheetPeriod,
  TimesheetPeriodStatus,
} from '../entities/timesheet-period.entity';
import { RequestUser, UserRole } from '../common/request-user';
import { DirectoryService } from './directory.service';
import { isValidPeriod, monthRange } from './month-range';

/** Plage maximale acceptee, bornes incluses. */
export const MAX_STATS_RANGE_MONTHS = 24;

/** Portee de lecture : toujours calculee cote serveur, jamais fournie par le client. */
export type StatsScope = 'admin' | 'responsable' | 'self';

export interface StatsMonth {
  year: number;
  month: number;
}

/** Resultat du calcul de portee : `userIds === null` = aucun filtre (admin). */
export interface StatsAudience {
  scope: StatsScope;
  userIds: string[] | null;
}

export interface HoursStatsRow {
  userId: string;
  projectId: string | null;
  year: number;
  month: number;
  /** SUM(hours_spent), jours feries inclus. */
  hours: number;
  /** SUM(hours_spent) sur les seules lignes non feriees. */
  workHours: number;
  holidayDays: number;
  filledDays: number;
  entries: number;
}

/**
 * Agregat (utilisateur, annee, mois) SANS dimension projet.
 *
 * `filledDays` est un COUNT(DISTINCT date) : sommer les lignes par projet de
 * `rows` compte deux fois une journee repartie sur deux projets (4 h sur A +
 * 4 h sur B pendant 20 jours ouvres → 40 jours remplis au lieu de 20). Seul un
 * regroupement sans projet restitue la vraie valeur. Les consommateurs doivent
 * lire ici toute grandeur par utilisateur-mois, et reserver `rows` a la
 * ventilation par projet.
 */
export interface UserMonthStatsRow {
  userId: string;
  year: number;
  month: number;
  /** SUM(hours_spent), jours feries inclus. */
  hours: number;
  /** SUM(hours_spent) sur les seules lignes non feriees. */
  workHours: number;
  holidayDays: number;
  /** COUNT(DISTINCT date) sur l'utilisateur-mois entier, tous projets confondus. */
  filledDays: number;
  entries: number;
}

export interface HoursStatsResponse {
  scope: StatsScope;
  from: StatsMonth;
  to: StatsMonth;
  rows: HoursStatsRow[];
  userMonths: UserMonthStatsRow[];
}

export interface PeriodStatsRow {
  id: string;
  userId: string;
  year: number;
  month: number;
  status: TimesheetPeriodStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface PeriodStatsResponse {
  scope: StatsScope;
  rows: PeriodStatsRow[];
}

/** Ligne brute renvoyee par getRawMany() : Postgres serialise tout en chaine. */
interface RawHoursRow {
  userId: string;
  projectId: string | null;
  year: string;
  month: string;
  hours: string | null;
  workHours: string | null;
  holidayDays: string;
  filledDays: string;
  entries: string;
}

/** Idem, pour l'agregat sans dimension projet. */
type RawUserMonthRow = Omit<RawHoursRow, 'projectId'>;

/**
 * Agregats mensuels destines a reporting-service.
 *
 * Regle centrale : tout se calcule en SQL. Ces endpoints alimentent un tableau
 * de bord charge a chaque ouverture — charger les lignes de `timesheets` en
 * memoire pour les reduire en JS couterait bien trop cher a l'echelle d'un
 * admin (tous les collaborateurs, 24 mois).
 */
@Injectable()
export class TimesheetStatsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    @InjectRepository(TimesheetPeriod)
    private readonly periodRepository: Repository<TimesheetPeriod>,
    private readonly directory: DirectoryService,
  ) {}

  // ── Portee ───────────────────────────────────────────────────────────────

  /**
   * Qui le demandeur a-t-il le droit de voir ?
   *   admin       → tout le monde (aucun filtre)
   *   responsable → ses collaborateurs + lui-meme
   *   sinon       → lui-meme
   */
  private async resolveAudience(user: RequestUser): Promise<StatsAudience> {
    // SECURITE : le header d'identite n'a qu'une valeur NEGATIVE. Il peut
    // disqualifier une elevation de portee (le gateway, seule source d'identite,
    // annonce un role plus faible que celui demande) mais il ne l'accorde
    // jamais. Auparavant `user.role === ADMIN` court-circuitait l'annuaire : un
    // simple en-tete `user-role: admin` suffisait a obtenir `userIds: null`,
    // c'est-a-dire la suppression complete du filtre WHERE user_id IN (...) et
    // donc les heures de tout le monde.
    //
    // Toute elevation exige desormais une corroboration de l'annuaire
    // (auth-service), qui est la source de verite des roles.
    //
    // Annuaire injoignable : on laisse remonter la ServiceUnavailableException
    // de DirectoryService. Aucun repli silencieux vers la portee admin — le
    // consommateur doit marquer la section « degradee » plutot qu'afficher des
    // chiffres faux mais plausibles.
    const directoryUser = await this.directory.getUser(user.userId, user.token);

    const roles: UserRole[] = directoryUser
      ? Array.isArray(directoryUser.roles) && directoryUser.roles.length > 0
        ? directoryUser.roles
        : [directoryUser.role]
      : [];

    // Filtre negatif bon marche : un header present et non-admin disqualifie
    // d'emblee la portee admin, sans meme consulter les roles de l'annuaire.
    // Un header absent ne disqualifie rien (reporting-service n'envoie
    // `x-user-role` que lorsque le gateway le lui a fourni).
    const headerDeniesAdmin =
      user.role !== undefined && user.role !== UserRole.ADMIN;

    if (!headerDeniesAdmin && roles.includes(UserRole.ADMIN)) {
      return { scope: 'admin', userIds: null };
    }

    // Meme exigence pour la branche responsable : la promotion vient soit du
    // tableau `roles` de l'annuaire, soit des collaborateurs qui declarent
    // l'appelant comme responsable. Dans les deux cas c'est l'annuaire qui
    // tranche, jamais l'en-tete.
    //
    // Sequentiel et non parallele : les deux appels partagent le cache de
    // DirectoryService, un Promise.all declencherait deux fetch a froid.
    const managedIds = await this.directory.getManagedUserIds(
      user.userId,
      user.token,
    );

    if (roles.includes(UserRole.RESPONSABLE) || managedIds.length > 0) {
      // Union : un responsable saisit aussi ses propres heures.
      return {
        scope: 'responsable',
        userIds: Array.from(new Set([...managedIds, user.userId])),
      };
    }

    return { scope: 'self', userIds: [user.userId] };
  }

  // ── A1 : heures agregees ─────────────────────────────────────────────────

  async getHours(
    user: RequestUser,
    fromRaw?: string,
    toRaw?: string,
  ): Promise<HoursStatsResponse> {
    const { from, to } = this.resolveRange(fromRaw, toRaw);
    const audience = await this.resolveAudience(user);

    const base: HoursStatsResponse = {
      scope: audience.scope,
      from,
      to,
      rows: [],
      userMonths: [],
    };
    // Portee vide (responsable sans equipe et sans compte) : rien a agreger.
    if (audience.userIds && audience.userIds.length === 0) {
      return base;
    }

    const { start } = monthRange(from.year, from.month);
    const { end } = monthRange(to.year, to.month);

    // Agregat 1 (inchange) : ventilation par (utilisateur, projet, annee, mois).
    const query = this.timesheetRepository
      .createQueryBuilder('ts')
      .select('ts.user_id', 'userId')
      .addSelect('ts.project_id', 'projectId')
      .addSelect('EXTRACT(YEAR FROM ts.date)', 'year')
      .addSelect('EXTRACT(MONTH FROM ts.date)', 'month');
    TimesheetStatsService.addHoursMeasures(query)
      .where('ts.date BETWEEN :start AND :end', { start, end })
      .groupBy('ts.user_id')
      .addGroupBy('ts.project_id')
      .addGroupBy('EXTRACT(YEAR FROM ts.date)')
      .addGroupBy('EXTRACT(MONTH FROM ts.date)')
      .orderBy('EXTRACT(YEAR FROM ts.date)', 'ASC')
      .addOrderBy('EXTRACT(MONTH FROM ts.date)', 'ASC')
      .addOrderBy('ts.user_id', 'ASC');

    if (audience.userIds) {
      query.andWhere('ts.user_id IN (:...userIds)', { userIds: audience.userIds });
    }

    // Agregat 2 (nouveau) : meme portee, meme plage, memes mesures, mais
    // regroupe par (utilisateur, annee, mois) SANS le projet. Indispensable
    // pour `filledDays`, qui est un COUNT(DISTINCT date) : additionner les
    // lignes par projet compterait deux fois une journee repartie sur deux
    // projets. C'est une agregation a part entiere sur les lignes brutes, pas
    // un post-traitement de `rows` — le decompte distinct n'est pas sommable.
    const userMonthQuery = this.timesheetRepository
      .createQueryBuilder('ts')
      .select('ts.user_id', 'userId')
      .addSelect('EXTRACT(YEAR FROM ts.date)', 'year')
      .addSelect('EXTRACT(MONTH FROM ts.date)', 'month');
    TimesheetStatsService.addHoursMeasures(userMonthQuery)
      .where('ts.date BETWEEN :start AND :end', { start, end })
      .groupBy('ts.user_id')
      .addGroupBy('EXTRACT(YEAR FROM ts.date)')
      .addGroupBy('EXTRACT(MONTH FROM ts.date)')
      .orderBy('EXTRACT(YEAR FROM ts.date)', 'ASC')
      .addOrderBy('EXTRACT(MONTH FROM ts.date)', 'ASC')
      .addOrderBy('ts.user_id', 'ASC');

    if (audience.userIds) {
      userMonthQuery.andWhere('ts.user_id IN (:...userIds)', {
        userIds: audience.userIds,
      });
    }

    // En parallele : les deux requetes sont independantes, l'endpoint ne coute
    // donc qu'un seul aller-retour en latence perçue.
    const [raw, rawUserMonths] = await Promise.all([
      query.getRawMany<RawHoursRow>(),
      userMonthQuery.getRawMany<RawUserMonthRow>(),
    ]);

    return {
      ...base,
      rows: raw.map((row) => ({
        userId: row.userId,
        projectId: row.projectId ?? null,
        year: TimesheetStatsService.toInt(row.year),
        month: TimesheetStatsService.toInt(row.month),
        hours: TimesheetStatsService.round(row.hours),
        workHours: TimesheetStatsService.round(row.workHours),
        holidayDays: TimesheetStatsService.toInt(row.holidayDays),
        filledDays: TimesheetStatsService.toInt(row.filledDays),
        entries: TimesheetStatsService.toInt(row.entries),
      })),
      userMonths: rawUserMonths.map((row) => ({
        userId: row.userId,
        year: TimesheetStatsService.toInt(row.year),
        month: TimesheetStatsService.toInt(row.month),
        hours: TimesheetStatsService.round(row.hours),
        workHours: TimesheetStatsService.round(row.workHours),
        holidayDays: TimesheetStatsService.toInt(row.holidayDays),
        filledDays: TimesheetStatsService.toInt(row.filledDays),
        entries: TimesheetStatsService.toInt(row.entries),
      })),
    };
  }

  /**
   * Mesures communes aux deux agregats d'heures. Factorisees pour qu'ils ne
   * puissent pas diverger : seule la granularite du GROUP BY doit differer.
   */
  private static addHoursMeasures(
    query: SelectQueryBuilder<Timesheet>,
  ): SelectQueryBuilder<Timesheet> {
    return query
      .addSelect('SUM(ts.hours_spent)', 'hours')
      .addSelect(
        'SUM(CASE WHEN ts.is_holiday = true THEN 0 ELSE ts.hours_spent END)',
        'workHours',
      )
      .addSelect('COUNT(CASE WHEN ts.is_holiday = true THEN 1 END)', 'holidayDays')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN ts.hours_spent > 0 OR ts.is_holiday = true THEN ts.date END)',
        'filledDays',
      )
      .addSelect('COUNT(*)', 'entries');
  }

  // ── A2 : etats de validation ─────────────────────────────────────────────

  /**
   * Lecture brute de `timesheet_periods`. Volontairement sans appel a
   * l'annuaire ni construction de PeriodView : le consommateur ne veut que
   * l'etat, et un mois absent de la table vaut `not_validated`.
   */
  async getPeriods(
    user: RequestUser,
    fromRaw?: string,
    toRaw?: string,
  ): Promise<PeriodStatsResponse> {
    const { from, to } = this.resolveRange(fromRaw, toRaw);
    const audience = await this.resolveAudience(user);

    if (audience.userIds && audience.userIds.length === 0) {
      return { scope: audience.scope, rows: [] };
    }

    const query = this.periodRepository
      .createQueryBuilder('p')
      .select([
        'p.id',
        'p.userId',
        'p.year',
        'p.month',
        'p.status',
        'p.submittedAt',
        'p.reviewedAt',
        'p.reviewedBy',
      ])
      // (annee * 12 + mois) rend la plage comparable en une seule condition.
      .where('(p.year * 12 + p.month) BETWEEN :fromIndex AND :toIndex', {
        fromIndex: TimesheetStatsService.monthIndex(from),
        toIndex: TimesheetStatsService.monthIndex(to),
      })
      .orderBy('p.year', 'ASC')
      .addOrderBy('p.month', 'ASC')
      .addOrderBy('p.userId', 'ASC');

    if (audience.userIds) {
      query.andWhere('p.userId IN (:...userIds)', { userIds: audience.userIds });
    }

    const periods = await query.getMany();

    return {
      scope: audience.scope,
      rows: periods.map((period) => ({
        id: period.id,
        userId: period.userId,
        year: TimesheetStatsService.toInt(period.year),
        month: TimesheetStatsService.toInt(period.month),
        status: period.status ?? TimesheetPeriodStatus.NOT_VALIDATED,
        submittedAt: TimesheetStatsService.toIso(period.submittedAt),
        reviewedAt: TimesheetStatsService.toIso(period.reviewedAt),
        reviewedBy: period.reviewedBy ?? null,
      })),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** `2026-08` → `{ year: 2026, month: 8 }`. */
  private parseMonth(raw: string | undefined, label: string): StatsMonth {
    const match = /^(\d{4})-(\d{2})$/.exec(String(raw ?? '').trim());
    const year = match ? parseInt(match[1], 10) : NaN;
    const month = match ? parseInt(match[2], 10) : NaN;
    if (!isValidPeriod(year, month)) {
      throw new BadRequestException(
        `Paramètre « ${label} » invalide : format attendu AAAA-MM (ex. 2026-08).`,
      );
    }
    return { year, month };
  }

  private resolveRange(
    fromRaw: string | undefined,
    toRaw: string | undefined,
  ): { from: StatsMonth; to: StatsMonth } {
    const from = this.parseMonth(fromRaw, 'from');
    const to = this.parseMonth(toRaw, 'to');

    const span =
      TimesheetStatsService.monthIndex(to) -
      TimesheetStatsService.monthIndex(from) +
      1;
    if (span <= 0) {
      throw new BadRequestException(
        'Période invalide : « from » doit être antérieur ou égal à « to ».',
      );
    }
    if (span > MAX_STATS_RANGE_MONTHS) {
      throw new BadRequestException(
        `Période trop large : ${MAX_STATS_RANGE_MONTHS} mois au maximum.`,
      );
    }
    return { from, to };
  }

  private static monthIndex(period: StatsMonth): number {
    return period.year * 12 + period.month;
  }

  private static toInt(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  private static round(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
  }

  private static toIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
