import { Link } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import API_URL from '../config/api'
import LogoutIcon from './LogoutIcon'
import ProfileIcon from './ProfileIcon'
import NotificationIcon from './NotificationIcon'
import SunIcon from './SunIcon'
import MoonIcon from './MoonIcon'
import KeyIcon from './KeyIcon'
import './Navbar.css'

/** Ancienneté en clair : "il y a 3 h" est plus lisible qu'une date complète. */
function formatRelative(value) {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `il y a ${d} j`
  return new Date(value).toLocaleDateString('fr-FR')
}

export default function Navbar({ toggleSidebar, theme, toggleTheme }) {
  const { user, logout } = useAuth()
  const { items, unread, markAsRead, markAllAsRead } = useNotifications()

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
              {unread > 0 && (
                <span className="notification-badge-count" aria-label={`${unread} notification(s) non lue(s)`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <div className="notification-dropdown">
              <div className="notification-header">
                <h3>Notifications</h3>
                {unread > 0 ? (
                  <button
                    type="button"
                    className="notification-count"
                    onClick={markAllAsRead}
                    title="Tout marquer comme lu"
                  >
                    {unread} non lue{unread > 1 ? 's' : ''}
                  </button>
                ) : (
                  <span className="notification-count">À jour</span>
                )}
              </div>
              <div className="dropdown-divider"></div>
              <div className="notification-list">
                {items.length === 0 && (
                  <div className="notification-item">
                    <div className="notification-item-content">
                      <p className="notification-text">Aucune notification.</p>
                    </div>
                  </div>
                )}
                {items.map((n) => (
                  <Link
                    key={n.id}
                    to={n.link || '#'}
                    className="notification-item"
                    onClick={() => { if (!n.read) markAsRead(n.id) }}
                  >
                    {!n.read && <div className="notification-item-dot"></div>}
                    <div className="notification-item-content">
                      <p className="notification-text">
                        <strong>{n.title}</strong>
                        {n.body ? <> — {n.body}</> : null}
                      </p>
                      <span className="notification-time">{formatRelative(n.createdAt)}</span>
                    </div>
                  </Link>
                ))}
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
                  <span className="dropdown-link-icon"><ProfileIcon size="16px" /></span>
                  Profile
                </Link>
                <Link to="/change-password" className="dropdown-link">
                  <span className="dropdown-link-icon"><KeyIcon size="16px" /></span>
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
