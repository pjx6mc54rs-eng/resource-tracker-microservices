import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useToast } from '../../context/ToastContext'
import {
  createChatGroup,
  createDirectChatChannel,
  fetchChannelMessages,
  markChannelAsRead,
} from './messagesApi'
import './MessagesPage.css'

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getSenderInitials(message) {
  const source = message.senderName || message.senderId || ''
  const normalized = String(source).trim()
  if (!normalized) return ''
  const parts = normalized.split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return normalized.slice(0, 2).toUpperCase()
}

export default function MessagesPage() {
  const { token, user } = useAuth()
  const {
    channels,
    activeChannelId,
    setActiveChannelId,
    messages,
    setMessages,
    socket,
    refreshChannels,
    isConnected,
  } = useChat()
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const messagesContainerRef = useRef(null)
  const shouldAutoScrollRef = useRef(true)

  const activeChannel = useMemo(() => {
    const project = channels.projects.find((item) => item.id === activeChannelId)
    if (project) return { ...project, type: 'PROJECT' }

    const group = channels.groups.find((item) => item.id === activeChannelId)
    if (group) return { ...group, type: 'GROUP' }

    const colleague = channels.colleagues.find((item) => item.channelId === activeChannelId)
    if (colleague) {
      return {
        id: colleague.channelId,
        type: 'DIRECT',
        name: colleague.name,
        userId: colleague.userId,
        online: colleague.online,
      }
    }

    return null
  }, [activeChannelId, channels])

  const headerStatus = useMemo(() => {
    if (!activeChannel) return ''
    if (activeChannel.type === 'DIRECT') {
      return activeChannel.online ? 'Discussion individuelle • En ligne' : 'Discussion individuelle • Hors ligne'
    }
    if (activeChannel.type === 'PROJECT') {
      return 'Discussion de projet'
    }
    return 'Groupe de discussion'
  }, [activeChannel])

  useEffect(() => {
    if (!activeChannelId || !token) {
      setMessages([])
      return
    }

    let active = true
    setIsLoading(true)
    setError(null)

    fetchChannelMessages(activeChannelId, token)
      .then((history) => {
        if (!active) return
        setMessages(history)
      })
      .catch((fetchError) => {
        if (!active) return
        setError(fetchError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    markChannelAsRead(activeChannelId, token).catch(() => {})

    if (socket?.connected) {
      socket.emit('join_room', { channelId: activeChannelId }, (ack) => {
        if (!ack?.ok) {
          setError(ack?.message ?? 'Échec de la connexion au canal.')
        }
      })
    }

    return () => {
      active = false
    }
  }, [activeChannelId, token, socket?.connected, setMessages])

  useEffect(() => {
    if (!messagesContainerRef.current || !shouldAutoScrollRef.current) return
    const container = messagesContainerRef.current
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, activeChannelId])

  useEffect(() => {
    shouldAutoScrollRef.current = true
  }, [activeChannelId])

  const handleSelectChannel = async (item, type) => {
    let targetChannelId = item.id ?? item.channelId

    if (type === 'DIRECT' && !item.channelId) {
      if (!token) return
      setIsLoading(true)
      try {
        const channel = await createDirectChatChannel(item.userId, token)
        item.channelId = channel.id
        targetChannelId = channel.id
        await refreshChannels()
      } catch (fetchError) {
        showToast(fetchError.message || 'Impossible de créer la discussion directe.', 'error')
        return
      } finally {
        setIsLoading(false)
      }
    }

    setActiveChannelId(targetChannelId)

    if (socket?.connected && targetChannelId) {
      socket.emit('join_room', { channelId: targetChannelId }, (ack) => {
        if (!ack?.ok) {
          console.warn('[MessagesPage] Échec du join_room au clic:', ack?.message)
        }
      })
    }
  }

  const handleSendMessage = (event) => {
    event.preventDefault()
    if (!activeChannelId) {
      showToast('Aucune discussion sélectionnée.', 'error')
      return
    }
    if (!text.trim()) return
    if (!socket?.connected) {
      showToast('Connexion temporairement perdue. Réessayez.', 'error')
      return
    }
    if (!token) return

    const content = text.trim()
    const temporaryId = `temp-${Date.now()}`
    const optimisticMessage = {
      id: temporaryId,
      channelId: activeChannelId,
      senderId: user?.id,
      message: content,
      createdAt: new Date().toISOString(),
    }

    setMessages((previous) => [...previous, optimisticMessage])
    setText('')

    try {
      socket.emit('send_message', { channelId: activeChannelId, message: content }, (ack) => {
        if (!ack?.ok) {
          setMessages((previous) => previous.filter((message) => message.id !== temporaryId))
          showToast(ack?.message ?? "Le message n'a pas pu être envoyé.", 'error')
          return
        }

        setMessages((previous) =>
          previous.map((message) =>
            message.id === temporaryId ? { ...ack.message, createdAt: ack.message.createdAt } : message,
          ),
        )
      })
    } catch (e) {
      setMessages((previous) => previous.filter((message) => message.id !== temporaryId))
      showToast('Erreur d’envoi.', 'error')
    }
  }

  const toggleMemberSelection = (userId) => {
    setSelectedMembers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  const handleCreateGroup = async (event) => {
    event.preventDefault()
    if (!token || !groupName.trim() || selectedMembers.length === 0) return

    setIsCreatingGroup(true)
    try {
      const channel = await createChatGroup(groupName.trim(), selectedMembers, token)
      await refreshChannels()
      setActiveChannelId(channel.id)
      setGroupName('')
      setSelectedMembers([])
      setIsCreateGroupOpen(false)
    } catch (fetchError) {
      showToast(fetchError.message || 'Impossible de créer le groupe.', 'error')
    } finally {
      setIsCreatingGroup(false)
    }
  }

  const getSenderName = (message) => {
    if (message.senderId === user?.id) {
      return 'Vous'
    }
    if (activeChannel?.type === 'DIRECT') {
      return activeChannel.name || 'Collègue'
    }
    return message.senderName || String(message.senderId)
  }

  const headerLabel = activeChannel?.name ?? 'Discussion'

  return (
    <div className="messages-page">
      <aside className="messages-sidebar">
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            <div>
              <p className="panel-label">DISCUSSIONS DE PROJET</p>
              <p className="panel-subtitle">Accès aux conversations liées à vos projets.</p>
            </div>
          </div>
          <div className="channel-list">
            {channels.projects.length === 0 ? (
              <p className="empty-list">Aucun projet disponible.</p>
            ) : (
              channels.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`channel-item ${activeChannelId === project.id ? 'active' : ''}`}
                  onClick={() => handleSelectChannel(project, 'PROJECT')}
                >
                  <span className="channel-name"># {project.name}</span>
                  {project.unreadCount > 0 && <span className="channel-badge">{project.unreadCount}</span>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            <div>
              <p className="panel-label">DISCUSSIONS INDIVIDUELLES</p>
              <p className="panel-subtitle">DMs avec vos collègues.</p>
            </div>
          </div>
          <div className="channel-list">
            {channels.colleagues.length === 0 ? (
              <p className="empty-list">Aucun collègue trouvé.</p>
            ) : (
              channels.colleagues.map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  className={`channel-item ${activeChannelId === member.channelId ? 'active' : ''}`}
                  onClick={() => handleSelectChannel(member, 'DIRECT')}
                >
                  <span className={`status-dot ${member.online ? 'online' : 'offline'}`} />
                  <span className="channel-name">{member.name}</span>
                  {member.unreadCount > 0 && <span className="channel-badge">{member.unreadCount}</span>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-panel">
          <div className="sidebar-panel-header with-action">
            <div>
              <p className="panel-label">GROUPES DE DISCUSSION</p>
              <p className="panel-subtitle">Canaux d'équipes et conversations partagées.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setIsCreateGroupOpen(true)}>
              +
            </button>
          </div>
          <div className="channel-list">
            {channels.groups.length === 0 ? (
              <p className="empty-list">Aucun groupe créé.</p>
            ) : (
              channels.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`channel-item ${activeChannelId === group.id ? 'active' : ''}`}
                  onClick={() => handleSelectChannel(group, 'GROUP')}
                >
                  <span className="channel-name">{group.name}</span>
                  {group.unreadCount > 0 && <span className="channel-badge">{group.unreadCount}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <section className="messages-content">
        {!activeChannel ? (
          <div className="empty-state-card">
            <p>Sélectionnez une discussion pour commencer à communiquer.</p>
          </div>
        ) : (
          <div className="chat-panel">
            <header className="chat-header">
              <div className="chat-title-group">
                <h2>{headerLabel}</h2>
                <p className="chat-meta">{headerStatus}</p>
              </div>
              <span className={`chat-status ${isConnected ? 'connected' : 'disconnected'}`}>
                {isConnected ? 'Connecté' : 'Connexion...' }
              </span>
            </header>

            <main ref={messagesContainerRef} className="chat-messages" aria-live="polite">
              {isLoading && <p className="chat-empty-state">Chargement des messages…</p>}
              {error && <p className="chat-error">{error}</p>}
              {!isLoading && !error && messages.length === 0 && (
                <p className="chat-empty-state">Aucun message pour le moment. Lancez la conversation !</p>
              )}
              {messages.map((message) => {
                const isMine = message.senderId === user?.id
                const senderName = getSenderName(message)
                return (
                  <div key={message.id} className={`message-row ${isMine ? 'sent' : 'received'}`}>
                    {!isMine && (
                      <div className="message-avatar" aria-hidden="true">
                        {getSenderInitials(message)}
                      </div>
                    )}
                    <div className={`message-bubble ${isMine ? 'sent' : 'received'}`}>
                      {!isMine && <span className="message-sender">{senderName}</span>}
                      <p className="message-text">{message.message}</p>
                      <div className="message-footer">
                        <time className="message-time" dateTime={message.createdAt}>
                          {formatTime(message.createdAt)}
                        </time>
                      </div>
                    </div>
                  </div>
                )
              })}
            </main>

            <form className="chat-form" onSubmit={handleSendMessage}>
              <input
                className="chat-input"
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Écrire un message…"
                maxLength={2000}
                disabled={!isConnected}
                aria-label="Votre message"
              />
              <button type="submit" className="chat-send-button" disabled={!isConnected || !text.trim()}>
                Envoyer
              </button>
            </form>
          </div>
        )}
      </section>

      {isCreateGroupOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <header className="modal-header">
              <h3>Nouveau groupe de discussion</h3>
              <button type="button" className="modal-close" onClick={() => setIsCreateGroupOpen(false)}>
                ×
              </button>
            </header>
            <form className="modal-body" onSubmit={handleCreateGroup}>
              <label className="modal-label">
                Nom du groupe
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Nom du groupe"
                  required
                />
              </label>
              <div className="modal-members">
                <p className="modal-subtitle">Sélectionnez des collaborateurs</p>
                <div className="member-grid">
                  {channels.colleagues.map((member) => (
                    <label key={member.userId} className="member-card">
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(member.userId)}
                        onChange={() => toggleMemberSelection(member.userId)}
                      />
                      <span>{member.name}</span>
                      <small className={member.online ? 'member-online' : 'member-offline'}>
                        {member.online ? 'En ligne' : 'Hors ligne'}
                      </small>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsCreateGroupOpen(false)}>
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isCreatingGroup || !groupName.trim() || selectedMembers.length === 0}
                >
                  {isCreatingGroup ? 'Création…' : 'Créer le groupe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
