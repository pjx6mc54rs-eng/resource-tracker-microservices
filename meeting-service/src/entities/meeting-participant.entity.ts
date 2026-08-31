import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Meeting } from './meeting.entity';

/** Reponse d'un invite. `PENDING` tant qu'il ne s'est pas prononce. */
export enum ParticipantResponse {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TENTATIVE = 'TENTATIVE',
}

@Entity('meeting_participants')
@Unique('UQ_meeting_participant', ['meetingId', 'userId'])
export class MeetingParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'meeting_id', type: 'uuid' })
  meetingId: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: Meeting;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: ParticipantResponse.PENDING,
  })
  response: ParticipantResponse;

  @Column({ name: 'responded_at', type: 'timestamp with time zone', nullable: true })
  respondedAt: Date | null;
}
