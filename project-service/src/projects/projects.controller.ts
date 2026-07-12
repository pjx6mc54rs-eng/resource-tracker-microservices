import { Controller, Post, Get, Body, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { TaskStatus } from '../entities/task.entity';

@Controller('projects')
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) {}

    // 1. Créer un projet (Admin uniquement)
    @Post()
    async createProject(
        @Body() body: { name: string; description?: string },
        @Headers('user-role') role: string
    ) {
        if (role !== 'admin') throw new UnauthorizedException('Accès réservé aux administrateurs');
        return this.projectsService.createProject(body);
    }

    // 2. Ajouter une tâche à un projet (Admin uniquement)
    @Post(':id/tasks')
    async addTask(
        @Param('id') projectId: string,
        @Body() body: { title: string; status?: TaskStatus },
        @Headers('user-role') role: string
    ) {
        if (role !== 'admin') throw new UnauthorizedException('Accès réservé aux administrateurs');
        return this.projectsService.createTask(projectId, body);
    }

    // 3. Assigner un collaborateur à un projet (Admin uniquement)
    @Post(':id/assign')
    async assignUser(
        @Param('id') projectId: string,
        @Body() body: { userId: string },
        @Headers('user-role') role: string
    ) {
        if (role !== 'admin') throw new UnauthorizedException('Accès réservé aux administrateurs');
        return this.projectsService.assignUser(projectId, body.userId);
    }

    // 4. Liste des projets (Admin voit tout, Collaborateur voit ses assignations)
    @Get()
    async getProjects(
        @Headers('user-role') role: string,
        @Headers('user-id') userId: string
    ) {
        if (role === 'admin') {
            return this.projectsService.findAllProjects();
        } else {
            if (!userId) throw new UnauthorizedException('Identifiant utilisateur manquant');
            return this.projectsService.findProjectsByWorker(userId);
        }
    }

    // 5. Voir les détails d'un de ses projets spécifiques (Équipe + Tâches)
    @Get(':id')
    async getProjectDetails(
        @Param('id') projectId: string,
        @Headers('user-id') userId: string
    ) {
        if (!userId) throw new UnauthorizedException('Identifiant utilisateur manquant');
        return this.projectsService.findProjectDetailsForWorker(projectId, userId);
    }

// 6. Récupérer uniquement les tâches d'un de ses projets (Pratique pour le formulaire du timesheet-service)
    @Get(':id/my-tasks')
    async getMyTasks(
        @Param('id') projectId: string,
        @Headers('user-id') userId: string
    ) {
        if (!userId) throw new UnauthorizedException('Identifiant utilisateur manquant');
        return this.projectsService.findTasksByProjectForWorker(projectId, userId);
    }

// 7. Voir les membres de l'équipe sur un projet commun
    @Get(':id/team')
    async getProjectTeam(
        @Param('id') projectId: string,
        @Headers('user-id') userId: string
    ) {
        if (!userId) throw new UnauthorizedException('Identifiant utilisateur manquant');
        return this.projectsService.findTeamMembersForWorker(projectId, userId);
    }
}