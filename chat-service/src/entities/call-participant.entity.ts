import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'
import { Call } from './call.entity'

/** Participation d'un utilisateur a un appel, avec l'etat de ses medias. */
@Entity('call_participants')
@Unique('UQ_call_participant', ['callId', 'userId'])
export class CallParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'call_id', type: 'uuid' })
  callId!: string

  @ManyToOne(() => Call, (call) => call.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call?: Call

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Column({ name: 'joined_at', type: 'timestamp with time zone', nullable: true })
  joinedAt?: Date | null

  @Column({ name: 'left_at', type: 'timestamp with time zone', nullable: true })
  leftAt?: Date | null

  @Column({ type: 'boolean', default: false })
  muted!: boolean

  @Column({ name: 'camera_off', type: 'boolean', default: false })
  cameraOff!: boolean
}
