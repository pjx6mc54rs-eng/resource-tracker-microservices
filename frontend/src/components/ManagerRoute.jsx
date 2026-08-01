import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Responsables and admins only — the timesheet validation queue. */
export function ManagerRoute({ children }) {
  const { token, user, loading } = useAuth()

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const roles = Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : [user?.role]
  const isManager = roles.includes('responsable') || roles.includes('admin')
  if (!isManager) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
