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
import { CallService, RINGING_TIMEOUT_MS } from './call.service'
import { CallType } from '../entities/call.entity'
import { JoinRoomDto, SendMessageDto } from './dto/chat.dto'
import { AuthUser } from './project-access.service'

type ChatSocket = Socket & { data: { user?: AuthUser; token?: string } }

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name)
  private readonly activeUsers = new Map<string, Set<string>>()
  /** Minuteries de sonnerie : un appel sans reponse bascule en « manque ». */
  private readonly ringingTimers = new Map<string, NodeJS.Timeout>()

  @WebSocketServer()
  server!: Server

  constructor(
      private readonly jwt: JwtService,
      private readonly chatService: ChatService,
      private readonly callService: CallService,
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

      // Room personnelle : la signalisation d'appel vise un utilisateur precis
      // (et tous ses onglets ouverts), pas un canal.
      await client.join(`user-${payload.sub}`)

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
        // Fermeture de l'onglet pendant un appel : le correspondant doit etre
        // libere, sinon il reste bloque sur un ecran d'appel sans interlocuteur.
        await this.endCallsForUser(userId)
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
      await this.chatService.assertChannelMember(body.channelId, user)
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
    const imageUrl = body?.imageUrl?.trim()
    if (!user || !body?.channelId || (!messageText && !imageUrl)) {
      return { ok: false, message: 'Message ou image invalide' }
    }

    const existingChannel = await this.chatService.getChannelById(body.channelId)
    if (!existingChannel) {
      return { ok: false, message: 'Canal introuvable' }
    }

    // Vérifie que l'utilisateur fait bien partie de ce canal
    let isMember = existingChannel.members?.some(member => member.userId === user.userId)
    if (!isMember) {
      try {
        await this.chatService.assertChannelMember(body.channelId, user)
        isMember = true
      } catch {
        return { ok: false, message: 'Vous ne faites pas partie de ce canal' }
      }
    }

    // Enregistre le message en BDD d'abord
    const saved = await this.chatService.saveMessage(
      body.channelId,
      user.userId,
      messageText ?? '',
      imageUrl,
      body.parentMessageId,
      body.isForwarded,
    )
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

  @SubscribeMessage('message_read')
  async handleMessageRead(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { channelId: string }) {
    const user = client.data.user
    if (!user || !body?.channelId) return
    client.to(body.channelId).emit('message_read', { channelId: body.channelId, userId: user.userId, readAt: new Date().toISOString() })
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { projectId: string; message?: string; imageUrl?: string; parentMessageId?: string; isForwarded?: boolean },
  ) {
    const user = client.data.user
    const messageText = body?.message?.trim()
    const imageUrl = body?.imageUrl?.trim()
    if (!user || !body?.projectId || (!messageText && !imageUrl)) {
      return { ok: false, message: 'Message ou image invalide' }
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

    const saved = await this.chatService.saveMessage(
      channel.id,
      user.userId,
      messageText ?? '',
      imageUrl,
      body.parentMessageId,
      body.isForwarded,
    )
    const payload = {
      ...saved,
      createdAt: saved.createdAt.toISOString(),
    }

    this.server.to(room).emit('newMessage', payload)
    this.server.to(channel.id).emit('new_message', payload)
    return { ok: true, message: payload }
  }

  // ==========================================================================
  // Signalisation WebRTC
  //
  // Seules les metadonnees de mise en relation transitent ici : description de
  // session (SDP) et candidats reseau (ICE). Le flux audio/video circule
  // directement entre les deux navigateurs, ou via TURN, mais jamais par ce
  // service ni par l'api-gateway.
  // ==========================================================================

  @SubscribeMessage('call:invite')
  async callInvite(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { channelId: string; type?: string },
  ) {
    const user = client.data.user
    if (!user || !body?.channelId) return { ok: false, message: 'Requête invalide' }

    const type = body.type === 'VIDEO' ? CallType.VIDEO : CallType.AUDIO
    try {
      const { call, peerIds } = await this.callService.initiate(body.channelId, user.userId, type)

      for (const peerId of peerIds) {
        this.server.to(`user-${peerId}`).emit('call:incoming', {
          callId: call.id,
          channelId: call.channelId,
          type: call.type,
          from: user.userId,
          createdAt: call.createdAt.toISOString(),
        })
      }

      // Sans reponse au bout du delai, l'appel est clos en « manque » des deux
      // cotes : sinon un correspondant hors ligne laisserait sonner indefiniment.
      this.ringingTimers.set(
        call.id,
        setTimeout(() => void this.expireCall(call.id), RINGING_TIMEOUT_MS),
      )

      return { ok: true, callId: call.id, type: call.type, peerIds }
    } catch (error: any) {
      return { ok: false, message: error?.message ?? "Impossible d'ouvrir l'appel" }
    }
  }

  @SubscribeMessage('call:accept')
  async callAccept(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { callId: string }) {
    const user = client.data.user
    if (!user || !body?.callId) return { ok: false, message: 'Requête invalide' }
    try {
      const call = await this.callService.accept(body.callId, user.userId)
      this.clearRingingTimer(call.id)
      this.broadcastToCall(call.id, 'call:accepted', { callId: call.id, by: user.userId })
      return { ok: true, callId: call.id }
    } catch (error: any) {
      return { ok: false, message: error?.message ?? 'Échec de la prise d\'appel' }
    }
  }

  @SubscribeMessage('call:decline')
  async callDecline(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { callId: string }) {
    const user = client.data.user
    if (!user || !body?.callId) return { ok: false, message: 'Requête invalide' }
    try {
      const call = await this.callService.decline(body.callId, user.userId)
      this.clearRingingTimer(call.id)
      this.broadcastToCall(call.id, 'call:ended', {
        callId: call.id,
        status: call.status,
        by: user.userId,
      })
      return { ok: true }
    } catch (error: any) {
      return { ok: false, message: error?.message ?? 'Échec du refus' }
    }
  }

  @SubscribeMessage('call:end')
  async callEnd(@ConnectedSocket() client: ChatSocket, @MessageBody() body: { callId: string }) {
    const user = client.data.user
    if (!user || !body?.callId) return { ok: false, message: 'Requête invalide' }
    try {
      const call = await this.callService.end(body.callId, user.userId)
      this.clearRingingTimer(call.id)
      this.broadcastToCall(call.id, 'call:ended', {
        callId: call.id,
        status: call.status,
        durationSeconds: call.durationSeconds,
        by: user.userId,
      })
      return { ok: true }
    } catch (error: any) {
      return { ok: false, message: error?.message ?? 'Échec du raccrochage' }
    }
  }

  /** Offre SDP de l'appelant, relayee telle quelle au correspondant. */
  @SubscribeMessage('call:offer')
  async callOffer(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { callId: string; to: string; sdp: unknown },
  ) {
    return this.relaySignal(client, body?.callId, body?.to, 'call:offer', { sdp: body?.sdp })
  }

  /** Reponse SDP du correspondant. */
  @SubscribeMessage('call:answer')
  async callAnswer(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { callId: string; to: string; sdp: unknown },
  ) {
    return this.relaySignal(client, body?.callId, body?.to, 'call:answer', { sdp: body?.sdp })
  }

  /** Candidat ICE : emis en rafale pendant toute la negociation. */
  @SubscribeMessage('call:ice-candidate')
  async callIceCandidate(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { callId: string; to: string; candidate: unknown },
  ) {
    return this.relaySignal(client, body?.callId, body?.to, 'call:ice-candidate', {
      candidate: body?.candidate,
    })
  }

  @SubscribeMessage('call:media-state')
  async callMediaState(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { callId: string; muted?: boolean; cameraOff?: boolean },
  ) {
    const user = client.data.user
    if (!user || !body?.callId) return { ok: false }
    await this.callService.setMediaState(body.callId, user.userId, body)
    this.broadcastToCall(body.callId, 'call:media-state', {
      callId: body.callId,
      userId: user.userId,
      muted: body.muted,
      cameraOff: body.cameraOff,
    }, user.userId)
    return { ok: true }
  }

  /**
   * Relais d'un message de signalisation vers un correspondant donne.
   * L'appartenance a l'appel est verifiee a chaque message : sans ce controle,
   * n'importe quel client authentifie pourrait injecter une offre SDP dans une
   * conversation qui ne le concerne pas.
   */
  private async relaySignal(
    client: ChatSocket,
    callId: string | undefined,
    to: string | undefined,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const user = client.data.user
    if (!user || !callId || !to) return { ok: false, message: 'Requête invalide' }
    try {
      const call = await this.callService.getActiveCall(callId)
      const memberIds = (call.participants ?? []).map((p) => p.userId)
      if (!memberIds.includes(user.userId) || !memberIds.includes(to)) {
        return { ok: false, message: 'Participant inconnu pour cet appel' }
      }
      this.server.to(`user-${to}`).emit(event, { ...payload, callId, from: user.userId })
      return { ok: true }
    } catch (error: any) {
      return { ok: false, message: error?.message ?? 'Relais impossible' }
    }
  }

  /** Diffuse un evenement a tous les participants (sauf exclusion). */
  private async broadcastToCall(
    callId: string,
    event: string,
    payload: Record<string, unknown>,
    exceptUserId?: string,
  ) {
    try {
      const call = await this.callService.getActiveCall(callId)
      for (const participant of call.participants ?? []) {
        if (participant.userId === exceptUserId) continue
        this.server.to(`user-${participant.userId}`).emit(event, payload)
      }
    } catch (err) {
      this.logger.warn(`Diffusion d'appel impossible (${callId}): ${(err as Error)?.message}`)
    }
  }

  private async expireCall(callId: string) {
    this.ringingTimers.delete(callId)
    try {
      const call = await this.callService.end(callId)
      this.broadcastToCall(callId, 'call:ended', { callId, status: call.status })
    } catch (err) {
      this.logger.warn(`Expiration d'appel impossible (${callId}): ${(err as Error)?.message}`)
    }
  }

  /** Clot les appels en cours d'un utilisateur qui vient de se deconnecter. */
  private async endCallsForUser(userId: string) {
    for (const callId of Array.from(this.ringingTimers.keys())) {
      try {
        const call = await this.callService.getActiveCall(callId)
        if (!(call.participants ?? []).some((p) => p.userId === userId)) continue
        await this.expireCall(callId)
      } catch {
        this.clearRingingTimer(callId)
      }
    }
  }

  private clearRingingTimer(callId: string) {
    const timer = this.ringingTimers.get(callId)
    if (timer) {
      clearTimeout(timer)
      this.ringingTimers.delete(callId)
    }
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