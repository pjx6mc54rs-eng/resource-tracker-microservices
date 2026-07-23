import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { fetchChatChannels, markChannelAsRead } from '../pages/messages/messagesApi'
import API_URL from '../config/api'

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
 
  const originalTitleRef = useRef(document.title || 'Norsys Ressource Tracker')
  const flashIntervalRef = useRef(null)
 
  const stopFlashingTitle = useCallback(() => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current)
      flashIntervalRef.current = null
    }
    document.title = originalTitleRef.current
  }, [])
 
  const startFlashingTitle = useCallback((text) => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current)
    }
    let isShowingNotification = false
    flashIntervalRef.current = setInterval(() => {
      isShowingNotification = !isShowingNotification
      document.title = isShowingNotification ? text : originalTitleRef.current
    }, 1500)
  }, [])
 
  const [isWindowFocused, setIsWindowFocused] = useState(document.hasFocus())
 
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true)
    const handleBlur = () => setIsWindowFocused(false)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('click', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('click', handleFocus)
    }
  }, [])
 
  useEffect(() => {
    const unreadColleagues = channels.colleagues.filter(
      (c) => c.unreadCount > 0 && (c.channelId !== activeChannelId || !isWindowFocused)
    )
    const unreadGroups = channels.groups.filter(
      (g) => g.unreadCount > 0 && (g.id !== activeChannelId || !isWindowFocused)
    )
    const unreadProjects = channels.projects.filter(
      (p) => p.unreadCount > 0 && (p.id !== activeChannelId || !isWindowFocused)
    )
 
    const hasUnread = unreadColleagues.length > 0 || unreadGroups.length > 0 || unreadProjects.length > 0
 
    if (!hasUnread) {
      stopFlashingTitle()
      return
    }
 
    const allUnread = [
      ...unreadColleagues.map((c) => ({ senderName: c.name, time: c.lastMessageAt })),
      ...unreadGroups.map((g) => ({ senderName: g.lastMessage?.senderName || 'a member', time: g.lastMessageAt })),
      ...unreadProjects.map((p) => ({ senderName: p.lastMessage?.senderName || 'a contributor', time: p.lastMessageAt })),
    ].filter((item) => item.time)
 
    allUnread.sort((a, b) => new Date(b.time) - new Date(a.time))
 
    const latestName = allUnread.length > 0 ? allUnread[0].senderName : 'a colleague'
    startFlashingTitle(`New message from ${latestName}`)
  }, [channels, activeChannelId, isWindowFocused, startFlashingTitle, stopFlashingTitle])

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
      [channels]
  )

  const markLocalChannelAsRead = useCallback((channelId) => {
    setChannels((current) => {
      const updateUnread = (item) => {
        if (item.id === channelId || item.channelId === channelId) {
          return { ...item, unreadCount: 0 }
        }
        return item
      }
      const projects = current.projects.map(updateUnread)
      const groups = current.groups.map(updateUnread)
      const colleagues = current.colleagues.map(updateUnread)

      const globalUnreadCount =
          projects.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0) +
          groups.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0) +
          colleagues.reduce((sum, item) => sum + normalizeValue(item.unreadCount), 0)
      return { ...current, projects, groups, colleagues, globalUnreadCount }
    })
  }, [])

  const markChannelAsReadAPI = useCallback(async (channelId) => {
    if (!token || !channelId) return
    try {
      await markChannelAsRead(channelId, token)
      markLocalChannelAsRead(channelId)
      if (socketRef.current?.connected) {
        socketRef.current.emit('message_read', { channelId })
      }
    } catch (e) {
      console.error('Failed to mark channel as read', e)
    }
  }, [token, markLocalChannelAsRead])

  const handleMessageRead = useCallback((payload) => {
    if (!payload?.channelId || !payload?.userId) return
    setChannels((current) => {
      const colleagues = current.colleagues.map((c) =>
        c.userId === payload.userId ? { ...c, lastReadAt: payload.readAt } : c
      )
      return { ...current, colleagues }
    })
  }, [])

  const updateChannelLastMessage = useCallback((channelId, message) => {
    setChannels((current) => {
      const updateMsg = (item) => {
        if (item.id === channelId || item.channelId === channelId) {
          const isMine = message.senderId === user?.id
          let senderName = message.senderName || 'Membre'
          if (isMine) senderName = 'You'
          else {
            const colleague = current.colleagues?.find((c) => c.userId === message.senderId)
            if (colleague) senderName = colleague.name
          }
          return {
            ...item,
            lastMessageAt: message.createdAt,
            lastMessage: {
              content: message.message,
              senderId: message.senderId,
              senderName: senderName,
              createdAt: message.createdAt,
            }
          }
        }
        return item
      }
      return {
        ...current,
        projects: current.projects.map(updateMsg),
        groups: current.groups.map(updateMsg),
        colleagues: current.colleagues.map(updateMsg),
      }
    })
  }, [user?.id])

  const handleIncomingMessage = useCallback(
      (message) => {
        if (!message?.channelId) return
 
        // Si le canal n'est pas encore connu localement (ex: nouveau groupe ou DM)
        const channelExists = findChannel(message.channelId)
        if (!channelExists) {
          refreshChannels()
          return
        }
 
        updateChannelLastMessage(message.channelId, message)
 
        // Si le message appartient au canal actuellement ouvert par l'utilisateur
        if (message.channelId === activeChannelId) {
          setMessages((previous) => {
            if (previous.some((item) => item.id === message.id)) return previous
            if (message.senderId === user?.id) {
              const tempIndex = previous.findIndex((item) => item.id.startsWith('temp-') && item.message === message.message)
              if (tempIndex !== -1) {
                return previous.map((item, idx) =>
                  idx === tempIndex ? { ...message, createdAt: message.createdAt } : item
                )
              }
            }
            return [...previous, {
              ...message,
              createdAt: message.createdAt ?? new Date().toISOString()
            }]
          })
          return
        }
 
        // Si l'utilisateur connecté est l'auteur du message, on ignore les notifications et compteurs de non-lus
        if (message.senderId === user?.id) {
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
      },
      [activeChannelId, findChannel, refreshChannels, user?.id, updateChannelLastMessage],
  )

  // Connexion du socket. Dépend uniquement du token.
  useEffect(() => {
    if (!token) return
    console.log('[ChatContext] connecting to', API_URL, 'token present?', !!token)

    const socket = io(API_URL, {
      path: '/api/chat/socket.io',
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
          `Unable to connect to chat service (WS): ${err?.message ?? 'unknown error'}`,
          'error',
      )
    })

    socket.on('reconnect_failed', () => {
      console.error('[ChatContext] socket reconnect_failed')
      showToast('Reconnection to chat service failed.', 'error')
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
    socket.on('message_read', handleMessageRead)

    return () => {
      socket.off('new_message', handleIncomingMessage)
      socket.off('newMessage', handleIncomingMessage)
      socket.off('presence_update', handlePresenceUpdate)
      socket.off('message_read', handleMessageRead)
    }
  }, [isConnected, handleIncomingMessage, handlePresenceUpdate, handleMessageRead])

  useEffect(() => {
    if (activeChannelId) {
      markChannelAsReadAPI(activeChannelId)
    }
  }, [activeChannelId, markChannelAsReadAPI])

  const value = useMemo(
      () => ({
        channels,
        activeChannelId,
        setActiveChannelId,
        messages,       // Expose l'état des messages
        setMessages,    // Expose le setter pour le fetch de l'historique
        loadChannels,
        refreshChannels,
        markChannelAsRead: markChannelAsReadAPI,
        socket: socketRef.current,
        isConnected,
      }),
      [channels, activeChannelId, messages, loadChannels, refreshChannels, markChannelAsReadAPI, isConnected],
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
