import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { MeetingParticipant } from '../entities/meeting-participant.entity';
import { EventsModule } from '../events/events.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingParticipant]),
    EventsModule,
    HttpModule,
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, AvailabilityService],
})
export class MeetingsModule {}
