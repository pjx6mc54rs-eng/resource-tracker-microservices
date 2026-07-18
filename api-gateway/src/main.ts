import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProxyController } from './proxy/proxy.controller';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS since the React frontend will make calls to this entrypoint
  app.enableCors();

  const proxyController = app.get(ProxyController);
  const server = app.getHttpServer();
  server.on('upgrade', (req: any, socket: any, head: any) => {
    if (req.url?.startsWith('/api/chat/socket.io')) {
      proxyController.chatProxy.upgrade(req, socket, head);
    }
  });

  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`API Gateway is running on port ${port}`);
}
bootstrap();
