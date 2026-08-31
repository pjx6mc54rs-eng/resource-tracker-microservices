import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { EventsService } from './events.service';
import { NOTIFICATIONS_CLIENT } from './events.constants';

@Module({
  providers: [
    {
      provide: NOTIFICATIONS_CLIENT,
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [
              process.env.RABBITMQ_URL ?? 'amqp://admin:admin@localhost:5672',
            ],
            queue: process.env.RABBITMQ_QUEUE ?? 'notifications',
            queueOptions: { durable: true },
          },
        }),
    },
    EventsService,
  ],
  exports: [EventsService],
})
export class EventsModule {}
