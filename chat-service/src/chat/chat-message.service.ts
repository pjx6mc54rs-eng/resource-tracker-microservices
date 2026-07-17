import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { firstValueFrom } from 'rxjs'
import { HttpService } from '@nestjs/axios'
import { ChatChannel, ChatChannelType } from '../entities/chat-channel.entity'
import { ChatMessage } from '../entities/chat-message.entity'
import { ChannelMember } from '../entities/channel-member.entity'
import { EncryptionService } from './encryption.service'

export type AuthUser = { userId: string; email?: string; role: 'admin' | 'collaborateur' }

@Injectable()
export class ChatService {
  private readonly projectBaseUrl = process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3001'
  private readonly authBaseUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000'
  private readonly logger = new Logger(ChatService.name)

  constructor(
    @InjectRepository(ChatChannel)
    private readonly channels: Repository<ChatChannel>,
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    @InjectRepository(ChannelMember)
    private readonly members: Repository<ChannelMember>,
    private readonly http: HttpService,
    private readonly encryption: EncryptionService,
  ) {}

  private tryDecrypt(value: string): string {
    if (!value) return value
    try {
      return this.encryption.decrypt(value)
    } catch {
      return value
    }
  }
  async getUserChannelIds(userId: string): Promise<{ channelId: string; projectId?: string }[]> {
    const memberships = await this.members.find({
      where: { userId },
      relations: ['channel'],
  })
    return memberships
  .filter((member) => Boolean(member.channel))
  .map((member) => ({
        channelId: member.channelId,
        projectId:
    member.channel?.type === ChatChannelType.PROJECT ? member.channel.projectId : undefined,
  }))
  }
  async getChannels(user: AuthUser, token: string) {
    const [projects, users] = await Promise.all([
      this.fetchProjectsForUser(user, token),
      this.fetchAllUsers(token),
    ])

    const projectChannels = await Promise.all(
      projects.map((project) => this.findOrCreateProjectChannel(project, user, token)),
    )

    const unreadCounts = await this.getUnreadCountsForUser(user.userId)

    const directChannelMap = await this.buildDirectChannelMap(user.userId, unreadCounts)

    const colleagues = users
      .filter((userItem) => userItem.id !== user.userId)
      .map((userItem) => ({
        userId: userItem.id,
        name: `${userItem.firstName ?? ''}${userItem.firstName && userItem.lastName ? ' ' : ''}${userItem.lastName ?? userItem.email}`.trim(),
        channelId: directChannelMap.get(userItem.id)?.channelId,
        unreadCount: directChannelMap.get(userItem.id)?.unreadCount ?? 0,
        online: false,
      }))

    const groupChannels = await this.channels.find({
      where: { type: ChatChannelType.GROUP },
      relations: ['members'],
      order: { createdAt: 'DESC' },
    })

    const groupSummaries = groupChannels
      .filter((channel) => channel.members.some((member) => member.userId === user.userId))
      .map((channel) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name ?? 'Groupe',
        unreadCount: unreadCounts.get(channel.id) ?? 0,
        memberCount: channel.members.length,
      }))

    const projectSummaries = projectChannels
      .filter((channel): channel is ChatChannel => Boolean(channel))
      .map((channel, index) => ({
        id: channel.id,
        type: channel.type,
        name: channel.name ?? `# ${projects[index]?.name ?? channel.projectId}`,
        projectId: channel.projectId,
        unreadCount: unreadCounts.get(channel.id) ?? 0,
      }))

    return {
      projects: projectSummaries,
      colleagues,
      groups: groupSummaries,
      globalUnreadCount: Array.from(unreadCounts.values()).reduce((sum, value) => sum + value, 0),
    }
  }

  async getChannelMessages(channelId: string, limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0
    const messages = await this.messages.find({
      where: { channelId },
      order: { createdAt: 'ASC' },
      take: safeLimit,
      skip: safeOffset,
    })
    return messages.map((message) => ({
      id: message.id,
      channelId: message.channelId,
      senderId: message.senderId,
      message: this.tryDecrypt(message.message),
      createdAt: message.createdAt,
    }))
  }

  async getProjectMessages(projectId: string, limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0
    const messages = await this.messages.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
      take: safeLimit,
      skip: safeOffset,
    })
    return messages.map((message) => ({
      id: message.id,
      projectId: message.projectId,
      senderId: message.senderId ?? (message as any).userId,
      message: this.tryDecrypt(message.message),
      createdAt: message.createdAt,
    }))
  }

  async createGroup(name: string, memberIds: string[], creatorId: string) {
    const uniqueMembers = Array.from(new Set([...memberIds, creatorId]))
    const channel = this.channels.create({
      type: ChatChannelType.GROUP,
      name,
    })
    const savedChannel = await this.channels.save(channel)

    const members = uniqueMembers.map((userId) =>
      this.members.create({ channel: savedChannel, userId }),
    )
    await this.members.save(members)

    return savedChannel
  }

  async findOrCreateDirectChannel(userId: string, peerId: string) {
    const existing = await this.channels
      .createQueryBuilder('channel')
      .innerJoinAndSelect('channel.members', 'firstMember', 'firstMember.userId = :userId', {
        userId,
      })
      .innerJoinAndSelect('channel.members', 'secondMember', 'secondMember.userId = :peerId', {
        peerId,
      })
      .where('channel.type = :type', { type: ChatChannelType.DIRECT })
      .getOne()

    if (existing) {
      return existing
    }

    const channel = this.channels.create({
      type: ChatChannelType.DIRECT,
    })
    const savedChannel = await this.channels.save(channel)
    const members = [userId, peerId].map((id) =>
      this.members.create({ channelId: savedChannel.id, userId: id }),
    )
    await this.members.save(members)
    return savedChannel
  }

  async markChannelRead(channelId: string, userId: string) {
    const member = await this.members.findOne({
      where: { channelId, userId },
    })
    if (!member) {
      throw new ForbiddenException('Accès refusé au canal')
    }
    member.lastReadAt = new Date()
    return this.members.save(member)
  }

  async saveMessage(channelId: string, userId: string, text: string) {
    const channel = await this.channels.findOne({ where: { id: channelId } })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }

    const message = this.messages.create({
      channel,
      channelId,
      // populate both senderId and userId for compatibility with different schemas
      senderId: userId,
      userId: userId,
      projectId: channel.type === ChatChannelType.PROJECT ? channel.projectId : undefined,
      message: this.encryption.encrypt(text),
    })
    const saved = await this.messages.save(message)
    await this.members.update({ channelId, userId }, { lastReadAt: new Date() })

    return {
      id: saved.id,
      channelId: saved.channelId,
      senderId: saved.senderId,
      message: this.tryDecrypt(saved.message),
      createdAt: saved.createdAt,
      projectId: channel.type === ChatChannelType.PROJECT ? channel.projectId : undefined,
    }
  }

  async findOrCreateProjectChannelById(projectId: string, currentUserId: string) {
    let channel = await this.channels.findOne({
      where: { projectId, type: ChatChannelType.PROJECT },
      relations: ['members'],
    })

    if (!channel) {
      channel = this.channels.create({
        type: ChatChannelType.PROJECT,
        name: `# ${projectId}`,
        projectId,
      })
      channel = await this.channels.save(channel)
    }

    const existingUserIds = new Set(channel.members?.map((member) => member.userId) ?? [])
    if (!existingUserIds.has(currentUserId)) {
      const member = this.members.create({ channel, userId: currentUserId })
      await this.members.save(member)
    }

    return this.channels.findOne({
      where: { id: channel.id },
      relations: ['members'],
    })
  }

  async assertChannelMember(channelId: string, userId: string) {
    const member = await this.members.findOne({ where: { channelId, userId } })
    if (!member) {
      throw new ForbiddenException('Accès refusé au canal')
    }
    return member
  }

  async getChannelById(channelId: string) {
    return this.channels.findOne({ where: { id: channelId }, relations: ['members'] })
  }

  private async getUnreadCountsForUser(userId: string) {
    const rawCounts = await this.messages
      .createQueryBuilder('message')
      .select('message.channel_id', 'channelId')
      .addSelect('COUNT(message.id)', 'unreadCount')
      .innerJoin(ChannelMember, 'member', 'member.channel_id = message.channel_id AND member.user_id = :userId', {
        userId,
      })
      .where('message.created_at > member.last_read_at')
      .groupBy('message.channel_id')
      .getRawMany()

    return new Map(rawCounts.map((row) => [row.channelId, Number(row.unreadCount)]))
  }

  private async buildDirectChannelMap(userId: string, unreadCounts: Map<string, number>) {
    const directChannels = await this.channels.find({
      where: { type: ChatChannelType.DIRECT },
      relations: ['members'],
    })

    const map = new Map<string, { channelId: string; unreadCount: number }>()
    for (const channel of directChannels) {
      if (!channel.members.some((member) => member.userId === userId)) {
        continue
      }
      const peer = channel.members.find((member) => member.userId !== userId)
      if (!peer) {
        continue
      }
      map.set(peer.userId, {
        channelId: channel.id,
        unreadCount: unreadCounts.get(channel.id) ?? 0,
      })
    }
    return map
  }

  private async findOrCreateProjectChannel(project: any, user: AuthUser, token: string) {
    let channel = await this.channels.findOne({
      where: { projectId: project.id, type: ChatChannelType.PROJECT },
      relations: ['members'],
    })

    if (!channel) {
      channel = this.channels.create({
        type: ChatChannelType.PROJECT,
        name: `# ${project.name ?? project.id}`,
        projectId: project.id,
      })
      channel = await this.channels.save(channel)
    }

    const memberIds = await this.fetchProjectMemberIds(project.id, user, token)
    const currentIds = new Set(channel.members?.map((member) => member.userId) ?? [])
    const newMembers = memberIds
      .filter((memberId) => !currentIds.has(memberId))
      .map((memberId) => this.members.create({ channel, userId: memberId }))

    if (newMembers.length > 0) {
      await this.members.save(newMembers)
    }

    return this.channels.findOne({
      where: { id: channel.id },
      relations: ['members'],
    })
  }

      private async fetchProjectMemberIds(projectId: string, user: AuthUser, token: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.projectBaseUrl}/projects/${projectId}/team`, {
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': user.userId,
            'x-user-role': user.role,
          },
          timeout: 5000,
        }),
      )
      const data = response.data
      const teamMembers = Array.isArray(data) ? data : data?.team ?? []
      return Array.from(new Set((teamMembers as any[]).map((member) => member.userId)))
    } catch (e: unknown) {
      const error = e as { message?: string }
      this.logger.warn(`Unable to fetch project members for ${projectId}: ${error?.message ?? e}`)
      return [user.userId]
    }
  }

    private async fetchProjectsForUser(user: AuthUser, token: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.projectBaseUrl}/projects`, {
          headers: {
            authorization: `Bearer ${token}`,
            'x-user-id': user.userId,
            'x-user-role': user.role,
          },
          timeout: 5000,
        }),
      )
      const data = response.data
      if (Array.isArray(data)) return data as any[]
      if (data && Array.isArray(data.projects)) return data.projects as any[]
      return []
    } catch (e: unknown) {
      const error = e as { message?: string }
      this.logger.warn(`Unable to fetch projects for user ${user.userId}: ${error?.message ?? e}`)
      return []
    }
  }

    private async fetchAllUsers(token: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.authBaseUrl}/auth/users`, {
          headers: {
            authorization: `Bearer ${token}`,
          },
          timeout: 5000,
        }),
      )
      const data = response.data
      if (Array.isArray(data)) return data as Array<{ id: string; firstName?: string; lastName?: string; email?: string }>
      if (data && Array.isArray(data.users)) return data.users as Array<{ id: string; firstName?: string; lastName?: string; email?: string }>
      return []
    } catch (e: unknown) {
      const error = e as { message?: string }
      this.logger.warn(`Unable to fetch users: ${error?.message ?? e}`)
      return []
    }
  }
}
