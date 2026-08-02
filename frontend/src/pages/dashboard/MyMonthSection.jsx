import { Link } from 'react-router-dom'
import ClockIcon from '../../components/ClockIcon'
import FolderIcon from '../../components/FolderIcon'
import ClipboardIcon from '../../components/ClipboardIcon'
import CalendarIcon from '../../components/CalendarIcon'
import { BarList, EmptyNote, Kpi, Panel, ProgressBar, StatusPill } from './DashboardParts'
import {
  PERIOD_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  formatDateTime,
  hours,
  list,
  monthLabel,
  num,
  projectName,
  round2,
  shortMonthLabel,
  weekdaysInMonth,
} from './dashboardUtils'

const EMPTY_PERIOD = {
  status: 'not_validated',
  totalHours: 0,
  workHours: 0,
  totalDays: 0,
  holidayDays: 0,
  filledDays: 0,
  entriesCount: 0,
  submittedAt: null,
  reviewedAt: null,
  reviewComment: null,
  canSubmit: false,
  canRecall: false,
  canDownload: false,
  reviewers: [],
}

export default function MyMonthSection({ me, period }) {
  const mine = me && typeof me === 'object' ? me : {}
  const monthly = { ...EMPTY_PERIOD, ...(mine.period ?? {}) }

  const status = PERIOD_STATUS_LABELS[monthly.status] ? monthly.status : 'not_validated'
  const reviewers = list(monthly.reviewers)
  const history = list(mine.history)
  const byProject = list(mine.hoursByProject)
  const tasks = mine.tasks && typeof mine.tasks === 'object' ? mine.tasks : {}
  const openTasks = list(tasks.open)

  /* `filledDays` is the number of distinct dates that carry an entry — the API
     counts weekends and holidays in it — while `workingDays` only counts
     weekdays. The two are therefore NOT comparable: filling a Saturday pushes
     filledDays past workingDays without any working day being covered. The
     progress bar clamps itself, and the copy below never claims the month is
     complete once the figures have gone out of sync. */
  const filledDays = num(monthly.filledDays)
  const workingDays = weekdaysInMonth(period.year, period.month)
  const remaining = Math.max(0, workingDays - filledDays)
  const beyondWorkingDays = filledDays > workingDays

  const label = monthLabel(period.year, period.month)

  return (
    <>
      <Panel
        title={`My timesheet — ${label}`}
        subtitle={
          status === 'pending'
            ? `Sent for validation on ${formatDateTime(monthly.submittedAt)}.`
            : status === 'approved' || status === 'rejected'
              ? `Reviewed on ${formatDateTime(monthly.reviewedAt)}.`
              : 'Nothing has been sent for validation yet for this month.'
        }
        icon={<ClockIcon size="20px" />}
        action={<StatusPill status={status} />}
      >
        {status === 'rejected' && monthly.reviewComment ? (
          <p className="dsh-comment">
            <strong>Returned for correction:</strong> {monthly.reviewComment}
          </p>
        ) : null}

        <div className="dsh-kpis">
          <Kpi value={hours(monthly.totalHours)} label="Total hours" />
          <Kpi value={hours(monthly.workHours)} label="Worked hours" />
          <Kpi value={round2(monthly.totalDays)} label="Days" />
          <Kpi value={num(filledDays)} label="Days filled" />
          <Kpi value={num(monthly.holidayDays)} label="Holidays" />
        </div>

        <ProgressBar
          label="Days filled this month"
          value={filledDays}
          max={workingDays}
          ariaLabel={`${filledDays} day${filledDays === 1 ? '' : 's'} filled for ${workingDays} working day${workingDays === 1 ? '' : 's'} in ${label}`}
          hint={
            workingDays === 0
              ? 'No working day to fill for this month.'
              : beyondWorkingDays
                ? `${filledDays} days filled for ${workingDays} working days in ${label} — days outside the working week are counted too, so some working days may still be empty.`
                : remaining === 0
                  ? `Every working day of ${label} is covered.`
                  : `${remaining} working day${remaining > 1 ? 's' : ''} still to fill.`
          }
        />

        <div className="dsh-hero-links">
          <Link to="/timesheet" className="dsh-link dsh-link-primary">
            {monthly.canSubmit ? 'Fill in and submit this month' : 'Open my timesheet'}
          </Link>
          {monthly.canRecall ? (
            <Link to="/timesheet" className="dsh-link">
              Recall my submission
            </Link>
          ) : null}
          {monthly.canDownload ? (
            <Link to="/timesheet" className="dsh-link">
              Export (Excel / PDF)
            </Link>
          ) : null}
          <span className="dsh-hero-meta">
            {num(monthly.entriesCount)} entr{num(monthly.entriesCount) === 1 ? 'y' : 'ies'} ·{' '}
            {reviewers.length > 0
              ? `Reviewed by ${reviewers.map((r) => r?.name ?? '—').join(', ')}`
              : 'No responsable assigned yet'}
          </span>
        </div>
      </Panel>

      <div className="dsh-grid dsh-grid-2">
        {/* projectsCount is period-independent: the API counts every project the
            user is attached to, not the ones worked on during this month. */}
        <Panel
          title="Hours per project"
          subtitle={`${num(mine.projectsCount)} project${num(mine.projectsCount) === 1 ? '' : 's'} assigned to me`}
          icon={<FolderIcon size="20px" />}
        >
          <BarList
            items={byProject.map((row, index) => ({
              key: row?.projectId ?? `no-project-${index}`,
              label: projectName(row?.projectName),
              value: row?.hours,
              share: row?.share,
            }))}
            emptyText="No hours logged for this month yet. Start with your timesheet."
          />
        </Panel>

        <Panel
          title="My open tasks"
          subtitle={`${num(tasks.total)} task${num(tasks.total) === 1 ? '' : 's'} assigned to me`}
          icon={<ClipboardIcon size="20px" />}
        >
          <div className="dsh-task-cols">
            {TASK_STATUSES.map((key) => {
              const items = openTasks.filter((task) => task?.status === key)
              return (
                <div className={`dsh-task-col dsh-task-col-${key}`} key={key}>
                  <div className="dsh-task-col-head">
                    <span className="dsh-task-col-name">{TASK_STATUS_LABELS[key]}</span>
                    <span className="dsh-task-count">{num(tasks[key])}</span>
                  </div>
                  {key === 'done' ? (
                    <p className="dsh-task-note">Completed tasks are not listed.</p>
                  ) : items.length === 0 ? (
                    <p className="dsh-task-note">Nothing here.</p>
                  ) : (
                    <ul className="dsh-task-list">
                      {items.map((task, index) => (
                        <li className="dsh-task-item" key={task?.id ?? `${key}-${index}`}>
                          <Link to="/projects" className="dsh-task-title">
                            {task?.title || 'Untitled task'}
                          </Link>
                          <span className="dsh-task-project">
                            {projectName(task?.projectName)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
          {num(tasks.total) > 0 && openTasks.length === 0 ? (
            <EmptyNote>No task is open right now — everything is done.</EmptyNote>
          ) : null}
        </Panel>
      </div>

      <Panel
        title="Submission history"
        subtitle="The last months with activity, most recent first."
        icon={<CalendarIcon size="20px" />}
      >
        {history.length === 0 ? (
          <EmptyNote>
            No month has been recorded yet. Your first submitted timesheet will show up here.
          </EmptyNote>
        ) : (
          <ul className="dsh-history">
            {history.map((entry, index) => {
              const entryStatus = PERIOD_STATUS_LABELS[entry?.status]
                ? entry.status
                : 'not_validated'
              return (
                <li
                  className={`dsh-chip dsh-chip-${entryStatus}`}
                  key={`${entry?.year ?? 'y'}-${entry?.month ?? index}`}
                  title={`${monthLabel(entry?.year, entry?.month)} — ${
                    PERIOD_STATUS_LABELS[entryStatus]
                  } — ${hours(entry?.totalHours)} over ${round2(entry?.totalDays)} day(s)`}
                >
                  <span className="dsh-chip-month">
                    {shortMonthLabel(entry?.year, entry?.month)}
                  </span>
                  <span className="dsh-chip-value">{hours(entry?.totalHours)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </>
  )
}
