import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LogoutIcon from './LogoutIcon'
import ProfileIcon from './ProfileIcon'
import NotificationIcon from './NotificationIcon'
import SunIcon from './SunIcon'
import MoonIcon from './MoonIcon'
import './Navbar.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3005'

export default function Navbar({ toggleSidebar, theme, toggleTheme }) {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/dashboard" className="navbar-logo-link">
          <img 
            src="/norsys_afrique_logo.png" 
            alt="Norsys Logo" 
            className="navbar-logo logo-light"
          />
          <img 
            src="/norsys_afrique_logo_dark.png" 
            alt="Norsys Logo" 
            className="navbar-logo logo-dark"
          />
        </Link>

        <Link to="/dashboard" className="navbar-brand-text">
          Norsys Ressource Tracker
        </Link>
        
        <div className="navbar-user">
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle Theme" data-tooltip={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
            {theme === 'light' ? <MoonIcon size="20px" /> : <SunIcon size="20px" />}
          </button>

          <div className="notification-dropdown-container">
            <button className="notification-btn" aria-label="Notifications" data-tooltip="Notifications">
              <NotificationIcon size="22px" />
              <span className="notification-badge-dot"></span>
            </button>
            <div className="notification-dropdown">
              <div className="notification-header">
                <h3>Notifications</h3>
                <span className="notification-count">3 new</span>
              </div>
              <div className="dropdown-divider"></div>
              <div className="notification-list">
                <div className="notification-item">
                  <div className="notification-item-dot"></div>
                  <div className="notification-item-content">
                    <p className="notification-text">New project assigned: <strong>Website Redesign</strong></p>
                    <span className="notification-time">2 hours ago</span>
                  </div>
                </div>
                <div className="notification-item">
                  <div className="notification-item-dot"></div>
                  <div className="notification-item-content">
                    <p className="notification-text">Timesheet approved by admin</p>
                    <span className="notification-time">5 hours ago</span>
                  </div>
                </div>
                <div className="notification-item">
                  <div className="notification-item-dot"></div>
                  <div className="notification-item-content">
                    <p className="notification-text">Welcome to <strong>Norsys Ressource Tracker</strong>!</p>
                    <span className="notification-time">1 day ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-dropdown-container">
            <button className="profile-btn" aria-label="Profile menu" data-tooltip="Profile Menu">
              {user?.avatarUrl ? (
                <img
                  src={`${API_URL}${user.avatarUrl}`}
                  alt="Profile"
                  className="navbar-profile-avatar"
                />
              ) : (
                <ProfileIcon size="72px" />
              )}
            </button>
            <div className="profile-dropdown">
              <div className="dropdown-user-info">
                <span className="dropdown-email">
                  {user?.firstName || user?.lastName
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : user?.email}
                </span>
                <span className="dropdown-role">{user?.role}</span>
              </div>
              <div className="dropdown-divider"></div>
              <nav className="dropdown-nav">
                <Link to="/profile" className="dropdown-link">
                  <span className="dropdown-link-icon">👤</span>
                  Profile
                </Link>
                <Link to="/change-password" className="dropdown-link">
                  <span className="dropdown-link-icon">🔑</span>
                  Change Password
                </Link>
                <div className="dropdown-divider"></div>
                <button onClick={handleLogout} className="dropdown-link dropdown-logout-btn">
                  <span className="dropdown-link-icon"><LogoutIcon size="16px" /></span>
                  Logout
                </button>
              </nav>
            </div>
          </div>
        </div>

        <button className="navbar-toggle" onClick={toggleSidebar} aria-label="Toggle navigation">
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
          <span className="hamburger-bar"></span>
        </button>
      </div>
    </nav>
  )
}
