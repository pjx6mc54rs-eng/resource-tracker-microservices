import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

export default function Dashboard() {
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin') || user?.role === 'admin'

  return (
    <div className="dashboard">
      <h1>{isAdmin ? 'Admin Dashboard' : 'Dashboard'}</h1>

      {/* Quick Access Navigation Cards */}
      <div className={isAdmin ? "quick-access-grid" : "quick-access-grid user-grid"}>
        <Link to="/projects" className="quick-access-card">
          <div className="quick-access-icon">📁</div>
          <div className="quick-access-info">
            <h4>Projects</h4>
            <p>{isAdmin ? "Manage corporate projects, details and task assignments." : "View your assigned projects and task details."}</p>
          </div>
        </Link>
        
        <Link to="/timesheet" className="quick-access-card">
          <div className="quick-access-icon">⏱️</div>
          <div className="quick-access-info">
            <h4>Timesheets</h4>
            <p>Log work hours, track spent time on tasks.</p>
          </div>
        </Link>

        <Link to="/messages" className="quick-access-card">
          <div className="quick-access-icon">💬</div>
          <div className="quick-access-info">
            <h4>Messages</h4>
            <p>Chat with colleagues, project groups, and teams.</p>
          </div>
        </Link>
        
        {isAdmin && (
          <Link to="/users" className="quick-access-card admin-users-card">
            <div className="quick-access-icon">👥</div>
            <div className="quick-access-info">
              <h4>User Space & Roles</h4>
              <p>Manage system users, change account roles (Collaborateur, Responsable, Admin).</p>
            </div>
          </Link>
        )}
      </div>
    </div>
  )
}
