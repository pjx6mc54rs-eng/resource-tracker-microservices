import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATIONS_CLIENT } from './events.constants';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(NOTIFICATIONS_CLIENT) private readonly client: ClientProxy,
  ) {}

  /**
   * Publie un evenement sans attendre de reponse.
   *
   * L'echec de publication est journalise mais jamais propage : une reunion
   * cree avec succes ne doit pas remonter une erreur a l'utilisateur parce que
   * le bus de messages est momentanement indisponible.
   */
  emit(pattern: string, payload: Record<string, unknown>): void {
    try {
      this.client.emit(pattern, payload).subscribe({
        error: (err) =>
          this.logger.warn(
            `Publication de ${pattern} impossible : ${err?.message ?? err}`,
          ),
      });
    } catch (err) {
      this.logger.warn(
        `Publication de ${pattern} impossible : ${(err as Error)?.message}`,
      );
    }
  }
}
