import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { Meeting } from './entities/meeting.entity';
import { MeetingParticipant } from './entities/meeting-participant.entity';
import { HealthController } from './health/health.controller';
import { MeetingsModule } from './meetings/meetings.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'admin',
      password: process.env.DATABASE_PASSWORD ?? 'admin',
      database: process.env.DATABASE_NAME ?? 'meeting_db',
      entities: [Meeting, MeetingParticipant],
      synchronize: false,
      migrationsRun: true,
      migrations: [path.join(__dirname, '/migrations/*.{ts,js}')],
    }),
    MeetingsModule,
  ],
})
export class AppModule {}
