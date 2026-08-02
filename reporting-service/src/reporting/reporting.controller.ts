import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { VerifiedUser, VerifiedUserGuard } from '../common/verified-user.guard';
import type { RequestUser } from '../common/request-user';
import { DashboardService } from './dashboard.service';
import type { DashboardResponse } from './dashboard.service';

/**
 * BFF du tableau de bord. Le front n'appelle que cette route : elle compose en
 * une seule réponse ce que le navigateur devait auparavant aller chercher dans
 * auth-service, project-service et timesheet-service.
 *
 * SÉCURITÉ : c'est la seule route du système à renvoyer des agrégats couvrant
 * toute l'entreprise, et elle est joignable en direct sur le réseau interne.
 * `VerifiedUserGuard` y vérifie donc lui-même la signature du jeton porteur et
 * en tire l'identité de l'appelant ; les en-têtes `x-user-*` ne sont plus une
 * source d'identité mais seulement un candidat à confronter au jeton.
 */
@Controller('reporting')
@UseGuards(VerifiedUserGuard)
export class ReportingController {
  constructor(private readonly dashboard: DashboardService) {}

  /** GET /reporting/dashboard?year=YYYY&month=M — mois courant par défaut. */
  @Get('dashboard')
  async getDashboard(
    @VerifiedUser() user: RequestUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Promise<DashboardResponse> {
    return this.dashboard.getDashboard(user, year, month);
  }
}
