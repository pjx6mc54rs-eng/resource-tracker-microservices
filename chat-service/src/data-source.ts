import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'admin',
  password: process.env.DATABASE_PASSWORD ?? 'admin',
  database: process.env.DATABASE_NAME ?? 'chat_db',
  entities: [ChatMessage],
  migrations: [__filename.endsWith('.ts') ? 'src/migrations/*.ts' : 'dist/migrations/*.js'],
  synchronize: false,
});
