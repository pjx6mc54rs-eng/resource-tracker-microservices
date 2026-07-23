
import { Module } from '@nestjs/common';

import { ConfigModule, ConfigService } from '@nestjs/config';

import { MailerModule } from '@nestjs-modules/mailer';

import { NotificationController } from './notification.controller';

import { NotificationService } from './notification.service';

@Module({

  imports: [

    ConfigModule, // nécessaire ici pour que NotificationService puisse injecter ConfigService

    MailerModule.forRootAsync({

      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({

        transport: {

          host: config.get<string>('MAIL_HOST'),

          port: config.get<number>('MAIL_PORT'),

          secure: false,

          auth: {

            user: config.get<string>('MAIL_USER'),

            pass: config.get<string>('MAIL_PASSWORD'),

          },

        },

        defaults: {

          from: config.get<string>('MAIL_FROM'),

        },

      }),

    }),

  ],

  controllers: [NotificationController],

  providers: [NotificationService],

})

export class NotificationModule {}

