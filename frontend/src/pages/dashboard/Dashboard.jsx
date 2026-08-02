import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useChat } from '../../context/ChatContext'
import { useNotifications } from '../../context/NotificationContext'
import FolderIcon from '../../components/FolderIcon'
import ClockIcon from '../../components/ClockIcon'
import ChatBubbleIcon from '../../components/ChatBubbleIcon'
import UsersIcon from '../../components/UsersIcon'
import NotificationIcon from '../../components/NotificationIcon'
import WarningIcon from '../../components/WarningIcon'
import ChartBarIcon from '../../components/ChartBarIcon'
import { getDashboard } from './reportingApi'
import { EmptyNote, MiniStat, Panel } from './DashboardParts'
import MyMonthSection from './MyMonthSection'
import ManagerSection from './ManagerSection'
import AdminSection from './AdminSection'
import {
  UPSTREAM_LABELS,
  list,
  monthLabel,
  num,
  relativeFromNow,
  roleLabel,
  shiftMonth,
} from './dashboardUtils'
import './Dashboard.css'

function Skeleton({ blocks }) {
  return (
    <div className="dsh-skeleton" aria-busy="true" aria-live="polite">
      <span className="dsh-skeleton-text">Loading your dashboard...</span>
      {Array.from({ length: blocks }, (unused, index) => (
        <div className="dsh-skeleton-panel" key={index}>
          <span className="dsh-skeleton-bar dsh-skeleton-bar-title" />
          <span className="dsh-skeleton-bar" />
          <span className="dsh-skeleton-bar dsh-skeleton-bar-short" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user, token } = useAuth()
  const { showToast } = useToast()
  const { channels } = useChat()
  const { items: notificationItems, unread } = useNotifications()

  // user.roles is only trusted for the pre-fetch skeleton and for the quick
  // access cards. Every data widget below is gated on the payload instead.
  const isAdminByRole = user?.roles?.includes('admin') || user?.role === 'admin'
  const isManagerByRole =
    isAdminByRole || user?.roles?.includes('responsable') || user?.role === 'responsable'

  const [period, setPeriod] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() + 1 }
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!token) return undefined

    let active = true
    getDashboard(token, period.year, period.month)
      .then((payload) => {
        if (!active) return
        setData(payload && typeof payload === 'object' ? payload : null)
        setLoadError(null)
      })
      .catch((err) => {
        if (!active) return
        console.error('Failed to load the dashboard:', err)
        setData(null)
        setLoadError(err.message || 'Failed to load the dashboard')
        showToast(err.message || 'Failed to load the dashboard', 'error')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [token, period.year, period.month, reloadKey, showToast])

  // The server echoes the period it actually served; prefer it over what we
  // asked for so every label stays truthful.
  const shownPeriod = useMemo(() => {
    const year = num(data?.period?.year)
    const month = num(data?.period?.month)
    return year > 0 && month >= 1 && month <= 12 ? { year, month } : period
  }, [data, period])

  const today = new Date()
  const isCurrentMonth =
    period.year === today.getFullYear() && period.month === today.getMonth() + 1
  const isFutureMonth =
    period.year > today.getFullYear() ||
    (period.year === today.getFullYear() && period.month > today.getMonth() + 1)

  const goToMonth = (delta) => {
    setLoading(true)
    setLoadError(null)
    setPeriod((previous) => shiftMonth(previous.year, previous.month, delta))
  }

  const goToCurrentMonth = () => {
    setLoading(true)
    setLoadError(null)
    const now = new Date()
    setPeriod({ year: now.getFullYear(), month: now.getMonth() + 1 })
  }

  const retry = () => {
    setLoading(true)
    setLoadError(null)
    setReloadKey((previous) => previous + 1)
  }

  const isLoading = loading && Boolean(token)
  const degraded = list(data?.degraded)
  const unreadMessages = channels?.globalUnreadCount ?? 0
  const notifications = list(notificationItems).slice(0, 5)
  const skeletonBlocks = isAdminByRole ? 5 : isManagerByRole ? 4 : 3

  return (
    <div className="dashboard dsh-page">
      <h1>{isAdminByRole ? 'Admin Dashboard' : 'Dashboard'}</h1>

      {/* Quick Access Navigation Cards */}
      <div className={isAdminByRole ? "quick-access-grid" : "quick-access-grid user-grid"}>
        <Link to="/projects" className="quick-access-card">
          <div className="quick-access-icon"><FolderIcon size="28px" /></div>
          <div className="quick-access-info">
            <h4>Projects</h4>
            <p>{isAdminByRole ? "Manage corporate projects, details and task assignments." : "View your assigned projects and task details."}</p>
          </div>
        </Link>

        <Link to="/timesheet" className="quick-access-card">
          <div className="quick-access-icon"><ClockIcon size="28px" /></div>
          <div className="quick-access-info">
            <h4>Timesheets</h4>
            <p>Log work hours, track spent time on tasks.</p>
          </div>
        </Link>

        <Link to="/messages" className="quick-access-card">
          <div className="quick-access-icon"><ChatBubbleIcon size="28px" /></div>
          <div className="quick-access-info">
            <h4>Messages</h4>
            <p>Chat with colleagues, project groups, and teams.</p>
          </div>
        </Link>

        {isAdminByRole && (
          <Link to="/users" className="quick-access-card admin-users-card">
            <div className="quick-access-icon"><UsersIcon size="28px" /></div>
            <div className="quick-access-info">
              <h4>User Space & Roles</h4>
              <p>Manage system users, change account roles (Collaborateur, Responsable, Admin).</p>
            </div>
          </Link>
        )}
      </div>

      <div className="dsh-body">
        <div className="dsh-toolbar">
          <div className="dsh-toolbar-titles">
            <span className="dsh-toolbar-icon"><ChartBarIcon size="20px" /></span>
            <div>
              <h2 className="dsh-toolbar-title">{monthLabel(shownPeriod.year, shownPeriod.month)}</h2>
              <p className="dsh-toolbar-sub">
                {data?.role
                  ? `Viewing as ${roleLabel(data.role)}.`
                  : 'Your activity at a glance.'}
              </p>
            </div>
          </div>

          <div className="dsh-monthnav">
            <button
              type="button"
              className="dsh-monthnav-btn"
              onClick={() => goToMonth(-1)}
              disabled={isLoading}
              aria-label="Previous month"
            >
              &#8249;
            </button>
            <span className="dsh-monthnav-label">
              {monthLabel(period.year, period.month)}
            </span>
            <button
              type="button"
              className="dsh-monthnav-btn"
              onClick={() => goToMonth(1)}
              disabled={isLoading || isCurrentMonth || isFutureMonth}
              aria-label="Next month"
            >
              &#8250;
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                className="dsh-monthnav-now"
                onClick={goToCurrentMonth}
                disabled={isLoading}
              >
                This month
              </button>
            )}
          </div>
        </div>

        {!isLoading && !loadError && degraded.length > 0 && (
          <p className="dsh-notice">
            <span className="dsh-notice-icon"><WarningIcon size="16px" /></span>
            Some figures may be incomplete:{' '}
            {degraded.map((name) => UPSTREAM_LABELS[name] ?? name).join(', ')}{' '}
            {degraded.length > 1 ? 'were' : 'was'} unreachable. The rest of the page is up to
            date.
          </p>
        )}

        {isLoading ? (
          <Skeleton blocks={skeletonBlocks} />
        ) : loadError ? (
          <div className="dsh-error">
            <span className="dsh-error-icon"><WarningIcon size="20px" /></span>
            <div className="dsh-error-body">
              <strong className="dsh-error-title">The dashboard could not be loaded.</strong>
              <span className="dsh-error-msg">{loadError}</span>
            </div>
            <button type="button" className="dsh-retry" onClick={retry}>
              Retry
            </button>
          </div>
        ) : data ? (
          <>
            <MyMonthSection me={data.me} period={shownPeriod} />
            {data.manager ? (
              <ManagerSection manager={data.manager} period={shownPeriod} />
            ) : null}
            {data.admin ? <AdminSection admin={data.admin} period={shownPeriod} /> : null}
          </>
        ) : (
          <EmptyNote>
            Nothing to show for {monthLabel(shownPeriod.year, shownPeriod.month)} yet.
          </EmptyNote>
        )}

        <Panel
          title="Recent activity"
          subtitle="Your latest notifications and unread conversations."
          icon={<NotificationIcon size="20px" />}
          count={num(unread)}
        >
          <div className="dsh-minis">
            <MiniStat value={num(unread)} label="Unread notifications" />
            <MiniStat value={num(unreadMessages)} label="Unread messages" />
          </div>

          {notifications.length === 0 ? (
            <EmptyNote>No notification yet — you are all caught up.</EmptyNote>
          ) : (
            <ul className="dsh-notif-list">
              {notifications.map((item, index) => (
                <li
                  className={`dsh-notif-item${item?.read ? '' : ' dsh-notif-unread'}`}
                  key={item?.id ?? `notif-${index}`}
                >
                  <span className="dsh-notif-dot" aria-hidden="true" />
                  <Link to={item?.link || '#'} className="dsh-notif-text">
                    <strong>{item?.title || 'Notification'}</strong>
                    {item?.body ? <span className="dsh-notif-body">{item.body}</span> : null}
                  </Link>
                  <span className="dsh-notif-time">{relativeFromNow(item?.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="dsh-panel-foot">
            <Link to="/messages" className="dsh-link">
              Open my messages
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  )
}
