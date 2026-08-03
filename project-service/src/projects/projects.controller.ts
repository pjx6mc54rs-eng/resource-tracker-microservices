import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  extractUserRole,
  requireAdmin,
  requireUserId,
} from '../common/request-user';
import type { IncomingHeaders } from '../common/request-user';
import { UserRole } from '../common/user-role.enum';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /** POST /projects — admin only */
  @Post()
  async createProject(
    @Body() body: CreateProjectDto,
    @Headers() headers: IncomingHeaders,
  ) {
    requireAdmin(headers);
    const creatorId = requireUserId(headers);
    return this.projectsService.createProject(body, creatorId);
  }

  /** POST /projects/:id/tasks — admin only */
  @Post(':id/tasks')
  async addTask(
    @Param('id') projectId: string,
    @Body() body: CreateTaskDto,
    @Headers() headers: IncomingHeaders,
  ) {
    requireAdmin(headers);
    return this.projectsService.createTask(projectId, body);
  }

  /** POST /projects/:id/assign — admin only */
  @Post(':id/assign')
  async assignUser(
    @Param('id') projectId: string,
    @Body() body: AssignUserDto,
    @Headers() headers: IncomingHeaders,
  ) {
    requireAdmin(headers);
    return this.projectsService.assignUser(projectId, body.userId);
  }

  /** DELETE /projects/:id/assign/:userId — admin only */
  @Delete(':id/assign/:userId')
  async unassignUser(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Headers() headers: IncomingHeaders,
  ) {
    requireAdmin(headers);
    return this.projectsService.unassignUser(projectId, userId);
  }

  /** GET /projects — admin: all / collaborateur: assigned only */
  @Get()
  async getProjects(@Headers() headers: IncomingHeaders) {
    const role = extractUserRole(headers);
    if (!role) {
      throw new UnauthorizedException('Header user-role manquant ou invalide');
    }

    if (role === UserRole.ADMIN) {
      return this.projectsService.findAllProjects();
    }

    const userId = requireUserId(headers);
    return this.projectsService.findProjectsByWorker(userId);
  }

  /** GET /projects/:id/my-tasks — assigned collaborator (or admin) */
  @Get(':id/my-tasks')
  async getMyTasks(
    @Param('id') projectId: string,
    @Headers() headers: IncomingHeaders,
  ) {
    return this.accessProjectThen(projectId, headers, (userId) =>
      this.projectsService.findTasksByProject(projectId, userId),
    );
  }

  /** GET /projects/:id/team — assigned collaborator (or admin) */
  @Get(':id/team')
  async getProjectTeam(
    @Param('id') projectId: string,
    @Headers() headers: IncomingHeaders,
  ) {
    return this.accessProjectThen(projectId, headers, () =>
      this.projectsService.findTeamMembers(projectId),
    );
  }

  /** GET /projects/:id — assigned collaborator (or admin) */
  @Get(':id')
  async getProjectDetails(
    @Param('id') projectId: string,
    @Headers() headers: IncomingHeaders,
  ) {
    const role = extractUserRole(headers);

    if (role === UserRole.ADMIN) {
      return this.projectsService.findProjectById(projectId);
    }

    const userId = requireUserId(headers);
    return this.projectsService.findProjectDetailsForWorker(projectId, userId);
  }

  /** PATCH /projects/:id/tasks/:taskId — assignees or admin */
  @Patch(':id/tasks/:taskId')
  async updateTask(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskDto,
    @Headers() headers: IncomingHeaders,
  ) {
    // `userId` est undefined pour un admin : dans ce cas personne n'est exclu
    // des notifications emises par updateTask.
    return this.accessProjectThen(projectId, headers, async (userId) => {
      return this.projectsService.updateTask(projectId, taskId, body, userId);
    });
  }

  /** DELETE /projects/:id/tasks/:taskId — admin only */
  @Delete(':id/tasks/:taskId')
  async deleteTask(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Headers() headers: IncomingHeaders,
  ) {
    requireAdmin(headers);
    return this.projectsService.deleteTask(projectId, taskId);
  }

  private async accessProjectThen<T>(
    projectId: string,
    headers: IncomingHeaders,
    action: (userId: string | undefined) => Promise<T>,
  ): Promise<T> {
    const role = extractUserRole(headers);

    if (role === UserRole.ADMIN) {
      await this.projectsService.assertProjectExists(projectId);
      return action(undefined);
    }

    const userId = requireUserId(headers);
    const assigned = await this.projectsService.isUserAssigned(
      projectId,
      userId,
    );
    if (!assigned) {
      throw new ForbiddenException(
        "Accès refusé : vous n'êtes pas assigné à ce projet.",
      );
    }
    return action(userId);
  }
}
