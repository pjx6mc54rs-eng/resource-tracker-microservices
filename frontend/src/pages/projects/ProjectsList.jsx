import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getProjects, createProject } from './projectsApi'
import { listUsers } from '../auth/authApi'
import ChatDrawer from '../chat/ChatDrawer'
import './ProjectsList.css'

export default function ProjectsList() {
  const { user, token } = useAuth()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'admin'

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [usersMap, setUsersMap] = useState({})
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
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

  const openChat = (project) => {
    setSelectedProject(project)
    setIsChatOpen(true)
    setUnreadCounts((previous) => ({ ...previous, [project.id]: 0 }))
  }

  const closeChat = () => {
    setIsChatOpen(false)
  }

  if (loading) {
    return <div className="projects-list"><p>Loading projects...</p></div>
  }

  return (
    <div className="projects-list">
      <div className="projects-header">
        <h1>Projects</h1>
        {isAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ New Project'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && isAdmin && (
        <form onSubmit={handleCreateProject} className="project-form">
          <div className="form-group">
            <label htmlFor="name">Project Name *</label>
            <input
              id="name"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={submitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              disabled={submitting}
              rows="3"
            />
          </div>
          {formError && <div className="error-message">{formError}</div>}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p>No projects found.</p>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              <h3>{project.name}</h3>
              <p className="project-card-description">
                {project.description || 'No description provided.'}
              </p>
              <div className="project-card-meta">
                <span className="project-card-meta-item">
                  <strong>Created by:</strong> {usersMap[project.createdBy] || 'Admin'}
                </span>
                <span className="project-card-meta-item">
                  <strong>Created at:</strong> {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                </span>
                <span className="project-card-meta-item">
                  <strong>Updated at:</strong> {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="project-card-actions">
                <Link to={`/projects/${project.id}`} className="btn btn-secondary">
                  View Details
                </Link>
                <button
                  className="project-chat-button"
                  type="button"
                  onClick={() => openChat(project)}
                  aria-label={`Ouvrir le chat du projet ${project.name}`}
                  title="Ouvrir le chat"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 11.5a7.5 7.5 0 0 1-8 7.48 8.7 8.7 0 0 1-3.18-.76L4 20l1.28-3.55A7.5 7.5 0 1 1 20 11.5Z" />
                    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
                  </svg>
                  {(unreadCounts[project.id] ?? project.unreadCount ?? 0) > 0 && (
                    <span className="project-chat-badge">{unreadCounts[project.id] ?? project.unreadCount}</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ChatDrawer
        isOpen={isChatOpen}
        onClose={closeChat}
        project={selectedProject}
        token={token}
        currentUser={user}
      />
    </div>
  )
}
