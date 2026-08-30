import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatChannel } from '../entities/chat-channel.entity'
import { ChatMessage } from '../entities/chat-message.entity'
import { ChannelMember } from '../entities/channel-member.entity'
import { Call } from '../entities/call.entity'
import { CallParticipant } from '../entities/call-participant.entity'
import { ChatController } from './chat.controller'
import { ChatGateway } from './chat.gateway'
import { ChatService } from './chat-message.service'
import { CallService } from './call.service'
import { EncryptionService } from './encryption.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { ProjectAccessService } from './project-access.service'

@Module({
  imports: [
    HttpModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([ChatChannel, ChatMessage, ChannelMember, Call, CallParticipant]),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, CallService, EncryptionService, ProjectAccessService, JwtAuthGuard],
})
export class ChatModule {}
