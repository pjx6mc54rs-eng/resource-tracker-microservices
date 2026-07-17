import { ChatMessage } from './chat-message.entity'
import { ChannelMember } from './channel-member.entity'
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'

export enum ChatChannelType {
  PROJECT = 'PROJECT',
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

@Entity('chat_channels')
export class ChatChannel {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({
    type: 'enum',
    enum: ChatChannelType,
    default: ChatChannelType.GROUP,
  })
  type!: ChatChannelType

  @Column({ type: 'text', nullable: true })
  name?: string

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt!: Date

  @OneToMany(() => ChatMessage, (message) => message.channel)
  messages!: ChatMessage[]

  @OneToMany(() => ChannelMember, (member) => member.channel, {
    cascade: true,
  })
  members!: ChannelMember[]
}
