import * as dotenv from 'dotenv'
import { DataSource } from 'typeorm'
import { ChatChannel } from './entities/chat-channel.entity'
import { ChatMessage } from './entities/chat-message.entity'
import { ChannelMember } from './entities/channel-member.entity'

dotenv.config()

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'admin',
  password: process.env.DATABASE_PASSWORD ?? 'admin',
  database: process.env.DATABASE_NAME ?? 'chat_db',
  entities: [ChatChannel, ChatMessage, ChannelMember],
  migrations: [__filename.endsWith('.ts') ? 'src/migrations/*.ts' : 'dist/migrations/*.js'],
  synchronize: false,
})
