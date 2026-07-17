import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { ChatService } from './chat-message.service'
import { JoinRoomDto, SendMessageDto } from './dto/chat.dto'
import { AuthUser } from './project-access.service'

type ChatSocket = Socket & { data: { user?: AuthUser; token?: string } }

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name)
  private readonly activeUsers = new Map<string, Set<string>>()

  @WebSocketServer()
  server!: Server

  constructor(
      private readonly jwt: JwtService,
      private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: ChatSocket) {
    const token =
        (client.handshake.auth?.token as string | undefined) ??
        client.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '')
    if (!token) return this.reject(client, 'JWT manquant')

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email?: string; role: AuthUser['role'] }>(token, {
        secret: process.env.JWT_SECRET ?? 'change_this_secret',
      })
      if (!payload.sub || !payload.role) throw new Error('Invalid payload')
      client.data.user = { userId: payload.sub, email: payload.email, role: payload.role }
      client.data.token = token

      this.logger.log(`WS connected: ${client.id} for user ${payload.sub}`)
      this.addSocketForUser(payload.sub, client.id)

      // Rejoint automatiquement toutes les rooms des canaux où l'utilisateur est déjà membre.
      await this.joinAllUserChannels(client, payload.sub)

      // Notifie que l'utilisateur est en ligne
      this.server.emit('presence_update', { userId: payload.sub, online: true })
    } catch (err) {
      this.logger.warn(`Connexion WS rejetée: ${(err as Error)?.message}`)
      this.reject(client, 'JWT invalide')
    }
  }

  async handleDisconnect(client: ChatSocket) {
    const userId = client.data.user?.userId
    if (!userId) return
    const clients = this.activeUsers.get(userId)
    if (clients) {
      clients.delete(client.id)
      if (clients.size === 0) {
        this.activeUsers.delete(userId)
        this.server.emit('presence_update', { userId, online: false })
      }
    }
  }

  @SubscribeMessage('join_room')
  async joinRoom(@ConnectedSocket() client: ChatSocket, @MessageBody() body: JoinRoomDto) {
    const user = client.data.user
    if (!user || !body?.channelId) {
      return { ok: false, message: 'Non authentifié ou canal invalide' }
    }

    try {
      await this.chatService.assertChannelMember(body.channelId, user.userId)
      await client.join(body.channelId)
      this.logger.log(`[WS] Client ${client.id} (${user.userId}) a rejoint manuellement la room ${body.channelId}`)
      return { ok: true, channelId: body.channelId }
    } catch (error: any) {
      client.emit('error', { message: error?.message ?? 'Accès refusé au canal' })
      return { ok: false, message: error?.message ?? 'Accès refusé au canal' }
    }
  }

  @SubscribeMessage('send_message')
  async sendMessageToChannel(@ConnectedSocket() client: ChatSocket, @MessageBody() body: SendMessageDto) {
    const user = client.data.user
    const messageText = body?.message?.trim()
    if (!user || !body?.channelId || !messageText) {
      return { ok: false, message: 'Message invalide' }
    }

    const existingChannel = await this.chatService.getChannelById(body.channelId)
    if (!existingChannel) {
      return { ok: false, message: 'Canal introuvable' }
    }

    // Vérifie que l'utilisateur fait bien partie de ce canal
    const isMember = existingChannel.members?.some(member => member.userId === user.userId)
    if (!isMember) {
      return { ok: false, message: 'Vous ne faites pas partie de ce canal' }
    }

    // Enregistre le message en BDD d'abord
    const saved = await this.chatService.saveMessage(body.channelId, user.userId, messageText)
    const payload = {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
    }

    // Force TOUS les membres de ce canal à rejoindre la room de socket s'ils sont connectés quelque part
    await this.ensureChannelMembersJoined(existingChannel.id, existingChannel.projectId)

    // S'assure que l'expéditeur actuel est bien dans la room
    if (!client.rooms.has(body.channelId)) {
      await client.join(body.channelId)
    }

    // Diffuse le message à la room du canal
    this.server.to(body.channelId).emit('new_message', payload)

    // Si lié à un projet, diffuse aussi sur le canal projet
    if (saved.projectId) {
      this.server.to(`project-${saved.projectId}`).emit('newMessage', payload)
    }

    return { ok: true, message: payload }
  }

  @SubscribeMessage('joinProject')
  async joinProject(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { projectId: string }) {
    const { user } = client.data
    if (!user || !body?.projectId) {
      return { ok: false, message: 'Non authentifié ou projet invalide' }
    }

    try {
      const channel = await this.chatService.findOrCreateProjectChannelById(body.projectId, user.userId)
      await client.join(`project-${body.projectId}`)
      if (channel?.id) {
        await client.join(channel.id)
      }
      return { ok: true, projectId: body.projectId }
    } catch (error: any) {
      client.emit('error', { message: error?.message ?? 'Accès au projet refusé' })
      return { ok: false, message: error?.message ?? 'Accès au projet refusé' }
    }
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { projectId: string; message: string }) {
    const user = client.data.user
    const messageText = body?.message?.trim()
    if (!user || !body?.projectId || !messageText) {
      return { ok: false, message: 'Message invalide' }
    }

    const room = `project-${body.projectId}`
    if (!client.rooms.has(room)) {
      return { ok: false, message: 'Rejoignez d\'abord le projet' }
    }

    const channel = await this.chatService.findOrCreateProjectChannelById(body.projectId, user.userId)
    if (!channel?.id) {
      return { ok: false, message: 'Canal introuvable' }
    }

    await this.ensureChannelMembersJoined(channel.id, body.projectId)

    const saved = await this.chatService.saveMessage(channel.id, user.userId, messageText)
    const payload = {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
    }

    this.server.to(room).emit('newMessage', payload)
    this.server.to(channel.id).emit('new_message', payload)
    return { ok: true, message: payload }
  }

  // Fait rejoindre au client toutes les rooms des canaux où il est déjà membre en base
  private async joinAllUserChannels(client: ChatSocket, userId: string) {
    try {
      const memberships = await this.chatService.getUserChannelIds(userId)
      for (const membership of memberships) {
        await client.join(membership.channelId)
        if (membership.projectId) {
          await client.join(`project-${membership.projectId}`)
        }
      }
      this.logger.log(`Client ${client.id} a rejoint automatiquement ${memberships.length} room(s)`)
    } catch (err) {
      this.logger.error(`Échec du join automatique des rooms pour ${userId}: ${(err as Error)?.message}`)
    }
  }

  // S'assure que tous les membres actifs d'un canal ont bien rejoint la room Socket.io correspondante
  private async ensureChannelMembersJoined(channelId: string, projectId?: string) {
    try {
      const channel = await this.chatService.getChannelById(channelId)
      if (!channel) return

      const memberUserIds = Array.from(new Set(channel.members?.map((member) => member.userId) ?? []))

      // Récupère tous les sockets connectés au serveur actuellement
      const allConnectedSockets = await this.server.fetchSockets()

      for (const userId of memberUserIds) {
        // On cherche tous les sockets qui appartiennent à cet utilisateur
        const userSockets = allConnectedSockets.filter(
            (s) => (s.data as any)?.user?.userId === userId
        )

        for (const socket of userSockets) {
          if (!socket.rooms.has(channelId)) {
            await socket.join(channelId)
            this.logger.log(`[WS-Force-Join] User ${userId} (${socket.id}) forcé dans la room ${channelId}`)
          }
          if (projectId && !socket.rooms.has(`project-${projectId}`)) {
            await socket.join(`project-${projectId}`)
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Échec du join des membres pour le canal ${channelId}: ${(err as Error)?.message}`)
    }
  }

  private addSocketForUser(userId: string, socketId: string) {
    const sockets = this.activeUsers.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    this.activeUsers.set(userId, sockets)
  }

  private reject(client: ChatSocket, message: string) {
    client.emit('error', { message })
    client.disconnect(true)
  }
}