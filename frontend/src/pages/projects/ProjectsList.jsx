import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getProjects, createProject } from './projectsApi'
import { listUsers } from '../auth/authApi'
import { useChat } from '../../context/ChatContext'
import { fetchChatChannels } from '../messages/messagesApi'
import { STATUS_LABELS, accentFor, initialsFor, formatDate, relativeDate, statsFor } from './projectUiHelpers'
import './ProjectsList.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'idle', label: 'Not started' },
]

export default function ProjectsList() {
  const { user, token } = useAuth()
  const { showToast } = useToast()
  const { channels, setActiveChannelId } = useChat()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usersMap, setUsersMap] = useState({})

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [view, setView] = useState(() => localStorage.getItem('projects-view') || 'grid')

  const getHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'user-role': user?.role,
    'user-id': user?.id,
  })

  const fetchProjects = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getProjects(getHeaders())
      setProjects(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    if (!isAdmin || !token) return
    try {
      const list = await listUsers(token)
      const map = {}
      list.forEach((u) => {
        const displayName = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (u.firstName || u.lastName || u.email)
        map[u.id] = displayName
      })
      setUsersMap(map)
    } catch (err) {
      console.error('Failed to fetch user list for mapping:', err)
    }
  }

  useEffect(() => {
    if (token) {
      fetchProjects()
      if (isAdmin) {
        fetchAllUsers()
      }
    }
  }, [token, user])

  useEffect(() => {
    localStorage.setItem('projects-view', view)
  }, [view])

  const closeForm = () => {
    setShowForm(false)
    setFormError(null)
  }

  useEffect(() => {
    if (!showForm) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeForm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showForm])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!formData.name.trim()) {
      setFormError('Project name is required')
      return
    }

    setSubmitting(true)
    try {
      await createProject(formData, getHeaders())
      setFormData({ name: '', description: '' })
      setShowForm(false)
      showToast('Project created successfully!', 'success')
      await fetchProjects()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openChat = async (project) => {
    let projectChannel = channels?.projects?.find((p) => p.projectId === project.id)
    if (!projectChannel) {
      try {
        const response = await fetchChatChannels(token)
        const projectsList = response?.projects || []
        projectChannel = projectsList.find((p) => p.projectId === project.id)
      } catch (err) {
        console.error('Error fetching chat channels:', err)
      }
    }

    if (projectChannel) {
      setActiveChannelId(projectChannel.id)
      navigate('/messages')
    } else {
      showToast('Discussion de projet introuvable.', 'error')
    }
  }

  const decorated = useMemo(
    () => projects.map((project) => ({ project, stats: statsFor(project) })),
    [projects],
  )

  const summary = useMemo(() => {
    const totals = decorated.reduce(
      (acc, { stats }) => ({
        tasks: acc.tasks + stats.total,
        done: acc.done + stats.done,
      }),
      { tasks: 0, done: 0 },
    )
    return {
      ...totals,
      percent: totals.tasks === 0 ? 0 : Math.round((totals.done / totals.tasks) * 100),
    }
  }, [decorated])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()

    const matches = decorated.filter(({ project, stats }) => {
      if (term) {
        const haystack = `${project.name ?? ''} ${project.description ?? ''}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      if (filter === 'active') return stats.status === 'active'
      if (filter === 'completed') return stats.status === 'completed'
      if (filter === 'idle') return stats.status === 'planned' || stats.status === 'empty'
      return true
    })

    const sorted = [...matches]
    if (sort === 'name') {
      sorted.sort((a, b) => (a.project.name ?? '').localeCompare(b.project.name ?? ''))
    } else if (sort === 'progress') {
      sorted.sort((a, b) => b.stats.percent - a.stats.percent)
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.project.updatedAt ?? b.project.createdAt ?? 0) -
          new Date(a.project.updatedAt ?? a.project.createdAt ?? 0),
      )
    }
    return sorted
  }, [decorated, search, filter, sort])

  const isFiltering = search.trim() !== '' || filter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setFilter('all')
  }

  return (
    <div className="projects-page">
      <header className="pj-hero">
        <div className="pj-hero-text">
          <h1>Projects</h1>
          <p className="pj-hero-sub">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            <span className="pj-sep" />
            {summary.tasks} {summary.tasks === 1 ? 'task' : 'tasks'}
            <span className="pj-sep" />
            {summary.percent}% complete
          </p>
        </div>
        {isAdmin && (
          <button className="pj-btn pj-btn--primary" onClick={() => setShowForm(true)}>
            <IconPlus />
            New project
          </button>
        )}
      </header>

      {error && (
        <div className="pj-alert pj-alert--error">
          <span>{error}</span>
          <button type="button" className="pj-alert-action" onClick={fetchProjects}>
            Retry
          </button>
        </div>
      )}

      <div className="pj-toolbar">
        <div className="pj-search">
          <IconSearch />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
          />
          {search && (
            <button type="button" className="pj-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              &times;
            </button>
          )}
        </div>

        <div className="pj-filters" role="group" aria-label="Filter projects by status">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`pj-pill${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="pj-toolbar-end">
          <select
            className="pj-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort projects"
          >
            <option value="recent">Recently updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="progress">Progress</option>
          </select>

          <div className="pj-view-toggle" role="group" aria-label="Change layout">
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              title="Grid view"
            >
              <IconGrid />
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              title="List view"
            >
              <IconList />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="pj-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pj-skeleton" aria-hidden="true">
              <div className="pj-skeleton-head">
                <span className="pj-sk-block pj-sk-tile" />
                <span className="pj-sk-lines">
                  <span className="pj-sk-block pj-sk-line" />
                  <span className="pj-sk-block pj-sk-line pj-sk-line--short" />
                </span>
              </div>
              <span className="pj-sk-block pj-sk-text" />
              <span className="pj-sk-block pj-sk-text pj-sk-line--short" />
              <span className="pj-sk-block pj-sk-bar" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="pj-empty">
          <div className="pj-empty-icon">
            <IconFolder />
          </div>
          {isFiltering ? (
            <>
              <h2>No matching projects</h2>
              <p>Try a different search term or clear the filters.</p>
              <button type="button" className="pj-btn pj-btn--ghost" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h2>No projects yet</h2>
              <p>
                {isAdmin
                  ? 'Create your first project to start tracking tasks and time.'
                  : 'You have not been assigned to a project yet.'}
              </p>
              {isAdmin && (
                <button type="button" className="pj-btn pj-btn--primary" onClick={() => setShowForm(true)}>
                  <IconPlus />
                  New project
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {isFiltering && (
            <p className="pj-results">
              {visible.length} of {projects.length} projects
            </p>
          )}

          <div className={`pj-grid${view === 'list' ? ' pj-grid--list' : ''}`}>
            {visible.map(({ project, stats }) => {
              const accent = accentFor(project.id ?? project.name ?? '')
              const projectChannel = channels?.projects?.find((p) => p.projectId === project.id)
              const unreadCount = projectChannel ? projectChannel.unreadCount : (project.unreadCount ?? 0)

              const members = project.assignments ?? []
              const memberNames = members.map((m) => usersMap[m.userId]).filter(Boolean)
              const shownNames = memberNames.slice(0, 4)
              const extraMembers = members.length - shownNames.length

              return (
                <article
                  key={project.id}
                  className="pj-card"
                  style={{ '--pj-accent-from': accent.from, '--pj-accent-to': accent.to }}
                >
                  <div className="pj-card-head">
                    <span className="pj-monogram" aria-hidden="true">
                      {initialsFor(project.name)}
                    </span>
                    <div className="pj-card-heading">
                      <h3 className="pj-card-name">
                        <Link to={`/projects/${project.id}`} className="pj-card-link">
                          {project.name}
                        </Link>
                      </h3>
                      <span className={`pj-status pj-status--${stats.status}`}>
                        {STATUS_LABELS[stats.status]}
                      </span>
                    </div>
                  </div>

                  <button
                    className="pj-chat"
                    type="button"
                    onClick={() => openChat(project)}
                    aria-label={`Ouvrir le chat du projet ${project.name}`}
                    title="Ouvrir le chat"
                  >
                    <IconChat />
                    {unreadCount > 0 && <span className="pj-chat-badge">{unreadCount}</span>}
                  </button>

                  <p className="pj-card-desc">
                    {project.description || 'No description provided.'}
                  </p>

                  <div className="pj-progress">
                    <div className="pj-progress-head">
                      <span>{isAdmin ? 'Progress' : 'My tasks'}</span>
                      <strong>
                        {stats.done}/{stats.total} · {stats.percent}%
                      </strong>
                    </div>
                    <div
                      className="pj-progress-track"
                      role="progressbar"
                      aria-valuenow={stats.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${project.name} progress`}
                    >
                      <span className="pj-progress-fill" style={{ width: `${stats.percent}%` }} />
                    </div>
                    <div className="pj-legend">
                      <span className="pj-legend-item">
                        <i className="pj-dot pj-dot--todo" />
                        {stats.todo} to do
                      </span>
                      <span className="pj-legend-item">
                        <i className="pj-dot pj-dot--doing" />
                        {stats.inProgress} in progress
                      </span>
                      <span className="pj-legend-item">
                        <i className="pj-dot pj-dot--done" />
                        {stats.done} done
                      </span>
                    </div>
                  </div>

                  <div className="pj-card-meta">
                    <span className="pj-meta-item" title={`Created by ${usersMap[project.createdBy] || 'Admin'}`}>
                      <IconUser />
                      {usersMap[project.createdBy] || 'Admin'}
                    </span>
                    <span className="pj-meta-item">
                      <IconCalendar />
                      Created {formatDate(project.createdAt)}
                    </span>
                  </div>

                  <div className="pj-card-foot">
                    {shownNames.length > 0 ? (
                      <div className="pj-team" title={memberNames.join(', ')}>
                        {shownNames.map((name, i) => (
                          <span key={`${name}-${i}`} className="pj-avatar">
                            {initialsFor(name)}
                          </span>
                        ))}
                        {extraMembers > 0 && <span className="pj-avatar pj-avatar--more">+{extraMembers}</span>}
                      </div>
                    ) : (
                      <span className="pj-team-count">
                        <IconUsers />
                        {members.length} {members.length === 1 ? 'member' : 'members'}
                      </span>
                    )}

                    <span className="pj-updated">
                      <IconClock />
                      {relativeDate(project.updatedAt)}
                    </span>

                    <span className="pj-cta">
                      Open
                      <IconArrow />
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {showForm && isAdmin && (
        <div className="pj-modal-backdrop" onClick={closeForm} role="presentation">
          <div
            className="pj-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pj-modal-title"
          >
            <div className="pj-modal-head">
              <div>
                <h2 id="pj-modal-title">New project</h2>
                <p>Set up a space for your team&apos;s tasks, time and discussions.</p>
              </div>
              <button type="button" className="pj-modal-close" onClick={closeForm} aria-label="Close">
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="pj-modal-form">
              <div className="pj-field">
                <label htmlFor="name">
                  Project name <span className="pj-required">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={submitting}
                  placeholder="e.g. Website redesign"
                  autoFocus
                />
              </div>

              <div className="pj-field">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  disabled={submitting}
                  placeholder="What is this project about?"
                  rows="4"
                />
              </div>

              {formError && <div className="pj-alert pj-alert--error">{formError}</div>}

              <div className="pj-modal-foot">
                <button type="button" className="pj-btn pj-btn--ghost" onClick={closeForm} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="pj-btn pj-btn--primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Icons ─────────────────────────────────────────────────── */

function IconPlus() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function IconList() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11.5a7.5 7.5 0 0 1-8 7.48 8.7 8.7 0 0 1-3.18-.76L4 20l1.28-3.55A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 5.6M18 14.2a6.5 6.5 0 0 1 3.5 4.8" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function IconArrow() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M12.5 6l6 6-6 6" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg className="pj-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.7a2 2 0 0 1 1.6.8l1 1.2h6.7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
    </svg>
  )
}
