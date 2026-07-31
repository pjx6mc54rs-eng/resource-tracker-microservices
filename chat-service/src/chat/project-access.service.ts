import { HttpService } from '@nestjs/axios';
import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export type AuthUser = { userId: string; email?: string; role: 'admin' | 'responsable' | 'collaborateur' };

@Injectable()
export class ProjectAccessService {
  constructor(private readonly http: HttpService) {}

  async assertCanAccessProject(user: AuthUser, projectId: string, token: string): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    const baseUrl = process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3001';
    try {
      await firstValueFrom(
        this.http.get(`${baseUrl}/projects/${projectId}`, {
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': user.userId,
            'x-user-role': user.role,
          },
          timeout: 5000,
        }),
      );
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) throw new NotFoundException('Projet introuvable');
      if (status === 401 || status === 403) throw new ForbiddenException('Accès au projet refusé');
      throw new ServiceUnavailableException('project-service indisponible');
    }
  }
}
