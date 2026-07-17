import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { fetchChatChannels } from '../pages/messages/messagesApi'

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? 'http://localhost:3007'
const ChatContext = createContext(null)

function normalizeValue(value) {
  return typeof value === 'number' ? value : 0
}

export function ChatProvider({ children }) {
  const { token, user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const [channels, setChannels] = useState({
    projects: [],
    colleagues: [],
    groups: [],
    globalUnreadCount: 0,
  })
  const [activeChannelId, setActiveChannelId] = useState(null)
  const [messages, setMessages] = useState([]) // Centralisé ici !
  const [isConnected, setIsConnected] = useState(false)

  const loadChannels = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetchChatChannels(token)
      const newChannels = {
        projects: Array.isArray(response.projects) ? response.projects : [],
        colleagues: Array.isArray(response.colleagues) ? response.colleagues : [],
        groups: Array.isArray(response.groups) ? response.groups : [],
        globalUnreadCount: normalizeValue(response.globalUnreadCount),
      }
      setChannels((prev) => {
        try {
          if (JSON.stringify(prev) === JSON.stringify(newChannels)) return prev
        } catch (e) {
          // fallback
        }
        return newChannels
      })
    } catch (error) {
      console.error('Unable to load chat channels', error)
    }
  }, [token])

  const refreshChannels = useCallback(async () => {
    await loadChannels()
  }, [loadChannels])

  const handlePresenceUpdate = useCallback((payload) => {
    if (!payload?.userId) return
    setChannels((current) => {
      const updateList = (list) =>
          list.map((item) =>
              item.userId === payload.userId ? { ...item, online: payload.online } : item,
          )
      return {
        ...current,
        colleagues: updateList(current.colleagues),
      }
    })
  }, [])

  const findChannel = useCallback(
      (channelId) => {
        return (
            channels.projects.find((item) => item.id === channelId) ||
            channels.groups.find((item) => item.id === channelId) ||
            channels.colleagues.find((item) => item.channelId === channelId)
        )
      },
      [channels],
  )

  const handleIncomingMessage = useCallback(
      (message) => {
        if (!message?.channelId) return

        // Si le message appartient au canal actuellement ouvert par l'utilisateur
        if (message.channelId === activeChannelId) {
          setMessages((previous) => {
            if (previous.some((item) => item.id === message.id)) return previous
            return [...previous, {
              ...message,
              createdAt: message.createdAt ?? new Date().toISOString()
            }]
          })
          return
        }

        // Sinon (si c'est pour un autre canal), on gère les notifications et compteurs de non-lus
        setChannels((current) => {
          let updated = false
          const increaseUnread = (item) => {
            if (item.id === message.channelId || item.channelId === message.channelId) {
              updated = true
              return { ...item, unreadCount: normalizeValue(item.unreadCount) + 1 }
            }
            return item
          }
          const projects = current.projects.map(increaseUnread)
          const groups = current.groups.map(increaseUnread)
          const colleagues = current.colleagues.map(increaseUnread)
          if (!updated) return current
          const globalUnreadCount =
              projects.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0) +
              groups.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0) +
              colleagues.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0)
          return { ...current, projects, groups, colleagues, globalUnreadCount }
        })

        const channel = findChannel(message.channelId)
        const title = channel?.name || 'Nouvelle discussion'
        showToast(`Nouveau message dans ${title}`, 'info', 6000, () => {
          navigate('/messages')
          setActiveChannelId(message.channelId)
        })
      },
      [activeChannelId, findChannel, navigate, showToast],
  )

  // Connexion du socket. Dépend uniquement du token.
  useEffect(() => {
    if (!token) return
    console.log('[ChatContext] connecting to', CHAT_URL, 'token present?', !!token)

    const socket = io(CHAT_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[ChatContext] socket connected', socket.id)
      setIsConnected(true)
    })

    socket.on('disconnect', (reason) => {
      console.warn('[ChatContext] socket disconnected', reason)
      setIsConnected(false)
    })

    socket.on('connect_error', (err) => {
      console.error('[ChatContext] socket connect_error', err)
      setIsConnected(false)
      showToast(
          `Impossible de se connecter au service de chat (WS) : ${err?.message ?? 'erreur inconnue'}`,
          'error',
      )
    })

    socket.on('reconnect_failed', () => {
      console.error('[ChatContext] socket reconnect_failed')
      showToast('La reconnexion au service de chat a échoué.', 'error')
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('connect_error')
      socket.off('reconnect_failed')
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [token])

  useEffect(() => {
    if (isConnected) {
      loadChannels()
    }
  }, [isConnected, loadChannels])

  // Abonnements centralisés
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    socket.on('new_message', handleIncomingMessage)
    socket.on('newMessage', handleIncomingMessage)
    socket.on('presence_update', handlePresenceUpdate)

    return () => {
      socket.off('new_message', handleIncomingMessage)
      socket.off('newMessage', handleIncomingMessage)
      socket.off('presence_update', handlePresenceUpdate)
    }
  }, [isConnected, handleIncomingMessage, handlePresenceUpdate])

  const value = useMemo(
      () => ({
        channels,
        activeChannelId,
        setActiveChannelId,
        messages,       // Expose l'état des messages
        setMessages,    // Expose le setter pour le fetch de l'historique
        loadChannels,
        refreshChannels,
        socket: socketRef.current,
        isConnected,
      }),
      [channels, activeChannelId, messages, loadChannels, refreshChannels, isConnected],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}