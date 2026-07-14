import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoutIcon from './LogoutIcon'
import ProfileIcon from './ProfileIcon'
import './Sidebar.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004'

export default function Sidebar({ isOpen, theme, toggleTheme }) {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-user">
        <div className="sidebar-user-header">
          {user?.avatarUrl ? (
            <img
              src={`${API_URL}${user.avatarUrl}`}
              alt="Profile"
              className="sidebar-user-avatar"
            />
          ) : (
            <div className="sidebar-user-avatar-placeholder">
              <ProfileIcon size="40px" />
            </div>
          )}
          <span className="sidebar-user-name">
            {user?.firstName || user?.lastName
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : user?.email}
          </span>
        </div>
        <span className="sidebar-user-role">{user?.role}</span>
      </div>

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
          <button onClick={handleLogout} className="sidebar-link sidebar-logout-btn-link">
            <span className="sidebar-icon"><LogoutIcon size="18px" /></span>
            <span className="sidebar-label">Logout</span>
          </button>
        </div>
      </nav>
    </aside>
  )
}
