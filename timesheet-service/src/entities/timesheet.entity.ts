import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('timesheets')
export class Timesheet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @Column({ type: 'date' })
  date: Date | string;

  @Column({ name: 'hours_spent', type: 'decimal', precision: 5, scale: 2 })
  hoursSpent: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
