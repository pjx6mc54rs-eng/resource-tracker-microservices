import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as crypto from 'crypto'
import { Repository } from 'typeorm'
import { Call, CallStatus, CallType } from '../entities/call.entity'
import { CallParticipant } from '../entities/call-participant.entity'
import { ChatChannel } from '../entities/chat-channel.entity'
import { ChannelMember } from '../entities/channel-member.entity'

/** Duree au-dela de laquelle un appel qui sonne est considere comme manque. */
export const RINGING_TIMEOUT_MS = 45_000

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name)

  constructor(
    @InjectRepository(Call) private readonly calls: Repository<Call>,
    @InjectRepository(CallParticipant) private readonly participants: Repository<CallParticipant>,
    @InjectRepository(ChatChannel) private readonly channels: Repository<ChatChannel>,
    @InjectRepository(ChannelMember) private readonly members: Repository<ChannelMember>,
  ) {}

  /**
   * Configuration ICE renvoyee au navigateur.
   *
   * STUN suffit quand les deux pairs peuvent se joindre directement ; derriere
   * un pare-feu d'entreprise ou un NAT symetrique, TURN relaie le flux.
   *
   * SECURITE : les identifiants TURN sont ephemeres et derives par HMAC du
   * secret partage avec coturn (mecanisme « REST API » de coturn). Un
   * identifiant statique embarque dans le bundle JavaScript serait lisible par
   * n'importe quel visiteur et transformerait le relais en service ouvert.
   */
  getIceServers(userId: string) {
    const stunUrls = (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)

    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: stunUrls },
    ]

    const turnUrls = (process.env.TURN_URLS ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
    const secret = process.env.TURN_SECRET

    if (turnUrls.length && secret) {
      const ttl = Number(process.env.TURN_TTL_SECONDS ?? 3600)
      const expiry = Math.floor(Date.now() / 1000) + ttl
      const username = `${expiry}:${userId}`
      const credential = crypto.createHmac('sha1', secret).update(username).digest('base64')
      iceServers.push({ urls: turnUrls, username, credential })
    } else {
      this.logger.warn(
        'TURN non configure : les appels echoueront entre pairs separes par un NAT symetrique.',
      )
    }

    return { iceServers }
  }

  /** Verifie l'appartenance au canal et renvoie les autres membres. */
  private async assertMemberAndGetPeers(channelId: string, userId: string) {
    const channel = await this.channels.findOne({ where: { id: channelId }, relations: ['members'] })
    if (!channel) throw new NotFoundException('Canal introuvable')

    const memberIds = (channel.members ?? []).map((m) => m.userId)
    if (!memberIds.includes(userId)) {
      throw new ForbiddenException("Vous ne faites pas partie de ce canal")
    }
    return { channel, peerIds: memberIds.filter((id) => id !== userId) }
  }

  /**
   * Ouvre un appel. Limite au face-a-face : au-dela de deux participants il
   * faudrait un maillage complet (bande passante montante en n-1) ou un SFU,
   * hors perimetre de cette version.
   */
  async initiate(channelId: string, initiatorId: string, type: CallType) {
    const { peerIds } = await this.assertMemberAndGetPeers(channelId, initiatorId)
    if (peerIds.length === 0) throw new BadRequestException('Aucun correspondant dans ce canal')
    if (peerIds.length > 1) {
      throw new BadRequestException(
        'Les appels de groupe ne sont pas pris en charge dans cette version',
      )
    }

    // Un seul appel actif par canal : evite deux sonneries concurrentes si les
    // deux correspondants appellent en meme temps.
    const active = await this.calls.findOne({
      where: [
        { channelId, status: CallStatus.RINGING },
        { channelId, status: CallStatus.ONGOING },
      ],
    })
    if (active) throw new BadRequestException('Un appel est deja en cours sur ce canal')

    const call = await this.calls.save(
      this.calls.create({ channelId, initiatorId, type, status: CallStatus.RINGING }),
    )
    await this.participants.save([
      this.participants.create({ callId: call.id, userId: initiatorId, joinedAt: new Date() }),
      ...peerIds.map((userId) => this.participants.create({ callId: call.id, userId })),
    ])

    return { call, peerIds }
  }

  async accept(callId: string, userId: string) {
    const call = await this.getActiveCall(callId)
    if (call.status !== CallStatus.RINGING) {
      throw new BadRequestException("Cet appel n'est plus en attente")
    }
    await this.assertParticipant(call, userId)

    call.status = CallStatus.ONGOING
    call.answeredAt = new Date()
    await this.calls.save(call)
    await this.participants.update({ callId, userId }, { joinedAt: new Date() })
    return call
  }

  async decline(callId: string, userId: string) {
    const call = await this.getActiveCall(callId)
    await this.assertParticipant(call, userId)
    return this.close(call, CallStatus.DECLINED)
  }

  /** Raccrochage volontaire, ou expiration de la sonnerie (appel manque). */
  async end(callId: string, userId?: string) {
    const call = await this.calls.findOne({ where: { id: callId } })
    if (!call) throw new NotFoundException('Appel introuvable')
    if (call.status === CallStatus.ENDED || call.status === CallStatus.MISSED) return call
    if (userId) await this.assertParticipant(call, userId)

    const wasAnswered = call.status === CallStatus.ONGOING
    return this.close(call, wasAnswered ? CallStatus.ENDED : CallStatus.MISSED)
  }

  private async close(call: Call, status: CallStatus) {
    const endedAt = new Date()
    call.status = status
    call.endedAt = endedAt
    call.durationSeconds = call.answeredAt
      ? Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000))
      : 0
    await this.calls.save(call)
    await this.participants.update({ callId: call.id, leftAt: null as any }, { leftAt: endedAt })
    return call
  }

  async setMediaState(callId: string, userId: string, state: { muted?: boolean; cameraOff?: boolean }) {
    const patch: Partial<CallParticipant> = {}
    if (typeof state.muted === 'boolean') patch.muted = state.muted
    if (typeof state.cameraOff === 'boolean') patch.cameraOff = state.cameraOff
    if (Object.keys(patch).length) await this.participants.update({ callId, userId }, patch)
  }

  /** Historique des appels d'un canal, du plus recent au plus ancien. */
  async history(channelId: string, userId: string, limit = 50) {
    await this.assertMemberAndGetPeers(channelId, userId)
    return this.calls.find({
      where: { channelId },
      relations: ['participants'],
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    })
  }

  async getActiveCall(callId: string) {
    const call = await this.calls.findOne({ where: { id: callId }, relations: ['participants'] })
    if (!call) throw new NotFoundException('Appel introuvable')
    return call
  }

  private async assertParticipant(call: Call, userId: string) {
    const participants =
      call.participants ?? (await this.participants.find({ where: { callId: call.id } }))
    if (!participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException("Vous ne participez pas a cet appel")
    }
  }
}
