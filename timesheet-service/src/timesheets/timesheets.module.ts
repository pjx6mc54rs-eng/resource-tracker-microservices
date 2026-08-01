import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Timesheet } from '../entities/timesheet.entity';
import { TimesheetPeriod } from '../entities/timesheet-period.entity';
import { TimesheetsService } from './timesheets.service';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetPeriodsService } from './periods.service';
import { TimesheetPeriodsController } from './periods.controller';
import { TimesheetExportService } from './export.service';
import { DirectoryService } from './directory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Timesheet, TimesheetPeriod]),
    HttpModule.register({ timeout: 5000, maxRedirects: 2 }),
  ],
  controllers: [TimesheetPeriodsController, TimesheetsController],
  providers: [
    TimesheetsService,
    TimesheetPeriodsService,
    TimesheetExportService,
    DirectoryService,
  ],
  exports: [TimesheetsService, TimesheetPeriodsService, TypeOrmModule],
})
export class TimesheetsModule {}
