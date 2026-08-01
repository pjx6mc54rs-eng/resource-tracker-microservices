import { EventsModule } from './events/events.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { HealthController } from './health/health.controller';
import * as path from 'path';

@Module({
  imports: [
    EventsModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'admin',
      password: process.env.DATABASE_PASSWORD || 'admin',
      database: process.env.DATABASE_NAME || 'timesheet_db',
      autoLoadEntities: true,
      synchronize: true,
      migrationsRun: true,
      migrations: [path.join(__dirname, '/migrations/*.{ts,js}')],
    }),
    TimesheetsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
