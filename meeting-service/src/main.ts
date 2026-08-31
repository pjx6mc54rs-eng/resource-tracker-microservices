import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // whitelist : les champs non declares dans les DTO sont retires, ce qui evite
  // qu'un appelant impose par exemple son propre organizerId.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.enableCors();

  // 3007 : emplacement de ce service dans la carte des ports du mode hote
  // (3000 auth, 3001 project, 3002 timesheet, 3003 reporting, 3004 chat,
  // 3005 api-gateway, 3006 notification). Compose et Kubernetes imposent 3000.
  await app.listen(process.env.PORT ?? 3007);
}
bootstrap();
