import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Timesheet } from '../entities/timesheet.entity';
import { CreateTimesheetDto } from './create-timesheet.dto';
import { TimesheetPeriodsService } from './periods.service';
import { periodOfDate } from './month-range';

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
    private readonly periodsService: TimesheetPeriodsService,
  ) {}

  async findByUser(userId: string, year?: number, month?: number): Promise<Timesheet[]> {
    if (year && month) {
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const startDate = `${year}-${monthStr}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const lastDayStr = lastDayNum < 10 ? `0${lastDayNum}` : `${lastDayNum}`;
      const endDate = `${year}-${monthStr}-${lastDayStr}`;

      return this.timesheetRepository.find({
        where: {
          userId,
          date: Between(startDate, endDate),
        },
        order: {
          date: 'ASC',
        },
      });
    }

    return this.timesheetRepository.find({
      where: { userId },
      order: { date: 'DESC' },
    });
  }

  async saveSingle(userId: string, dto: CreateTimesheetDto): Promise<Timesheet | null> {
    await this.periodsService.assertDateEditable(userId, dto.date);
    return this.persist(userId, dto);
  }

  private async persist(userId: string, dto: CreateTimesheetDto): Promise<Timesheet | null> {
    const rawHours = dto.hoursSpent !== undefined && dto.hoursSpent !== null ? Number(dto.hoursSpent) : (dto.isHoliday ? 8 : 0);

    let timesheet: Timesheet | null = null;
    if (dto.id) {
      timesheet = await this.timesheetRepository.findOne({ where: { id: dto.id, userId } });
    }

    if (!timesheet) {
      const whereCondition: any = { userId, date: dto.date };
      if (dto.isHoliday) {
        whereCondition.isHoliday = true;
      } else if (dto.projectId) {
        whereCondition.projectId = dto.projectId;
      }

      timesheet = await this.timesheetRepository.findOne({ where: whereCondition });
    }

    // If hours is 0 or less, remove existing entry if present (clearing both project work and holiday entries)
    if (rawHours <= 0) {
      if (timesheet) {
        await this.timesheetRepository.remove(timesheet);
      }
      return null;
    }

    if (timesheet) {
      timesheet.projectId = dto.projectId ?? timesheet.projectId ?? null;
      timesheet.taskId = dto.taskId ?? timesheet.taskId ?? null;
      timesheet.hoursSpent = rawHours;
      timesheet.isHoliday = !!dto.isHoliday;
      timesheet.note = dto.note !== undefined ? dto.note : timesheet.note;
      return this.timesheetRepository.save(timesheet);
    }

    const newTimesheet = this.timesheetRepository.create({
      userId,
      projectId: dto.projectId ?? null,
      taskId: dto.taskId ?? null,
      date: dto.date,
      hoursSpent: rawHours,
      isHoliday: !!dto.isHoliday,
      note: dto.note ?? null,
    });

    return this.timesheetRepository.save(newTimesheet);
  }

  async bulkSave(userId: string, entries: CreateTimesheetDto[]): Promise<(Timesheet | null)[]> {
    // One lock check per distinct month rather than per entry — a bulk save
    // usually covers a single month and this keeps it to a single query.
    const months = new Map<string, { year: number; month: number }>();
    for (const entry of entries) {
      const period = periodOfDate(entry.date);
      months.set(`${period.year}-${period.month}`, period);
    }
    for (const { year, month } of months.values()) {
      await this.periodsService.assertMonthEditable(userId, year, month);
    }

    const results: (Timesheet | null)[] = [];
    for (const entry of entries) {
      const saved = await this.persist(userId, entry);
      results.push(saved);
    }
    return results;
  }

  /**
   * Jours declares comme conges ou feries, pour une liste d'utilisateurs et une
   * plage de dates.
   *
   * Sert a la planification des reunions : proposer un creneau a quelqu'un en
   * conge est la premiere cause de replanification. Volontairement limite a
   * (utilisateur, date) : ni le projet, ni les heures, ni la note ne sortent
   * d'ici, une information de presence n'ayant pas besoin du detail de la
   * saisie.
   */
  async findAbsences(
    userIds: string[],
    from: string,
    to: string,
  ): Promise<{ userId: string; date: string }[]> {
    if (userIds.length === 0) return [];
    const rows = await this.timesheetRepository
      .createQueryBuilder('t')
      .select('t.user_id', 'userId')
      .addSelect('t.date', 'date')
      .where('t.user_id IN (:...userIds)', { userIds })
      .andWhere('t.is_holiday = true')
      .andWhere('t.date BETWEEN :from AND :to', { from, to })
      .groupBy('t.user_id')
      .addGroupBy('t.date')
      .getRawMany();

    return rows.map((row) => ({
      userId: row.userId,
      // La colonne est de type date : selon le pilote elle revient en Date ou
      // en chaine. On normalise en AAAA-MM-JJ pour le client.
      date:
        row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10),
    }));
  }

  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    const timesheet = await this.timesheetRepository.findOne({ where: { id } });
    if (!timesheet) {
      throw new NotFoundException('Timesheet entry not found');
    }
    if (timesheet.userId !== userId) {
      throw new ForbiddenException('Cannot delete timesheet entry of another user');
    }
    await this.periodsService.assertDateEditable(userId, String(timesheet.date));
    await this.timesheetRepository.remove(timesheet);
    return { success: true };
  }
}
