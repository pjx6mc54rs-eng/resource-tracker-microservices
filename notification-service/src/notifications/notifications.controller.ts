import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { NotificationsService } from './notifications.service';

type IncomingHeaders = Record<string, string | string[] | undefined>;

/**
 * L'identite vient des en-tetes injectes par l'api-gateway apres verification
 * du JWT (voir proxy.controller.ts : setHeader('x-user-id', ...)). Meme
 * convention que timesheet-service, pour ne pas introduire un second contrat.
 */
function requireUserId(headers: IncomingHeaders): string {
  const raw = headers['x-user-id'] ?? headers['user-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const userId = value?.trim();
  if (!userId) {
    throw new UnauthorizedException('En-tête x-user-id absent');
  }
  return userId;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Liste des notifications du demandeur, plus recentes d'abord. */
  @Get()
  async list(
    @Headers() headers: IncomingHeaders,
    @Query('limit') limit?: string,
  ) {
    const userId = requireUserId(headers);
    const parsed = Number.parseInt(limit ?? '', 10);
    const items = await this.notifications.findForUser(
      userId,
      Number.isFinite(parsed) ? parsed : 30,
    );
    const unread = await this.notifications.countUnread(userId);
    return { items, unread };
  }

  /** Compteur seul : utilise par la cloche, bien plus leger que la liste. */
  @Get('unread-count')
  async unreadCount(@Headers() headers: IncomingHeaders) {
    const userId = requireUserId(headers);
    return { unread: await this.notifications.countUnread(userId) };
  }

  @Patch(':id/read')
  async markOneRead(
    @Headers() headers: IncomingHeaders,
    @Param('id') id: string,
  ) {
    const userId = requireUserId(headers);
    const updated = await this.notifications.markRead(userId, [id]);
    return { updated };
  }

  @Patch('read')
  async markRead(
    @Headers() headers: IncomingHeaders,
    @Body() body: { ids?: string[] },
  ) {
    const userId = requireUserId(headers);
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const updated = ids.length
      ? await this.notifications.markRead(userId, ids)
      : await this.notifications.markAllRead(userId);
    return { updated };
  }
}
