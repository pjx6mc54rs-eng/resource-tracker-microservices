import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Timesheet } from '../entities/timesheet.entity';
import { CreateTimesheetDto } from './create-timesheet.dto';

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetRepository: Repository<Timesheet>,
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
    const results: (Timesheet | null)[] = [];
    for (const entry of entries) {
      const saved = await this.saveSingle(userId, entry);
      results.push(saved);
    }
    return results;
  }

  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    const timesheet = await this.timesheetRepository.findOne({ where: { id } });
    if (!timesheet) {
      throw new NotFoundException('Timesheet entry not found');
    }
    if (timesheet.userId !== userId) {
      throw new ForbiddenException('Cannot delete timesheet entry of another user');
    }
    await this.timesheetRepository.remove(timesheet);
    return { success: true };
  }
}
