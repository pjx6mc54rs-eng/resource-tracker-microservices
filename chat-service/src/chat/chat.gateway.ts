import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatMessageService } from './chat-message.service';
import { JoinProjectDto, SendMessageDto } from './dto/chat.dto';
import { AuthUser, ProjectAccessService } from './project-access.service';

type ChatSocket = Socket & { data: { user?: AuthUser; token?: string } };

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: ChatMessageService,
    private readonly access: ProjectAccessService,
  ) {}

  async handleConnection(client: ChatSocket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '');
    if (!token) return this.reject(client, 'JWT manquant');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email?: string; role: AuthUser['role'] }>(token, {
        secret: process.env.JWT_SECRET ?? 'change_this_secret',
      });
      if (!payload.sub || !payload.role) throw new Error('Invalid payload');
      client.data.user = { userId: payload.sub, email: payload.email, role: payload.role };
      client.data.token = token;
      this.logger.log(`WS connected: ${client.id}`);
    } catch {
      this.reject(client, 'JWT invalide');
    }
  }

  @SubscribeMessage('joinProject')
  async joinProject(@ConnectedSocket() client: ChatSocket, @MessageBody() body: JoinProjectDto) {
    const { user, token } = client.data;
    if (!user || !token) return { ok: false, message: 'Non authentifié' };
    try {
      await this.access.assertCanAccessProject(user, body?.projectId, token);
      const room = this.room(body.projectId);
      await client.join(room);
      client.emit('joinedProject', { projectId: body.projectId, room });
      return { ok: true, projectId: body.projectId };
    } catch (error: any) {
      const message = error?.message ?? 'Accès au projet refusé';
      client.emit('error', { message });
      return { ok: false, message };
    }
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(@ConnectedSocket() client: ChatSocket, @MessageBody() body: SendMessageDto) {
    const user = client.data.user;
    const message = body?.message?.trim();
    if (!user || !body?.projectId || !message) return { ok: false, message: 'Message invalide' };
    const room = this.room(body.projectId);
    if (!client.rooms.has(room)) return { ok: false, message: 'Rejoignez d’abord le projet' };

    const saved = await this.messages.save(body.projectId, user.userId, message);
    const payload = { ...saved, timestamp: saved.createdAt.toISOString() };
    this.server.to(room).emit('newMessage', payload);
    return { ok: true, message: payload };
  }

  private room(projectId: string) {
    return `project-${projectId}`;
  }

  private reject(client: ChatSocket, message: string) {
    client.emit('error', { message });
    client.disconnect(true);
  }
}
