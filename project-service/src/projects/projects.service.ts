import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { Assignment } from '../entities/assignment.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
  ) {}

  // ── Admin ──────────────────────────────────────────────────────────────

  async createProject(data: CreateProjectDto): Promise<Project> {
    const project = this.projectRepo.create(data);
    return this.projectRepo.save(project);
  }

  async createTask(projectId: string, data: CreateTaskDto): Promise<Task> {
    await this.assertProjectExists(projectId);
    const task = this.taskRepo.create({ ...data, projectId });
    return this.taskRepo.save(task);
  }

  async assignUser(projectId: string, userId: string): Promise<Assignment> {
    await this.assertProjectExists(projectId);

    const existing = await this.assignmentRepo.findOne({
      where: { projectId, userId },
    });
    if (existing) {
      throw new ConflictException('Ce collaborateur est déjà assigné à ce projet');
    }

    const assignment = this.assignmentRepo.create({ projectId, userId });
    return this.assignmentRepo.save(assignment);
  }

  async findAllProjects(): Promise<Project[]> {
    return this.projectRepo.find({
      relations: ['tasks', 'assignments'],
      order: { createdAt: 'DESC' },
    });
  }

  async findProjectById(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['tasks', 'assignments'],
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  // ── Collaborateur ──────────────────────────────────────────────────────

  async findProjectsByWorker(userId: string): Promise<Project[]> {
    return this.projectRepo
      .createQueryBuilder('project')
      .innerJoin(
        'project.assignments',
        'assignment',
        'assignment.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect('project.tasks', 'task')
      .leftJoinAndSelect('project.assignments', 'all_assignments')
      .orderBy('project.createdAt', 'DESC')
      .getMany();
  }

  async findProjectDetailsForWorker(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.projectRepo
      .createQueryBuilder('project')
      .innerJoin(
        'project.assignments',
        'assignment',
        'assignment.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect('project.tasks', 'task')
      .leftJoinAndSelect('project.assignments', 'all_assignments')
      .where('project.id = :projectId', { projectId })
      .getOne();

    if (!project) {
      throw new NotFoundException(
        "Projet introuvable ou vous n'y êtes pas assigné.",
      );
    }

    return project;
  }

  async findTasksByProject(
    projectId: string,
    _userId?: string,
  ): Promise<Task[]> {
    return this.taskRepo.find({ where: { projectId } });
  }

  async findTeamMembers(projectId: string): Promise<Assignment[]> {
    return this.assignmentRepo.find({ where: { projectId } });
  }

  // ── Shared helpers ─────────────────────────────────────────────────────

  async assertProjectExists(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  async isUserAssigned(projectId: string, userId: string): Promise<boolean> {
    const assignment = await this.assignmentRepo.findOne({
      where: { projectId, userId },
    });
    return !!assignment;
  }

  async assertWorkerAssignedToProject(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const assigned = await this.isUserAssigned(projectId, userId);
    if (!assigned) {
      throw new ForbiddenException(
        "Accès refusé : vous n'êtes pas assigné à ce projet.",
      );
    }
  }
}
