import { Controller, Get, Headers, Param, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RequestWithUser } from './jwt-auth.guard';
import { ChatMessageService } from './chat-message.service';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { ProjectAccessService } from './project-access.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly messages: ChatMessageService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get(':projectId/messages')
  async getMessages(
    @Param('projectId') projectId: string,
    @Query() query: MessagesQueryDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('JWT manquant');
    await this.access.assertCanAccessProject(request.user, projectId, token);
    return this.messages.getProjectMessages(projectId, query.limit ?? 50, query.offset ?? 0);
  }
}
