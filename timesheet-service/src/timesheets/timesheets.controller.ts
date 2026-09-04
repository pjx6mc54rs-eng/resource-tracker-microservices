import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { CreateTimesheetDto, BulkSaveTimesheetsDto } from './create-timesheet.dto';

@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  private extractUserId(headers: Record<string, any>): string {
    const userId = headers['x-user-id'] || headers['X-User-Id'];
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }
    return userId;
  }

  /**
   * Jours d'absence declares par une liste de collaborateurs.
   *
   * Accessible a tout utilisateur authentifie : planifier une reunion suppose
   * de connaitre les absences de ses collegues. Seuls (utilisateur, date)
   * sortent d'ici, jamais le detail des saisies.
   *
   * `?userIds=a,b&from=AAAA-MM-JJ&to=AAAA-MM-JJ`
   */
  @Get('absences')
  async getAbsences(
    @Headers() headers: Record<string, any>,
    @Query('userIds') userIds?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.extractUserId(headers);
    const ids = (userIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length || !from || !to) return [];
    return this.timesheetsService.findAbsences(ids, from, to);
  }

  @Get('me')
  async getMyTimesheets(
    @Headers() headers: Record<string, any>,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const userId = this.extractUserId(headers);
    const y = year ? parseInt(year, 10) : undefined;
    const m = month ? parseInt(month, 10) : undefined;
    return this.timesheetsService.findByUser(userId, y, m);
  }

  @Post()
  async saveTimesheet(
    @Headers() headers: Record<string, any>,
    @Body() dto: CreateTimesheetDto,
  ) {
    const userId = this.extractUserId(headers);
    return this.timesheetsService.saveSingle(userId, dto);
  }

  @Post('bulk')
  async bulkSaveTimesheets(
    @Headers() headers: Record<string, any>,
    @Body() body: BulkSaveTimesheetsDto,
  ) {
    const userId = this.extractUserId(headers);
    const entries = Array.isArray(body) ? body : (body?.entries || []);
    return this.timesheetsService.bulkSave(userId, entries);
  }

  @Delete(':id')
  async deleteTimesheet(
    @Headers() headers: Record<string, any>,
    @Param('id') id: string,
  ) {
    const userId = this.extractUserId(headers);
    return this.timesheetsService.delete(id, userId);
  }
}
