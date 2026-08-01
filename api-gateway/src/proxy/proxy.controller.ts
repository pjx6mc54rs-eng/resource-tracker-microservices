import { Controller, All, Req, Res, UseGuards, Next } from '@nestjs/common';
import * as express from 'express';
import { createProxyMiddleware, fixRequestBody, RequestHandler } from 'http-proxy-middleware';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api')
export class ProxyController {
  private readonly authProxy: RequestHandler;
  private readonly projectProxy: RequestHandler;
  private readonly timesheetProxy: RequestHandler;
  private readonly reportingProxy: RequestHandler
  public readonly chatProxy: RequestHandler
  private readonly notificationProxy: RequestHandler;

  constructor() {
    const commonOptions = {
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
      // Nest parses JSON before this controller runs. Restore that parsed body
      // onto the outgoing stream; otherwise the auth service waits forever for
      // the Content-Length bytes advertised by the original request.
      proxyTimeout: 15_000,
      on: {
        proxyReq: (proxyReq: any, req: any) => {
          if (req.user) {
            // Downstream header injection: pass authenticated user's info to microservices
            proxyReq.setHeader('x-user-id', req.user.id || req.user.sub || '')
            proxyReq.setHeader('x-user-role', req.user.role || '')
          }

          fixRequestBody(proxyReq, req)
        },
        // On a websocket upgrade failure http-proxy hands us the raw socket
        // here instead of an express Response, so branch before answering.
        error: (err: any, req: any, resOrSocket: any) => {
          if (typeof resOrSocket?.status !== 'function') {
            if (resOrSocket?.writable) {
              resOrSocket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n')
            }
            resOrSocket?.destroy?.()
            return
          }

          if (!resOrSocket.headersSent && !resOrSocket.writableEnded) {
            resOrSocket.status(503).json({
              statusCode: 503,
              message: 'Service Temporarily Unavailable',
              error: 'Service Unavailable',
              details: err.message,
            })
          }
        },
      },
    }

    this.authProxy = createProxyMiddleware({
      ...commonOptions,
      // Compose supplies AUTH_SERVICE_URL=http://auth-service:3000 inside
      // its network; this fallback is for running the services locally.
      target: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
    })

    this.projectProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.PROJECT_SERVICE_URL || 'http://localhost:3001',
    })

    this.timesheetProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.TIMESHEET_SERVICE_URL || 'http://localhost:3002',
    })

    this.reportingProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.REPORTING_SERVICE_URL || 'http://localhost:3003',
    })

    this.notificationProxy = createProxyMiddleware({
      ...commonOptions,
      target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
    })

    this.chatProxy = createProxyMiddleware({
      ...commonOptions,
      pathRewrite: {
        '^/api/chat/socket.io': '/socket.io',
        '^/api': '',
      },
      target: process.env.CHAT_SERVICE_URL || 'http://localhost:3004',
      ws: true,
    })
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

  @All('auth/uploads/*')
  handlePublicUploads(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.authProxy(req, res, next);
  }

  @All('chat/uploads/*')
  handlePublicChatUploads(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.chatProxy(req, res, next);
  }

  @All('chat/socket.io')
  handlePublicChatSocketIoRoot(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.chatProxy(req, res, next);
  }

  @All('chat/socket.io/*path')
  handlePublicChatSocketIoSub(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.chatProxy(req, res, next);
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

  @All('notifications')
  @UseGuards(JwtAuthGuard)
  handleNotificationsRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.notificationProxy(req, res, next);
  }

  @All('notifications/*')
  @UseGuards(JwtAuthGuard)
  handleNotificationsProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.notificationProxy(req, res, next);
  }

  @All('timesheets')
  @UseGuards(JwtAuthGuard)
  handleTimesheetsRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.timesheetProxy(req, res, next);
  }

  @All('timesheets/*')
  @UseGuards(JwtAuthGuard)
  handleTimesheetsProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.timesheetProxy(req, res, next)
  }

  @All('chat')
  @UseGuards(JwtAuthGuard)
  handleChatRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.chatProxy(req, res, next)
  }

  @All('chat/*')
  @UseGuards(JwtAuthGuard)
  handleChatProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.chatProxy(req, res, next)
  }

  @All('reporting')
  @UseGuards(JwtAuthGuard)
  handleReportingRootProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.reportingProxy(req, res, next)
  }

  @All('reporting/*')
  @UseGuards(JwtAuthGuard)
  handleReportingProxy(@Req() req: express.Request, @Res() res: express.Response, @Next() next: express.NextFunction) {
    this.reportingProxy(req, res, next);
  }
}