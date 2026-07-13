import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getMyTimesheets } from '../timesheet/timesheetsApi'
import { getProjects } from '../projects/projectsApi'
import { getDashboard } from './reportingApi'
import './Dashboard.css'

export default function Dashboard() {
  const { user, token } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dashboardData, setDashboardData] = useState(null)
  const [myProjects, setMyProjects] = useState([])
  const [myTimesheets, setMyTimesheets] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        if (isAdmin) {
          const dashboard = await getDashboard(token)
          setDashboardData(dashboard)
        } else {
          const projects = await getProjects(token)
          const timesheets = await getMyTimesheets(token)
          setMyProjects(projects)
          setMyTimesheets(timesheets)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isAdmin, token])

  if (loading) {
    return <div className="dashboard"><p>Loading...</p></div>
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  if (isAdmin) {
    return (
      <div className="dashboard">
        <h1>Admin Dashboard</h1>
        <div className="dashboard-grid">
          {dashboardData?.summary && (
            <div className="dashboard-card">
              <h3>Summary</h3>
              <p>Total Projects: {dashboardData.summary.totalProjects || 0}</p>
              <p>Total Users: {dashboardData.summary.totalUsers || 0}</p>
              <p>Total Hours: {dashboardData.summary.totalHours || 0}</p>
            </div>
          )}
          {dashboardData?.projectSummary && dashboardData.projectSummary.length > 0 && (
            <div className="dashboard-card">
              <h3>Hours by Project</h3>
              <ul>
                {dashboardData.projectSummary.map((item) => (
                  <li key={item.projectId}>
                    {item.projectName}: {item.totalHours} hours
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dashboardData?.userSummary && dashboardData.userSummary.length > 0 && (
            <div className="dashboard-card">
              <h3>Hours by User</h3>
              <ul>
                {dashboardData.userSummary.map((item) => (
                  <li key={item.userId}>
                    {item.userName}: {item.totalHours} hours
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="dashboard-actions">
          <a href="/projects" className="btn btn-primary">Manage Projects</a>
          <a href="/users" className="btn btn-primary">Manage Users</a>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>My Projects ({myProjects.length})</h3>
          {myProjects.length === 0 ? (
            <p>No projects assigned yet.</p>
          ) : (
            <ul>
              {myProjects.map((project) => (
                <li key={project.id}>
                  <a href={`/projects/${project.id}`}>{project.name}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dashboard-card">
          <h3>Recent Timesheets ({myTimesheets.length})</h3>
          {myTimesheets.length === 0 ? (
            <p>No timesheets recorded yet.</p>
          ) : (
            <ul>
              {myTimesheets.slice(0, 5).map((ts) => (
                <li key={ts.id}>
                  {ts.date}: {ts.hoursSpent} hours on task {ts.taskId}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="dashboard-actions">
        <a href="/projects" className="btn btn-primary">View All Projects</a>
        <a href="/timesheet" className="btn btn-primary">Log Time</a>
      </div>
    </div>
  )
}
