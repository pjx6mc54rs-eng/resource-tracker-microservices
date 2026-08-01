import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import API_URL from '../config/api'
import LogoutIcon from './LogoutIcon'
import ProfileIcon from './ProfileIcon'
import './Sidebar.css'

export default function Sidebar({ isOpen, theme, toggleTheme }) {
  const { user, logout } = useAuth()
  const { channels } = useChat()
  const globalUnreadCount = channels?.globalUnreadCount ?? 0

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
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
        <span className="sidebar-user-role">
          {(Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : [user?.role || 'collaborateur']).join(', ')}
        </span>
      </div>

      <div className="sidebar-header">
        <span className="sidebar-brand-title">Norsys Ressource Tracker</span>
      </div>

      <nav className="sidebar-nav">
        <button
          onClick={toggleCollapse}
          className="sidebar-collapse-btn"
          type="button"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="sidebar-icon collapse-icon-wrapper">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
          <span className="sidebar-label">Collapse Menu</span>
        </button>

        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">📊</span>
          <span className="sidebar-label">Dashboard</span>
        </NavLink>
        <NavLink to="/projects" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">📁</span>
          <span className="sidebar-label">Projects</span>
        </NavLink>
        <NavLink to="/messages" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">💬</span>
          <span className="sidebar-label">Messages</span>
          {globalUnreadCount > 0 && (
            <span className="sidebar-badge unread-badge-global">{globalUnreadCount}</span>
          )}
        </NavLink>
        <NavLink to="/timesheet" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <span className="sidebar-icon">⏱️</span>
          <span className="sidebar-label">Timesheet</span>
        </NavLink>
        {(user?.roles?.includes('responsable') ||
          user?.role === 'responsable' ||
          user?.roles?.includes('admin') ||
          user?.role === 'admin') && (
          <NavLink to="/timesheet-validation" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">✅</span>
            <span className="sidebar-label">Timesheet Validation</span>
          </NavLink>
        )}
        {(user?.roles?.includes('admin') || user?.role === 'admin') && (
          <NavLink to="/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="sidebar-icon">👥</span>
            <span className="sidebar-label">User Space & Roles</span>
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
