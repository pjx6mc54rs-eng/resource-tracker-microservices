import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
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

    const lastMessages = await this.messages
      .createQueryBuilder('message')
      .innerJoin(
        (subQuery) =>
          subQuery
            .select('msg.channel_id', 'channel_id')
            .addSelect('MAX(msg.created_at)', 'max_created_at')
            .from(ChatMessage, 'msg')
            .groupBy('msg.channel_id'),
        'latest',
        'message.channel_id = latest.channel_id AND message.created_at = latest.max_created_at',
      )
      .getMany()

    const lastMessageMap = new Map<string, { content: string; senderId: string; createdAt: Date }>()
    for (const msg of lastMessages) {
      if (msg.channelId) {
        lastMessageMap.set(msg.channelId, {
          content: this.tryDecrypt(msg.message),
          senderId: msg.senderId || msg.userId || '',
          createdAt: msg.createdAt,
        })
      }
    }

    const userMap = new Map<string, string>(
      users.map((u) => [
        u.id,
        `${u.firstName ?? ''}${u.firstName && u.lastName ? ' ' : ''}${u.lastName ?? u.email}`.trim()
      ])
    )

    const getLastMessageForChannel = (channelId: string) => {
      const msg = lastMessageMap.get(channelId)
      if (!msg) return null
      return {
        content: msg.content,
        senderId: msg.senderId,
        senderName: msg.senderId === user.userId ? 'You' : (userMap.get(msg.senderId) ?? 'Membre'),
        createdAt: msg.createdAt,
      }
    }

    const colleagues = users
      .filter((userItem) => userItem.id !== user.userId)
      .map((userItem) => {
        const channelId = directChannelMap.get(userItem.id)?.channelId
        const lastMsg = channelId ? getLastMessageForChannel(channelId) : null
        return {
          userId: userItem.id,
          name: `${userItem.firstName ?? ''}${userItem.firstName && userItem.lastName ? ' ' : ''}${userItem.lastName ?? userItem.email}`.trim(),
          channelId,
          unreadCount: directChannelMap.get(userItem.id)?.unreadCount ?? 0,
          lastReadAt: directChannelMap.get(userItem.id)?.lastReadAt,
          lastMessageAt: lastMsg?.createdAt,
          lastMessage: lastMsg,
          avatarUrl: userItem.avatarUrl,
          online: false,
        }
      })

    const groupChannels = await this.channels.find({
      where: { type: ChatChannelType.GROUP },
      relations: ['members'],
      order: { createdAt: 'DESC' },
    })

    const groupSummaries = groupChannels
      .filter((channel) => channel.members.some((member) => member.userId === user.userId))
      .map((channel) => {
        const lastMsg = getLastMessageForChannel(channel.id)
        return {
          id: channel.id,
          type: channel.type,
          name: channel.name ?? 'Groupe',
          avatarUrl: channel.avatarUrl,
          unreadCount: unreadCounts.get(channel.id) ?? 0,
          lastMessageAt: lastMsg?.createdAt,
          lastMessage: lastMsg,
          memberCount: channel.members.length,
          members: channel.members.map((m) => ({ userId: m.userId, isAdmin: m.isAdmin })),
        }
      })

    const projectSummaries = projectChannels
      .filter((channel): channel is ChatChannel => Boolean(channel))
      .map((channel, index) => {
        const lastMsg = getLastMessageForChannel(channel.id)
        return {
          id: channel.id,
          type: channel.type,
          name: channel.name ?? `# ${projects[index]?.name ?? channel.projectId}`,
          projectId: channel.projectId,
          unreadCount: unreadCounts.get(channel.id) ?? 0,
          lastMessageAt: lastMsg?.createdAt,
          lastMessage: lastMsg,
          memberCount: channel.members?.length ?? 0,
          members: channel.members?.map((m) => ({ userId: m.userId, isAdmin: m.isAdmin })) ?? [],
        }
      })

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
      relations: ['parentMessage'],
      take: safeLimit,
      skip: safeOffset,
    })
    return messages.map((message) => ({
      id: message.id,
      channelId: message.channelId,
      senderId: message.senderId,
      message: message.message ? this.tryDecrypt(message.message) : '',
      imageUrl: message.imageUrl,
      parentMessageId: message.parentMessageId,
      parentMessage: message.parentMessage ? {
        id: message.parentMessage.id,
        senderId: message.parentMessage.senderId,
        message: message.parentMessage.message ? this.tryDecrypt(message.parentMessage.message) : '',
        imageUrl: message.parentMessage.imageUrl,
      } : null,
      isForwarded: message.isForwarded,
      createdAt: message.createdAt,
    }))
  }

  async getProjectMessages(projectId: string, limit = 50, offset = 0) {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0
    const messages = await this.messages.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
      relations: ['parentMessage'],
      take: safeLimit,
      skip: safeOffset,
    })
    return messages.map((message) => ({
      id: message.id,
      projectId: message.projectId,
      senderId: message.senderId ?? (message as any).userId,
      message: message.message ? this.tryDecrypt(message.message) : '',
      imageUrl: message.imageUrl,
      parentMessageId: message.parentMessageId,
      parentMessage: message.parentMessage ? {
        id: message.parentMessage.id,
        senderId: message.parentMessage.senderId,
        message: message.parentMessage.message ? this.tryDecrypt(message.parentMessage.message) : '',
        imageUrl: message.parentMessage.imageUrl,
      } : null,
      isForwarded: message.isForwarded,
      createdAt: message.createdAt,
    }))
  }

  async createGroup(name: string, memberIds: string[], creatorId: string, avatarUrl?: string) {
    const uniqueMembers = Array.from(new Set([...memberIds, creatorId]))
    const channel = this.channels.create({
      type: ChatChannelType.GROUP,
      name,
      avatarUrl: avatarUrl ?? null,
    })
    const savedChannel = await this.channels.save(channel)

    const members = uniqueMembers.map((userId) =>
      this.members.create({ channel: savedChannel, userId, isAdmin: userId === creatorId }),
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

  async saveMessage(channelId: string, userId: string, text: string, imageUrl?: string, parentMessageId?: string, isForwarded?: boolean) {
    const channel = await this.channels.findOne({ where: { id: channelId } })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }

    let parentMessage: ChatMessage | undefined = undefined
    if (parentMessageId) {
      const found = await this.messages.findOne({ where: { id: parentMessageId } })
      parentMessage = found || undefined
    }

    const message = this.messages.create({
      channel,
      channelId,
      // populate both senderId and userId for compatibility with different schemas
      senderId: userId,
      userId: userId,
      projectId: channel.type === ChatChannelType.PROJECT ? channel.projectId : undefined,
      message: this.encryption.encrypt(text ?? ''),
      imageUrl: imageUrl ?? null,
      parentMessageId: parentMessageId ?? null,
      parentMessage: parentMessage,
      isForwarded: isForwarded ?? false,
    })
    const saved = await this.messages.save(message)
    await this.members.update({ channelId, userId }, { lastReadAt: saved.createdAt })

    return {
      id: saved.id,
      channelId: saved.channelId,
      senderId: saved.senderId,
      message: this.tryDecrypt(saved.message),
      imageUrl: saved.imageUrl,
      parentMessageId: saved.parentMessageId,
      parentMessage: saved.parentMessage ? {
        id: saved.parentMessage.id,
        senderId: saved.parentMessage.senderId,
        message: saved.parentMessage.message ? this.tryDecrypt(saved.parentMessage.message) : '',
        imageUrl: saved.parentMessage.imageUrl,
      } : null,
      isForwarded: saved.isForwarded,
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

    const map = new Map<string, { channelId: string; unreadCount: number; lastReadAt?: Date }>()
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
        lastReadAt: peer.lastReadAt,
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
      if (Array.isArray(data)) return data as Array<{ id: string; firstName?: string; lastName?: string; email?: string; avatarUrl?: string }>
      if (data && Array.isArray(data.users)) return data.users as Array<{ id: string; firstName?: string; lastName?: string; email?: string; avatarUrl?: string }>
      return []
    } catch (e: unknown) {
      const error = e as { message?: string }
      this.logger.warn(`Unable to fetch users: ${error?.message ?? e}`)
      return []
    }
  }

  async clearChannelMessages(channelId: string): Promise<void> {
    await this.messages.delete({ channelId })
  }

  async deleteChannel(channelId: string): Promise<void> {
    await this.channels.delete({ id: channelId })
  }

  async addGroupMember(channelId: string, userId: string) {
    const channel = await this.channels.findOne({
      where: { id: channelId },
      relations: ['members'],
    })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }
    if (channel.type !== ChatChannelType.GROUP) {
      throw new ForbiddenException('Ce canal n\'est pas un groupe de discussion')
    }

    const alreadyMember = channel.members.some((m) => m.userId === userId)
    if (alreadyMember) {
      return { ok: true, channel }
    }

    const newMember = this.members.create({
      channelId,
      userId,
      lastReadAt: new Date(),
    })
    await this.members.save(newMember)

    return { ok: true }
  }

  async updateChannelName(channelId: string, name?: string, avatarUrl?: string) {
    const channel = await this.channels.findOne({ where: { id: channelId } })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }
    if (channel.type !== ChatChannelType.GROUP) {
      throw new ForbiddenException('Seuls les groupes de discussion sont modifiables')
    }
    if (name !== undefined) {
      channel.name = name
    }
    if (avatarUrl !== undefined) {
      channel.avatarUrl = avatarUrl
    }
    return this.channels.save(channel)
  }

  async leaveGroup(channelId: string, userId: string) {
    const channel = await this.channels.findOne({
      where: { id: channelId },
      relations: ['members'],
    })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }
    if (channel.type !== ChatChannelType.GROUP) {
      throw new ForbiddenException('Seuls les groupes de discussion peuvent être quittés')
    }

    const membership = channel.members.find((m) => m.userId === userId)
    if (!membership) {
      throw new BadRequestException('Vous n\'êtes pas membre de ce groupe')
    }

    // Si l'utilisateur est le seul admin et qu'il reste d'autres membres
    if (membership.isAdmin) {
      const otherAdmins = channel.members.filter((m) => m.isAdmin && m.userId !== userId)
      if (otherAdmins.length === 0) {
        const otherMembers = channel.members.filter((m) => m.userId !== userId)
        if (otherMembers.length > 0) {
          // Choisir un membre au hasard pour devenir admin
          const randomMember = otherMembers[Math.floor(Math.random() * otherMembers.length)]
          randomMember.isAdmin = true
          await this.members.save(randomMember)
        }
      }
    }

    // Supprimer le membre du canal
    await this.members.remove(membership)

    // Si le canal n'a plus de membres du tout, le supprimer complètement
    const remainingMembersCount = await this.members.count({ where: { channelId } })
    if (remainingMembersCount === 0) {
      await this.channels.delete({ id: channelId })
    }

    return { ok: true }
  }

  async removeGroupMember(channelId: string, requestUserId: string, targetUserId: string) {
    const channel = await this.channels.findOne({
      where: { id: channelId },
      relations: ['members'],
    })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }
    if (channel.type !== ChatChannelType.GROUP) {
      throw new ForbiddenException('Seuls les groupes de discussion sont modifiables')
    }

    // Vérifier si l'utilisateur qui fait la demande est admin
    const requestMember = channel.members.find((m) => m.userId === requestUserId)
    if (!requestMember || !requestMember.isAdmin) {
      throw new ForbiddenException('Vous devez être administrateur pour supprimer des membres')
    }

    const targetMember = channel.members.find((m) => m.userId === targetUserId)
    if (!targetMember) {
      throw new BadRequestException('Le membre cible ne fait pas partie du groupe')
    }

    await this.members.remove(targetMember)
    return { ok: true }
  }

  async assignAdminRole(channelId: string, requestUserId: string, targetUserId: string) {
    const channel = await this.channels.findOne({
      where: { id: channelId },
      relations: ['members'],
    })
    if (!channel) {
      throw new NotFoundException('Canal introuvable')
    }
    if (channel.type !== ChatChannelType.GROUP) {
      throw new ForbiddenException('Seuls les groupes de discussion sont modifiables')
    }

    // Vérifier si l'utilisateur qui fait la demande est admin
    const requestMember = channel.members.find((m) => m.userId === requestUserId)
    if (!requestMember || !requestMember.isAdmin) {
      throw new ForbiddenException('Vous devez être administrateur pour attribuer le rôle admin')
    }

    const targetMember = channel.members.find((m) => m.userId === targetUserId)
    if (!targetMember) {
      throw new BadRequestException('Le membre cible ne fait pas partie du groupe')
    }

    targetMember.isAdmin = true
    await this.members.save(targetMember)
    return { ok: true }
  }
}
