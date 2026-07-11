import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportingView } from '../entities/reporting-view.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReportingView])],
  exports: [TypeOrmModule],
})
export class ReportingModule {}
