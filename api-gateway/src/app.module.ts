import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change_this_secret',
    }),

    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.AUTH_SERVICE_HOST || 'auth-service',
          port: Number(process.env.AUTH_SERVICE_PORT) || 3001,
        },
      },
      {
        name: 'EMPLOYEE_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.EMPLOYEE_SERVICE_HOST || 'employee-service',
          port: Number(process.env.EMPLOYEE_SERVICE_PORT) || 3002,
        },
      },
      {
        name: 'PROJECT_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.PROJECT_SERVICE_HOST || 'project-service',
          port: Number(process.env.PROJECT_SERVICE_PORT) || 3003,
        },
      },
      {
        name: 'ASSIGNMENT_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.ASSIGNMENT_SERVICE_HOST || 'assignment-service',
          port: Number(process.env.ASSIGNMENT_SERVICE_PORT) || 3004,
        },
      },
    ]),
  ],
  controllers: [ProxyController, HealthController],
})
export class AppModule {}