import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatModule } from './chat/chat.module'
import { ChatChannel } from './entities/chat-channel.entity'
import { ChatMessage } from './entities/chat-message.entity'
import { ChannelMember } from './entities/channel-member.entity'
import { Call } from './entities/call.entity'
import { CallParticipant } from './entities/call-participant.entity'
import { HealthController } from './health/health.controller';
import * as path from 'path';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'admin',
      password: process.env.DATABASE_PASSWORD ?? 'admin',
      database: process.env.DATABASE_NAME ?? 'chat_db',
      entities: [ChatChannel, ChatMessage, ChannelMember, Call, CallParticipant],
      synchronize: true,
      migrationsRun: true,
      migrations: [path.join(__dirname, '/migrations/*.{ts,js}')],
    }),
    ChatModule,
  ],
})
export class AppModule {}
