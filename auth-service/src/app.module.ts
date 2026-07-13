import { Module } from '@nestjs/common';
// @ts-ignore
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // 1. Charge automatiquement le fichier .env à la racine du microservice
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // 2. Connexion à la base de données auth_db
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'admin',
      password: process.env.DATABASE_PASSWORD || 'admin',
      database: process.env.DATABASE_NAME || 'auth_db',
      autoLoadEntities: true, // Charge automatiquement User, etc.
      synchronize: false,    // Source de vérité via les migrations/init SQL
    }),

<<<<<<< Updated upstream
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [
            process.env.RABBITMQ_URL ||
            'amqp://guest:guest@rabbitmq:5672',
          ],
          queue: 'notifications',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),

=======
>>>>>>> Stashed changes
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}