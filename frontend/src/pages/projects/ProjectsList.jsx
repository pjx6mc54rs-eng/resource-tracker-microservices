import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getProjects, createProject } from './projectsApi'
import './ProjectsList.css'

export default function ProjectsList() {
  const { user, token } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

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

  useEffect(() => {
    if (token) {
      fetchProjects()
    }
  }, [token])

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
      await fetchProjects()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
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
              <p>{project.description}</p>
              <Link to={`/projects/${project.id}`} className="btn btn-secondary">
                View Details
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
