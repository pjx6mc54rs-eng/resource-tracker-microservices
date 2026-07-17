import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { ChatChannel } from './chat-channel.entity'

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'channel_id', type: 'uuid', nullable: true })
  channelId?: string

  @ManyToOne(() => ChatChannel, (channel) => channel.messages, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel?: ChatChannel

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId?: string

  // Backwards compatibility: older schemas may have stored the author as `user_id`.
  // Map it here so inserts include both fields when required by DB constraints.
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string

  @Column({ type: 'text' })
  message!: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date
}
