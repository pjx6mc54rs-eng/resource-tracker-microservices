/* Shared visual-identity helpers for the projects list and detail pages, so
   a project's accent color, monogram and status badge stay identical
   wherever it's shown. */

const ACCENTS = [
  { from: '#7cb342', to: '#4a7527' },
  { from: '#38bdf8', to: '#0369a1' },
  { from: '#a78bfa', to: '#6d28d9' },
  { from: '#fbbf24', to: '#b45309' },
  { from: '#fb7185', to: '#be123c' },
  { from: '#2dd4bf', to: '#0f766e' },
]

export const STATUS_LABELS = {
  empty: 'No tasks',
  planned: 'Not started',
  active: 'In progress',
  completed: 'Completed',
}

export function accentFor(id = '') {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return ACCENTS[hash % ACCENTS.length]
}

export function initialsFor(text = '') {
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function formatDate(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString()
}

export function relativeDate(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString()
}

export function statsFor(project) {
  const tasks = project.tasks ?? []
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const todo = total - done - inProgress
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  let status = 'planned'
  if (total === 0) status = 'empty'
  else if (done === total) status = 'completed'
  else if (done > 0 || inProgress > 0) status = 'active'

  return { total, done, inProgress, todo, percent, status }
}
