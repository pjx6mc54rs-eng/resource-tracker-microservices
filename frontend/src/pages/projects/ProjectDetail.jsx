import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getProjectDetail, addTaskToProject, assignUserToProject } from './projectsApi'
import './ProjectDetail.css'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user, token } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskFormData, setTaskFormData] = useState({ title: '' })
  const [taskFormError, setTaskFormError] = useState(null)
  const [submittingTask, setSubmittingTask] = useState(false)

  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignFormData, setAssignFormData] = useState({ user_id: '' })
  const [assignFormError, setAssignFormError] = useState(null)
  const [submittingAssign, setSubmittingAssign] = useState(false)

  const fetchProject = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getProjectDetail(id, token)
      setProject(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) {
      fetchProject()
    }
  }, [id, token])

  const handleAddTask = async (e) => {
    e.preventDefault()
    setTaskFormError(null)

    if (!taskFormData.title.trim()) {
      setTaskFormError('Task title is required')
      return
    }

    setSubmittingTask(true)
    try {
      await addTaskToProject(id, taskFormData, token)
      setTaskFormData({ title: '' })
      setShowTaskForm(false)
      await fetchProject()
    } catch (err) {
      setTaskFormError(err.message)
    } finally {
      setSubmittingTask(false)
    }
  }

  const handleAssignUser = async (e) => {
    e.preventDefault()
    setAssignFormError(null)

    if (!assignFormData.user_id.trim()) {
      setAssignFormError('Please select a user')
      return
    }

    setSubmittingAssign(true)
    try {
      await assignUserToProject(id, assignFormData, token)
      setAssignFormData({ user_id: '' })
      setShowAssignForm(false)
      await fetchProject()
    } catch (err) {
      setAssignFormError(err.message)
    } finally {
      setSubmittingAssign(false)
    }
  }

  if (loading) {
    return <div className="project-detail"><p>Loading project...</p></div>
  }

  if (error) {
    return (
      <div className="project-detail">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="project-detail">
        <div className="error-message">Project not found</div>
      </div>
    )
  }

  return (
    <div className="project-detail">
      <h1>{project.name}</h1>
      <p className="project-description">{project.description}</p>

      <div className="project-sections">
        <div className="project-section">
          <div className="section-header">
            <h2>Tasks</h2>
            {isAdmin && (
              <button
                className="btn btn-small"
                onClick={() => setShowTaskForm(!showTaskForm)}
              >
                {showTaskForm ? 'Cancel' : '+ Add Task'}
              </button>
            )}
          </div>

          {showTaskForm && isAdmin && (
            <form onSubmit={handleAddTask} className="task-form">
              <div className="form-group">
                <label htmlFor="title">Task Title *</label>
                <input
                  id="title"
                  type="text"
                  name="title"
                  value={taskFormData.title}
                  onChange={(e) =>
                    setTaskFormData({ ...taskFormData, title: e.target.value })
                  }
                  disabled={submittingTask}
                />
              </div>
              {taskFormError && (
                <div className="error-message">{taskFormError}</div>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={submittingTask}
              >
                {submittingTask ? 'Adding...' : 'Add Task'}
              </button>
            </form>
          )}

          {project.tasks && project.tasks.length > 0 ? (
            <ul className="tasks-list">
              {project.tasks.map((task) => (
                <li key={task.id} className="task-item">
                  {task.title}
                </li>
              ))}
            </ul>
          ) : (
            <p>No tasks yet.</p>
          )}
        </div>

        {isAdmin && (
          <div className="project-section">
            <div className="section-header">
              <h2>Assigned Users</h2>
              <button
                className="btn btn-small"
                onClick={() => setShowAssignForm(!showAssignForm)}
              >
                {showAssignForm ? 'Cancel' : '+ Assign User'}
              </button>
            </div>

            {showAssignForm && (
              <form onSubmit={handleAssignUser} className="assign-form">
                <div className="form-group">
                  <label htmlFor="user_id">User ID *</label>
                  <input
                    id="user_id"
                    type="text"
                    name="user_id"
                    value={assignFormData.user_id}
                    onChange={(e) =>
                      setAssignFormData({
                        ...assignFormData,
                        user_id: e.target.value,
                      })
                    }
                    disabled={submittingAssign}
                    placeholder="Enter user ID"
                  />
                </div>
                {assignFormError && (
                  <div className="error-message">{assignFormError}</div>
                )}
                <button
                  type="submit"
                  className="btn btn-primary btn-small"
                  disabled={submittingAssign}
                >
                  {submittingAssign ? 'Assigning...' : 'Assign User'}
                </button>
              </form>
            )}

            {project.assignedUsers && project.assignedUsers.length > 0 ? (
              <ul className="users-list">
                {project.assignedUsers.map((user) => (
                  <li key={user.id} className="user-item">
                    {user.email}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No users assigned yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
