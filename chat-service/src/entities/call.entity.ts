import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { ChatChannel } from './chat-channel.entity'
import { CallParticipant } from './call-participant.entity'

export enum CallType {
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

/**
 * Cycle de vie d'un appel :
 *
 *   RINGING ──accept──► ONGOING ──raccrochage──► ENDED
 *      │  │
 *      │  └──decline──► DECLINED
 *      └─────timeout──► MISSED
 *
 * Le media (audio/video) ne transite jamais par le serveur : il circule en
 * pair a pair via WebRTC, eventuellement relaye par TURN. Cette entite ne
 * conserve donc que les metadonnees necessaires a l'historique.
 */
export enum CallStatus {
  RINGING = 'RINGING',
  ONGOING = 'ONGOING',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
  DECLINED = 'DECLINED',
}

@Entity('calls')
@Index(['channelId', 'createdAt'])
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId!: string

  @ManyToOne(() => ChatChannel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel?: ChatChannel

  @Column({ name: 'initiator_id', type: 'uuid' })
  initiatorId!: string

  @Column({ type: 'enum', enum: CallType, default: CallType.AUDIO })
  type!: CallType

  @Column({ type: 'enum', enum: CallStatus, default: CallStatus.RINGING })
  status!: CallStatus

  /** Horodatage de la prise d'appel : null tant que personne n'a decroche. */
  @Column({ name: 'answered_at', type: 'timestamp with time zone', nullable: true })
  answeredAt?: Date | null

  @Column({ name: 'ended_at', type: 'timestamp with time zone', nullable: true })
  endedAt?: Date | null

  /** Duree de conversation en secondes, calculee a la cloture. */
  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds!: number

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date

  @OneToMany(() => CallParticipant, (participant) => participant.call, { cascade: true })
  participants!: CallParticipant[]
}
