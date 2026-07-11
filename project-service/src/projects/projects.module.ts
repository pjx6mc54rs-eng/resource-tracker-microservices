import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { Assignment } from '../entities/assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Task, Assignment])],
  exports: [TypeOrmModule],
})
export class ProjectsModule {}
