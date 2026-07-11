import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change_this_secret',
    }),
  ],
  controllers: [ProxyController, HealthController],
})
export class AppModule {}
