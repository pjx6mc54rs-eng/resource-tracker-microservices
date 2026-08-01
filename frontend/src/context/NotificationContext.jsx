import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import API_URL from '../config/api'
import { useAuth } from './AuthContext'

const NotificationContext = createContext()

// Intervalle de rafraîchissement. Volontairement long : les notifications
// tolèrent une minute de retard, et interroger plus souvent chargerait le
// serveur sans bénéfice perceptible.
const POLL_INTERVAL_MS = 60_000

export function NotificationProvider({ children }) {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Évite de déclencher deux requêtes simultanées si le rafraîchissement
  // périodique tombe pendant un chargement manuel.
  const inFlight = useRef(false)

  const request = useCallback(
    async (path, options = {}) => {
      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      })
      if (!res.ok) {
        throw new Error(`Requête échouée (${res.status})`)
      }
      return res.json().catch(() => ({}))
    },
    [token],
  )

  const refresh = useCallback(async () => {
    if (!token || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const data = await request('/api/notifications?limit=30')
      setItems(Array.isArray(data.items) ? data.items : [])
      setUnread(Number(data.unread) || 0)
      setError('')
    } catch (err) {
      // Silencieux à l'écran : une cloche qui ne se met pas à jour ne doit pas
      // interrompre l'utilisateur. L'erreur reste lisible pour le débogage.
      setError(err.message)
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [token, request])

  useEffect(() => {
    if (!token) {
      setItems([])
      setUnread(0)
      return undefined
    }
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [token, refresh])

  const markAsRead = useCallback(
    async (id) => {
      // Mise à jour optimiste : la cloche réagit immédiatement au clic.
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      )
      setUnread((u) => Math.max(0, u - 1))
      try {
        await request(`/api/notifications/${id}/read`, { method: 'PATCH' })
      } catch {
        refresh()
      }
    },
    [request, refresh],
  )

  const markAllAsRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
    try {
      await request('/api/notifications/read', {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
    } catch {
      refresh()
    }
  }, [request, refresh])

  const value = {
    items,
    unread,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error(
      'useNotifications doit être utilisé dans un NotificationProvider',
    )
  }
  return context
}
