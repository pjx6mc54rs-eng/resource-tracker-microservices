import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { NOTIFICATIONS_CLIENT } from './events.constants';

/**
 * Emission d'evenements de notification.
 *
 * Regle centrale : publier ne doit JAMAIS faire echouer l'action metier.
 * Si RabbitMQ est injoignable, une validation de feuille de temps doit
 * aboutir quand meme — l'utilisateur perd la notification, pas son travail.
 * Toutes les erreurs sont donc journalisees et absorbees ici.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @Inject(NOTIFICATIONS_CLIENT) private readonly client: ClientProxy,
  ) {}

  emit(pattern: string, payload: Record<string, unknown>): void {
    try {
      this.client.emit(pattern, payload).subscribe({
        error: (err: Error) =>
          this.logger.warn(
            `Publication de "${pattern}" en echec : ${err.message}`,
          ),
      });
    } catch (error) {
      this.logger.warn(
        `Publication de "${pattern}" impossible : ${(error as Error).message}`,
      );
    }
  }
}
