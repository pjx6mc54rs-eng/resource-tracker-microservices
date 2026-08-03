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
      // Le repli vise localhost : c'est le cas du developpement hors conteneur,
      // ou RabbitMQ est joignable via le port publie par docker compose.
      // Docker compose et Kubernetes fournissent tous les deux RABBITMQ_URL.
      urls: [process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672'],
      queue: process.env.RABBITMQ_QUEUE || 'notifications',
      // durable : la file survit au redemarrage du broker. Les evenements emis
      // pendant une panne du service sont donc conserves, pas perdus.
      queueOptions: { durable: true },
    },
  });

  app.enableCors();

  await app.startAllMicroservices();
  // 3006 = l'emplacement de ce service dans la carte des ports du mode hote
  // (3000 auth, 3001 project, 3002 timesheet, 3003 reporting, 3004 chat,
  // 3005 api-gateway). Docker compose et Kubernetes imposent PORT=3000.
  await app.listen(process.env.PORT ?? 3006);
}
bootstrap();
