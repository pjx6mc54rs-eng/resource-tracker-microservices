import {Injectable, NotFoundException, ConflictException, UnauthorizedException} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { Assignment } from '../entities/assignment.entity';

@Injectable()
export class ProjectsService {
    constructor(
        @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
        @InjectRepository(Task) private readonly taskRepo: Repository<Task>,
        @InjectRepository(Assignment) private readonly assignmentRepo: Repository<Assignment>,
    ) {}

                     //ADMIN

    async createProject(data: Partial<Project>): Promise<Project> {
        const project = this.projectRepo.create(data);
        return this.projectRepo.save(project);
    }

    async createTask(projectId: string, data: Partial<Task>): Promise<Task> {
        const project = await this.projectRepo.findOne({ where: { id: projectId } });
        if (!project) throw new NotFoundException('Projet introuvable');

        const task = this.taskRepo.create({ ...data, projectId });
        return this.taskRepo.save(task);
    }

    async assignUser(projectId: string, userId: string): Promise<Assignment> {
        const project = await this.projectRepo.findOne({ where: { id: projectId } });
        if (!project) throw new NotFoundException('Projet introuvable');

        // Vérifie si le collaborateur est déjà assigné au projet
        const existing = await this.assignmentRepo.findOne({ where: { projectId, userId } });
        if (existing) throw new ConflictException('Ce collaborateur est déjà assigné à ce projet');

        const assignment = this.assignmentRepo.create({ projectId, userId });
        return this.assignmentRepo.save(assignment);
    }

    async findAllProjects(): Promise<Project[]> {
        // @ts-ignore
        return this.projectRepo.find( { relations: ['tasks', 'assignments'] });
    }

                       //COLLABORATEUR

    async findProjectsByWorker(userId: string): Promise<Project[]> {
        // Récupère uniquement les projets où l'utilisateur apparaît dans les affectations
        return this.projectRepo.createQueryBuilder('project')
            .innerJoin('project.assignments', 'assignment', 'assignment.userId = :userId', { userId })
            .leftJoinAndSelect('project.tasks', 'task')
            .getMany();
    }


    /**
     * Récupère les détails d'un projet spécifique, UNIQUEMENT si le collaborateur y est assigné.
     */
    async findProjectDetailsForWorker(projectId: string, userId: string): Promise<Project> {
        const project = await this.projectRepo.createQueryBuilder('project')
            .innerJoin('project.assignments', 'assignment', 'assignment.userId = :userId', { userId })
            .leftJoinAndSelect('project.tasks', 'task')
            .leftJoinAndSelect('project.assignments', 'all_assignments') // Permet de voir l'équipe du projet
            .where('project.id = :projectId', { projectId })
            .getOne();

        if (!project) {
            throw new NotFoundException("Projet introuvable ou vous n'y êtes pas assigné.");
        }

        return project;
    }

    /**
     * Récupère uniquement la liste des tâches d'un projet donné,
     * à condition que le collaborateur fasse partie du projet.
     */
    async findTasksByProjectForWorker(projectId: string, userId: string): Promise<Task[]> {
        // On vérifie d'abord l'assignation
        const isAssigned = await this.assignmentRepo.findOne({ where: { projectId, userId } });
        if (!isAssigned) {
            throw new UnauthorizedException("Accès refusé : vous n'êtes pas assigné à ce projet.");
        }

        return this.taskRepo.find({ where: { projectId } });
    }

    /**
     * Récupère la liste de tous les collaborateurs qui travaillent sur le même projet
     * (Utile pour l'affichage de l'équipe sur le frontend)
     */
    async findTeamMembersForWorker(projectId: string, userId: string): Promise<Assignment[]> {
        const isAssigned = await this.assignmentRepo.findOne({ where: { projectId, userId } });
        if (!isAssigned) {
            throw new UnauthorizedException("Accès refusé : vous n'êtes pas assigné à ce projet.");
        }

        return this.assignmentRepo.find({ where: { projectId } });
    }

}