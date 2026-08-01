import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

import { NotificationsService } from './notifications.service';
import { NotificationType } from '../entities/notification.entity';

/**
 * Consommateur RabbitMQ. Chaque @EventPattern correspond a un evenement emis
 * par un autre service.
 *
 * Regle appliquee partout : une exception ici ferait renvoyer le message dans
 * la file indefiniment. On journalise et on absorbe, car une notification
 * perdue est moins grave qu'une boucle de retraitement.
 */

interface TimesheetPeriodEvent {
  /** Destinataires de la notification. */
  recipientIds: string[];
  /** Personne a l'origine de l'action. */
  actorName?: string;
  /** Libelle du mois concerne, ex. "juillet 2026". */
  periodLabel: string;
  /** Motif, uniquement pour un refus. */
  reason?: string;
}

interface ProjectAssignmentEvent {
  recipientIds: string[];
  actorName?: string;
  projectName: string;
  projectId: string;
}

interface TaskAssignedEvent {
  recipientIds: string[];
  actorName?: string;
  taskTitle: string;
  projectId: string;
}

interface AccountEvent {
  recipientIds: string[];
  actorName?: string;
  email?: string;
  newRole?: string;
}

@Controller()
export class NotificationsEventsController {
  private readonly logger = new Logger(NotificationsEventsController.name);

  constructor(private readonly notifications: NotificationsService) {}

  private async safely(label: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Traitement de "${label}" en echec : ${(error as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------- Timesheets

  @EventPattern('timesheet.submitted')
  async onSubmitted(@Payload() e: TimesheetPeriodEvent) {
    await this.safely('timesheet.submitted', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TIMESHEET_SUBMITTED,
        title: 'Feuille de temps à valider',
        body: `${e.actorName ?? 'Un collaborateur'} a soumis sa feuille de temps de ${e.periodLabel}.`,
        link: '/timesheet',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('timesheet.approved')
  async onApproved(@Payload() e: TimesheetPeriodEvent) {
    await this.safely('timesheet.approved', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TIMESHEET_APPROVED,
        title: 'Feuille de temps validée',
        body: `Votre feuille de temps de ${e.periodLabel} a été validée.`,
        link: '/timesheet',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('timesheet.rejected')
  async onRejected(@Payload() e: TimesheetPeriodEvent) {
    await this.safely('timesheet.rejected', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TIMESHEET_REJECTED,
        title: 'Feuille de temps refusée',
        body: e.reason
          ? `Votre feuille de temps de ${e.periodLabel} a été refusée : ${e.reason}`
          : `Votre feuille de temps de ${e.periodLabel} a été refusée.`,
        link: '/timesheet',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('timesheet.recalled')
  async onRecalled(@Payload() e: TimesheetPeriodEvent) {
    await this.safely('timesheet.recalled', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TIMESHEET_RECALLED,
        title: 'Soumission retirée',
        body: `${e.actorName ?? 'Un collaborateur'} a retiré sa feuille de temps de ${e.periodLabel}.`,
        link: '/timesheet',
        actorName: e.actorName ?? null,
      }),
    );
  }

  // ----------------------------------------------------- Projets et taches

  @EventPattern('project.assigned')
  async onProjectAssigned(@Payload() e: ProjectAssignmentEvent) {
    await this.safely('project.assigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.PROJECT_ASSIGNED,
        title: 'Nouveau projet',
        body: `Vous avez été affecté au projet « ${e.projectName} ».`,
        link: `/projects/${e.projectId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('project.unassigned')
  async onProjectUnassigned(@Payload() e: ProjectAssignmentEvent) {
    await this.safely('project.unassigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.PROJECT_UNASSIGNED,
        title: 'Retrait d’un projet',
        body: `Vous ne faites plus partie du projet « ${e.projectName} ».`,
        link: '/projects',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('task.assigned')
  async onTaskAssigned(@Payload() e: TaskAssignedEvent) {
    await this.safely('task.assigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TASK_ASSIGNED,
        title: 'Nouvelle tâche',
        body: `Une tâche vous a été assignée : « ${e.taskTitle} ».`,
        link: `/projects/${e.projectId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  // ------------------------------------------------------------ Administration

  @EventPattern('account.created')
  async onAccountCreated(@Payload() e: AccountEvent) {
    await this.safely('account.created', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.ACCOUNT_CREATED,
        title: 'Bienvenue',
        body: 'Votre compte Resource Tracker a été créé.',
        link: '/profile',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('account.role_changed')
  async onRoleChanged(@Payload() e: AccountEvent) {
    await this.safely('account.role_changed', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.ROLE_CHANGED,
        title: 'Rôle modifié',
        body: e.newRole
          ? `Votre rôle est désormais « ${e.newRole} ».`
          : 'Votre rôle a été modifié.',
        link: '/profile',
        actorName: e.actorName ?? null,
      }),
    );
  }
}
