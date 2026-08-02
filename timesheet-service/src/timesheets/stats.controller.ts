import { Controller, Get, Headers, Query } from '@nestjs/common';
import { requireRequestUser } from '../common/request-user';
import type { IncomingHeaders } from '../common/request-user';
import { TimesheetStatsService } from './stats.service';

/**
 * Agregats en lecture seule consommes par reporting-service.
 *
 * La portee (admin / responsable / soi-meme) n'est jamais un parametre : elle
 * est deduite de l'identite injectee par le gateway.
 */
@Controller('timesheets/stats')
export class TimesheetStatsController {
  constructor(private readonly statsService: TimesheetStatsService) {}

  /**
   * Heures agregees sur `?from=AAAA-MM&to=AAAA-MM`, sous deux formes calculees
   * sur la meme portee et la meme plage :
   *   - `rows`       : ventilation par (utilisateur, projet, annee, mois) ;
   *   - `userMonths` : agregat par (utilisateur, annee, mois), sans projet.
   *
   * Toute grandeur par utilisateur-mois doit etre lue dans `userMonths` :
   * `filledDays` etant un COUNT(DISTINCT date), sommer les lignes de `rows`
   * compte deux fois une journee repartie sur deux projets. `rows` ne sert qu'a
   * la ventilation par projet.
   */
  @Get('hours')
  async getHours(
    @Headers() headers: IncomingHeaders,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = requireRequestUser(headers);
    return this.statsService.getHours(user, from, to);
  }

  /** Etats de validation existants sur la plage. `?from=AAAA-MM&to=AAAA-MM` */
  @Get('periods')
  async getPeriods(
    @Headers() headers: IncomingHeaders,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = requireRequestUser(headers);
    return this.statsService.getPeriods(user, from, to);
  }
}
