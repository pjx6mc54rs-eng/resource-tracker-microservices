import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MeetingParticipant } from './meeting-participant.entity';

export enum MeetingStatus {
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
}

/**
 * Reunion planifiee.
 *
 * Les identifiants d'utilisateur et de projet proviennent d'autres bases
 * (auth_db, project_db) : aucune cle etrangere ne les contraint ici,
 * conformement au principe d'une base par service. La coherence est assuree au
 * niveau applicatif.
 */
@Entity('meetings')
// Requete dominante : « les reunions a venir », donc un tri par date de debut
// filtre sur le statut.
@Index(['startsAt'])
@Index(['organizerId', 'startsAt'])
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'starts_at', type: 'timestamp with time zone' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamp with time zone' })
  endsAt: Date;

  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId: string;

  /** Rattachement facultatif a un projet, pour le filtrage et le reporting. */
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  /**
   * Canal de discussion associe, renseigne au premier « Rejoindre » d'une
   * reunion a plus de deux participants. Le conserver evite de recreer un
   * groupe a chaque connexion.
   */
  @Column({ name: 'channel_id', type: 'uuid', nullable: true })
  channelId: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: MeetingStatus.SCHEDULED,
  })
  status: MeetingStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @OneToMany(() => MeetingParticipant, (participant) => participant.meeting, {
    cascade: true,
    eager: true,
  })
  participants: MeetingParticipant[];
}
