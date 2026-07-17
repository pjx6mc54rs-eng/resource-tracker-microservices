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
} from '@nestjs/common'
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
    await this.chat.assertChannelMember(channelId, request.user.userId)
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
    return this.chat.createGroup(body.name, body.memberIds, request.user.userId)
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
}
