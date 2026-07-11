import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS since the React frontend will make calls to this entrypoint
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`API Gateway is running on port ${port}`);
}
bootstrap();
