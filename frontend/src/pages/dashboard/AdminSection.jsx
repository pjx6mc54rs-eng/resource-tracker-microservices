import { Link } from 'react-router-dom'
import UsersIcon from '../../components/UsersIcon'
import FolderIcon from '../../components/FolderIcon'
import ClipboardIcon from '../../components/ClipboardIcon'
import ChartBarIcon from '../../components/ChartBarIcon'
import BoltIcon from '../../components/BoltIcon'
import CheckCircleIcon from '../../components/CheckCircleIcon'
import WarningIcon from '../../components/WarningIcon'
import { BarList, EmptyNote, MiniStat, Panel } from './DashboardParts'
import {
  PERIOD_STATUSES,
  PERIOD_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  hours,
  list,
  monthLabel,
  num,
  projectName,
  round2,
  shortMonthLabel,
  widthPercent,
} from './dashboardUtils'

/* Hand-rolled column chart geometry — there is no chart library in this app
   and none may be added, so the trend is plain SVG in a fixed viewBox that
   scales with the panel. */
const CHART_W = 360
const CHART_H = 150
const PLOT_TOP = 16
const PLOT_BOTTOM = 108
const PLOT_H = PLOT_BOTTOM - PLOT_TOP

function TrendChart({ trend }) {
  const points = list(trend)
  if (points.length === 0) {
    return <EmptyNote>No hours have been recorded over the last six months.</EmptyNote>
  }

  const peak = points.reduce((max, point) => Math.max(max, num(point?.hours)), 0)
  const colWidth = CHART_W / points.length
  const barWidth = Math.min(38, colWidth * 0.5)
  const summary = points
    .map((point) => `${shortMonthLabel(point?.year, point?.month)}: ${hours(point?.hours)}`)
    .join(', ')

  return (
    <svg
      className="dsh-trend"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label={`Hours logged over the last six months — ${summary}`}
    >
      <line
        className="dsh-trend-axis"
        x1="0"
        y1={PLOT_BOTTOM}
        x2={CHART_W}
        y2={PLOT_BOTTOM}
      />
      {points.map((point, index) => {
        const value = round2(point?.hours)
        const barHeight = peak > 0 ? (value / peak) * PLOT_H : 0
        const x = index * colWidth + (colWidth - barWidth) / 2
        const y = PLOT_BOTTOM - barHeight
        const label = shortMonthLabel(point?.year, point?.month)
        return (
          <g key={`${point?.year ?? 'y'}-${point?.month ?? index}`}>
            <title>{`${monthLabel(point?.year, point?.month)}: ${hours(value)}`}</title>
            <rect
              className="dsh-trend-bar"
              x={x}
              y={barHeight > 0 ? y : PLOT_BOTTOM - 2}
              width={barWidth}
              height={barHeight > 0 ? barHeight : 2}
              rx="4"
            />
            <text
              className="dsh-trend-value"
              x={x + barWidth / 2}
              y={Math.max(PLOT_TOP - 5, y - 5)}
              textAnchor="middle"
            >
              {value}
            </text>
            <text
              className="dsh-trend-label"
              x={x + barWidth / 2}
              y={PLOT_BOTTOM + 20}
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function TaskStack({ tasks }) {
  const total = num(tasks.total)
  if (total <= 0) {
    return <EmptyNote>No task has been created yet.</EmptyNote>
  }

  return (
    <div className="dsh-stack">
      <div
        className="dsh-stack-track"
        role="img"
        aria-label={TASK_STATUSES.map(
          (key) => `${TASK_STATUS_LABELS[key]}: ${num(tasks[key])}`,
        ).join(', ')}
      >
        {TASK_STATUSES.map((key) => {
          const value = num(tasks[key])
          if (value <= 0) return null
          return (
            <span
              className={`dsh-stack-seg dsh-stack-seg-${key}`}
              key={key}
              style={{ width: `${widthPercent(value, total)}%` }}
              title={`${TASK_STATUS_LABELS[key]}: ${value} of ${total}`}
            />
          )
        })}
      </div>
      <ul className="dsh-stack-legend">
        {TASK_STATUSES.map((key) => (
          <li className="dsh-stack-legend-item" key={key}>
            <span className={`dsh-stack-swatch dsh-stack-seg-${key}`} />
            {TASK_STATUS_LABELS[key]}
            <strong>{num(tasks[key])}</strong>
          </li>
        ))}
        <li className="dsh-stack-legend-item">
          Total<strong>{total}</strong>
        </li>
      </ul>
    </div>
  )
}

function ValidationFunnel({ validation }) {
  const peak = PERIOD_STATUSES.reduce(
    (max, key) => Math.max(max, num(validation[key])),
    0,
  )

  return (
    <ul className="dsh-funnel">
      {PERIOD_STATUSES.map((key) => {
        const value = num(validation[key])
        return (
          <li className={`dsh-funnel-item dsh-funnel-item-${key}`} key={key}>
            <span className="dsh-funnel-value">{value}</span>
            <span
              className="dsh-funnel-track"
              role="img"
              title={`${PERIOD_STATUS_LABELS[key]}: ${value}`}
              aria-label={`${PERIOD_STATUS_LABELS[key]}: ${value}`}
            >
              <span
                className={`dsh-funnel-fill dsh-funnel-fill-${key}`}
                style={{
                  width: value > 0 ? `${Math.max(2, widthPercent(value, peak))}%` : '0%',
                }}
              />
            </span>
            <span className="dsh-funnel-label">{PERIOD_STATUS_LABELS[key]}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function AdminSection({ admin, period }) {
  const block = admin && typeof admin === 'object' ? admin : {}
  const users = block.users && typeof block.users === 'object' ? block.users : {}
  const projects = block.projects && typeof block.projects === 'object' ? block.projects : {}
  const tasks = block.tasks && typeof block.tasks === 'object' ? block.tasks : {}
  const validation = block.validation && typeof block.validation === 'object' ? block.validation : {}
  const companyHours = block.hours && typeof block.hours === 'object' ? block.hours : {}

  const orphanUsers = list(users.withoutResponsable)
  const services = list(block.services)
  const topProjects = list(companyHours.topProjects)

  return (
    <>
      <h2 className="dsh-section-title">
        Company — {monthLabel(period.year, period.month)}
      </h2>

      <div className="dsh-grid dsh-grid-2">
        <Panel
          title="Users"
          subtitle={`${num(users.newThisMonth)} joined this month`}
          icon={<UsersIcon size="20px" />}
          count={num(users.total)}
          action={
            <Link to="/users" className="dsh-link">
              Manage users
            </Link>
          }
        >
          <div className="dsh-minis">
            <MiniStat value={num(users.admins)} label="Admins" />
            <MiniStat value={num(users.responsables)} label="Responsables" />
            <MiniStat value={num(users.collaborateurs)} label="Collaborateurs" />
            <MiniStat value={num(users.newThisMonth)} label="New this month" />
          </div>

          {orphanUsers.length > 0 ? (
            <div className="dsh-alert dsh-alert-warn">
              <span className="dsh-alert-icon">
                <WarningIcon size="16px" />
              </span>
              <span className="dsh-alert-body">
                <strong>
                  {orphanUsers.length} user{orphanUsers.length > 1 ? 's have' : ' has'} no
                  responsable
                </strong>{' '}
                — their timesheets cannot be validated.
                <ul className="dsh-userlist">
                  {orphanUsers.map((entry, index) => (
                    <li className="dsh-userlist-item" key={entry?.id ?? `orphan-${index}`}>
                      <Link to="/users">{entry?.name || 'Unnamed user'}</Link>
                    </li>
                  ))}
                </ul>
              </span>
            </div>
          ) : (
            <EmptyNote>Every user is attached to a responsable.</EmptyNote>
          )}
        </Panel>

        <Panel
          title="Projects"
          subtitle={`${num(projects.newThisMonth)} created this month`}
          icon={<FolderIcon size="20px" />}
          count={num(projects.total)}
          action={
            <Link to="/projects" className="dsh-link">
              Browse projects
            </Link>
          }
        >
          <div className="dsh-minis">
            <MiniStat value={num(projects.total)} label="Total" />
            <MiniStat
              value={num(projects.withoutAssignees)}
              label="Without assignees"
              tone={num(projects.withoutAssignees) > 0 ? 'warn' : undefined}
            />
            <MiniStat
              value={num(projects.withoutTasks)}
              label="Without tasks"
              tone={num(projects.withoutTasks) > 0 ? 'warn' : undefined}
            />
            <MiniStat value={num(projects.newThisMonth)} label="New this month" />
          </div>
        </Panel>
      </div>

      <div className="dsh-grid dsh-grid-2">
        <Panel
          title="Tasks across the company"
          subtitle="Every task, by status."
          icon={<ClipboardIcon size="20px" />}
        >
          <TaskStack tasks={tasks} />
        </Panel>

        <Panel
          title="Validation funnel"
          subtitle={`Monthly timesheets for ${monthLabel(period.year, period.month)}.`}
          icon={<CheckCircleIcon size="20px" />}
        >
          <ValidationFunnel validation={validation} />
        </Panel>
      </div>

      <Panel
        title="Company hours"
        subtitle={`${hours(companyHours.total)} logged in ${monthLabel(period.year, period.month)}.`}
        icon={<ChartBarIcon size="20px" />}
      >
        <div className="dsh-grid dsh-grid-2">
          <div className="dsh-subpanel">
            <h3 className="dsh-subtitle">Top projects</h3>
            <BarList
              items={topProjects.map((row, index) => ({
                key: row?.projectId ?? `top-${index}`,
                label: projectName(row?.projectName),
                value: row?.hours,
                share: row?.share,
              }))}
              emptyText="No hours have been logged for this month."
            />
          </div>
          <div className="dsh-subpanel">
            <h3 className="dsh-subtitle">Six-month trend</h3>
            <TrendChart trend={companyHours.trend} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Service health"
        subtitle="Live probe of the microservices behind this dashboard."
        icon={<BoltIcon size="20px" />}
      >
        {services.length === 0 ? (
          <EmptyNote>Health information is not available right now.</EmptyNote>
        ) : (
          <ul className="dsh-health">
            {services.map((service, index) => {
              const up = service?.status === 'up'
              return (
                <li
                  className="dsh-health-item"
                  key={service?.name ?? `service-${index}`}
                  title={`${service?.name ?? 'service'}: ${up ? 'up' : 'down'} (${round2(
                    service?.ms,
                  )} ms)`}
                >
                  <span
                    className={`dsh-health-dot ${up ? 'dsh-health-dot-up' : 'dsh-health-dot-down'}`}
                    aria-hidden="true"
                  />
                  <span className="dsh-health-name">{service?.name ?? 'service'}</span>
                  <span className="dsh-health-ms">
                    {up ? `${round2(service?.ms)} ms` : 'unreachable'}
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
