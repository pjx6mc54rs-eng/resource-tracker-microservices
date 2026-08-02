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
import {
  playNotificationSound,
  primeNotificationSound,
} from '../utils/notificationSound'

const NotificationContext = createContext()

// Intervalle de rafraîchissement. 20 s est un compromis : assez court pour que
// le compteur bouge peu après une action, assez long pour ne pas marteler le
// serveur. Le rafraîchissement au retour sur l'onglet couvre le reste.
const POLL_INTERVAL_MS = 20_000

export function NotificationProvider({ children }) {
  const { token } = useAuth()

  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Évite de déclencher deux requêtes simultanées si le rafraîchissement
  // périodique tombe pendant un chargement manuel.
  const inFlight = useRef(false)

  // Identifiants déjà vus. Sert à distinguer « une notification vient
  // d'arriver » de « le serveur me renvoie la même liste », ce que le simple
  // compteur de non-lues ne permet pas : il baisse aussi quand on marque lu.
  const knownIds = useRef(new Set())
  // Le premier chargement ne doit jamais sonner : il rapporte l'historique,
  // pas des nouveautés.
  const primed = useRef(false)

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
      const list = Array.isArray(data.items) ? data.items : []

      if (!primed.current) {
        // Premier chargement : on mémorise sans rien jouer.
        primed.current = true
      } else {
        const arrived = list.filter(
          (n) => !knownIds.current.has(n.id) && !n.read,
        )
        // Un seul son par cycle, même si plusieurs notifications arrivent
        // ensemble : les rejouer en rafale sur une instance partagée les
        // couperait les unes les autres, pour un résultat inaudible.
        if (arrived.length > 0) {
          playNotificationSound()
        }
      }

      // Reconstruit l'ensemble à partir de la liste courante : il reste ainsi
      // borné à la taille de la page renvoyée par l'API.
      knownIds.current = new Set(list.map((n) => n.id))

      setItems(list)
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
      // Déconnexion : la prochaine session repart d'un historique vierge et ne
      // doit pas sonner en le chargeant.
      knownIds.current = new Set()
      primed.current = false
      return undefined
    }

    primeNotificationSound()
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)

    // Revenir sur l'onglet est le moment où l'utilisateur regarde la cloche :
    // on récupère l'état frais immédiatement plutôt que d'attendre le tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
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
