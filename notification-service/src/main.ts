import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Le service est hybride :
  //  - consommateur RabbitMQ, pour recevoir les evenements des autres services
  //  - serveur HTTP, pour que le frontend puisse lire les notifications
  //
  // C'est ce premier volet qui manquait jusqu'ici : sans connectMicroservice,
  // les @EventPattern ne sont jamais declenches, meme quand RabbitMQ tourne.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [
        process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq-service:5672',
      ],
      queue: process.env.RABBITMQ_QUEUE || 'notifications',
      // durable : la file survit au redemarrage du broker. Les evenements emis
      // pendant une panne du service sont donc conserves, pas perdus.
      queueOptions: { durable: true },
    },
  });

  app.enableCors();

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
