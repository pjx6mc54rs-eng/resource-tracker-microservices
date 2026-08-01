import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorName?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly repository: Repository<Notification>,
  ) {}

  /**
   * Cree une notification par destinataire. Les doublons de destinataires sont
   * ecartes : un responsable qui est aussi createur ne doit pas etre prevenu
   * deux fois du meme evenement.
   */
  async createMany(
    userIds: string[],
    payload: Omit<CreateNotificationInput, 'userId'>,
  ): Promise<Notification[]> {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (unique.length === 0) {
      this.logger.warn(`Evenement "${payload.type}" sans destinataire, ignore.`);
      return [];
    }

    const rows = unique.map((userId) =>
      this.repository.create({
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
        actorName: payload.actorName ?? null,
        read: false,
      }),
    );

    const saved = await this.repository.save(rows);
    this.logger.log(
      `${saved.length} notification(s) "${payload.type}" creee(s)`,
    );
    return saved;
  }

  findForUser(userId: string, limit = 30) {
    return this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  countUnread(userId: string) {
    return this.repository.count({ where: { userId, read: false } });
  }

  /**
   * Marque comme lues. Le filtre sur userId est indispensable : sans lui, un
   * utilisateur pourrait marquer les notifications d'un autre en devinant un id.
   */
  async markRead(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.repository.update(
      { userId, id: In(ids) },
      { read: true },
    );
    return result.affected ?? 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.repository.update(
      { userId, read: false },
      { read: true },
    );
    return result.affected ?? 0;
  }
}
