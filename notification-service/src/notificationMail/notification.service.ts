
import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { MailerService } from '@nestjs-modules/mailer';

interface TaskAssignedEmailData {

  userEmail: string;

  userName: string;

  taskTitle: string;

  taskId: string;

}

@Injectable()

export class NotificationService {

  private readonly logger = new Logger(NotificationService.name);

  constructor(

    private readonly mailerService: MailerService,

    private readonly configService: ConfigService,

  ) {}

  async sendTaskAssignedEmail(data: TaskAssignedEmailData): Promise<void> {

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const deepLink = `${frontendUrl}/dashboard/tasks/${data.taskId}`;

    await this.mailerService.sendMail({

      to: data.userEmail,

      subject: `Nouvelle tâche assignée : ${data.taskTitle}`,

      html: this.buildTaskAssignedTemplate(data.userName, data.taskTitle, deepLink),

    });

    this.logger.log(`Email envoyé à ${data.userEmail} pour la tâche ${data.taskId}`);

  }

  private buildTaskAssignedTemplate(userName: string, taskTitle: string, deepLink: string): string {

    return `

      <!DOCTYPE html>

      <html>

        <body style="margin:0; padding:0; background-color:#f4f4f5; font-family: Arial, sans-serif;">

          <table width="100%" cellpadding="0" cellspacing="0" style="padding: 32px 0;">

            <tr>

              <td align="center">

                <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">

                  <tr>

                    <td style="background:#1a1a1a; padding:24px 32px;">

                      <span style="color:#ffffff; font-size:18px; font-weight:bold;">Resource Tracker</span>

                    </td>

                  </tr>

                  <tr>

                    <td style="padding:32px;">

                      <p style="font-size:16px; color:#1a1a1a; margin:0 0 16px;">Bonjour ${userName},</p>

                      <p style="font-size:15px; color:#3d3d3a; line-height:1.6; margin:0 0 24px;">

                        Une nouvelle tâche vient de vous être assignée :

                      </p>

                      <p style="font-size:17px; color:#1a1a1a; font-weight:bold; margin:0 0 24px; padding:12px 16px; background:#f4f4f5; border-radius:6px;">

                        ${taskTitle}

                      </p>

                      <table cellpadding="0" cellspacing="0">

                        <tr>

                          <td style="border-radius:6px; background:#185fa5;">

                            <a href="${deepLink}" target="_blank" style="display:inline-block; padding:12px 28px; color:#ffffff; text-decoration:none; font-size:15px; font-weight:bold;">

                              Voir la tâche

                            </a>

                          </td>

                        </tr>

                      </table>

                      <p style="font-size:13px; color:#888780; margin:24px 0 0;">

                        Si le bouton ne fonctionne pas, copiez ce lien : <br/>

                        <a href="${deepLink}" style="color:#185fa5;">${deepLink}</a>

                      </p>

                    </td>

                  </tr>

                </table>

              </td>

            </tr>

          </table>

        </body>

      </html>

    `;

  }

}

