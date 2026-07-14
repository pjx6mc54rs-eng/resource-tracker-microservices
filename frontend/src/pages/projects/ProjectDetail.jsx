import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  getProjectDetail,
  addTaskToProject,
  assignUserToProject,
  getMyTasks,
  getProjectTeam,
} from './projectsApi'
import { listUsers } from '../auth/authApi'
import './ProjectDetail.css'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user, token } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Collaborator specific state
  const [myTasks, setMyTasks] = useState([])
  const [team, setTeam] = useState([])

  // Task form state
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    status: 'todo',
    assignedUserIds: [],
  })
  const [taskFormError, setTaskFormError] = useState(null)
  const [submittingTask, setSubmittingTask] = useState(false)

  // Assignment form state
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignFormData, setAssignFormData] = useState({ userId: '' })
  const [assignFormError, setAssignFormError] = useState(null)
  const [submittingAssign, setSubmittingAssign] = useState(false)

  // Admin user data list for lookup and dropdown selection
  const [allUsers, setAllUsers] = useState([])
  const [usersMap, setUsersMap] = useState({})

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'user-role': user?.role,
    'user-id': user?.id,
  })

  const fetchProjectData = async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = getHeaders()
      const data = await getProjectDetail(id, headers)
      setProject(data)

      if (!isAdmin) {
        const [tasksData, teamData] = await Promise.all([
          getMyTasks(id, headers),
          getProjectTeam(id, headers),
        ])
        setMyTasks(Array.isArray(tasksData) ? tasksData : [])
        setTeam(Array.isArray(teamData) ? teamData : [])
      }
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
      setAllUsers(Array.isArray(list) ? list : [])
      const map = {}
      list.forEach((u) => {
        map[u.id] = u.email
      })
      setUsersMap(map)
    } catch (err) {
      console.error('Failed to fetch user list for mapping:', err)
    }
  }

  useEffect(() => {
    if (id && token) {
      fetchProjectData()
      if (isAdmin) {
        fetchAllUsers()
      }
    }
  }, [id, token, user])

  const handleAddTask = async (e) => {
    e.preventDefault()
    setTaskFormError(null)

    if (!taskFormData.title.trim()) {
      setTaskFormError('Task title is required')
      return
    }
    if (!taskFormData.assignedUserIds.length) {
      setTaskFormError('Select at least one collaborator for this task')
      return
    }

    setSubmittingTask(true)
    try {
      await addTaskToProject(id, taskFormData, getHeaders())
      setTaskFormData({ title: '', status: 'todo', assignedUserIds: [] })
      setShowTaskForm(false)
      await fetchProjectData()
    } catch (err) {
      setTaskFormError(err.message)
    } finally {
      setSubmittingTask(false)
    }
  }

  const toggleTaskCollaborator = (userId) => {
    setTaskFormData((prev) => {
      const already = prev.assignedUserIds.includes(userId)
      return {
        ...prev,
        assignedUserIds: already
          ? prev.assignedUserIds.filter((id) => id !== userId)
          : [...prev.assignedUserIds, userId],
      }
    })
  }

  const handleAssignUser = async (e) => {
    e.preventDefault()
    setAssignFormError(null)

    if (!assignFormData.userId) {
      setAssignFormError('Please select a user to assign')
      return
    }

    setSubmittingAssign(true)
    try {
      await assignUserToProject(id, assignFormData, getHeaders())
      setAssignFormData({ userId: '' })
      setShowAssignForm(false)
      await fetchProjectData()
    } catch (err) {
      setAssignFormError(err.message)
    } finally {
      setSubmittingAssign(false)
    }
  }

  if (loading) {
    return (
      <div className="project-detail">
        <p className="loading-text">Loading project details...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="project-detail">
        <div className="error-message">
          <h3>Error Loading Project</h3>
          <p>{error}</p>
          <Link to="/projects" className="btn btn-secondary mt-2">
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="project-detail">
        <div className="error-message">
          <h3>Project Not Found</h3>
          <p>The requested project could not be located.</p>
          <Link to="/projects" className="btn btn-secondary mt-2">
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  const tasksList = isAdmin ? (project.tasks ?? []) : myTasks
  const teamList = isAdmin ? (project.assignments ?? []) : team
  const assignedCollaborators = teamList.filter((a) => a.userId)

  return (
    <div className="project-detail">
      <div className="detail-header">
        <Link to="/projects" className="back-link">
          &larr; Back to Projects
        </Link>
        <span className="role-tag">{isAdmin ? 'Admin View' : 'Collaborator View'}</span>
      </div>

      <div className="project-banner">
        <h1>{project.name}</h1>
        <p className="project-description">
          {project.description || 'No description provided.'}
        </p>
      </div>

      <div className="project-sections">
        {/* Tâches Section */}
        <div className="project-section">
          <div className="section-header">
            <h2>Tasks ({tasksList.length})</h2>
            {isAdmin && (
              <button
                className="btn btn-primary btn-small"
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
                  placeholder="Task title"
                  required
                />
              </div>
              <div className="form-group">
                <label>Collaborators * (at least one)</label>
                {assignedCollaborators.length === 0 ? (
                  <p className="empty-state" style={{ marginTop: '0.5rem' }}>
                    Assign a collaborator to the project first.
                  </p>
                ) : (
                  <div className="collaborator-checkboxes">
                    {assignedCollaborators.map((assignment) => (
                      <label
                        key={assignment.userId}
                        className="collaborator-checkbox"
                      >
                        <input
                          type="checkbox"
                          checked={taskFormData.assignedUserIds.includes(
                            assignment.userId,
                          )}
                          onChange={() =>
                            toggleTaskCollaborator(assignment.userId)
                          }
                          disabled={submittingTask}
                        />
                        <span>
                          {usersMap[assignment.userId] ?? assignment.userId}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  value={taskFormData.status}
                  onChange={(e) =>
                    setTaskFormData({ ...taskFormData, status: e.target.value })
                  }
                  disabled={submittingTask}
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              {taskFormError && <div className="error-message">{taskFormError}</div>}
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={
                  submittingTask ||
                  assignedCollaborators.length === 0 ||
                  taskFormData.assignedUserIds.length === 0
                }
              >
                {submittingTask ? 'Adding...' : 'Add Task'}
              </button>
            </form>
          )}

          {tasksList.length > 0 ? (
            <ul className="tasks-list">
              {tasksList.map((task) => {
                const assigneeIds =
                  task.assignees?.map((a) => a.userId) ??
                  (task.assignedUserId ? [task.assignedUserId] : [])
                return (
                  <li key={task.id} className="task-item">
                    <span className="task-title">{task.title}</span>
                    {assigneeIds.length > 0 && (
                      <span className="task-assignee">
                        {assigneeIds
                          .map((uid) => usersMap[uid] ?? 'Collaborator')
                          .join(', ')}
                      </span>
                    )}
                    <span className={`task-badge badge-${task.status || 'todo'}`}>
                      {(task.status || 'todo').replace('_', ' ')}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="empty-state">No tasks created yet.</p>
          )}
        </div>

        {/* Équipe Section */}
        <div className="project-section">
          <div className="section-header">
            <h2>Project Team ({teamList.length})</h2>
            {isAdmin && (
              <button
                className="btn btn-primary btn-small"
                onClick={() => setShowAssignForm(!showAssignForm)}
              >
                {showAssignForm ? 'Cancel' : '+ Assign Member'}
              </button>
            )}
          </div>

          {showAssignForm && isAdmin && (
            <form onSubmit={handleAssignUser} className="assign-form">
              <div className="form-group">
                <label htmlFor="userId">Collaborator *</label>
                <select
                  id="userId"
                  name="userId"
                  value={assignFormData.userId}
                  onChange={(e) =>
                    setAssignFormData({ userId: e.target.value })
                  }
                  disabled={submittingAssign}
                >
                  <option value="">-- Select Collaborator --</option>
                  {allUsers
                    .filter((u) => u.role !== 'admin') // Only show collaborators for assignments
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                </select>
              </div>
              {assignFormError && <div className="error-message">{assignFormError}</div>}
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={submittingAssign}
              >
                {submittingAssign ? 'Assigning...' : 'Assign User'}
              </button>
            </form>
          )}

          {teamList.length > 0 ? (
            <ul className="users-list">
              {teamList.map((assignment) => (
                <li key={assignment.id} className="user-item">
                  <div className="user-info">
                    <div className="user-avatar">
                      {(usersMap[assignment.userId] ?? 'C')[0].toUpperCase()}
                    </div>
                    <div className="user-details">
                      <span className="user-email-text">
                        {usersMap[assignment.userId] ?? 'Collaborator'}
                      </span>
                      <span className="user-id-subtext">ID: {assignment.userId}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No team members assigned yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
