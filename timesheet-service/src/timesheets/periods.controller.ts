import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TimesheetPeriodStatus } from '../entities/timesheet-period.entity';
import { requireRequestUser } from '../common/request-user';
import type { IncomingHeaders } from '../common/request-user';
import { TimesheetPeriodsService } from './periods.service';
import { ExportPayload, TimesheetExportService } from './export.service';
import { ReviewPeriodDto, SubmitPeriodDto } from './period.dto';

type ExportFormat = 'xlsx' | 'pdf';

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** Monthly validation workflow: submit → approve/reject → download. */
@Controller('timesheets/periods')
export class TimesheetPeriodsController {
  constructor(
    private readonly periodsService: TimesheetPeriodsService,
    private readonly exportService: TimesheetExportService,
  ) {}

  // ── Collaborateur ────────────────────────────────────────────────────────

  /** Validation state of my own month. */
  @Get('me')
  async getMyPeriod(
    @Headers() headers: IncomingHeaders,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const user = requireRequestUser(headers);
    return this.periodsService.getMyPeriod(user, this.toInt(year), this.toInt(month));
  }

  /** Every month I have submitted so far. */
  @Get('me/history')
  async getMyHistory(@Headers() headers: IncomingHeaders) {
    return this.periodsService.listMyPeriods(requireRequestUser(headers));
  }

  @Post('me/submit')
  async submit(@Headers() headers: IncomingHeaders, @Body() dto: SubmitPeriodDto) {
    const user = requireRequestUser(headers);
    return this.periodsService.submit(user, this.toInt(dto?.year), this.toInt(dto?.month));
  }

  /** Take back a submission that has not been reviewed yet. */
  @Post('me/recall')
  async recall(@Headers() headers: IncomingHeaders, @Body() dto: SubmitPeriodDto) {
    const user = requireRequestUser(headers);
    return this.periodsService.recall(user, this.toInt(dto?.year), this.toInt(dto?.month));
  }

  @Get('me/export')
  async exportMine(
    @Headers() headers: IncomingHeaders,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const user = requireRequestUser(headers);
    const payload = await this.periodsService.getExportData(
      user,
      user.userId,
      this.toInt(year),
      this.toInt(month),
    );
    return this.sendExport(res, payload, this.toFormat(format));
  }

  // ── Responsable / admin ──────────────────────────────────────────────────

  /** Timesheets I am entitled to review. `?status=pending,approved,rejected` */
  @Get('review')
  async listForReview(
    @Headers() headers: IncomingHeaders,
    @Query('status') status?: string,
  ) {
    const user = requireRequestUser(headers);
    return this.periodsService.listForReview(user, this.toStatuses(status));
  }

  @Get(':id')
  async getOne(@Headers() headers: IncomingHeaders, @Param('id') id: string) {
    const user = requireRequestUser(headers);
    const { period, entries, projectNames } = await this.periodsService.getPeriodForReview(
      user,
      id,
    );
    return {
      period,
      entries: entries.map((entry) => ({
        id: entry.id,
        date: String(entry.date).split('T')[0],
        projectId: entry.projectId,
        projectName: entry.projectId ? (projectNames.get(entry.projectId) ?? null) : null,
        hoursSpent: Number(entry.hoursSpent) || 0,
        isHoliday: entry.isHoliday,
        note: entry.note ?? null,
      })),
    };
  }

  @Post(':id/approve')
  async approve(
    @Headers() headers: IncomingHeaders,
    @Param('id') id: string,
    @Body() dto: ReviewPeriodDto,
  ) {
    const user = requireRequestUser(headers);
    return this.periodsService.review(user, id, 'approve', dto?.comment);
  }

  @Post(':id/reject')
  async reject(
    @Headers() headers: IncomingHeaders,
    @Param('id') id: string,
    @Body() dto: ReviewPeriodDto,
  ) {
    const user = requireRequestUser(headers);
    return this.periodsService.review(user, id, 'reject', dto?.comment);
  }

  @Get(':id/export')
  async exportOne(
    @Headers() headers: IncomingHeaders,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const user = requireRequestUser(headers);
    const { period } = await this.periodsService.getPeriodForReview(user, id);
    const payload = await this.periodsService.getExportData(
      user,
      period.owner.id,
      period.year,
      period.month,
    );
    return this.sendExport(res, payload, this.toFormat(format));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async sendExport(
    res: Response,
    payload: ExportPayload,
    format: ExportFormat,
  ): Promise<void> {
    const file =
      format === 'pdf'
        ? await this.exportService.toPdf(payload)
        : await this.exportService.toExcel(payload);
    const fileName = `${this.exportService.fileBaseName(payload)}.${format}`;

    res.setHeader('Content-Type', CONTENT_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(file.length));
    res.end(file);
  }

  private toInt(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Paramètres année / mois invalides.');
    }
    return parsed;
  }

  private toFormat(value: string | undefined): ExportFormat {
    const normalized = (value ?? 'xlsx').toLowerCase();
    if (normalized === 'pdf') return 'pdf';
    if (normalized === 'xlsx' || normalized === 'excel') return 'xlsx';
    throw new BadRequestException("Format d'export non supporté (xlsx ou pdf).");
  }

  private toStatuses(raw: string | undefined): TimesheetPeriodStatus[] {
    const allowed = Object.values(TimesheetPeriodStatus);
    if (!raw) return [TimesheetPeriodStatus.PENDING];
    const requested = raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part): part is TimesheetPeriodStatus =>
        (allowed as string[]).includes(part),
      );
    return requested.length > 0 ? requested : [TimesheetPeriodStatus.PENDING];
  }
}
