import ClockIcon from '../../components/ClockIcon'
import CheckCircleIcon from '../../components/CheckCircleIcon'
import XCircleIcon from '../../components/XCircleIcon'
import ClipboardIcon from '../../components/ClipboardIcon'
import {
  PERIOD_STATUS_LABELS,
  hours,
  list,
  num,
  round2,
  sharePercent,
  widthPercent,
} from './dashboardUtils'

/* Same label + icon table idiom as TimesheetValidation's TABS, extended with
   the `not_validated` case that only exists on the collaborateur side. */
const STATUS_ICONS = {
  not_validated: ClipboardIcon,
  pending: ClockIcon,
  approved: CheckCircleIcon,
  rejected: XCircleIcon,
}

export function StatusPill({ status, size = '14px' }) {
  const key = STATUS_ICONS[status] ? status : 'not_validated'
  const Icon = STATUS_ICONS[key]
  return (
    <span className={`dsh-pill dsh-pill-${key}`}>
      <Icon size={size} />
      {PERIOD_STATUS_LABELS[key]}
    </span>
  )
}

export function Panel({ title, subtitle, icon, count, action, children }) {
  return (
    <section className="dsh-panel">
      <header className="dsh-panel-head">
        {icon ? <span className="dsh-panel-icon">{icon}</span> : null}
        <div className="dsh-panel-titles">
          <h2 className="dsh-panel-title">{title}</h2>
          {subtitle ? <p className="dsh-panel-sub">{subtitle}</p> : null}
        </div>
        {count !== undefined && count !== null ? (
          <span className="dsh-count">{num(count)}</span>
        ) : null}
        {action ? <span className="dsh-panel-action">{action}</span> : null}
      </header>
      <div className="dsh-panel-body">{children}</div>
    </section>
  )
}

export function EmptyNote({ children }) {
  return <p className="dsh-empty">{children}</p>
}

export function Kpi({ value, label, hint }) {
  return (
    <div className="dsh-kpi">
      <span className="dsh-kpi-value">{value}</span>
      <span className="dsh-kpi-label">{label}</span>
      {hint ? <span className="dsh-kpi-hint">{hint}</span> : null}
    </div>
  )
}

export function MiniStat({ value, label, tone }) {
  return (
    <div className={`dsh-mini${tone ? ` dsh-mini-${tone}` : ''}`}>
      <span className="dsh-mini-value">{value}</span>
      <span className="dsh-mini-label">{label}</span>
    </div>
  )
}

/**
 * A progress bar can never report more than 100%: `value` is clamped to `max`
 * here, so a caller whose numerator and denominator are not strictly
 * comparable cannot overflow the track, the "x / y" readout or aria-valuenow.
 * When the clamp bites, the honest figures belong in `ariaLabel` / `hint` —
 * this component only guarantees the bar itself stays truthful.
 */
export function ProgressBar({ label, hint, value, max, ariaLabel }) {
  const raw = Math.max(0, num(value))
  const target = Math.max(0, num(max))
  const done = target > 0 ? Math.min(raw, target) : raw
  const filled = widthPercent(done, target)
  return (
    <div className="dsh-progress">
      <div className="dsh-progress-head">
        <span>{label}</span>
        <strong>
          {done} / {target || '—'}
        </strong>
      </div>
      <div
        className="dsh-progress-track"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={target || done}
        aria-label={ariaLabel ?? label}
        title={ariaLabel ?? `${done} of ${target || '—'}`}
      >
        <span className="dsh-progress-fill" style={{ width: `${filled}%` }} />
      </div>
      {hint ? <p className="dsh-progress-foot">{hint}</p> : null}
    </div>
  )
}

/**
 * Horizontal bar list used for "hours per project" and "top projects".
 * `items` are { key, label, value, share } — share is the 0..1 float the API
 * already computed; the bar width is relative to the biggest row so a single
 * dominant project does not flatten everything else.
 */
export function BarList({ items, emptyText, unit = 'h' }) {
  const rows = list(items)
  if (rows.length === 0) return <EmptyNote>{emptyText}</EmptyNote>

  const peak = rows.reduce((max, row) => Math.max(max, num(row.value)), 0)

  return (
    <ul className="dsh-bars">
      {rows.map((row, index) => {
        const value = round2(row.value)
        const label = row.label ?? 'Unassigned'
        return (
          <li className="dsh-bar-row" key={row.key ?? `${label}-${index}`}>
            <span className="dsh-bar-label" title={label}>
              {label}
            </span>
            <span
              className="dsh-bar-track"
              role="img"
              title={`${label}: ${value}${unit} (${sharePercent(row.share)})`}
              aria-label={`${label}: ${value}${unit}, ${sharePercent(row.share)} of the total`}
            >
              <span
                className="dsh-bar-fill"
                style={{
                  width: value > 0 ? `${Math.max(2, widthPercent(value, peak))}%` : '0%',
                }}
              />
            </span>
            <span className="dsh-bar-value">
              {unit === 'h' ? hours(value) : `${value}${unit}`}
              <em className="dsh-bar-share">{sharePercent(row.share)}</em>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
