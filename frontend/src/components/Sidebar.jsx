import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoutIcon from './LogoutIcon'
import './Sidebar.css'

export default function Sidebar({ isOpen, theme, toggleTheme }) {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-brand-title">Resource Tracker</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">📊</span>
          <span className="sidebar-label">Dashboard</span>
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">📁</span>
          <span className="sidebar-label">Projects</span>
        </NavLink>
        <NavLink to="/timesheet" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">⏱️</span>
          <span className="sidebar-label">Timesheet</span>
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">👥</span>
            <span className="sidebar-label">Users</span>
          </NavLink>
        )}

        {/* Mobile-only Nav Links */}
        <div className="sidebar-mobile-only-nav">
          <NavLink to="/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">👤</span>
            <span className="sidebar-label">Profile</span>
          </NavLink>
          <NavLink to="/change-password" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">🔑</span>
            <span className="sidebar-label">Change Password</span>
          </NavLink>
          <NavLink to="/notifications" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">🔔</span>
            <span className="sidebar-label">Notifications</span>
          </NavLink>
          <button onClick={toggleTheme} className="sidebar-link sidebar-theme-toggle-btn-link">
            <span className="sidebar-icon">{theme === 'light' ? '🌙' : '☀️'}</span>
            <span className="sidebar-label">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
        </div>
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <span className="sidebar-user-email">{user?.email}</span>
          <span className="sidebar-user-role">{user?.role}</span>
        </div>
        <button onClick={handleLogout} className="logout-btn-icon" data-tooltip="Logout" aria-label="Logout">
          <LogoutIcon size="20px" />
        </button>
      </div>
    </aside>
  )
}
