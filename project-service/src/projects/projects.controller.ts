import {
  Controller,
  Post,
  Get,
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
    return this.projectsService.createProject(body);
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
    const assigned = await this.projectsService.isUserAssigned(projectId, userId);
    if (!assigned) {
      throw new ForbiddenException(
        "Accès refusé : vous n'êtes pas assigné à ce projet.",
      );
    }
    return action(userId);
  }
}
