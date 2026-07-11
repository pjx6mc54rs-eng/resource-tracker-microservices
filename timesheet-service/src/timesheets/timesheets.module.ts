import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Timesheet } from '../entities/timesheet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Timesheet])],
  exports: [TypeOrmModule],
})
export class TimesheetsModule {}
