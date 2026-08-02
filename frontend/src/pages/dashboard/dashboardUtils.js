/**
 * Pure helpers shared by the dashboard widgets.
 *
 * The reporting payload is deliberately fault tolerant: every section can be
 * null and every number can be missing. Everything exported here therefore
 * degrades to a safe value instead of producing NaN / "undefined" on screen.
 */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const PERIOD_STATUSES = ['not_validated', 'pending', 'approved', 'rejected']

export const PERIOD_STATUS_LABELS = {
  not_validated: 'Not submitted',
  pending: 'Awaiting validation',
  approved: 'Validated',
  rejected: 'Rejected',
}

export const TASK_STATUSES = ['todo', 'in_progress', 'done']

export const TASK_STATUS_LABELS = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

export const UPSTREAM_LABELS = {
  auth: 'user directory',
  projects: 'projects & tasks',
  timesheets: 'timesheets',
  health: 'service health',
}

/** Number coercion that never leaks NaN into the DOM. */
export function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function round2(value) {
  return Math.round(num(value) * 100) / 100
}

/** Every array coming from the payload goes through this. */
export function list(value) {
  return Array.isArray(value) ? value : []
}

export function monthLabel(year, month) {
  const name = MONTHS[num(month) - 1]
  return name && num(year) ? `${name} ${num(year)}` : '—'
}

export function shortMonthLabel(year, month) {
  const name = MONTHS[num(month) - 1]
  return name ? `${name.slice(0, 3)} ${String(num(year)).slice(-2)}` : '—'
}

/** Month arithmetic on a 1-12 month, safe across year boundaries. */
export function shiftMonth(year, month, delta) {
  const zeroBased = num(year) * 12 + (num(month) - 1) + num(delta)
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 }
}

export function isSameMonth(a, b) {
  return num(a?.year) === num(b?.year) && num(a?.month) === num(b?.month)
}

/**
 * Working days of a month, computed client side — the API only ever returns
 * {year, month}, so the "days filled" target is the frontend's job.
 */
export function weekdaysInMonth(year, month) {
  const y = num(year)
  const m = num(month)
  if (!y || m < 1 || m > 12) return 0
  const daysInMonth = new Date(y, m, 0).getDate()
  let count = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = new Date(y, m - 1, day).getDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

/** 0..1 share -> "42.3%" (the API already rounds to 4dp). */
export function sharePercent(share) {
  return `${Math.round(num(share) * 1000) / 10}%`
}

/** Bar widths: a ratio clamped to 0..100 so a bad payload can't break layout. */
export function widthPercent(value, total) {
  const max = num(total)
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (num(value) / max) * 100))
}

export function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString()
}

export function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}

/** Whole days elapsed since an ISO timestamp, or null when unusable. */
export function daysSince(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000))
}

export function relativeFromNow(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const minutes = Math.floor((Date.now() - parsed.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d ago`
  return parsed.toLocaleDateString()
}

export function initials(name) {
  const parts = String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part[0].toUpperCase()).join('')
}

export function hours(value) {
  return `${round2(value)}h`
}

/** projectId null means "no project" — the contract asks for this exact copy. */
export function projectName(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || 'Unassigned'
}

export function roleLabel(role) {
  if (role === 'admin') return 'Administrator'
  if (role === 'responsable') return 'Responsable'
  return 'Collaborateur'
}
