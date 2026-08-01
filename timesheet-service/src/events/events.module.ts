import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { EventsService } from './events.service';
import { NOTIFICATIONS_CLIENT } from './events.constants';

/**
 * Publication d'evenements vers notification-service via RabbitMQ.
 *
 * La file est la meme que celle ecoutee par notification-service
 * ("notifications") et elle est durable : si le service consommateur est
 * arrete, les evenements s'accumulent au lieu d'etre perdus.
 */
@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: NOTIFICATIONS_CLIENT,
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ||
              'amqp://admin:admin@rabbitmq-service:5672',
          ],
          queue: process.env.RABBITMQ_QUEUE || 'notifications',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
