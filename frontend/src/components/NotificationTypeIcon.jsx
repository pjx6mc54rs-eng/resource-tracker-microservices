/**
 * Représentation visuelle d'un type de notification.
 *
 * Les types viennent de NotificationType côté notification-service. Chacun
 * reçoit une icône et une couleur d'accent : dans une liste, la forme et la
 * teinte se lisent avant le texte et permettent de repérer d'un coup d'œil
 * un refus au milieu de validations.
 *
 * Icônes en trait, cohérentes avec le reste de la barre de navigation.
 */

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

const CheckCircle = () => (
  <><circle cx="12" cy="12" r="9" {...P} /><path d="M8.5 12.2l2.3 2.3 4.7-4.9" {...P} /></>
)
const XCircle = () => (
  <><circle cx="12" cy="12" r="9" {...P} /><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" {...P} /></>
)
const ClockDoc = () => (
  <><path d="M6 3.5h8.5L18 7v13.5H6z" {...P} /><path d="M9 12h6M9 15.5h4" {...P} /></>
)
const Undo = () => (
  <><path d="M4 10h9a5 5 0 010 10H9" {...P} /><path d="M7.5 6.5L4 10l3.5 3.5" {...P} /></>
)
const FolderPlus = () => (
  <><path d="M3.5 7.5a1.5 1.5 0 011.5-1.5h3.6l1.8 2h8.1a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z" {...P} /><path d="M12 11.5v4M10 13.5h4" {...P} /></>
)
const CalendarPlus = () => (
  <><path d="M4.5 6.5h15v13h-15z" {...P} /><path d="M4.5 10.5h15M8.5 4v3M15.5 4v3" {...P} /><path d="M12 13v4M10 15h4" {...P} /></>
)
const CalendarClock = () => (
  <><path d="M4.5 6.5h15v13h-15z" {...P} /><path d="M4.5 10.5h15M8.5 4v3M15.5 4v3" {...P} /><path d="M12 13v3l2 1.4" {...P} /></>
)
const CalendarX = () => (
  <><path d="M4.5 6.5h15v13h-15z" {...P} /><path d="M4.5 10.5h15M8.5 4v3M15.5 4v3" {...P} /><path d="M10 13.5l4 4M14 13.5l-4 4" {...P} /></>
)
const CalendarCheck = () => (
  <><path d="M4.5 6.5h15v13h-15z" {...P} /><path d="M4.5 10.5h15M8.5 4v3M15.5 4v3" {...P} /><path d="M9.5 15l1.8 1.8 3.4-3.6" {...P} /></>
)
const FolderMinus = () => (
  <><path d="M3.5 7.5a1.5 1.5 0 011.5-1.5h3.6l1.8 2h8.1a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5z" {...P} /><path d="M10 13.5h4" {...P} /></>
)
const Checklist = () => (
  <><path d="M4 7l1.6 1.6L8.6 5.6" {...P} /><path d="M4 16l1.6 1.6L8.6 14.6" {...P} /><path d="M11.5 7.5H20M11.5 16.5H20" {...P} /></>
)
const ArrowRightCircle = () => (
  <><circle cx="12" cy="12" r="9" {...P} /><path d="M8.2 12h6M12.1 9.3l2.9 2.7-2.9 2.7" {...P} /></>
)
const UserHandoff = () => (
  <><circle cx="8.5" cy="8" r="3" {...P} /><path d="M3.5 18.5c0-2.9 2.2-4.8 5-4.8.8 0 1.6.15 2.3.45" {...P} /><path d="M13.5 17.5H20M17.5 15l2.5 2.5-2.5 2.5" {...P} /></>
)
const UserUp = () => (
  <><circle cx="10" cy="8" r="3.2" {...P} /><path d="M4.2 19c0-3.2 2.6-5.2 5.8-5.2 1.1 0 2.1.2 3 .7" {...P} /><path d="M17.5 19.5v-6M15 16l2.5-2.5L20 16" {...P} /></>
)
const Users = () => (
  <><circle cx="9" cy="8.5" r="3" {...P} /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" {...P} /><path d="M16 6.2a3 3 0 010 5.6M17.5 19c0-2-.7-3.6-1.9-4.6" {...P} /></>
)
const Sparkle = () => (
  <><path d="M12 4l1.7 4.6L18.5 10l-4.8 1.4L12 16l-1.7-4.6L5.5 10l4.8-1.4z" {...P} /><path d="M17.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" {...P} /></>
)
const Shield = () => (
  <><path d="M12 3.5l6.5 2.4v5.4c0 4-2.7 7.3-6.5 8.7-3.8-1.4-6.5-4.7-6.5-8.7V5.9z" {...P} /><path d="M9.3 12.1l1.9 1.9 3.6-3.8" {...P} /></>
)
const Bell = () => (
  <><path d="M18 9.75V9A6 6 0 006 9v.75a8.97 8.97 0 01-2.3 6.02c1.73.64 3.56 1.09 5.45 1.31m8.85-1.31a23.8 23.8 0 01-5.71 0m5.71 0a3 3 0 11-5.71 0" {...P} /></>
)

/** type → { Icon, couleur d'accent, libellé accessible } */
const TYPES = {
  timesheet_submitted: { Icon: ClockDoc, color: '#2563eb', label: 'Timesheet submitted' },
  timesheet_approved: { Icon: CheckCircle, color: '#16a34a', label: 'Timesheet approved' },
  timesheet_rejected: { Icon: XCircle, color: '#dc2626', label: 'Timesheet rejected' },
  timesheet_recalled: { Icon: Undo, color: '#d97706', label: 'Submission withdrawn' },

  project_assigned: { Icon: FolderPlus, color: '#2563eb', label: 'Project assignment' },
  project_unassigned: { Icon: FolderMinus, color: '#64748b', label: 'Removed from a project' },
  task_assigned: { Icon: Checklist, color: '#7c3aed', label: 'Task assigned' },
  task_reassigned: { Icon: UserHandoff, color: '#64748b', label: 'Task reassigned' },
  task_status_changed: { Icon: ArrowRightCircle, color: '#0ea5e9', label: 'Task status updated' },

  responsable_assigned: { Icon: UserUp, color: '#0d9488', label: 'New manager' },
  collaborator_attached: { Icon: Users, color: '#0d9488', label: 'New collaborator' },

  meeting_invited: { Icon: CalendarPlus, color: '#2563eb', label: 'Meeting invitation' },
  meeting_updated: { Icon: CalendarClock, color: '#d97706', label: 'Meeting updated' },
  meeting_cancelled: { Icon: CalendarX, color: '#dc2626', label: 'Meeting cancelled' },
  meeting_response: { Icon: CalendarCheck, color: '#16a34a', label: 'Meeting response' },

  account_created: { Icon: Sparkle, color: '#16a34a', label: 'Account created' },
  role_changed: { Icon: Shield, color: '#d97706', label: 'Role updated' },
}

// Repli pour un type inconnu : le frontend ne doit pas casser si le backend
// ajoute un événement avant que l'interface ne soit mise à jour.
const FALLBACK = { Icon: Bell, color: '#64748b', label: 'Notification' }

export function notificationMeta(type) {
  return TYPES[type] ?? FALLBACK
}

export default function NotificationTypeIcon({ type, size = 18 }) {
  const { Icon, color, label } = notificationMeta(type)
  return (
    <span
      className="notification-type-icon"
      style={{ color, '--accent': color }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <Icon />
      </svg>
    </span>
  )
}
