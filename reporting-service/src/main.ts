import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertJwtSecretConfigured } from './common/jwt-secret';

async function bootstrap() {
  // Contrôle bruyant AVANT d'accepter le moindre appel : sans JWT_SECRET,
  // /reporting/dashboard refusera tout (503) au lieu de croire les en-têtes.
  assertJwtSecretConfigured();

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3003);
}
bootstrap();
