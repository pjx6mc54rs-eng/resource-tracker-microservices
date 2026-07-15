import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getProjectMessages } from './chatApi'
import './ChatDrawer.css'

const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? 'http://localhost:3006'

function displayName(message, currentUser) {
  if (message.userName) return message.userName
  if (message.userId === currentUser?.id) {
    return currentUser.firstName || currentUser.email || 'Vous'
  }
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
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isOpen])

  useEffect(() => {
    if (!isOpen || !project?.id || !token) return undefined

    let active = true
    setMessages([])
    setError(null)
    setIsLoading(true)

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

    const socket = io(CHAT_URL, { auth: { token }, transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      if (!active) return
      setIsConnected(true)
      // Contrat réel du chat-service : joinProject, et non join_project.
      socket.emit('joinProject', { projectId: project.id }, (ack) => {
        if (active && !ack?.ok) setError(ack?.message ?? 'Accès au projet refusé.')
      })
    })

    socket.on('newMessage', (message) => {
      if (message.projectId !== project.id) return
      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) return previous
        return [...previous, message]
      })
    })

    socket.on('error', (payload) => active && setError(payload?.message ?? 'Erreur du chat.'))
    socket.on('connect_error', () => active && setError('Connexion au chat impossible.'))
    socket.on('disconnect', () => active && setIsConnected(false))

    return () => {
      active = false
      // Le backend actuel ne définit pas leaveProject : fermer la socket quitte la room.
      socket.disconnect()
      socketRef.current = null
    }
  }, [isOpen, project?.id, token])

  function sendMessage(event) {
    event.preventDefault()
    const content = text.trim()
    const socket = socketRef.current
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

    setMessages((previous) => [...previous, optimisticMessage])
    setText('')

    // Contrat réel du chat-service : sendMessage, sans userId client.
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
                  {displayName(message, currentUser)} · {messageTime(message)}
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
