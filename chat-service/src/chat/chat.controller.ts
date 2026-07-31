import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  Delete,
  Patch,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { JwtAuthGuard, RequestWithUser } from './jwt-auth.guard'
import { ChatService } from './chat-message.service'
import {
  CreateGroupDto,
  DirectChannelDto,
  JoinRoomDto,
  MessagesQueryDto,
  SendMessageDto,
} from './dto/chat.dto'
import { ProjectAccessService } from './project-access.service'


@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get('channels')
  async getChannels(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw new UnauthorizedException('JWT manquant')
    return this.chat.getChannels(request.user, token)
  }

  @Post('channels/direct')
  async createDirectChannel(
    @Body() body: DirectChannelDto,
    @Req() request: RequestWithUser,
  ) {
    return this.chat.findOrCreateDirectChannel(request.user.userId, body.peerId)
  }

  @Get('channels/:channelId/messages')
  async getChannelMessages(
    @Param('channelId') channelId: string,
    @Query() query: MessagesQueryDto,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.getChannelMessages(channelId, query.limit ?? 50, query.offset ?? 0)
  }

  @Post('channels/:channelId/read-all')
  async markChannelRead(
    @Param('channelId') channelId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.markChannelRead(channelId, request.user.userId)
    return { ok: true }
  }

  @Post('groups')
  async createGroup(
    @Body() body: CreateGroupDto,
    @Req() request: RequestWithUser,
  ) {
    return this.chat.createGroup(body.name, body.memberIds, request.user.userId, body.avatarUrl)
  }

  @Get(':projectId/messages')
  async getProjectMessages(
    @Param('projectId') projectId: string,
    @Query() query: MessagesQueryDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw new UnauthorizedException('JWT manquant')
    await this.access.assertCanAccessProject(request.user, projectId, token)
    return this.chat.getProjectMessages(projectId, query.limit ?? 50, query.offset ?? 0)
  }

  @Post('channels/:channelId/clear')
  async clearChannel(
    @Param('channelId') channelId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    await this.chat.clearChannelMessages(channelId)
    return { ok: true }
  }

  @Delete('channels/:channelId')
  async deleteChannel(
    @Param('channelId') channelId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    await this.chat.deleteChannel(channelId)
    return { ok: true }
  }

  @Post('channels/:channelId/members')
  async addGroupMember(
    @Param('channelId') channelId: string,
    @Body() body: { userId: string },
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.addGroupMember(channelId, body.userId)
  }

  @Patch('channels/:channelId')
  async updateChannel(
    @Param('channelId') channelId: string,
    @Body() body: { name?: string; avatarUrl?: string },
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.updateChannelName(channelId, body.name, body.avatarUrl)
  }

  @Post('channels/:channelId/leave')
  async leaveGroup(
    @Param('channelId') channelId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.leaveGroup(channelId, request.user.userId)
  }

  @Delete('channels/:channelId/members/:targetUserId')
  async removeGroupMember(
    @Param('channelId') channelId: string,
    @Param('targetUserId') targetUserId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.removeGroupMember(channelId, request.user.userId, targetUserId)
  }

  @Post('channels/:channelId/members/:targetUserId/admin')
  async assignAdminRole(
    @Param('channelId') channelId: string,
    @Param('targetUserId') targetUserId: string,
    @Req() request: RequestWithUser,
  ) {
    await this.chat.assertChannelMember(channelId, request.user)
    return this.chat.assignAdminRole(channelId, request.user.userId, targetUserId)
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni')
    }
    const uploadDir = join(process.cwd(), 'uploads')
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true })
    }
    const fileExt = extname(file.originalname)
    const fileName = `${randomUUID()}${fileExt}`
    const filePath = join(uploadDir, fileName)
    writeFileSync(filePath, file.buffer)
    return {
      imageUrl: `/api/chat/uploads/${fileName}`,
    }
  }
}
