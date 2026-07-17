import { ChatChannel } from './chat-channel.entity'
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm'

@Entity('chat_channel_members')
@Unique('UQ_chat_channel_member', ['channelId', 'userId'])
export class ChannelMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId!: string

  @ManyToOne(() => ChatChannel, (channel) => channel.members, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'channel_id' })
  channel!: ChatChannel

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string

  @Column({
    name: 'last_read_at',
    type: 'timestamp with time zone',
    default: () => 'now()',
  })
  lastReadAt!: Date
}
