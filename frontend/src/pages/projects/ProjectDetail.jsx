import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  getProjectDetail,
  addTaskToProject,
  assignUserToProject,
  getMyTasks,
  getProjectTeam,
  updateTaskStatus,
  unassignUserFromProject,
  deleteTaskFromProject,
} from './projectsApi'
import { listUsers } from '../auth/authApi'
import './ProjectDetail.css'

export default function ProjectDetail() {
  const { id } = useParams()
  const { user, token } = useAuth()
  const { showToast } = useToast()
  const isAdmin = user?.role === 'admin'

  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // State variables for projects and data mapping

  // Task form state
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    assignedUserId: '',
  })
  const [taskFormError, setTaskFormError] = useState(null)
  const [submittingTask, setSubmittingTask] = useState(false)

  // Modal states
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedTaskDetails, setSelectedTaskDetails] = useState(null)
  const [activeTaskMenuId, setActiveTaskMenuId] = useState(null)
  const [activeTeamMenuId, setActiveTeamMenuId] = useState(null)
  const [userToRemove, setUserToRemove] = useState(null)
  const [submittingRemoveMember, setSubmittingRemoveMember] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState(null)
  const [submittingDeleteTask, setSubmittingDeleteTask] = useState(false)

  // Task Editing states
  const [isEditingTask, setIsEditingTask] = useState(false)
  const [editTaskFormData, setEditTaskFormData] = useState({
    title: '',
    description: '',
    status: '',
    assignedUserId: '',
  })
  const [editTaskFormError, setEditTaskFormError] = useState(null)
  const [submittingEditTask, setSubmittingEditTask] = useState(false)
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

      // Loaded directly via getProjectDetail for both admin and collaborators
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchAllUsers = async () => {
    if (!token) return
    try {
      const list = await listUsers(token)
      setAllUsers(Array.isArray(list) ? list : [])
      const map = {}
      list.forEach((u) => {
        const displayName = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (u.firstName || u.lastName || u.email)
        map[u.id] = {
          displayName,
          jobTitle: u.jobTitle,
        }
      })
      setUsersMap(map)
    } catch (err) {
      console.error('Failed to fetch user list for mapping:', err)
    }
  }

  useEffect(() => {
    if (id && token) {
      fetchProjectData()
      fetchAllUsers()
    }
  }, [id, token, user])

  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveTaskMenuId(null)
      setActiveTeamMenuId(null)
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const handleAddTask = async (e) => {
    e.preventDefault()
    setTaskFormError(null)

    if (!taskFormData.title.trim()) {
      setTaskFormError('Task title is required')
      return
    }
    if (!taskFormData.assignedUserId) {
      setTaskFormError('Select a collaborator for this task')
      return
    }

    setSubmittingTask(true)
    try {
      await addTaskToProject(id, taskFormData, getHeaders())
      setTaskFormData({ title: '', description: '', status: 'todo', assignedUserId: '' })
      setShowTaskModal(false)
      showToast('Task added successfully!', 'success')
      await fetchProjectData()
    } catch (err) {
      setTaskFormError(err.message)
    } finally {
      setSubmittingTask(false)
    }
  }

  // toggleTaskCollaborator removed since single assignee is used

  // Drag and drop states and handlers
  const [activeDragOverColumn, setActiveDragOverColumn] = useState(null)

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDragEnter = (e, columnStatus) => {
    e.preventDefault()
    setActiveDragOverColumn(columnStatus)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
  }

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault()
    setActiveDragOverColumn(null)
    const taskId = e.dataTransfer.getData('text/plain')
    if (!taskId) return

    try {
      await updateTaskStatus(id, taskId, targetStatus, getHeaders())
      showToast('Task moved successfully!', 'success')
      await fetchProjectData()
    } catch (err) {
      console.error('Failed to update task status:', err)
      showToast('Failed to move task status.', 'error')
    }
  }

  const toggleTaskMenu = (e, taskId) => {
    e.stopPropagation()
    setActiveTaskMenuId((prev) => (prev === taskId ? null : taskId))
  }

  const handleStartEditTask = (task) => {
    const activeTask = task && typeof task === 'object' && task.id ? task : selectedTaskDetails
    if (!activeTask) return

    const assigneeIds =
      activeTask.assignees?.map((a) => a.userId) ??
      (activeTask.assignedUserId ? [activeTask.assignedUserId] : [])

    setEditTaskFormData({
      title: activeTask.title,
      description: activeTask.description || '',
      status: activeTask.status || 'todo',
      assignedUserId: assigneeIds[0] || '',
    })
    setEditTaskFormError(null)
    setIsEditingTask(true)
  }

  const handleSaveEditTask = async (e) => {
    e.preventDefault()
    setEditTaskFormError(null)

    if (!editTaskFormData.title.trim()) {
      setEditTaskFormError('Task title is required')
      return
    }
    if (!editTaskFormData.assignedUserId) {
      setEditTaskFormError('Select a collaborator for this task')
      return
    }

    setSubmittingEditTask(true)
    try {
      const updated = await updateTaskStatus(id, selectedTaskDetails.id, {
        title: editTaskFormData.title,
        description: editTaskFormData.description,
        status: editTaskFormData.status,
        assignedUserId: editTaskFormData.assignedUserId,
      }, getHeaders())

      setSelectedTaskDetails(null)
      setIsEditingTask(false)
      showToast('Task updated successfully!', 'success')
      await fetchProjectData()
    } catch (err) {
      setEditTaskFormError(err.message)
    } finally {
      setSubmittingEditTask(false)
    }
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
      setShowAssignModal(false)
      showToast('Team member assigned successfully!', 'success')
      await fetchProjectData()
    } catch (err) {
      setAssignFormError(err.message)
    } finally {
      setSubmittingAssign(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!userToRemove) return

    setSubmittingRemoveMember(true)
    try {
      await unassignUserFromProject(id, userToRemove.userId, getHeaders())
      showToast('Member removed from team successfully!', 'success')
      setUserToRemove(null)
      await fetchProjectData()
    } catch (err) {
      showToast(err.message || 'Failed to remove member.', 'error')
      setUserToRemove(null)
    } finally {
      setSubmittingRemoveMember(false)
    }
  }

  const handleDeleteTask = async () => {
    if (!taskToDelete) return

    setSubmittingDeleteTask(true)
    try {
      await deleteTaskFromProject(id, taskToDelete.id, getHeaders())
      showToast('Task deleted successfully!', 'success')
      setTaskToDelete(null)
      await fetchProjectData()
    } catch (err) {
      showToast(err.message || 'Failed to delete task.', 'error')
      setTaskToDelete(null)
    } finally {
      setSubmittingDeleteTask(false)
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

  const tasksList = project.tasks ?? []
  const teamList = project.assignments ?? []
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
        <div className="project-meta">
          <div className="project-meta-item">
            <span className="project-meta-label">Created By</span>
            <span className="project-meta-value">
              {usersMap[project.createdBy]?.displayName || 'Admin'}
            </span>
          </div>
          <div className="project-meta-item">
            <span className="project-meta-label">Created At</span>
            <span className="project-meta-value">
              {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div className="project-meta-item">
            <span className="project-meta-label">Last Updated</span>
            <span className="project-meta-value">
              {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="project-sections">
        {/* Équipe Section */}
        <div className="project-section">
          <div className="section-header">
            <h2>Project Team ({teamList.length})</h2>
            <div className="team-actions">
              <button
                className="btn btn-secondary btn-small"
                onClick={() => setShowTeamModal(true)}
                style={{ marginRight: '0.5rem' }}
              >
                View Team
              </button>
              {isAdmin && (
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => setShowAssignModal(true)}
                >
                  + Assign Member
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tâches Section */}
        <div className="project-section">
          <div className="section-header">
            <h2>Tasks ({tasksList.length})</h2>
            {isAdmin && (
              <button
                className="btn btn-primary btn-small"
                onClick={() => setShowTaskModal(true)}
              >
                + Add Task
              </button>
            )}
          </div>

          <div className="scrum-board">
            {['todo', 'in_progress', 'done'].map((status) => {
              const columnTasks = tasksList.filter((t) => (t.status || 'todo') === status)
              const columnTitle = status === 'todo' ? 'To Do' : status === 'in_progress' ? 'In Progress' : 'Done'
              const isOver = activeDragOverColumn === status
              return (
                <div
                  key={status}
                  className={`scrum-column column-${status} ${isOver ? 'drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  <div className="scrum-column-header">
                    <h3>{columnTitle} ({columnTasks.length})</h3>
                  </div>
                  <div className="scrum-column-content">
                    {columnTasks.length > 0 ? (
                      columnTasks.map((task) => {
                        const assigneeIds =
                          task.assignees?.map((a) => a.userId) ??
                          (task.assignedUserId ? [task.assignedUserId] : [])
                        return (
                          <div
                            key={task.id}
                            className="scrum-task-card"
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id)}
                          >
                            <div className="task-card-header">
                              <div className="task-card-title">{task.title}</div>
                              <div className="task-menu-container">
                                <button
                                  type="button"
                                  className="btn-icon task-menu-btn"
                                  title="Task Menu"
                                  onClick={(e) => toggleTaskMenu(e, task.id)}
                                >
                                  &#8942;
                                </button>
                                {activeTaskMenuId === task.id && (
                                  <div className="task-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      className="dropdown-item"
                                      onClick={() => {
                                        setSelectedTaskDetails(task);
                                        setIsEditingTask(false);
                                        setActiveTaskMenuId(null);
                                      }}
                                    >
                                      Show Details
                                    </button>
                                    {isAdmin && (
                                      <>
                                        <button
                                          type="button"
                                          className="dropdown-item"
                                          onClick={() => {
                                            setSelectedTaskDetails(task);
                                            handleStartEditTask(task);
                                            setActiveTaskMenuId(null);
                                          }}
                                        >
                                          Edit Task
                                        </button>
                                        <button
                                          type="button"
                                          className="dropdown-item dropdown-item-danger"
                                          onClick={() => {
                                            setTaskToDelete({
                                              id: task.id,
                                              title: task.title,
                                            });
                                            setActiveTaskMenuId(null);
                                          }}
                                        >
                                          Delete Task
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {assigneeIds.length > 0 && (
                              <div className="task-card-assignees">
                                {assigneeIds
                                  .map((uid) => usersMap[uid]?.displayName ?? 'Collaborator')
                                  .join(', ')}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="scrum-empty-column">No tasks</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Team Modal */}
      {showTeamModal && (
        <div className="modal-backdrop" onClick={() => setShowTeamModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Project Team ({teamList.length})</h3>
              <button className="modal-close" onClick={() => setShowTeamModal(false)}>
                &times;
              </button>
            </div>
            {teamList.length > 0 ? (
              <ul className="users-list">
                {teamList.map((assignment) => (
                  <li key={assignment.id} className="user-item">
                    <div className="user-info">
                      <div className="user-avatar">
                        {(usersMap[assignment.userId]?.displayName ?? 'C')[0].toUpperCase()}
                      </div>
                      <div className="user-details">
                        <span className="user-email-text">
                          {usersMap[assignment.userId]?.displayName ?? 'Collaborator'}
                        </span>
                        {usersMap[assignment.userId]?.jobTitle && (
                          <span className="user-job-title">
                            {usersMap[assignment.userId].jobTitle}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="team-menu-container">
                        <button
                          type="button"
                          className="btn-icon team-menu-btn"
                          title="Team Member Menu"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTeamMenuId(prev => prev === assignment.id ? null : assignment.id);
                          }}
                        >
                          &#8942;
                        </button>
                        {activeTeamMenuId === assignment.id && (
                          <div className="team-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="dropdown-item dropdown-item-danger"
                              onClick={() => {
                                setUserToRemove({
                                  userId: assignment.userId,
                                  displayName: usersMap[assignment.userId]?.displayName ?? 'Collaborator'
                                });
                                setActiveTeamMenuId(null);
                              }}
                            >
                              Remove Member
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">No team members assigned yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Assign Member Modal */}
      {showAssignModal && isAdmin && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Assign Member</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>
                &times;
              </button>
            </div>
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
                    .filter((u) => u.role !== 'admin' && !teamList.some((a) => a.userId === u.id))
                    .map((u) => {
                      const name = u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : (u.firstName || u.lastName || u.email);
                      const displayLabel = u.jobTitle ? `${name} (${u.jobTitle})` : name;
                      return (
                        <option key={u.id} value={u.id}>
                          {displayLabel}
                        </option>
                      )
                    })}
                </select>
              </div>
              {assignFormError && <div className="error-message">{assignFormError}</div>}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={submittingAssign}
              >
                {submittingAssign ? 'Assigning...' : 'Assign User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && isAdmin && (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Task</h3>
              <button className="modal-close" onClick={() => setShowTaskModal(false)}>
                &times;
              </button>
            </div>
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
                <label htmlFor="taskDescription">Description</label>
                <textarea
                  id="taskDescription"
                  name="description"
                  value={taskFormData.description}
                  onChange={(e) =>
                    setTaskFormData({ ...taskFormData, description: e.target.value })
                  }
                  disabled={submittingTask}
                  placeholder="Task description..."
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label htmlFor="taskCollaboratorSelect">Collaborator *</label>
                {assignedCollaborators.length === 0 ? (
                  <p className="empty-state" style={{ marginTop: '0.5rem' }}>
                    Assign a collaborator to the project first.
                  </p>
                ) : (
                  <select
                    id="taskCollaboratorSelect"
                    value={taskFormData.assignedUserId}
                    onChange={(e) =>
                      setTaskFormData({ ...taskFormData, assignedUserId: e.target.value })
                    }
                    disabled={submittingTask}
                    required
                  >
                    <option value="">-- Select Collaborator --</option>
                    {assignedCollaborators.map((assignment) => {
                      const name = usersMap[assignment.userId]?.displayName ?? assignment.userId
                      return (
                        <option key={assignment.userId} value={assignment.userId}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
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
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={
                  submittingTask ||
                  assignedCollaborators.length === 0 ||
                  !taskFormData.assignedUserId
                }
              >
                {submittingTask ? 'Adding...' : 'Add Task'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {selectedTaskDetails && (
        <div className="modal-backdrop" onClick={() => { setSelectedTaskDetails(null); setIsEditingTask(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{isEditingTask ? 'Edit Task' : 'Task Details'}</h3>
              <button className="modal-close" onClick={() => { setSelectedTaskDetails(null); setIsEditingTask(false); }}>
                &times;
              </button>
            </div>
            {isEditingTask ? (
              <form onSubmit={handleSaveEditTask} className="task-form">
                <div className="form-group">
                  <label htmlFor="editTitle">Task Title *</label>
                  <input
                    id="editTitle"
                    type="text"
                    name="title"
                    value={editTaskFormData.title}
                    onChange={(e) =>
                      setEditTaskFormData({ ...editTaskFormData, title: e.target.value })
                    }
                    disabled={submittingEditTask}
                    placeholder="Task title"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editTaskDescription">Description</label>
                  <textarea
                    id="editTaskDescription"
                    name="description"
                    value={editTaskFormData.description}
                    onChange={(e) =>
                      setEditTaskFormData({ ...editTaskFormData, description: e.target.value })
                    }
                    disabled={submittingEditTask}
                    placeholder="Task description..."
                    rows="3"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="editTaskCollaboratorSelect">Collaborator *</label>
                  {assignedCollaborators.length === 0 ? (
                    <p className="empty-state" style={{ marginTop: '0.5rem' }}>
                      Assign a collaborator to the project first.
                    </p>
                  ) : (
                    <select
                      id="editTaskCollaboratorSelect"
                      value={editTaskFormData.assignedUserId}
                      onChange={(e) =>
                        setEditTaskFormData({ ...editTaskFormData, assignedUserId: e.target.value })
                      }
                      disabled={submittingEditTask}
                      required
                    >
                      <option value="">-- Select Collaborator --</option>
                      {assignedCollaborators.map((assignment) => {
                        const name = usersMap[assignment.userId]?.displayName ?? assignment.userId
                        return (
                          <option key={assignment.userId} value={assignment.userId}>
                            {name}
                          </option>
                        )
                      })}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="editStatus">Status</label>
                  <select
                    id="editStatus"
                    name="status"
                    value={editTaskFormData.status}
                    onChange={(e) =>
                      setEditTaskFormData({ ...editTaskFormData, status: e.target.value })
                    }
                    disabled={submittingEditTask}
                  >
                    <option value="todo">Todo</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                {editTaskFormError && <div className="error-message">{editTaskFormError}</div>}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setIsEditingTask(false)}
                    disabled={submittingEditTask}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={
                      submittingEditTask ||
                      assignedCollaborators.length === 0 ||
                      !editTaskFormData.assignedUserId
                    }
                  >
                    {submittingEditTask ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="task-detail-modal-body">
                <div className="detail-row">
                  <span className="detail-label">Title</span>
                  <span className="detail-value">{selectedTaskDetails.title}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <div>
                    <span className={`task-badge badge-${selectedTaskDetails.status || 'todo'}`}>
                      {(selectedTaskDetails.status || 'todo').replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Description</span>
                  <p className="detail-description">
                    {selectedTaskDetails.description || 'No description provided.'}
                  </p>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Assigned Collaborators</span>
                  <div className="detail-assignees">
                    {(() => {
                      const assigneeIds =
                        selectedTaskDetails.assignees?.map((a) => a.userId) ??
                        (selectedTaskDetails.assignedUserId ? [selectedTaskDetails.assignedUserId] : [])
                      return assigneeIds.length > 0 ? (
                        <div className="selected-chips" style={{ marginTop: 0 }}>
                          {assigneeIds.map((uid) => (
                            <div key={uid} className="user-chip">
                              <span>{usersMap[uid]?.displayName ?? uid}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-state" style={{ padding: 0, textAlign: 'left' }}>No assignees</p>
                      )
                    })()}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%' }}
                    onClick={() => handleStartEditTask()}
                  >
                    Edit Task
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Remove Member Modal */}
      {userToRemove && (
        <div className="modal-backdrop" onClick={() => setUserToRemove(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Confirm Removal</h3>
              <button className="modal-close" onClick={() => setUserToRemove(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1rem 0' }}>
              <p>Are you sure you want to remove <strong>{userToRemove.displayName}</strong> from the team?</p>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                This will also unassign them from any tasks they are currently assigned to on this project.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setUserToRemove(null)}
                disabled={submittingRemoveMember}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                onClick={handleRemoveMember}
                disabled={submittingRemoveMember}
              >
                {submittingRemoveMember ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Task Modal */}
      {taskToDelete && (
        <div className="modal-backdrop" onClick={() => setTaskToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
              <button className="modal-close" onClick={() => setTaskToDelete(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ padding: '1rem 0' }}>
              <p>Are you sure you want to delete the task <strong>{taskToDelete.title}</strong>?</p>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                This action is permanent and cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setTaskToDelete(null)}
                disabled={submittingDeleteTask}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                onClick={handleDeleteTask}
                disabled={submittingDeleteTask}
              >
                {submittingDeleteTask ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
