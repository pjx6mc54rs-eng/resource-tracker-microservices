import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PrivateRoute } from './components/PrivateRoute'
import { AdminRoute } from './components/AdminRoute'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import SunIcon from './components/SunIcon'
import MoonIcon from './components/MoonIcon'
import Login from './pages/auth/Login'
import SignUp from './pages/auth/SignUp'
import Dashboard from './pages/dashboard/Dashboard'
import ProjectsList from './pages/projects/ProjectsList'
import ProjectDetail from './pages/projects/ProjectDetail'
import TimesheetForm from './pages/timesheet/TimesheetForm'
import UsersList from './pages/users/UsersList'
import './App.css'

function App() {
  const { token, loading } = useAuth()
  const location = useLocation()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light'
  })

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev)
  const closeSidebar = () => setIsSidebarOpen(false)

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      return next
    })
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const timer = setTimeout(() => {
      closeSidebar()
    }, 0)
    return () => clearTimeout(timer)
  }, [location.pathname])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    )
  }

  const showLayout = token && location.pathname !== '/login' && location.pathname !== '/signup'
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'

  return (
    <>
      {showLayout && <Navbar toggleSidebar={toggleSidebar} theme={theme} toggleTheme={toggleTheme} />}
      {!showLayout && isAuthPage && (
        <button className="floating-theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme" title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
          {theme === 'light' ? <MoonIcon size="22px" /> : <SunIcon size="22px" />}
        </button>
      )}
      <div className={showLayout ? "app-layout" : "app-content"}>
        {showLayout && <Sidebar isOpen={isSidebarOpen} theme={theme} toggleTheme={toggleTheme} />}
        {showLayout && isSidebarOpen && (
          <div className="sidebar-overlay" onClick={closeSidebar} />
        )}
        <div className={showLayout ? "main-content" : undefined}>
          <Routes>
            {/* Auth routes (public) */}
            <Route
              path="/login"
              element={token ? <Navigate to="/dashboard" replace /> : <Login />}
            />
            <Route
              path="/signup"
              element={token ? <Navigate to="/dashboard" replace /> : <SignUp />}
            />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />

            <Route
              path="/projects"
              element={
                <PrivateRoute>
                  <ProjectsList />
                </PrivateRoute>
              }
            />

            <Route
              path="/projects/:id"
              element={
                <PrivateRoute>
                  <ProjectDetail />
                </PrivateRoute>
              }
            />

            <Route
              path="/timesheet"
              element={
                <PrivateRoute>
                  <TimesheetForm />
                </PrivateRoute>
              }
            />

            {/* Admin-only routes */}
            <Route
              path="/users"
              element={
                <PrivateRoute>
                  <AdminRoute>
                    <UsersList />
                  </AdminRoute>
                </PrivateRoute>
              }
            />

            {/* Root and catch-all */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </div>
    </>
  )
}

export default App
