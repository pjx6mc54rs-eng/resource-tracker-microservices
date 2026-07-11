import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('reporting_view')
export class ReportingView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'total_hours', type: 'decimal', precision: 6, scale: 2, default: 0 })
  totalHours: number;

  @UpdateDateColumn({ name: 'last_updated', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  lastUpdated: Date;
}
