
import { Controller, Logger } from '@nestjs/common';

import { EventPattern, Payload } from '@nestjs/microservices';

import { NotificationService } from './notification.service';

interface TaskCreatedPayload {

  userEmail: string;

  userName: string;

  taskTitle: string;

  taskId: string;

}

@Controller()

export class NotificationController {

  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern('task_created')

  async handleTaskCreated(@Payload() payload: TaskCreatedPayload) {

    this.logger.log(`Événement task_created reçu pour la tâche ${payload.taskId}`);

    try {

      await this.notificationService.sendTaskAssignedEmail(payload);

    } catch (error) {

      this.logger.error(

        `Échec d'envoi d'email pour la tâche ${payload.taskId}: ${(error as Error).message}`,

      );

    }

  }

}

