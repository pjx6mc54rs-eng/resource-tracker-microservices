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
  /** Libelle du mois concerne, ex. "July 2026". */
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

interface TaskStatusChangedEvent extends TaskAssignedEvent {
  /** Nouveau statut, valeur brute de TaskStatus (project-service). */
  status: string;
  /** Statut precedent, pour formuler "moved from ... to ...". */
  previousStatus?: string;
}

/**
 * Libelles des statuts de tache, alignes sur ceux affiches par le frontend
 * (TASK_STATUS_LABELS). Repli sur la valeur brute : si project-service ajoute
 * un statut, la notification reste lisible au lieu d'afficher "undefined".
 */
const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

function statusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

interface ResponsableEvent {
  recipientIds: string[];
  /** Noms des responsables nouvellement rattaches au collaborateur. */
  managerNames?: string[];
  /** Nom du collaborateur, pour la notification envoyee au responsable. */
  collaboratorName?: string;
}

interface AccountEvent {
  recipientIds: string[];
  actorName?: string;
  email?: string;
  /** Role principal. Conserve pour les emetteurs qui n'envoient que celui-la. */
  newRole?: string;
  /** Ensemble des roles : un compte peut en cumuler plusieurs. */
  newRoles?: string[];
}

/**
 * Libelles des roles, alignes sur roleLabel() du frontend. Repli sur la valeur
 * brute : un role ajoute cote auth-service reste lisible dans la notification.
 */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  responsable: 'Responsable',
  collaborateur: 'Collaborateur',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** "a", "a and b", "a, b and c" : enumeration lisible dans une phrase. */
function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Charge utile commune aux evenements emis par meeting-service. */
interface MeetingEvent {
  recipientIds: string[];
  meetingId: string;
  title: string;
  startsAt?: string;
  slotChanged?: boolean;
  response?: string;
  actorName?: string | null;
}

/**
 * Creneau lisible dans le corps de la notification. En cas de date invalide on
 * renvoie une chaine neutre plutot que « Invalid Date », qui serait affichee
 * telle quelle a l'utilisateur.
 */
function formatSlot(iso?: string): string {
  if (!iso) return 'the scheduled time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'the scheduled time';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
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
        title: 'Timesheet to review',
        body: `${e.actorName ?? 'A collaborator'} submitted their timesheet for ${e.periodLabel}.`,
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
        title: 'Timesheet approved',
        body: `Your timesheet for ${e.periodLabel} has been approved.`,
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
        title: 'Timesheet rejected',
        body: e.reason
          ? `Your timesheet for ${e.periodLabel} has been rejected: ${e.reason}`
          : `Your timesheet for ${e.periodLabel} has been rejected.`,
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
        title: 'Submission withdrawn',
        body: `${e.actorName ?? 'A collaborator'} withdrew their timesheet for ${e.periodLabel}.`,
        link: '/timesheet',
        actorName: e.actorName ?? null,
      }),
    );
  }

  // ----------------------------------------------------- Projets et taches

  // ---------------------------------------------------------------- Reunions

  @EventPattern('meeting.invited')
  async onMeetingInvited(@Payload() e: MeetingEvent) {
    await this.safely('meeting.invited', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.MEETING_INVITED,
        title: 'Meeting invitation',
        body: `You are invited to "${e.title}" on ${formatSlot(e.startsAt)}.`,
        link: `/meetings/${e.meetingId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('meeting.updated')
  async onMeetingUpdated(@Payload() e: MeetingEvent) {
    await this.safely('meeting.updated', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.MEETING_UPDATED,
        title: 'Meeting updated',
        // Un simple changement de titre n'exige pas de repondre a nouveau ;
        // un changement de creneau, si.
        body: e.slotChanged
          ? `"${e.title}" has moved to ${formatSlot(e.startsAt)}. Please confirm your attendance again.`
          : `The meeting "${e.title}" has been updated.`,
        link: `/meetings/${e.meetingId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('meeting.cancelled')
  async onMeetingCancelled(@Payload() e: MeetingEvent) {
    await this.safely('meeting.cancelled', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.MEETING_CANCELLED,
        title: 'Meeting cancelled',
        body: `"${e.title}" scheduled for ${formatSlot(e.startsAt)} has been cancelled.`,
        link: '/meetings',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('meeting.response')
  async onMeetingResponse(@Payload() e: MeetingEvent) {
    const wording: Record<string, string> = {
      ACCEPTED: 'accepted',
      DECLINED: 'declined',
      TENTATIVE: 'tentatively accepted',
    };
    await this.safely('meeting.response', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.MEETING_RESPONSE,
        title: 'Meeting response',
        body: `An invitee has ${wording[e.response ?? ''] ?? 'answered'} your invitation to "${e.title}".`,
        link: `/meetings/${e.meetingId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('project.assigned')
  async onProjectAssigned(@Payload() e: ProjectAssignmentEvent) {
    await this.safely('project.assigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.PROJECT_ASSIGNED,
        title: 'New project',
        body: `You have been assigned to the project "${e.projectName}".`,
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
        title: 'Removed from a project',
        body: `You are no longer part of the project "${e.projectName}".`,
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
        title: 'New task',
        body: `A task has been assigned to you: "${e.taskTitle}".`,
        link: `/projects/${e.projectId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('task.reassigned')
  async onTaskReassigned(@Payload() e: TaskAssignedEvent) {
    await this.safely('task.reassigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TASK_REASSIGNED,
        title: 'Task reassigned',
        body: `Your task "${e.taskTitle}" has been assigned to another collaborator.`,
        link: `/projects/${e.projectId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('task.status_changed')
  async onTaskStatusChanged(@Payload() e: TaskStatusChangedEvent) {
    const to = statusLabel(e.status);
    await this.safely('task.status_changed', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.TASK_STATUS_CHANGED,
        title: 'Task status updated',
        body: e.previousStatus
          ? `Your task "${e.taskTitle}" moved from ${statusLabel(e.previousStatus)} to ${to}.`
          : `Your task "${e.taskTitle}" moved to ${to}.`,
        link: `/projects/${e.projectId}`,
        actorName: e.actorName ?? null,
      }),
    );
  }

  // ---------------------------------------------------------------- Hierarchie

  @EventPattern('responsable.assigned')
  async onResponsableAssigned(@Payload() e: ResponsableEvent) {
    const names = (e.managerNames ?? []).filter(Boolean);
    await this.safely('responsable.assigned', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.RESPONSABLE_ASSIGNED,
        title: names.length > 1 ? 'New managers' : 'New manager',
        body:
          names.length > 0
            ? `${names.join(', ')} ${names.length > 1 ? 'are now your managers' : 'is now your manager'}.`
            : 'Your reporting line has been updated.',
        link: '/profile',
        actorName: null,
      }),
    );
  }

  @EventPattern('collaborator.attached')
  async onCollaboratorAttached(@Payload() e: ResponsableEvent) {
    await this.safely('collaborator.attached', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.COLLABORATOR_ATTACHED,
        title: 'New collaborator',
        body: `${e.collaboratorName ?? 'A collaborator'} now reports to you.`,
        link: '/users',
        actorName: null,
      }),
    );
  }

  // ------------------------------------------------------------ Administration

  @EventPattern('account.created')
  async onAccountCreated(@Payload() e: AccountEvent) {
    await this.safely('account.created', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.ACCOUNT_CREATED,
        title: 'Welcome',
        body: 'Your Resource Tracker account has been created.',
        link: '/profile',
        actorName: e.actorName ?? null,
      }),
    );
  }

  @EventPattern('account.role_changed')
  async onRoleChanged(@Payload() e: AccountEvent) {
    const roles = (e.newRoles ?? (e.newRole ? [e.newRole] : [])).filter(Boolean);
    const labels = roles.map(roleLabel);
    await this.safely('account.role_changed', () =>
      this.notifications.createMany(e.recipientIds, {
        type: NotificationType.ROLE_CHANGED,
        title: 'Role updated',
        body:
          labels.length > 1
            ? `Your roles are now ${joinLabels(labels)}.`
            : labels.length === 1
              ? `Your role is now ${labels[0]}.`
              : 'Your role has been updated.',
        link: '/profile',
        actorName: e.actorName ?? null,
      }),
    );
  }
}
