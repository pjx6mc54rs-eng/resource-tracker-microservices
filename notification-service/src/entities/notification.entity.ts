import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Categorie d'evenement. Sert au frontend pour choisir une icone et un ton,
 * et permet de filtrer cote API sans analyser le texte.
 */
export enum NotificationType {
  // Timesheets
  TIMESHEET_SUBMITTED = 'timesheet_submitted',
  TIMESHEET_APPROVED = 'timesheet_approved',
  TIMESHEET_REJECTED = 'timesheet_rejected',
  TIMESHEET_RECALLED = 'timesheet_recalled',
  // Projets et taches
  PROJECT_ASSIGNED = 'project_assigned',
  PROJECT_UNASSIGNED = 'project_unassigned',
  TASK_ASSIGNED = 'task_assigned',
  // Hierarchie
  RESPONSABLE_ASSIGNED = 'responsable_assigned',
  COLLABORATOR_ATTACHED = 'collaborator_attached',
  // Administration
  ACCOUNT_CREATED = 'account_created',
  ROLE_CHANGED = 'role_changed',
}

@Entity('notifications')
// Index compose : la requete dominante est "les notifications de cet
// utilisateur, les plus recentes d'abord".
@Index(['userId', 'createdAt'])
@Index(['userId', 'read'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Destinataire. Identifiant provenant de auth_db, sans contrainte FK : les
   *  bases sont separees par service. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  /** Chemin relatif dans le frontend, ex. "/timesheet". Jamais une URL absolue :
   *  le domaine change entre local et production. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  link: string | null;

  /** Auteur de l'action, pour afficher "par Untel". */
  @Column({ name: 'actor_name', type: 'varchar', length: 200, nullable: true })
  actorName: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;
}
