import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
// @ts-ignore
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
<<<<<<< Updated upstream
    const app =
        await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
            transport: Transport.TCP,
            options: {
                host: process.env.HOST || '0.0.0.0',
                port: Number(process.env.PORT) || 3001,
            },
        });
=======
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors();
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
>>>>>>> Stashed changes

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    await app.listen();
    console.log('✅ Auth Service TCP running on port 3001');
}

bootstrap();