import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Navbar.css'

export default function Navbar() {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-brand">
          Resource Tracker
        </Link>
        
        <div className="navbar-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/projects">Projects</Link>
          <Link to="/timesheet">Timesheet</Link>
          {user?.role === 'admin' && <Link to="/users">Users</Link>}
        </div>

        <div className="navbar-user">
          <span className="user-email">{user?.email}</span>
          <span className="user-role">{user?.role}</span>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
