import { useEffect, useRef, useState } from 'react'
import { useChat } from '../../context/ChatContext' // Hypothèse sur le chemin de ton ChatContext
import { getProjectMessages } from './chatApi'
import './ChatDrawer.css'

function displayName(message, currentUser, channels) {
  if (message.userId === currentUser?.id) {
    return 'You'
  }
  if (message.userName) return message.userName
  const colleague = channels?.colleagues?.find((c) => c.userId === message.userId)
  if (colleague) return colleague.name
  return 'Collaborateur'
}

function messageTime(message) {
  const value = message.timestamp ?? message.createdAt
  return value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
}

export default function ChatDrawer({ isOpen, onClose, project, token, currentUser }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef(null)

  // Consommation du socket unique et de son état depuis ton contexte global de chat
  const { socket, isConnected, channels } = useChat()

  // Scroll automatique vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isOpen])

  // Chargement de l'historique et gestion des événements temps réel
  useEffect(() => {
    if (!isOpen || !project?.id || !token || !socket) return undefined

    let active = true
    setMessages([])
    setError(null)
    setIsLoading(true)

    // 1. Récupération de l'historique des messages
    getProjectMessages(project.id, token)
        .then((history) => {
          if (!active) return
          setMessages(history.map((message) => ({
            ...message,
            timestamp: message.timestamp ?? message.createdAt,
          })))
        })
        .catch((requestError) => active && setError(requestError.message))
        .finally(() => active && setIsLoading(false))

    // 2. Rejoindre le salon (room) du projet
    if (socket.connected) {
      socket.emit('joinProject', { projectId: project.id }, (ack) => {
        if (active && !ack?.ok) setError(ack?.message ?? 'Accès au projet refusé.')
      })
    }

    // Si reconnexion en cours de route
    const handleConnect = () => {
      socket.emit('joinProject', { projectId: project.id }, (ack) => {
        if (active && !ack?.ok) setError(ack?.message ?? 'Accès au projet refusé.')
      })
    }

    // 3. Réception d'un nouveau message
    const handleNewMessage = (message) => {
      if (message.projectId !== project.id) return
      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) return previous
        if (message.userId === currentUser?.id) {
          const tempIndex = previous.findIndex((item) => item.id.startsWith('temporary-') && item.message === message.message)
          if (tempIndex !== -1) {
            return previous.map((item, idx) => idx === tempIndex ? message : item)
          }
        }
        return [...previous, message]
      })
    }

    const handleChatError = (payload) => active && setError(payload?.message ?? 'Erreur du chat.')

    // Attachement des écouteurs d'événements
    socket.on('connect', handleConnect)
    socket.on('newMessage', handleNewMessage)
    socket.on('error', handleChatError)

    // Nettoyage à la fermeture ou au changement de projet
    return () => {
      active = false

      // On retire spécifiquement nos écouteurs pour ce composant sans tuer le socket
      socket.off('connect', handleConnect)
      socket.off('newMessage', handleNewMessage)
      socket.off('error', handleChatError)

      // Si ton backend supporte une action pour quitter explicitement la room sans se déconnecter :
      socket.emit('leaveProject', { projectId: project.id })
    }
  }, [isOpen, project?.id, token, socket])

  // Envoi du message
  function sendMessage(event) {
    event.preventDefault()
    const content = text.trim()

    if (!content || !socket?.connected || !project) return

    const temporaryId = `temporary-${Date.now()}`
    const optimisticMessage = {
      id: temporaryId,
      projectId: project.id,
      userId: currentUser?.id,
      userName: currentUser?.firstName || currentUser?.email || 'Vous',
      message: content,
      timestamp: new Date().toISOString(),
    }

    // UI Optimiste
    setMessages((previous) => [...previous, optimisticMessage])
    setText('')

    // Envoi via le socket partagé
    socket.emit('sendMessage', { projectId: project.id, message: content }, (ack) => {
      if (!ack?.ok) {
        setMessages((previous) => previous.filter((message) => message.id !== temporaryId))
        setError(ack?.message ?? "Le message n'a pas été envoyé.")
        return
      }
      setMessages((previous) => previous.map((message) => (
          message.id === temporaryId ? ack.message : message
      )))
    })
  }

  return (
      <>
        <div
            className={`chat-drawer-overlay ${isOpen ? 'is-open' : ''}`}
            aria-hidden={!isOpen}
            onClick={onClose}
        />
        <aside
            className={`chat-drawer ${isOpen ? 'is-open' : ''}`}
            aria-hidden={!isOpen}
            aria-label={`Discussion du projet ${project?.name ?? ''}`}
        >
          <header className="chat-drawer-header">
            <div>
              <p className="chat-drawer-eyebrow">Discussion du projet</p>
              <h2>{project?.name ?? 'Projet'}</h2>
              <span className={`chat-online-status ${isConnected ? 'is-online' : ''}`}>
              <i /> {isConnected ? 'En ligne' : 'Connexion…'}
            </span>
            </div>
            <button className="chat-close-button" type="button" onClick={onClose} aria-label="Fermer le chat">×</button>
          </header>

          <main className="chat-drawer-messages" aria-live="polite">
            {isLoading && <p className="chat-empty-state">Chargement des messages…</p>}
            {error && <p className="chat-error">{error}</p>}
            {!isLoading && !error && messages.length === 0 && (
                <p className="chat-empty-state">Commencez la discussion avec votre équipe.</p>
            )}
            {messages.map((message) => {
              const isMine = message.userId === currentUser?.id
              return (
                  <article className={`chat-message-row ${isMine ? 'is-mine' : ''}`} key={message.id}>
                    <p className="chat-message-meta">
                      {displayName(message, currentUser, channels)} · {messageTime(message)}
                    </p>
                    <div className="chat-message-bubble">{message.message}</div>
                  </article>
              )
            })}
            <div ref={bottomRef} />
          </main>

          <form className="chat-drawer-footer" onSubmit={sendMessage}>
            <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Écrire un message…"
                maxLength="2000"
                disabled={!isConnected}
                aria-label="Votre message"
            />
            <button type="submit" disabled={!isConnected || !text.trim()} aria-label="Envoyer le message">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Zm-9.5 9.5L21 3" /></svg>
            </button>
          </form>
        </aside>
      </>
  )
}