import { Controller, All, Req, Res, UseGuards, Next } from '@nestjs/common';
import * as express from 'express';
import { createProxyMiddleware, RequestHandler, fixRequestBody } from 'http-proxy-middleware';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api')
export class ProxyController {
  private readonly authProxy: RequestHandler;
  private readonly projectProxy: RequestHandler;
  private readonly timesheetProxy: RequestHandler;
  private readonly reportingProxy: RequestHandler;

  constructor() {
    const commonOptions = {
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
      onProxyReq: (proxyReq: any, req: any) => {
        // CORRECTION : Permet de renvoyer le body JSON consommé par NestJS aux microservices
        fixRequestBody(proxyReq, req);

        if (req.user) {
          // Injection uniforme des en-têtes sécurisés
          proxyReq.setHeader('x-user-id', req.user.id || req.user.sub || '');
          proxyReq.setHeader('x-user-role', req.user.role || '');
        }
      },
      onError: (err: any, req: any, res: any) => {
        res.status(503).json({
          statusCode: 503,
          message: 'Service Temporarily Unavailable',
          error: 'Service Unavailable',
          details: err.message,
        });
      },
    };

    this.authProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.AUTH_SERVICE_URL || 'http://auth-service:3000',
    });

    this.projectProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.PROJECT_SERVICE_URL || 'http://project-service:3000',
    });

    this.timesheetProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.TIMESHEET_SERVICE_URL || 'http://timesheet-service:3000',
    });

    this.reportingProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.REPORTING_SERVICE_URL || 'http://reporting-service:3000',
    });
  }

  // 1. PUBLIC ROUTES
  @All('auth/login')
  handlePublicLogin(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.authProxy(req, res, next);
  }

  @All('auth/register')
  handlePublicRegister(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.authProxy(req, res, next);
  }

  // 2. PROTECTED ROUTES
  @All('auth/*')
  @UseGuards(JwtAuthGuard)
  handleAuthProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.authProxy(req, res, next);
  }

  @All('projects')
  @UseGuards(JwtAuthGuard)
  handleProjectsRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.projectProxy(req, res, next);
  }

  @All('projects/*')
  @UseGuards(JwtAuthGuard)
  handleProjectsProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.projectProxy(req, res, next);
  }

  @All('tasks')
  @UseGuards(JwtAuthGuard)
  handleTasksRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.projectProxy(req, res, next);
  }

  @All('tasks/*')
  @UseGuards(JwtAuthGuard)
  handleTasksProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.projectProxy(req, res, next);
  }

  @All('timesheets')
  @UseGuards(JwtAuthGuard)
  handleTimesheetsRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.timesheetProxy(req, res, next);
  }

  @All('timesheets/*')
  @UseGuards(JwtAuthGuard)
  handleTimesheetsProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.timesheetProxy(req, res, next);
  }

  @All('reporting')
  @UseGuards(JwtAuthGuard)
  handleReportingRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.reportingProxy(req, res, next);
  }

  @All('reporting/*')
  @UseGuards(JwtAuthGuard)
  handleReportingProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.reportingProxy(req, res, next);
  }
}