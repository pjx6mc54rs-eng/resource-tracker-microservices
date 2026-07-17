import { useEffect, useMemo, useState, useRef } from 'react'
import './Chat.css'

const initialConversations = [
  {
    id: 'conv-1',
    name: 'Équipe Produit',
    type: 'group',
    lastMessage: { content: 'On valide le planning ?', createdAt: '2026-07-17T10:52:00.000Z' },
    unreadCount: 2,
    isOnline: true,
  },
  {
    id: 'conv-2',
    name: 'Nizar Ouaf',
    type: 'private',
    lastMessage: { content: 'Je te partage le document.', createdAt: '2026-07-17T09:20:00.000Z' },
    unreadCount: 0,
    isOnline: true,
  },
  {
    id: 'conv-3',
    name: 'Design Team',
    type: 'group',
    lastMessage: { content: 'J’ai corrigé la maquette.', createdAt: '2026-07-16T16:40:00.000Z' },
    unreadCount: 4,
    isOnline: false,
  },
]

const initialMessagesByConversation = {
  'conv-1': [
    {
      id: 'm-1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      senderName: 'Claire',
      senderAvatar: '',
      content: 'Tu as vu la dernière version du backlog ?',
      type: 'text',
      createdAt: '2026-07-17T10:45:00.000Z',
      status: 'sent',
    },
    {
      id: 'm-2',
      conversationId: 'conv-1',
      senderId: 'me',
      senderName: 'Moi',
      senderAvatar: '',
      content: 'Oui, je propose qu’on en discute à 11h.',
      type: 'text',
      createdAt: '2026-07-17T10:48:00.000Z',
      status: 'sent',
    },
  ],
  'conv-2': [
    {
      id: 'm-3',
      conversationId: 'conv-2',
      senderId: 'me',
      senderName: 'Moi',
      senderAvatar: '',
      content: 'Salut Nizar, tu peux vérifier la note ? 😊',
      type: 'text',
      createdAt: '2026-07-17T09:18:00.000Z',
      status: 'sent',
    },
    {
      id: 'm-4',
      conversationId: 'conv-2',
      senderId: 'user-2',
      senderName: 'Nizar',
      senderAvatar: '',
      content: 'Je te partage le document dans 2 min.',
      type: 'text',
      createdAt: '2026-07-17T09:20:00.000Z',
      status: 'sent',
    },
  ],
  'conv-3': [
    {
      id: 'm-5',
      conversationId: 'conv-3',
      senderId: 'user-3',
      senderName: 'Sara',
      senderAvatar: '',
      content: 'Je viens de mettre à jour le styleguide.',
      type: 'text',
      createdAt: '2026-07-16T16:35:00.000Z',
      status: 'sent',
    },
    {
      id: 'm-6',
      conversationId: 'conv-3',
      senderId: 'me',
      senderName: 'Moi',
      senderAvatar: '',
      content: 'Top, je regarde ça ce soir.',
      type: 'text',
      createdAt: '2026-07-16T16:40:00.000Z',
      status: 'sent',
    },
  ],
}

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name) {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default function Chat() {
  const [conversations, setConversations] = useState(initialConversations)
  const [activeConversationId, setActiveConversationId] = useState(initialConversations[0].id)
  const [messagesByConversation, setMessagesByConversation] = useState(initialMessagesByConversation)
  const [messageText, setMessageText] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const messageListRef = useRef(null)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  )

  const messages = useMemo(
    () => messagesByConversation[activeConversationId] || [],
    [messagesByConversation, activeConversationId],
  )

  useEffect(() => {
    if (!activeConversationId) return
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    )
  }, [activeConversationId])

  useEffect(() => {
    setIsConnected(true)
    const timer = window.setTimeout(() => {
      simulateIncomingMessage()
    }, 4000)

    const interval = window.setInterval(() => {
      simulateIncomingMessage()
    }, 15000)

    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [activeConversationId, conversations])

  useEffect(() => {
    if (!messageListRef.current) return
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [messages])

  const simulateIncomingMessage = () => {
    const otherConversations = conversations.filter((conversation) => conversation.id !== activeConversationId)
    if (otherConversations.length === 0) return

    const targetConversation = otherConversations[Math.floor(Math.random() * otherConversations.length)]
    const incomingMessage = {
      id: `incoming-${Date.now()}`,
      conversationId: targetConversation.id,
      senderId: targetConversation.type === 'private' ? 'user-2' : 'user-3',
      senderName: targetConversation.type === 'private' ? targetConversation.name : 'Sara',
      senderAvatar: '',
      content: targetConversation.type === 'private'
        ? 'Message reçu via WebSocket simulé.'
        : 'Nouveau message de groupe disponible.',
      type: 'text',
      createdAt: new Date().toISOString(),
      status: 'sent',
    }

    setMessagesByConversation((current) => {
      const updatedMessages = {
        ...current,
        [targetConversation.id]: [
          ...(current[targetConversation.id] || []),
          incomingMessage,
        ],
      }
      return updatedMessages
    })

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === targetConversation.id
          ? {
              ...conversation,
              unreadCount: conversation.id === activeConversationId ? 0 : conversation.unreadCount + 1,
              lastMessage: { content: incomingMessage.content, createdAt: incomingMessage.createdAt },
            }
          : conversation,
      ),
    )
  }

  const handleSelectConversation = (conversationId) => {
    setActiveConversationId(conversationId)
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    )
  }

  const handleSendMessage = (event) => {
    event.preventDefault()
    if (!messageText.trim() || !activeConversation) return

    const temporaryId = `temp-${Date.now()}`
    const newMessage = {
      id: temporaryId,
      conversationId: activeConversationId,
      senderId: 'me',
      senderName: 'Moi',
      senderAvatar: '',
      content: messageText.trim(),
      type: 'text',
      createdAt: new Date().toISOString(),
      status: 'sending',
    }

    setMessagesByConversation((current) => ({
      ...current,
      [activeConversationId]: [...(current[activeConversationId] || []), newMessage],
    }))
    setMessageText('')

    window.setTimeout(() => {
      setMessagesByConversation((current) => ({
        ...current,
        [activeConversationId]: current[activeConversationId].map((message) =>
          message.id === temporaryId ? { ...message, status: 'sent' } : message,
        ),
      }))
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeConversationId
            ? {
                ...conversation,
                lastMessage: { content: newMessage.content, createdAt: newMessage.createdAt },
              }
            : conversation,
        ),
      )
    }, 700)
  }

  return (
    <div className="chat-root">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h2>Discussions</h2>
          <p>Vos conversations récentes</p>
        </div>

        <div className="chat-conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`chat-conversation-item ${conversation.id === activeConversationId ? 'active' : ''}`}
              onClick={() => handleSelectConversation(conversation.id)}
            >
              <div className="conversation-meta">
                <span className="conversation-name">{conversation.name}</span>
                {conversation.type === 'private' && (
                  <span className={`conversation-status ${conversation.isOnline ? 'online' : 'offline'}`}>
                    {conversation.isOnline ? 'En ligne' : 'Hors ligne'}
                  </span>
                )}
              </div>
              <p className="conversation-last-message">{conversation.lastMessage?.content}</p>
              <div className="conversation-footer">
                <span className="conversation-time">{conversation.lastMessage ? formatTime(conversation.lastMessage.createdAt) : ''}</span>
                {conversation.unreadCount > 0 && (
                  <span className="conversation-badge">{conversation.unreadCount}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div>
            <p className="chat-header-label">{activeConversation?.type === 'group' ? 'Groupe de discussion' : 'Discussion privée'}</p>
            <h1>{activeConversation?.name ?? 'Aucune conversation sélectionnée'}</h1>
          </div>
          <span className={`chat-connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connecté' : 'Hors ligne'}
          </span>
        </header>

        <div className="chat-window">
          <div className="chat-messages" ref={messageListRef}>
            {(messages.length === 0 || !activeConversation) && (
              <div className="chat-empty-state">Sélectionnez une conversation pour afficher les messages.</div>
            )}
            {messages.map((message) => {
              const isMine = message.senderId === 'me'
              return (
                <div key={message.id} className={`chat-message-row ${isMine ? 'sent' : 'received'}`}>
                  {!isMine && (
                    <div className="chat-message-avatar">{getInitials(message.senderName)}</div>
                  )}
                  <div className={`chat-message-bubble ${isMine ? 'sent' : 'received'}`}>
                    {!isMine && <div className="chat-message-sender">{message.senderName}</div>}
                    <p className="chat-message-content">{message.content}</p>
                    <div className="chat-message-meta">
                      <span>{formatTime(message.createdAt)}</span>
                      {isMine && message.status === 'sending' && <span className="chat-message-status">Envoi…</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input
              type="text"
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Écrire un message..."
              className="chat-input"
              disabled={!activeConversation}
            />
            <button type="submit" className="chat-send-button" disabled={!messageText.trim() || !activeConversation}>
              Envoyer
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
EOF