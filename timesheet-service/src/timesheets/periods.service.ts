import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Timesheet } from '../entities/timesheet.entity';
import {
  TimesheetPeriod,
  TimesheetPeriodStatus,
} from '../entities/timesheet-period.entity';
import { RequestUser, UserRole } from '../common/request-user';
import { DirectoryService, DirectoryUser } from './directory.service';
import { isValidPeriod, monthRange, periodOfDate } from './month-range';

export const HOURS_PER_DAY = 8;

export interface PeriodOwner {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
}

export interface PeriodSummary {
  entriesCount: number;
  totalHours: number;
  totalDays: number;
  workHours: number;
  holidayDays: number;
  filledDays: number;
}

export interface PeriodView extends PeriodSummary {
  id: string | null;
  year: number;
  month: number;
  status: TimesheetPeriodStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  owner: PeriodOwner;
  reviewer: PeriodOwner | null;
  reviewers: PeriodOwner[];
  locked: boolean;
  canSubmit: boolean;
  canRecall: boolean;
  canDownload: boolean;
}

export type ReviewDecision = 'approve' | 'reject';

@Injectable()
export class TimesheetPeriodsService {
  constructor(
    @InjectRepository(TimesheetPeriod)
    private readonly periodRepository: Repository<TimesheetPeriod>,
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    private readonly directory: DirectoryService,
  ) {}

  // ── Status helpers ───────────────────────────────────────────────────────

  static isLockedStatus(status: TimesheetPeriodStatus): boolean {
    return (
      status === TimesheetPeriodStatus.PENDING ||
      status === TimesheetPeriodStatus.APPROVED
    );
  }

  findPeriod(userId: string, year: number, month: number): Promise<TimesheetPeriod | null> {
    return this.periodRepository.findOne({ where: { userId, year, month } });
  }

  /**
   * Gate used by every write path on `timesheets`: a month awaiting validation
   * or already validated is frozen.
   */
  async assertMonthEditable(userId: string, year: number, month: number): Promise<void> {
    const period = await this.findPeriod(userId, year, month);
    if (!period || !TimesheetPeriodsService.isLockedStatus(period.status)) {
      return;
    }
    if (period.status === TimesheetPeriodStatus.APPROVED) {
      throw new ForbiddenException(
        `La feuille de temps ${String(month).padStart(2, '0')}/${year} est validée : elle ne peut plus être modifiée.`,
      );
    }
    throw new ForbiddenException(
      `La feuille de temps ${String(month).padStart(2, '0')}/${year} est en attente de validation : annulez l'envoi pour la modifier.`,
    );
  }

  /** Same gate, keyed by an entry date instead of an explicit period. */
  async assertDateEditable(userId: string, date: string): Promise<void> {
    const { year, month } = periodOfDate(date);
    await this.assertMonthEditable(userId, year, month);
  }

  // ── Entries & summaries ──────────────────────────────────────────────────

  findEntries(userId: string, year: number, month: number): Promise<Timesheet[]> {
    const { start, end } = monthRange(year, month);
    return this.timesheetRepository.find({
      where: { userId, date: Between(start, end) },
      order: { date: 'ASC' },
    });
  }

  static summarize(entries: Timesheet[]): PeriodSummary {
    const filled = new Set<string>();
    let totalHours = 0;
    let workHours = 0;
    let holidayDays = 0;

    entries.forEach((entry) => {
      const hours = Number(entry.hoursSpent) || 0;
      const date = String(entry.date).split('T')[0];
      totalHours += hours;
      if (entry.isHoliday) {
        holidayDays += 1;
      } else {
        workHours += hours;
      }
      if (hours > 0 || entry.isHoliday) filled.add(date);
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      entriesCount: entries.length,
      totalHours: round(totalHours),
      totalDays: round(totalHours / HOURS_PER_DAY),
      workHours: round(workHours),
      holidayDays,
      filledDays: filled.size,
    };
  }

  /** Dates whose entries don't add up to exactly one day — blocks submission. */
  private static invalidDays(entries: Timesheet[]): string[] {
    const perDay = new Map<string, number>();
    entries.forEach((entry) => {
      const date = String(entry.date).split('T')[0];
      perDay.set(date, (perDay.get(date) ?? 0) + (Number(entry.hoursSpent) || 0));
    });
    return Array.from(perDay.entries())
      .filter(([, hours]) => hours > 0 && Math.abs(hours - HOURS_PER_DAY) > 0.01)
      .map(([date]) => date)
      .sort();
  }

  // ── Views ────────────────────────────────────────────────────────────────

  private static toOwner(user: DirectoryUser | undefined, fallbackId: string): PeriodOwner {
    return {
      id: user?.id ?? fallbackId,
      name: DirectoryService.displayName(user, fallbackId),
      email: user?.email ?? null,
      jobTitle: user?.jobTitle ?? null,
    };
  }

  private async buildView(
    ownerId: string,
    year: number,
    month: number,
    period: TimesheetPeriod | null,
    token: string,
  ): Promise<PeriodView> {
    const entries = await this.findEntries(ownerId, year, month);
    const summary = TimesheetPeriodsService.summarize(entries);
    const status = period?.status ?? TimesheetPeriodStatus.NOT_VALIDATED;

    const users = await this.directory.getUsers(token).catch(() => [] as DirectoryUser[]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const owner = byId.get(ownerId);
    const reviewerIds =
      period?.reviewerIds && period.reviewerIds.length > 0
        ? period.reviewerIds
        : (owner?.responsableIds ?? []);

    return {
      ...summary,
      id: period?.id ?? null,
      year,
      month,
      status,
      submittedAt: period?.submittedAt ?? null,
      reviewedAt: period?.reviewedAt ?? null,
      reviewComment: period?.reviewComment ?? null,
      owner: TimesheetPeriodsService.toOwner(owner, ownerId),
      reviewer: period?.reviewedBy
        ? TimesheetPeriodsService.toOwner(byId.get(period.reviewedBy), period.reviewedBy)
        : null,
      reviewers: reviewerIds.map((id) =>
        TimesheetPeriodsService.toOwner(byId.get(id), id),
      ),
      locked: TimesheetPeriodsService.isLockedStatus(status),
      canSubmit:
        !TimesheetPeriodsService.isLockedStatus(status) && summary.entriesCount > 0,
      canRecall: status === TimesheetPeriodStatus.PENDING,
      canDownload: status === TimesheetPeriodStatus.APPROVED,
    };
  }

  async getMyPeriod(user: RequestUser, year: number, month: number): Promise<PeriodView> {
    this.assertPeriodParams(year, month);
    const period = await this.findPeriod(user.userId, year, month);
    return this.buildView(user.userId, year, month, period, user.token);
  }

  /** Every month this user has ever submitted, most recent first. */
  async listMyPeriods(user: RequestUser): Promise<PeriodView[]> {
    const periods = await this.periodRepository.find({
      where: { userId: user.userId },
      order: { year: 'DESC', month: 'DESC' },
    });
    return Promise.all(
      periods.map((p) => this.buildView(user.userId, p.year, p.month, p, user.token)),
    );
  }

  // ── Collaborateur actions ────────────────────────────────────────────────

  async submit(user: RequestUser, year: number, month: number): Promise<PeriodView> {
    this.assertPeriodParams(year, month);

    const existing = await this.findPeriod(user.userId, year, month);
    if (existing?.status === TimesheetPeriodStatus.APPROVED) {
      throw new ForbiddenException(
        'Cette feuille de temps est déjà validée : elle ne peut plus être renvoyée.',
      );
    }
    if (existing?.status === TimesheetPeriodStatus.PENDING) {
      throw new BadRequestException(
        'Cette feuille de temps est déjà en attente de validation.',
      );
    }

    const entries = await this.findEntries(user.userId, year, month);
    if (entries.length === 0) {
      throw new BadRequestException(
        'Aucune saisie pour ce mois : renseignez vos journées avant de demander la validation.',
      );
    }

    const invalid = TimesheetPeriodsService.invalidDays(entries);
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Chaque journée saisie doit totaliser exactement 1 jour (8h). Journées à corriger : ${invalid.join(', ')}.`,
      );
    }

    const reviewerIds = await this.directory.getResponsableIds(user.userId, user.token);

    const period =
      existing ??
      this.periodRepository.create({ userId: user.userId, year, month });
    period.status = TimesheetPeriodStatus.PENDING;
    period.submittedAt = new Date();
    period.reviewerIds = reviewerIds;
    period.reviewedBy = null;
    period.reviewedAt = null;
    period.reviewComment = null;

    const saved = await this.periodRepository.save(period);
    return this.buildView(user.userId, year, month, saved, user.token);
  }

  /** Take a still-unreviewed submission back so it can be edited again. */
  async recall(user: RequestUser, year: number, month: number): Promise<PeriodView> {
    this.assertPeriodParams(year, month);

    const period = await this.findPeriod(user.userId, year, month);
    if (!period || period.status !== TimesheetPeriodStatus.PENDING) {
      throw new BadRequestException(
        "Seule une feuille de temps en attente de validation peut être rappelée.",
      );
    }

    period.status = TimesheetPeriodStatus.NOT_VALIDATED;
    period.submittedAt = null;
    period.reviewerIds = null;
    const saved = await this.periodRepository.save(period);
    return this.buildView(user.userId, year, month, saved, user.token);
  }

  // ── Responsable / admin actions ──────────────────────────────────────────

  private async isAdmin(user: RequestUser): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;
    return this.directory.isAdmin(user.userId, user.token);
  }

  private async assertCanReview(user: RequestUser, period: TimesheetPeriod): Promise<void> {
    if (period.userId === user.userId) {
      throw new ForbiddenException('Vous ne pouvez pas valider votre propre feuille de temps.');
    }
    if (period.reviewerIds?.includes(user.userId)) return;

    const liveResponsables = await this.directory
      .getResponsableIds(period.userId, user.token)
      .catch(() => [] as string[]);
    if (liveResponsables.includes(user.userId)) return;

    if (await this.isAdmin(user)) return;

    throw new ForbiddenException(
      "Vous n'êtes pas responsable de ce collaborateur.",
    );
  }

  /** Periods this reviewer is entitled to see, newest submission first. */
  async listForReview(
    user: RequestUser,
    statuses: TimesheetPeriodStatus[],
  ): Promise<PeriodView[]> {
    const admin = await this.isAdmin(user);
    const periods = await this.periodRepository.find({
      where: { status: In(statuses) },
      order: { submittedAt: 'DESC', year: 'DESC', month: 'DESC' },
    });

    const managedIds = admin
      ? null
      : new Set(await this.directory.getManagedUserIds(user.userId, user.token));

    const visible = periods.filter((p) => {
      if (p.userId === user.userId) return false;
      if (admin) return true;
      return p.reviewerIds?.includes(user.userId) || managedIds?.has(p.userId);
    });

    return Promise.all(
      visible.map((p) => this.buildView(p.userId, p.year, p.month, p, user.token)),
    );
  }

  async getPeriodForReview(
    user: RequestUser,
    periodId: string,
  ): Promise<{ period: PeriodView; entries: Timesheet[]; projectNames: Map<string, string> }> {
    const period = await this.periodRepository.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Feuille de temps introuvable');
    }
    if (period.userId !== user.userId) {
      await this.assertCanReview(user, period);
    }

    const [view, entries, projectNames] = await Promise.all([
      this.buildView(period.userId, period.year, period.month, period, user.token),
      this.findEntries(period.userId, period.year, period.month),
      this.directory.getProjectNames(period.userId, user.token),
    ]);

    return { period: view, entries, projectNames };
  }

  async review(
    user: RequestUser,
    periodId: string,
    decision: ReviewDecision,
    comment?: string,
  ): Promise<PeriodView> {
    const period = await this.periodRepository.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Feuille de temps introuvable');
    }
    if (period.status !== TimesheetPeriodStatus.PENDING) {
      throw new BadRequestException(
        'Seule une feuille de temps en attente de validation peut être traitée.',
      );
    }
    await this.assertCanReview(user, period);

    const trimmed = comment?.trim() || null;
    if (decision === 'reject' && !trimmed) {
      throw new BadRequestException('Un motif est requis pour refuser une feuille de temps.');
    }

    period.status =
      decision === 'approve'
        ? TimesheetPeriodStatus.APPROVED
        : TimesheetPeriodStatus.REJECTED;
    period.reviewedBy = user.userId;
    period.reviewedAt = new Date();
    period.reviewComment = trimmed;

    const saved = await this.periodRepository.save(period);
    return this.buildView(period.userId, period.year, period.month, saved, user.token);
  }

  // ── Exports ──────────────────────────────────────────────────────────────

  /**
   * Owners may download their own timesheet once it is validated; reviewers and
   * admins may download anything that has left the draft state.
   */
  async getExportData(
    user: RequestUser,
    ownerId: string,
    year: number,
    month: number,
  ): Promise<{ period: PeriodView; entries: Timesheet[]; projectNames: Map<string, string> }> {
    this.assertPeriodParams(year, month);

    const period = await this.findPeriod(ownerId, year, month);
    const status = period?.status ?? TimesheetPeriodStatus.NOT_VALIDATED;

    if (ownerId === user.userId) {
      if (status !== TimesheetPeriodStatus.APPROVED) {
        throw new ForbiddenException(
          'Le téléchargement est disponible une fois la feuille de temps validée par votre responsable.',
        );
      }
    } else {
      if (!period || status === TimesheetPeriodStatus.NOT_VALIDATED) {
        throw new NotFoundException('Aucune feuille de temps soumise pour cette période.');
      }
      await this.assertCanReview(user, period);
    }

    const [view, entries, projectNames] = await Promise.all([
      this.buildView(ownerId, year, month, period, user.token),
      this.findEntries(ownerId, year, month),
      this.directory.getProjectNames(ownerId, user.token),
    ]);

    return { period: view, entries, projectNames };
  }

  private assertPeriodParams(year: number, month: number): void {
    if (!isValidPeriod(year, month)) {
      throw new BadRequestException('Période invalide : année et mois (1-12) requis.');
    }
  }
}
