import { EventsService } from '../events/events.service';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { Assignment } from '../entities/assignment.entity';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
    @InjectRepository(Assignment)
    private readonly assignmentRepo: Repository<Assignment>,
    @InjectRepository(TaskAssignment)
    private readonly taskAssignmentRepo: Repository<TaskAssignment>,
    private readonly events: EventsService,
  ) {}

  /** Nom du projet, pour le texte des notifications. */
  private async projectName(projectId: string): Promise<string> {
    const p = await this.projectRepo.findOne({ where: { id: projectId } });
    return p?.name ?? 'un projet';
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async createProject(
    data: CreateProjectDto,
    creatorId: string,
  ): Promise<Project> {
    const project = this.projectRepo.create({
      ...data,
      createdBy: creatorId,
    });
    const saved = await this.projectRepo.save(project);
    if (creatorId) {
      const assignment = this.assignmentRepo.create({
        projectId: saved.id,
        userId: creatorId,
      });
      await this.assignmentRepo.save(assignment);
    }
    return saved;
  }

  async createTask(projectId: string, data: CreateTaskDto): Promise<Task> {
    await this.assertProjectExists(projectId);

    if (!data.assignedUserId) {
      throw new BadRequestException(
        'Un collaborateur doit être associé à la tâche',
      );
    }

    const onProject = await this.isUserAssigned(projectId, data.assignedUserId);
    if (!onProject) {
      throw new ForbiddenException(
        `Le collaborateur ${data.assignedUserId} doit d'abord être assigné au projet.`,
      );
    }

    const task = this.taskRepo.create({
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      projectId,
      assignees: [
        this.taskAssignmentRepo.create({ userId: data.assignedUserId }),
      ],
    });

    const savedTask = await this.taskRepo.save(task);

    this.events.emit('task.assigned', {
      recipientIds: [data.assignedUserId],
      taskTitle: savedTask.title,
      projectId,
    });

    return savedTask;
  }

  async assignUser(projectId: string, userId: string): Promise<Assignment> {
    await this.assertProjectExists(projectId);

    const existing = await this.assignmentRepo.findOne({
      where: { projectId, userId },
    });
    if (existing) {
      throw new ConflictException(
        'Ce collaborateur est déjà assigné à ce projet',
      );
    }

    const assignment = this.assignmentRepo.create({ projectId, userId });
    const saved = await this.assignmentRepo.save(assignment);

    this.events.emit('project.assigned', {
      recipientIds: [userId],
      projectName: await this.projectName(projectId),
      projectId,
    });

    return saved;
  }

  async unassignUser(projectId: string, userId: string): Promise<void> {
    await this.assertProjectExists(projectId);

    const existing = await this.assignmentRepo.findOne({
      where: { projectId, userId },
    });
    if (!existing) {
      throw new NotFoundException(
        "Ce collaborateur n'est pas assigné à ce projet",
      );
    }

    // Check if the user has any assigned tasks in this project
    const tasks = await this.taskRepo.find({ where: { projectId } });
    if (tasks.length > 0) {
      const taskIds = tasks.map((t) => t.id);
      const hasTasks = await this.taskAssignmentRepo.findOne({
        where: {
          taskId: In(taskIds),
          userId,
        },
      });
      if (hasTasks) {
        throw new BadRequestException(
          'This team member has assigned tasks. Unassign these tasks and then you can remove him.',
        );
      }
    }

    // Le nom est lu avant la suppression : apres, plus rien ne relie
    // l'utilisateur au projet.
    const name = await this.projectName(projectId);
    await this.assignmentRepo.delete({ projectId, userId });

    this.events.emit('project.unassigned', {
      recipientIds: [userId],
      projectName: name,
      projectId,
    });
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await this.assertProjectExists(projectId);

    const task = await this.taskRepo.findOne({
      where: { id: taskId, projectId },
    });
    if (!task) {
      throw new NotFoundException('Tâche introuvable');
    }

    await this.taskRepo.delete({ id: taskId });
  }

  async findAllProjects(): Promise<Project[]> {
    return this.projectRepo.find({
      relations: ['tasks', 'tasks.assignees', 'assignments'],
      order: { createdAt: 'DESC' },
    });
  }

  async findProjectById(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['tasks', 'tasks.assignees', 'assignments'],
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  // ── Collaborateur ──────────────────────────────────────────────────────

  async findProjectsByWorker(userId: string): Promise<Project[]> {
    const projects = await this.projectRepo
      .createQueryBuilder('project')
      .leftJoin(
        'project.assignments',
        'assignment',
      )
      .leftJoinAndSelect('project.assignments', 'all_assignments')
      .where('assignment.userId = :userId OR project.createdBy = :userId', { userId })
      .orderBy('project.createdAt', 'DESC')
      .getMany();

    for (const project of projects) {
      project.tasks = await this.findTasksByProject(project.id, userId);
    }
    return projects;
  }

  async findProjectDetailsForWorker(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.projectRepo
      .createQueryBuilder('project')
      .leftJoin(
        'project.assignments',
        'assignment',
      )
      .leftJoinAndSelect('project.assignments', 'all_assignments')
      .where('project.id = :projectId AND (assignment.userId = :userId OR project.createdBy = :userId)', {
        projectId,
        userId,
      })
      .getOne();

    if (!project) {
      throw new NotFoundException(
        "Projet introuvable ou vous n'y êtes pas assigné.",
      );
    }

    project.tasks = await this.findTasksByProject(projectId, userId);
    return project;
  }

  async findTasksByProject(
    projectId: string,
    userId?: string,
  ): Promise<Task[]> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignees', 'assignees')
      .where('task.projectId = :projectId', { projectId })
      .orderBy('task.title', 'ASC');

    if (userId) {
      qb.innerJoin(
        'task.assignees',
        'filter_assignee',
        'filter_assignee.userId = :userId',
        { userId },
      );
    }

    return qb.getMany();
  }

  async findTeamMembers(projectId: string): Promise<Assignment[]> {
    const assignments = await this.assignmentRepo.find({ where: { projectId } });
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (project?.createdBy && !assignments.some((a) => a.userId === project.createdBy)) {
      assignments.push(
        this.assignmentRepo.create({ projectId, userId: project.createdBy }),
      );
    }
    return assignments;
  }

  // ── Shared helpers ─────────────────────────────────────────────────────

  async assertProjectExists(projectId: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  async isUserAssigned(projectId: string, userId: string): Promise<boolean> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (project && project.createdBy === userId) {
      return true;
    }
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

  /**
   * `actorId` est l'auteur du changement (undefined pour un admin, qui n'est pas
   * forcement membre du projet). Il sert uniquement a ne pas se notifier
   * soi-meme : un collaborateur qui deplace sa propre tache sait deja qu'il l'a
   * deplacee.
   */
  async updateTask(
    projectId: string,
    taskId: string,
    data: UpdateTaskDto,
    actorId?: string,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, projectId },
      relations: ['assignees'],
    });
    if (!task) {
      throw new NotFoundException('Tâche introuvable');
    }

    // Etat d'origine, capture avant toute mutation : c'est la comparaison
    // avant/apres qui decide qui est notifie, et de quoi. Le formulaire
    // d'edition renvoie toujours `status` et `assignedUserId`, meme inchanges ;
    // sans cette comparaison chaque enregistrement notifierait pour rien.
    const previousStatus = task.status;
    const previousAssigneeIds = (task.assignees ?? []).map((a) => a.userId);

    if (data.status) {
      task.status = data.status;
    }

    if (data.title) {
      task.title = data.title;
    }

    if (data.description !== undefined) {
      task.description = data.description;
    }

    if (data.assignedUserId) {
      const onProject = await this.isUserAssigned(projectId, data.assignedUserId);
      if (!onProject) {
        throw new ForbiddenException(
          `Le collaborateur ${data.assignedUserId} doit d'abord être assigné au projet.`,
        );
      }

      await this.taskAssignmentRepo.delete({ taskId });
      task.assignees = [
        this.taskAssignmentRepo.create({ userId: data.assignedUserId, taskId }),
      ];
    }

    const saved = await this.taskRepo.save(task);

    const nextAssigneeIds = data.assignedUserId
      ? [data.assignedUserId]
      : previousAssigneeIds;
    const gainedIds = nextAssigneeIds.filter(
      (id) => !previousAssigneeIds.includes(id),
    );
    const lostIds = previousAssigneeIds.filter(
      (id) => !nextAssigneeIds.includes(id),
    );
    const statusChanged = Boolean(data.status) && data.status !== previousStatus;

    /** Destinataires reels : dedoublonnes, et jamais l'auteur du changement. */
    const recipients = (ids: string[]) =>
      Array.from(new Set(ids)).filter((id) => id && id !== actorId);

    const gained = recipients(gainedIds);
    if (gained.length > 0) {
      this.events.emit('task.assigned', {
        recipientIds: gained,
        taskTitle: saved.title,
        projectId,
      });
    }

    const lost = recipients(lostIds);
    if (lost.length > 0) {
      this.events.emit('task.reassigned', {
        recipientIds: lost,
        taskTitle: saved.title,
        projectId,
      });
    }

    if (statusChanged) {
      // Celui qui vient de recevoir la tache a deja "task.assigned" : lui
      // envoyer en plus un changement de statut ferait deux notifications
      // pour un seul evenement.
      const informed = recipients(
        nextAssigneeIds.filter((id) => !gainedIds.includes(id)),
      );
      if (informed.length > 0) {
        this.events.emit('task.status_changed', {
          recipientIds: informed,
          taskTitle: saved.title,
          projectId,
          status: saved.status,
          previousStatus,
        });
      }
    }

    return saved;
  }
}
