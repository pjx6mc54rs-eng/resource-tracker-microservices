import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;
}
