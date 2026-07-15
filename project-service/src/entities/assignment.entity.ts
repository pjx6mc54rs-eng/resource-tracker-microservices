import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('assignments')
@Unique('IDX_assignments_project_user', ['projectId', 'userId'])
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;
}
