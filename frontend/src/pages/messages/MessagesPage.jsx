import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useToast } from '../../context/ToastContext'
import {
  createChatGroup,
  createDirectChatChannel,
  fetchChannelMessages,
  markChannelAsRead,
  clearChatChannel,
  deleteChatChannel,
  addGroupMember,
  updateChatChannelName,
  leaveChatGroup,
  removeGroupMember,
  makeMemberAdmin,
} from './messagesApi'
import './MessagesPage.css'

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3005'

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
)

const ProjectIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
  </svg>
)

const GroupIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h6v-3.5c0-2.33-4.67-3.5-7-3.5z" />
  </svg>
)

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
    markChannelAsRead
  } = useChat()
  const { showToast } = useToast()
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState([])
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null,
    title: '',
    message: '',
    subMessage: '',
    targetUserId: null,
  })
  const [addMemberSearch, setAddMemberSearch] = useState('')
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [isGroupMembersModalOpen, setIsGroupMembersModalOpen] = useState(false)
  const [isEditingGroupName, setIsEditingGroupName] = useState(false)
  const [editedGroupName, setEditedGroupName] = useState('')
  const [isSavingGroupName, setIsSavingGroupName] = useState(false)
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false)

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
        avatarUrl: colleague.avatarUrl,
      }
    }

    return null
  }, [activeChannelId, channels])

  const isCurrentUserAdmin = useMemo(() => {
    if (!activeChannel || !activeChannel.members) return false
    const membership = activeChannel.members.find((m) => m.userId === user?.id)
    return membership?.isAdmin ?? false
  }, [activeChannel, user])

  const currentGroupMembers = useMemo(() => {
    if (!activeChannel || !activeChannel.members) return []
    const membersList = channels.colleagues
      .filter((c) => activeChannel.members.some((m) => m.userId === c.userId))
      .map((c) => {
        const mInfo = activeChannel.members.find((m) => m.userId === c.userId)
        return {
          ...c,
          isAdmin: mInfo?.isAdmin ?? false,
        }
      })
    // Ajouter l'utilisateur connecté s'il est membre du groupe
    const currentUserMInfo = activeChannel.members.find((m) => m.userId === user?.id)
    if (currentUserMInfo) {
      membersList.unshift({
        userId: user.id,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || 'Vous',
        avatarUrl: user.avatarUrl,
        online: true,
        isCurrentUser: true,
        isAdmin: currentUserMInfo.isAdmin ?? false,
      })
    }
    return membersList
  }, [activeChannel, channels.colleagues, user])

  const addableColleagues = useMemo(() => {
    if (!activeChannel || !activeChannel.members) return []
    const memberIds = activeChannel.members.map((m) => m.userId)
    return channels.colleagues.filter((c) => !memberIds.includes(c.userId))
  }, [activeChannel, channels.colleagues])

  const sortedProjects = useMemo(() => {
    return [...channels.projects]
      .filter((project) => {
        const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase())
        if (searchQuery) return matchesSearch
        return project.lastMessage || project.id === activeChannelId
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [channels.projects, activeChannelId, searchQuery])

  const sortedColleagues = useMemo(() => {
    return [...channels.colleagues]
      .filter((colleague) => {
        const matchesSearch = colleague.name.toLowerCase().includes(searchQuery.toLowerCase())
        if (searchQuery) return matchesSearch
        return colleague.lastMessage || colleague.channelId === activeChannelId
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [channels.colleagues, activeChannelId, searchQuery])

  const sortedGroups = useMemo(() => {
    return [...channels.groups]
      .filter((group) => {
        const matchesSearch = group.name.toLowerCase().includes(searchQuery.toLowerCase())
        if (searchQuery) return matchesSearch
        return group.lastMessage || group.id === activeChannelId
      })
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
        return bTime - aTime
      })
  }, [channels.groups, activeChannelId, searchQuery])

  // Charger l'historique
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

  useEffect(() => {
    if (!isHeaderMenuOpen) return
    const handleClose = () => setIsHeaderMenuOpen(false)
    // Delay listener to avoid closing immediately on trigger click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClose)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClose)
    }
  }, [isHeaderMenuOpen])

  const handleSelectChannel = async (item, type) => {
    let targetChannelId = item.id ?? item.channelId

    if (type === 'DIRECT' && !item.channelId) {
      if (!token) return
      try {
        setIsLoading(true)
        const channel = await createDirectChatChannel(item.userId, token)

        item.channelId = channel.id
        targetChannelId = channel.id

        await refreshChannels()
      } catch (fetchError) {
        showToast(fetchError.message || 'Impossible de créer la discussion directe.', 'error')
        setIsLoading(false)
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
      showToast("Erreur d'envoi.", 'error')
    }
  }

  const handleInputFocus = () => {
    if (activeChannelId) {
      markChannelAsRead(activeChannelId)
    }
  }

  const handleClearConversationClick = () => {
    setConfirmModal({
      isOpen: true,
      type: 'clear',
      title: 'Effacer la conversation',
      message: 'Êtes-vous sûr de vouloir effacer tous les messages de cette conversation ?',
      subMessage: 'Cette action est définitive et ne pourra pas être annulée.',
    })
  }

  const handleDeleteConversationClick = () => {
    setConfirmModal({
      isOpen: true,
      type: 'delete',
      title: 'Supprimer la conversation',
      message: 'Êtes-vous sûr de vouloir supprimer définitivement cette conversation ?',
      subMessage: 'Tous les messages associés seront supprimés et la discussion sera retirée de votre liste.',
    })
  }

  const handleConfirmAction = async () => {
    if (!activeChannelId) return
    const actionType = confirmModal.type
    const targetUserId = confirmModal.targetUserId
    setConfirmModal((prev) => ({ ...prev, isOpen: false }))

    if (actionType === 'clear') {
      try {
        await clearChatChannel(activeChannelId, token)
        setMessages([])
        await refreshChannels()
        showToast("La conversation a été effacée.", "success")
      } catch (err) {
        showToast(err.message || "Impossible d'effacer la conversation.", "error")
      }
    } else if (actionType === 'delete') {
      try {
        await deleteChatChannel(activeChannelId, token)
        setActiveChannelId(null)
        setMessages([])
        await refreshChannels()
        showToast("La conversation a été supprimée.", "success")
      } catch (err) {
        showToast(err.message || "Impossible de supprimer la conversation.", "error")
      }
    } else if (actionType === 'leave') {
      try {
        await leaveChatGroup(activeChannelId, token)
        setActiveChannelId(null)
        setMessages([])
        await refreshChannels()
        showToast("Vous avez quitté le groupe.", "success")
      } catch (err) {
        showToast(err.message || "Impossible de quitter le groupe.", "error")
      }
    } else if (actionType === 'removeMember') {
      if (!targetUserId) return
      try {
        await removeGroupMember(activeChannelId, targetUserId, token)
        await refreshChannels()
        showToast("Membre retiré du groupe.", "success")
      } catch (err) {
        showToast(err.message || "Impossible de retirer le membre.", "error")
      }
    } else if (actionType === 'promoteMember') {
      if (!targetUserId) return
      try {
        await makeMemberAdmin(activeChannelId, targetUserId, token)
        await refreshChannels()
        showToast("Rôle administrateur accordé.", "success")
      } catch (err) {
        showToast(err.message || "Impossible d'accorder le rôle administrateur.", "error")
      }
    }
  }

  const handleAddMemberGroup = async (userId) => {
    if (!activeChannelId || !token) return
    setIsAddingMember(true)
    try {
      await addGroupMember(activeChannelId, userId, token)
      setAddMemberSearch('')
      await refreshChannels()
      showToast("Membre ajouté au groupe avec succès.", "success")
    } catch (err) {
      showToast(err.message || "Impossible d'ajouter le membre.", "error")
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleSaveGroupName = async () => {
    if (!activeChannelId || !token || !editedGroupName.trim()) return
    setIsSavingGroupName(true)
    try {
      await updateChatChannelName(activeChannelId, editedGroupName.trim(), token)
      await refreshChannels()
      setIsEditingGroupName(false)
      showToast("Nom du groupe mis à jour avec succès.", "success")
    } catch (err) {
      showToast(err.message || "Impossible de renommer le groupe.", "error")
    } finally {
      setIsSavingGroupName(false)
    }
  }

  const handleLeaveGroupClick = () => {
    setConfirmModal({
      isOpen: true,
      type: 'leave',
      title: 'Quitter la discussion',
      message: 'Êtes-vous sûr de vouloir quitter cette discussion ?',
      subMessage: 'Si vous êtes le seul administrateur, un autre membre sera nommé administrateur automatiquement.',
      targetUserId: null,
    })
  }

  const handleRemoveMemberGroup = (userId) => {
    if (!activeChannelId || !token) return
    const member = currentGroupMembers.find((m) => m.userId === userId)
    const name = member ? member.name : "ce membre"
    setConfirmModal({
      isOpen: true,
      type: 'removeMember',
      title: 'Retirer du groupe',
      message: `Êtes-vous sûr de vouloir retirer ${name} du groupe ?`,
      subMessage: 'Cette personne ne recevra plus de messages de cette discussion.',
      targetUserId: userId,
    })
  }

  const handleMakeAdminGroup = (userId) => {
    if (!activeChannelId || !token) return
    const member = currentGroupMembers.find((m) => m.userId === userId)
    const name = member ? member.name : "ce membre"
    setConfirmModal({
      isOpen: true,
      type: 'promoteMember',
      title: 'Nommer administrateur',
      message: `Nommer ${name} administrateur du groupe ?`,
      subMessage: 'Les administrateurs peuvent renommer le groupe, ajouter ou retirer des membres.',
      targetUserId: userId,
    })
  }

  const toggleMemberSelection = (userId) => {
    setSelectedMembers((current) =>
        current.includes(userId)
            ? current.filter((id) => id !== userId)
            : [...current, userId],
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

  const activePeerStatus = !isConnected
    ? 'Connexion...'
    : activeChannel?.type === 'DIRECT'
      ? (activeChannel.online ? 'En ligne' : 'Hors ligne')
      : activeChannel?.type === 'PROJECT'
        ? 'Discussion de projet'
        : activeChannel?.type === 'GROUP'
          ? 'Groupe de discussion'
          : ''

  return (
      <div className="messages-page">
        <aside className="messages-sidebar">
          <div className="sidebar-search-container">
            <input
              type="text"
              className="sidebar-search-input"
              placeholder="Rechercher ou démarrer un chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="sidebar-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>

          {/* Discussions de projet */}
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
                  sortedProjects.map((project) => (
                      <button
                          key={project.id}
                          type="button"
                          className={`channel-item ${activeChannelId === project.id ? 'active' : ''} ${project.unreadCount > 0 ? 'unread' : ''}`}
                          onClick={() => handleSelectChannel(project, 'PROJECT')}
                      >
                        <div className="channel-avatar-container project">
                          <ProjectIcon />
                        </div>
                        <div className="channel-item-details">
                          <div className="channel-item-header">
                            <span className="channel-name"># {project.name}</span>
                            {project.lastMessage && (
                              <span className="channel-last-time">
                                {formatTime(project.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          <div className="channel-item-footer">
                            <span className="channel-last-msg">
                              {project.lastMessage ? (
                                `${project.lastMessage.senderName}: ${project.lastMessage.content}`
                              ) : (
                                "Pas de message"
                              )}
                            </span>
                            {project.unreadCount > 0 && (
                                <span className="channel-badge">{project.unreadCount}</span>
                            )}
                          </div>
                        </div>
                      </button>
                  ))
              )}
            </div>
          </div>

          {/* Discussions individuelles */}
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
                  sortedColleagues.map((member) => (
                      <button
                          key={member.userId}
                          type="button"
                          className={`channel-item ${activeChannelId === member.channelId ? 'active' : ''} ${member.unreadCount > 0 ? 'unread' : ''}`}
                          onClick={() => handleSelectChannel(member, 'DIRECT')}
                      >
                        <div className="channel-avatar-container">
                          {member.avatarUrl ? (
                            <img
                              className="channel-avatar-img"
                              src={`${API_URL}${member.avatarUrl}`}
                              alt={member.name}
                              onError={(e) => {
                                e.target.style.display = 'none'
                                e.target.nextSibling.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div
                            className="channel-avatar-placeholder"
                            style={{ display: member.avatarUrl ? 'none' : 'flex' }}
                          >
                            <ProfileIcon />
                          </div>
                          <span className={`status-dot ${member.online ? 'online' : 'offline'}`} />
                        </div>
                        <div className="channel-item-details">
                          <div className="channel-item-header">
                            <span className="channel-name">{member.name}</span>
                            {member.lastMessage && (
                              <span className="channel-last-time">
                                {formatTime(member.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          <div className="channel-item-footer">
                            <span className="channel-last-msg">
                              {member.lastMessage ? (
                                `${member.lastMessage.senderName}: ${member.lastMessage.content}`
                              ) : (
                                "Pas de message"
                              )}
                            </span>
                            {member.unreadCount > 0 && (
                                <span className="channel-badge">{member.unreadCount}</span>
                            )}
                          </div>
                        </div>
                      </button>
                  ))
              )}
            </div>
          </div>

          {/* Groupes de discussion */}
          <div className="sidebar-panel">
            <div className="sidebar-panel-header with-action">
              <div>
                <p className="panel-label">GROUPES DE DISCUSSION</p>
                <p className="panel-subtitle">Canaux d'équipes et conversations partagées.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsCreateGroupOpen(true)}
                title="Créer un groupe de discussion"
                aria-label="Créer un groupe de discussion"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div className="channel-list">
              {channels.groups.length === 0 ? (
                  <p className="empty-list">Aucun groupe créé.</p>
              ) : (
                  sortedGroups.map((group) => (
                      <button
                          key={group.id}
                          type="button"
                          className={`channel-item ${activeChannelId === group.id ? 'active' : ''} ${group.unreadCount > 0 ? 'unread' : ''}`}
                          onClick={() => handleSelectChannel(group, 'GROUP')}
                      >
                        <div className="channel-avatar-container group">
                          <GroupIcon />
                        </div>
                        <div className="channel-item-details">
                          <div className="channel-item-header">
                            <span className="channel-name">{group.name}</span>
                            {group.lastMessage && (
                              <span className="channel-last-time">
                                {formatTime(group.lastMessage.createdAt)}
                              </span>
                            )}
                          </div>
                          <div className="channel-item-footer">
                            <span className="channel-last-msg">
                              {group.lastMessage ? (
                                `${group.lastMessage.senderName}: ${group.lastMessage.content}`
                              ) : (
                                "Pas de message"
                              )}
                            </span>
                            {group.unreadCount > 0 && (
                                <span className="channel-badge">{group.unreadCount}</span>
                            )}
                          </div>
                        </div>
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
                  <div className="chat-header-info">
                    {activeChannel.type === 'DIRECT' && (
                      <div className="chat-header-avatar-container">
                        {activeChannel.avatarUrl ? (
                          <img
                            className="chat-header-avatar-img"
                            src={`${API_URL}${activeChannel.avatarUrl}`}
                            alt={activeChannel.name}
                            onError={(e) => {
                              e.target.style.display = 'none'
                              e.target.nextSibling.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        <div
                          className="chat-header-avatar-placeholder"
                          style={{ display: activeChannel.avatarUrl ? 'none' : 'flex' }}
                        >
                          <ProfileIcon />
                        </div>
                        <span className={`status-dot ${activeChannel.online ? 'online' : 'offline'}`} />
                      </div>
                    )}
                    {activeChannel.type === 'PROJECT' && (
                      <div className="chat-header-avatar-container project">
                        <ProjectIcon />
                      </div>
                    )}
                    {activeChannel.type === 'GROUP' && (
                      <div className="chat-header-avatar-container group">
                        <GroupIcon />
                      </div>
                    )}
                    <div className="chat-header-text">
                      <h2>{activeChannel.name}</h2>
                      <p className="chat-meta">{activePeerStatus}</p>
                    </div>
                  </div>
                  <div className="chat-header-actions">
                    <div className="chat-header-menu-container">
                      <button
                        type="button"
                        className="chat-action-btn menu-trigger-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsHeaderMenuOpen(!isHeaderMenuOpen)
                        }}
                        title="Options de discussion"
                        aria-label="Options de discussion"
                        style={{ padding: '0.5rem', borderRadius: '50%', minWidth: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="6" cy="12" r="1.5" />
                          <circle cx="18" cy="12" r="1.5" />
                        </svg>
                      </button>
                      {isHeaderMenuOpen && (
                        <div className="chat-header-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          {activeChannel.type === 'GROUP' && (
                            <>
                              <button
                                type="button"
                                className="dropdown-item"
                                onClick={() => {
                                  setIsGroupMembersModalOpen(true)
                                  setEditedGroupName(activeChannel.name)
                                  setIsEditingGroupName(false)
                                  setIsHeaderMenuOpen(false)
                                }}
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                                <span>Membres du groupe ({activeChannel.memberCount || activeChannel.members?.length || 0})</span>
                              </button>
                              <button
                                type="button"
                                className="dropdown-item"
                                onClick={() => {
                                  setIsGroupMembersModalOpen(true)
                                  setEditedGroupName(activeChannel.name)
                                  setIsEditingGroupName(true)
                                  setIsHeaderMenuOpen(false)
                                }}
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                <span>Renommer le groupe</span>
                              </button>
                              <button
                                type="button"
                                className="dropdown-item leave-item"
                                onClick={() => {
                                  handleLeaveGroupClick()
                                  setIsHeaderMenuOpen(false)
                                }}
                              >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                  <polyline points="16 17 21 12 16 7" />
                                  <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                <span>Quitter le groupe</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="dropdown-item"
                            onClick={() => {
                              handleClearConversationClick()
                              setIsHeaderMenuOpen(false)
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                            <span>Effacer la conversation</span>
                          </button>
                          <button
                            type="button"
                            className="dropdown-item delete-item"
                            onClick={() => {
                              handleDeleteConversationClick()
                              setIsHeaderMenuOpen(false)
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                            <span>Supprimer la conversation</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                <main
                    ref={messagesContainerRef}
                    className="chat-messages"
                    onScroll={(event) => {
                      const container = event.currentTarget
                      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
                      const shouldAuto = distanceFromBottom <= 80
                      if (shouldAutoScrollRef.current !== shouldAuto) {
                        shouldAutoScrollRef.current = shouldAuto
                      }
                    }}
                >
                  {isLoading && <p className="chat-empty-state">Chargement des messages…</p>}
                  {error && <p className="chat-error">{error}</p>}
                  {!isLoading && !error && messages.length === 0 && (
                      <p className="chat-empty-state">Aucun message pour le moment. Lancez la conversation !</p>
                  )}
                  {messages.map((message, index) => {
                    const isMine = message.senderId === user?.id
                    const senderName = isMine ? 'You' : (channels.colleagues?.find((c) => c.userId === message.senderId)?.name || message.senderName || 'Collègue')
                    const isLastMessage = index === messages.length - 1
                    const colleague = channels.colleagues?.find((c) => c.channelId === activeChannelId || c.userId === activeChannel?.userId)
                    const isSeen = colleague?.lastReadAt && new Date(colleague.lastReadAt) >= new Date(message.createdAt)
                    const senderCol = channels.colleagues?.find((c) => c.userId === message.senderId)
                    const senderAvatarUrl = senderCol?.avatarUrl
                    return (
                        <div key={message.id} className={`message-row ${isMine ? 'sent' : 'received'}`}>
                          {!isMine && (
                            <div className="message-avatar" aria-hidden="true">
                              {senderAvatarUrl ? (
                                <img
                                  className="message-avatar-img"
                                  src={`${API_URL}${senderAvatarUrl}`}
                                  alt={senderName}
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    e.target.nextSibling.style.display = 'flex'
                                  }}
                                />
                              ) : null}
                              <div
                                className="message-avatar-placeholder"
                                style={{ display: senderAvatarUrl ? 'none' : 'flex' }}
                              >
                                <ProfileIcon />
                              </div>
                            </div>
                          )}
                          <div className="message-wrapper">
                            <span className="message-sender">{senderName}</span>
                            <div className="message-bubble">
                              <p className="message-text">{message.message}</p>
                            </div>
                            <span className="message-time">
                              {formatTime(message.createdAt)}
                              {isLastMessage && isMine && isSeen && ' · Vu'}
                            </span>
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
                      onFocus={handleInputFocus}
                      onClick={handleInputFocus}
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

        {/* Modal Créer Groupe */}
        {isCreateGroupOpen && (
            <div className="modal-overlay" role="dialog" aria-modal="true">
              <div className="modal-card">
                <header className="modal-header">
                  <h3>Nouveau groupe de discussion</h3>
                  <button type="button" className="modal-close" onClick={() => { setIsCreateGroupOpen(false); setMemberSearch('') }}>
                    ×
                  </button>
                </header>
                <form className="modal-body" onSubmit={handleCreateGroup}>
                  <label className="modal-label">
                    Nom du groupe
                    <input
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                        placeholder="Ex: Équipe design, Sprint 3…"
                        required
                    />
                  </label>

                  <div className="modal-members">
                    <p className="modal-subtitle">Ajouter des membres</p>

                    {/* Selected chips */}
                    {selectedMembers.length > 0 && (
                      <div className="member-chips">
                        {selectedMembers.map((id) => {
                          const m = channels.colleagues.find((c) => c.userId === id)
                          if (!m) return null
                          return (
                            <span key={id} className="member-chip">
                              {m.name}
                              <button
                                type="button"
                                className="member-chip-remove"
                                onClick={() => toggleMemberSelection(id)}
                                aria-label={`Retirer ${m.name}`}
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Search input */}
                    <div className="member-search-wrap">
                      <svg className="member-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.5" y1="16.5" x2="22" y2="22" />
                      </svg>
                      <input
                        type="text"
                        className="member-search-input"
                        placeholder="Rechercher un collaborateur…"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        autoComplete="off"
                      />
                      {memberSearch && (
                        <button type="button" className="member-search-clear" onClick={() => setMemberSearch('')}>×</button>
                      )}
                    </div>

                    {/* Results list */}
                    {memberSearch && (
                      <div className="member-results">
                        {channels.colleagues
                          .filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                          .map((m) => {
                            const selected = selectedMembers.includes(m.userId)
                            return (
                              <button
                                key={m.userId}
                                type="button"
                                className={`member-result-item ${selected ? 'selected' : ''}`}
                                onClick={() => { toggleMemberSelection(m.userId); setMemberSearch('') }}
                              >
                                <div className="member-result-avatar">
                                  {m.avatarUrl ? (
                                    <img src={`${API_URL}${m.avatarUrl}`} alt={m.name} className="member-result-img" />
                                  ) : (
                                    <ProfileIcon />
                                  )}
                                  <span className={`status-dot ${m.online ? 'online' : 'offline'}`} />
                                </div>
                                <div className="member-result-info">
                                  <span className="member-result-name">{m.name}</span>
                                  <span className={`member-result-status ${m.online ? 'member-online' : 'member-offline'}`}>
                                    {m.online ? 'En ligne' : 'Hors ligne'}
                                  </span>
                                </div>
                                {selected && (
                                  <svg className="member-result-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            )
                          })}
                        {channels.colleagues.filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                          <p className="member-results-empty">Aucun collaborateur trouvé.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={() => { setIsCreateGroupOpen(false); setMemberSearch('') }}>
                      Annuler
                    </button>
                    <button type="submit" className="btn-primary" disabled={isCreatingGroup || !groupName.trim() || selectedMembers.length === 0}>
                      {isCreatingGroup ? 'Création…' : `Créer (${selectedMembers.length})`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {confirmModal.isOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 1100 }}>
            <div className="modal-card" style={{ maxWidth: '420px' }}>
              <header className="modal-header">
                <h3>{confirmModal.title}</h3>
                <button type="button" className="modal-close" onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}>
                  ×
                </button>
              </header>
              <div className="modal-body" style={{ padding: '1rem 1.5rem 1.5rem' }}>
                <p style={{ margin: 0, fontWeight: 500, lineHeight: 1.5 }}>{confirmModal.message}</p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--chat-text-muted)', lineHeight: 1.5 }}>
                  {confirmModal.subMessage}
                </p>
                <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1, padding: '0.75rem 1rem' }}
                    onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      background: (confirmModal.type === 'delete' || confirmModal.type === 'removeMember')
                        ? '#ef4444'
                        : confirmModal.type === 'leave'
                          ? '#f97316'
                          : confirmModal.type === 'promoteMember'
                            ? '#3b82f6'
                            : '#f59e0b',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '999px',
                      cursor: 'pointer'
                    }}
                    onClick={handleConfirmAction}
                  >
                    {confirmModal.type === 'delete'
                      ? 'Supprimer'
                      : confirmModal.type === 'leave'
                        ? 'Quitter'
                        : confirmModal.type === 'removeMember'
                          ? 'Retirer'
                          : confirmModal.type === 'promoteMember'
                            ? 'Promouvoir'
                            : 'Effacer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isGroupMembersModalOpen && activeChannel && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card" style={{ maxWidth: '460px' }}>
              <header className="modal-header">
                <h3>Membres de la discussion</h3>
                <button type="button" className="modal-close" onClick={() => { setIsGroupMembersModalOpen(false); setAddMemberSearch(''); }}>
                  ×
                </button>
              </header>
              <div className="modal-body" style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Rename Group section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid var(--chat-sidebar-border)', paddingBottom: '1rem' }}>
                  <p className="modal-subtitle" style={{ fontWeight: 600, color: 'var(--chat-text-primary)' }}>Nom de la discussion</p>
                  {isEditingGroupName ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="member-search-input"
                        style={{ flex: 1, height: '38px' }}
                        value={editedGroupName}
                        onChange={(e) => setEditedGroupName(e.target.value)}
                        placeholder="Entrez le nom du groupe…"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveGroupName}
                        disabled={isSavingGroupName || !editedGroupName.trim()}
                        style={{ height: '38px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.85rem' }}
                      >
                        {isSavingGroupName ? 'Sauvegarde…' : 'Enregistrer'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setIsEditingGroupName(false); setEditedGroupName(activeChannel.name); }}
                        style={{ height: '38px', padding: '0 1rem', borderRadius: '6px', fontSize: '0.85rem' }}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--chat-input-bg)', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid var(--chat-input-border)' }}>
                      <span style={{ fontWeight: 500, color: 'var(--chat-text-primary)' }}>{activeChannel.name}</span>
                      <button
                        type="button"
                        onClick={() => setIsEditingGroupName(true)}
                        style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        Modifier
                      </button>
                    </div>
                  )}
                </div>

                {/* Search / Add section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p className="modal-subtitle" style={{ fontWeight: 600, color: 'var(--chat-text-primary)' }}>Ajouter un nouveau membre</p>
                  <div className="member-search-wrap">
                    <svg className="member-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.5" y1="16.5" x2="22" y2="22" />
                    </svg>
                    <input
                      type="text"
                      className="member-search-input"
                      placeholder="Rechercher un collaborateur à ajouter…"
                      value={addMemberSearch}
                      onChange={(e) => setAddMemberSearch(e.target.value)}
                      autoComplete="off"
                    />
                    {addMemberSearch && (
                      <button type="button" className="member-search-clear" onClick={() => setAddMemberSearch('')}>×</button>
                    )}
                  </div>

                  {/* Add Search Results */}
                  {addMemberSearch && (
                    <div className="member-results" style={{ marginTop: '0.25rem', border: '1px solid var(--chat-sidebar-border)' }}>
                      {addableColleagues
                        .filter((m) => m.name.toLowerCase().includes(addMemberSearch.toLowerCase()))
                        .map((m) => (
                          <button
                            key={m.userId}
                            type="button"
                            className="member-result-item"
                            onClick={() => handleAddMemberGroup(m.userId)}
                            disabled={isAddingMember}
                            style={{ width: '100%' }}
                          >
                            <div className="member-result-avatar">
                              {m.avatarUrl ? (
                                <img src={`${API_URL}${m.avatarUrl}`} alt={m.name} className="member-result-img" />
                              ) : (
                                <ProfileIcon />
                              )}
                              <span className={`status-dot ${m.online ? 'online' : 'offline'}`} />
                            </div>
                            <div className="member-result-info">
                              <span className="member-result-name">{m.name}</span>
                              <span className={`member-result-status ${m.online ? 'member-online' : 'member-offline'}`}>
                                {m.online ? 'En ligne' : 'Hors ligne'}
                              </span>
                            </div>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          </button>
                        ))}
                      {addableColleagues.filter((m) => m.name.toLowerCase().includes(addMemberSearch.toLowerCase())).length === 0 && (
                        <p className="member-results-empty">Aucun collaborateur à ajouter.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Members list section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <p className="modal-subtitle" style={{ fontWeight: 600, color: 'var(--chat-text-primary)' }}>Membres actuels ({currentGroupMembers.length})</p>
                  <div className="member-results" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    {currentGroupMembers.map((m) => (
                      <div
                        key={m.userId}
                        className="member-result-item"
                        style={{ cursor: 'default', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.5rem 0.75rem' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="member-result-avatar">
                            {m.avatarUrl ? (
                              <img src={`${API_URL}${m.avatarUrl}`} alt={m.name} className="member-result-img" />
                            ) : (
                              <ProfileIcon />
                            )}
                            <span className={`status-dot ${m.online ? 'online' : 'offline'}`} />
                          </div>
                          <div className="member-result-info">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span className="member-result-name" style={{ fontWeight: 500 }}>{m.name}</span>
                              {m.isCurrentUser && <span style={{ fontSize: '0.8rem', color: 'var(--chat-text-muted)', marginLeft: '0.25rem' }}>(Vous)</span>}
                              {m.isAdmin && <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '4px', marginLeft: '0.4rem', fontWeight: 600 }}>Admin</span>}
                            </div>
                            <span className={`member-result-status ${m.online ? 'member-online' : 'member-offline'}`}>
                              {m.online ? 'En ligne' : 'Hors ligne'}
                            </span>
                          </div>
                        </div>

                        {/* Admin actions */}
                        {isCurrentUserAdmin && !m.isCurrentUser && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {!m.isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleMakeAdminGroup(m.userId)}
                                style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #3b82f6', background: 'transparent', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                              >
                                Promouvoir
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberGroup(m.userId)}
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                            >
                              Retirer
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Close Button */}
                <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setIsGroupMembersModalOpen(false); setAddMemberSearch(''); }}
                    style={{ padding: '0.75rem 1.5rem' }}
                  >
                    Fermer
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>
  )
}