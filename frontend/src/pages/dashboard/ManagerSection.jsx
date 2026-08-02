import { Link } from 'react-router-dom'
import CheckCircleIcon from '../../components/CheckCircleIcon'
import UsersIcon from '../../components/UsersIcon'
import WarningIcon from '../../components/WarningIcon'
import { EmptyNote, MiniStat, Panel, StatusPill } from './DashboardParts'
import {
  PERIOD_STATUS_LABELS,
  daysSince,
  formatDateTime,
  hours,
  initials,
  list,
  monthLabel,
  num,
  round2,
} from './dashboardUtils'

/** Beyond this, a submission waiting in the queue deserves a visible nudge. */
const AGING_THRESHOLD_DAYS = 3

export default function ManagerSection({ manager, period }) {
  const block = manager && typeof manager === 'object' ? manager : {}
  const pending = block.pending && typeof block.pending === 'object' ? block.pending : {}
  const reviewed =
    block.reviewedThisMonth && typeof block.reviewedThisMonth === 'object'
      ? block.reviewedThisMonth
      : {}
  const team = block.team && typeof block.team === 'object' ? block.team : {}

  const queue = list(pending.items)
  const compliance = list(team.compliance)
  const waitingDays = daysSince(pending.oldestSubmittedAt)
  const isAging = waitingDays !== null && waitingDays >= AGING_THRESHOLD_DAYS

  return (
    <>
      <h2 className="dsh-section-title">Team — {monthLabel(period.year, period.month)}</h2>

      <div className="dsh-grid dsh-grid-2">
        <Panel
          title="Awaiting my validation"
          subtitle="Timesheets your collaborateurs have sent you."
          icon={<CheckCircleIcon size="20px" />}
          count={num(pending.count)}
          action={
            <Link to="/timesheet-validation" className="dsh-link dsh-link-primary">
              Open the queue
            </Link>
          }
        >
          {isAging ? (
            <p className="dsh-alert dsh-alert-warn">
              <span className="dsh-alert-icon">
                <WarningIcon size="16px" />
              </span>
              The oldest submission has been waiting {waitingDays} day
              {waitingDays > 1 ? 's' : ''} (since {formatDateTime(pending.oldestSubmittedAt)}).
            </p>
          ) : null}

          {queue.length === 0 ? (
            <EmptyNote>Nothing is waiting for your validation right now.</EmptyNote>
          ) : (
            <ul className="dsh-queue">
              {queue.map((item, index) => (
                <li className="dsh-queue-item" key={item?.periodId ?? `queue-${index}`}>
                  <span className="dsh-avatar">{initials(item?.userName)}</span>
                  <span className="dsh-queue-main">
                    <Link to="/timesheet-validation" className="dsh-queue-name">
                      {item?.userName || 'Unknown collaborateur'}
                    </Link>
                    <span className="dsh-queue-meta">
                      {item?.jobTitle ? `${item.jobTitle} · ` : ''}
                      {monthLabel(item?.year, item?.month)}
                      {item?.submittedAt ? ` · sent ${formatDateTime(item.submittedAt)}` : ''}
                    </span>
                  </span>
                  <span className="dsh-queue-side">
                    <strong>{hours(item?.totalHours)}</strong>
                    <em>{round2(item?.totalDays)} d</em>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Team at a glance"
          subtitle="Reviews handled this month and overall team volume."
          icon={<UsersIcon size="20px" />}
        >
          <div className="dsh-minis">
            <MiniStat value={num(reviewed.approved)} label="Validated this month" tone="ok" />
            <MiniStat value={num(reviewed.rejected)} label="Rejected this month" tone="bad" />
            <MiniStat value={num(team.size)} label="Collaborateurs" />
            <MiniStat value={hours(team.hours)} label="Team hours" />
            <MiniStat value={hours(team.avgHours)} label="Average per person" />
          </div>
        </Panel>
      </div>

      <Panel
        title="Team compliance"
        subtitle="Where each collaborateur stands for the selected month."
        icon={<UsersIcon size="20px" />}
        count={compliance.length}
      >
        {compliance.length === 0 ? (
          <EmptyNote>
            No collaborateur is attached to you yet, so there is nothing to follow up on.
          </EmptyNote>
        ) : (
          <ul className="dsh-team">
            {compliance.map((row, index) => {
              const rowStatus = PERIOD_STATUS_LABELS[row?.status] ? row.status : 'not_validated'
              return (
                <li className="dsh-team-row" key={row?.userId ?? `team-${index}`}>
                  <span className="dsh-avatar">{initials(row?.name)}</span>
                  <span className="dsh-team-name">{row?.name || 'Unknown collaborateur'}</span>
                  <StatusPill status={rowStatus} />
                  <span className="dsh-team-nums">
                    <strong>{hours(row?.totalHours)}</strong>
                    <em>{num(row?.filledDays)} days filled</em>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </>
  )
}
