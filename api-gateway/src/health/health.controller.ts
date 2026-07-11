import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  async getHealth() {
    const services = {
      auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3000',
      project: process.env.PROJECT_SERVICE_URL || 'http://project-service:3000',
      timesheet: process.env.TIMESHEET_SERVICE_URL || 'http://timesheet-service:3000',
      reporting: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3000',
    };

    const status: Record<string, any> = {};
    let isHealthy = true;

    for (const [name, url] of Object.entries(services)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        status[name] = {
          status: res.ok || res.status < 500 ? 'up' : 'down',
          statusCode: res.status,
        };
        if (res.status >= 500) {
          isHealthy = false;
        }
      } catch (err: any) {
        status[name] = {
          status: 'down',
          error: err.message,
        };
        isHealthy = false;
      }
    }

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      services: status,
    };
  }
}
