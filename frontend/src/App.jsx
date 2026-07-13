import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PrivateRoute } from './components/PrivateRoute'
import { AdminRoute } from './components/AdminRoute'
import Navbar from './components/Navbar'
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

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    )
  }

  return (
    <>
      {token && <Navbar />}
      <div className="app-content">
        <Routes>
          {/* Auth routes (public) */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

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
    </>
  )
}

export default App
