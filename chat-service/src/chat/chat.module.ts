import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatMessageService } from './chat-message.service';
import { EncryptionService } from './encryption.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ProjectAccessService } from './project-access.service';

@Module({
  imports: [HttpModule, JwtModule.register({}), TypeOrmModule.forFeature([ChatMessage])],
  controllers: [ChatController],
  providers: [ChatGateway, ChatMessageService, EncryptionService, ProjectAccessService, JwtAuthGuard],
})
export class ChatModule {}
