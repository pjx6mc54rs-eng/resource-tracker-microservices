import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChatModule } from './chat/chat.module'
import { ChatChannel } from './entities/chat-channel.entity'
import { ChatMessage } from './entities/chat-message.entity'
import { ChannelMember } from './entities/channel-member.entity'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'admin',
      password: process.env.DATABASE_PASSWORD ?? 'admin',
      database: process.env.DATABASE_NAME ?? 'chat_db',
      entities: [ChatChannel, ChatMessage, ChannelMember],
      synchronize: false,
    }),
    ChatModule,
  ],
})
export class AppModule {}
