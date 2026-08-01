import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import API_URL from '../../config/api'
import ProfileIcon from '../../components/ProfileIcon'
import EyeOpen from '../../components/EyeOpen'
import EyeClosed from '../../components/EyeClosed'
import './UsersList.css'

async function request(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    console.error('[usersApi] fetch error:', err)
    throw new Error('Unable to reach the server. Please try again.')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // response had no JSON body
  }

  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : (data?.message ?? `Request failed (${res.status})`)
    throw new Error(message)
  }

  return data
}

function getUsers(token) {
  return request('/api/auth/users', { token })
}

function adminUpdateUser(userId, userData, token) {
  return request(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    body: userData,
    token,
  })
}

async function adminUploadAvatar(userId, file, token) {
  const formData = new FormData()
  formData.append('avatar', file)

  const res = await fetch(`${API_URL}/api/auth/users/${userId}/avatar`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  let data = null
  try { data = await res.json() } catch {}

  if (!res.ok) {
    throw new Error(data?.message ?? 'Failed to upload photo')
  }

  return data
}

function adminDeleteAvatar(userId, token) {
  return request(`/api/auth/users/${userId}/avatar`, {
    method: 'DELETE',
    token,
  })
}

function getUserDisplayName(u) {
  if (!u) return ''
  const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim()
  return fullName || u.email
}

export default function UsersList() {
  const { token, user: currentUser } = useAuth()
  const { showToast } = useToast()
  const isAdmin = currentUser?.roles?.includes('admin') || currentUser?.role === 'admin'

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Edit Modal State
  const [editingUser, setEditingUser] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    jobTitle: '',
    bio: '',
    roles: [],
    responsableIds: [],
    newPassword: '',
  })
  const [saving, setSaving] = useState(false)

  // Filter & pagination state
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 8

  useEffect(() => {
    fetchUsersList()
  }, [token])

  const fetchUsersList = async () => {
    setLoading(true)
    try {
      const data = await getUsers(token)
      setUsers(Array.isArray(data) ? data : [])
    } catch (err) {
      showToast(err.message || 'Failed to load users directory.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenEditModal = (u) => {
    setEditingUser(u)
    setShowPassword(false)
    const initialRoles = Array.isArray(u.roles) && u.roles.length > 0
      ? u.roles
      : [u.role || 'collaborateur']
    const initialResponsableIds = Array.isArray(u.responsableIds) ? u.responsableIds : []

    setFormData({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      phone: u.phone || '',
      jobTitle: u.jobTitle || '',
      bio: u.bio || '',
      roles: initialRoles,
      responsableIds: initialResponsableIds,
      newPassword: '',
    })
  }

  const handleCloseModal = () => {
    setEditingUser(null)
  }

  const handleRoleToggle = (roleValue) => {
    setFormData((prev) => {
      const current = prev.roles
      if (current.includes(roleValue)) {
        if (current.length === 1) return prev
        return { ...prev, roles: current.filter((r) => r !== roleValue) }
      } else {
        return { ...prev, roles: [...current, roleValue] }
      }
    })
  }

  const handleResponsableToggle = (responsableId) => {
    setFormData((prev) => {
      const current = prev.responsableIds || []
      if (current.includes(responsableId)) {
        return { ...prev, responsableIds: current.filter((id) => id !== responsableId) }
      } else {
        return { ...prev, responsableIds: [...current, responsableId] }
      }
    })
  }

  const handleSaveUser = async (e) => {
    e.preventDefault()
    if (!editingUser) return

    const isWorker = formData.roles.includes('collaborateur') || formData.roles.includes('responsable')
    if (isWorker && (!formData.responsableIds || formData.responsableIds.length === 0)) {
      showToast('Chaque collaborateur ou responsable doit avoir au moins un responsable désigné.', 'error')
      return
    }

    if (formData.newPassword && formData.newPassword.trim().length > 0 && formData.newPassword.trim().length < 6) {
      showToast('Le mot de passe doit contenir au moins 6 caractères.', 'error')
      return
    }

    setSaving(true)

    try {
      const updated = await adminUpdateUser(editingUser.id, formData, token)
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? updated : u)))
      showToast(`User ${getUserDisplayName(updated)} updated successfully!`, 'success')
      setEditingUser(null)
    } catch (err) {
      showToast(err.message || 'Failed to save user changes.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editingUser) return
    setSaving(true)

    try {
      const updated = await adminUploadAvatar(editingUser.id, file, token)
      setEditingUser(updated)
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? updated : u)))
      showToast(`Profile photo updated for ${getUserDisplayName(updated)}`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to upload photo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!editingUser) return
    setSaving(true)

    try {
      const updated = await adminDeleteAvatar(editingUser.id, token)
      setEditingUser(updated)
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? updated : u)))
      showToast(`Profile photo removed for ${getUserDisplayName(updated)}`, 'info')
    } catch (err) {
      showToast(err.message || 'Failed to remove photo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Client-side Anti-Mutual Responsibility Check
  const isUserManagedBy = (managerUser, targetUserId, visited = new Set()) => {
    if (!managerUser || visited.has(managerUser.id)) return false
    visited.add(managerUser.id)
    const mIds = Array.isArray(managerUser.responsableIds) ? managerUser.responsableIds : []
    if (mIds.includes(targetUserId)) return true
    for (const pId of mIds) {
      const parent = users.find((u) => u.id === pId)
      if (parent && isUserManagedBy(parent, targetUserId, visited)) return true
    }
    return false
  }

  if (loading) {
    return <div className="users-page"><p>Loading users...</p></div>
  }

  // Filter potential managers: Users with 'responsable' or 'admin' role
  const potentialManagers = editingUser
    ? users.filter((u) => {
        if (u.id === editingUser.id) return false
        const rList = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role || 'collaborateur']
        return rList.includes('responsable') || rList.includes('admin')
      })
    : []

  // ── Filtering ──────────────────────────────────────────────
  const filteredUsers = users.filter((u) => {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase()
    const email = (u.email || '').toLowerCase()
    const job = (u.jobTitle || '').toLowerCase()
    const q = search.toLowerCase()
    const matchesSearch = !q || name.includes(q) || email.includes(q) || job.includes(q)

    const userRoles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role || 'collaborateur']
    const matchesRole = roleFilter === 'all' || userRoles.includes(roleFilter)

    return matchesSearch && matchesRole
  })

  // ── Pagination ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleSearchChange = (e) => {
    setSearch(e.target.value)
    setCurrentPage(1)
  }

  const handleRoleFilter = (role) => {
    setRoleFilter(role)
    setCurrentPage(1)
  }

  return (
    <div className="users-page">
      <div className="users-header-row">
        <div>
          <h1>User Space & Management</h1>
          <p className="users-subtitle">
            {isAdmin
              ? 'Manage user profile details, profile photos, passwords, multi-role assignments, and designated Responsables.'
              : 'Directory of registered system users.'}
          </p>
        </div>
      </div>

      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <>
          {/* ── Filter Bar ── */}
          <div className="users-filter-bar">
            <div className="users-search-wrap">
              <svg className="users-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="users-search-input"
                placeholder="Search by name, email or job title…"
                value={search}
                onChange={handleSearchChange}
              />
              {search && (
                <button className="users-search-clear" onClick={() => { setSearch(''); setCurrentPage(1) }} aria-label="Clear search">✕</button>
              )}
            </div>
            <div className="users-role-filters">
              {['all', 'collaborateur', 'responsable', 'admin'].map((role) => (
                <button
                  key={role}
                  className={`role-filter-pill ${roleFilter === role ? 'active' : ''} ${role !== 'all' ? `pill-${role}` : ''}`}
                  onClick={() => handleRoleFilter(role)}
                >
                  {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Results summary ── */}
          <div className="users-results-meta">
            {filteredUsers.length === 0
              ? 'No users match your filters.'
              : `Showing ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredUsers.length)} of ${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''}`}
          </div>

          {filteredUsers.length === 0 ? (
            <div className="users-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>No users match your current filters.</p>
              <button className="users-clear-filters-btn" onClick={() => { setSearch(''); setRoleFilter('all'); setCurrentPage(1) }}>
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* ── Desktop Table ── */}
              <div className="users-table-wrapper">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Job Title</th>
                      <th>Assigned Roles</th>
                      <th>Designated Responsables</th>
                      {isAdmin && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.map((u) => {
                      const displayName =
                        u.firstName || u.lastName
                          ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
                          : 'Unnamed User'

                      const userRolesList = Array.isArray(u.roles) && u.roles.length > 0
                        ? u.roles
                        : [u.role || 'collaborateur']

                      const userResponsables = Array.isArray(u.responsableIds) && u.responsableIds.length > 0
                        ? u.responsableIds.map((rId) => {
                            const found = users.find((x) => x.id === rId)
                            return found ? getUserDisplayName(found) : null
                          }).filter(Boolean)
                        : []

                      return (
                        <tr key={u.id}>
                          <td>
                            <div className="user-info-cell">
                              {u.avatarUrl ? (
                                <img
                                  src={`${API_URL}${u.avatarUrl}`}
                                  alt="Avatar"
                                  className="user-avatar-small-img"
                                />
                              ) : (
                                <div className="user-avatar-small">
                                  {u.firstName ? u.firstName[0].toUpperCase() : u.email[0].toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="user-name">{displayName}</div>
                                {u.phone && <div className="user-phone">{u.phone}</div>}
                              </div>
                            </div>
                          </td>
                          <td>{u.email}</td>
                          <td>{u.jobTitle || '-'}</td>
                          <td>
                            <div className="roles-badges-wrapper">
                              {userRolesList.map((r) => (
                                <span key={r} className={`role-badge role-${r}`}>
                                  {r.toUpperCase()}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            {userResponsables.length > 0 ? (
                              <div className="responsables-chips-wrapper">
                                {userResponsables.map((name, idx) => (
                                  <span key={idx} className="responsable-chip">
                                    👤 {name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="no-responsable-text">-</span>
                            )}
                          </td>
                          {isAdmin && (
                            <td>
                              <span className="edit-btn-tooltip-wrapper" data-tooltip="Edit User">
                                <button
                                  type="button"
                                  className="btn-edit-user"
                                  aria-label="Edit User"
                                  onClick={() => handleOpenEditModal(u)}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                              </span>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile Cards (hidden on desktop via CSS) ── */}
              <div className="users-mobile-cards">
                {pagedUsers.map((u) => {
                  const displayName =
                    u.firstName || u.lastName
                      ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
                      : 'Unnamed User'

                  const userRolesList = Array.isArray(u.roles) && u.roles.length > 0
                    ? u.roles
                    : [u.role || 'collaborateur']

                  const userResponsables = Array.isArray(u.responsableIds) && u.responsableIds.length > 0
                    ? u.responsableIds.map((rId) => {
                        const found = users.find((x) => x.id === rId)
                        return found ? getUserDisplayName(found) : null
                      }).filter(Boolean)
                    : []

                  return (
                    <div key={u.id} className="user-mobile-card">
                      <div className="user-mobile-card-header">
                        {u.avatarUrl ? (
                          <img src={`${API_URL}${u.avatarUrl}`} alt="Avatar" className="user-avatar-small-img" />
                        ) : (
                          <div className="user-avatar-small">
                            {u.firstName ? u.firstName[0].toUpperCase() : u.email[0].toUpperCase()}
                          </div>
                        )}
                        <div className="user-mobile-card-info">
                          <div className="user-name">{displayName}</div>
                          <div className="user-mobile-card-email">{u.email}</div>
                        </div>
                        {isAdmin && (
                          <div className="user-mobile-card-action">
                            <button
                              type="button"
                              className="btn-edit-user"
                              aria-label="Edit User"
                              onClick={() => handleOpenEditModal(u)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="user-mobile-card-body">
                        {u.jobTitle && (
                          <div className="user-mobile-detail-row">
                            <span className="user-mobile-detail-label">Job</span>
                            <span className="user-mobile-detail-value">{u.jobTitle}</span>
                          </div>
                        )}
                        {u.phone && (
                          <div className="user-mobile-detail-row">
                            <span className="user-mobile-detail-label">Phone</span>
                            <span className="user-mobile-detail-value">{u.phone}</span>
                          </div>
                        )}
                        <div className="user-mobile-detail-row">
                          <span className="user-mobile-detail-label">Roles</span>
                          <span className="user-mobile-detail-value">
                            {userRolesList.map((r) => (
                              <span key={r} className={`role-badge role-${r}`}>{r.toUpperCase()}</span>
                            ))}
                          </span>
                        </div>
                        {userResponsables.length > 0 && (
                          <div className="user-mobile-detail-row">
                            <span className="user-mobile-detail-label">Managers</span>
                            <span className="user-mobile-detail-value">
                              {userResponsables.map((name, idx) => (
                                <span key={idx} className="responsable-chip">👤 {name}</span>
                              ))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ── Paginator ── */}
              {totalPages > 1 && (
                <div className="users-paginator">
                  <button
                    className="paginator-btn paginator-prev"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    aria-label="Previous page"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>

                  <div className="paginator-pages">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first, last, current ±1, and ellipsis in between
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - safePage) <= 1

                      if (!showPage) {
                        // Render a single ellipsis per gap
                        const prevShown =
                          page - 1 === 1 ||
                          page - 1 === totalPages ||
                          Math.abs((page - 1) - safePage) <= 1
                        if (!prevShown) return null
                        return <span key={`ellipsis-${page}`} className="paginator-ellipsis">…</span>
                      }

                      return (
                        <button
                          key={page}
                          className={`paginator-page-btn ${page === safePage ? 'active' : ''}`}
                          onClick={() => setCurrentPage(page)}
                          aria-label={`Page ${page}`}
                          aria-current={page === safePage ? 'page' : undefined}
                        >
                          {page}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    className="paginator-btn paginator-next"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    aria-label="Next page"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Edit User Modal */}
      {editingUser && (

        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header-premium">
              <div className="header-title-container">
                <div className="header-avatar-badge">
                  {editingUser.avatarUrl ? (
                    <img src={`${API_URL}${editingUser.avatarUrl}`} alt="Avatar" />
                  ) : (
                    <span>{editingUser.firstName ? editingUser.firstName[0].toUpperCase() : editingUser.email[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <h2>Edit User: {getUserDisplayName(editingUser)}</h2>
                  <span className="user-email-subtitle">{editingUser.email}</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={handleCloseModal} aria-label="Close modal">✕</button>
            </div>

            <form onSubmit={handleSaveUser} className="modal-form">
              <div className="modal-body modal-grid-2col">
                {/* Left Column: Avatar, Personal Info & Password Reset */}
                <div className="modal-col-left">
                  {/* Photo Control Banner */}
                  <div className="photo-banner-card">
                    <div className="photo-banner-preview">
                      {editingUser.avatarUrl ? (
                        <img src={`${API_URL}${editingUser.avatarUrl}`} alt="User Avatar" />
                      ) : (
                        <ProfileIcon size="54px" />
                      )}
                    </div>
                    <div className="photo-banner-info">
                      <span className="photo-banner-title">Profile Avatar</span>
                      <span className="photo-banner-desc">PNG, JPG or WEBP. Max 5MB.</span>
                    </div>
                    <div className="photo-banner-actions">
                      <label className="btn-upload-avatar">
                        📷 Photo
                        <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
                      </label>
                      {editingUser.avatarUrl && (
                        <button type="button" className="btn-remove-avatar" onClick={handleRemoveAvatar}>
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-section-title">Personal Information</div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>First Name</label>
                      <input
                        type="text"
                        placeholder="First name"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Last Name</label>
                      <input
                        type="text"
                        placeholder="Last name"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        type="text"
                        placeholder="+33 6 12 34 56 78"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Job Title</label>
                      <input
                        type="text"
                        placeholder="Job Title"
                        value={formData.jobTitle}
                        onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Bio</label>
                    <textarea
                      rows="2"
                      placeholder="Brief user bio..."
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    />
                  </div>

                  {/* Password Reset Section */}
                  <div className="form-section-title">Security & Password</div>
                  <div className="form-group">
                    <label>Reset Password</label>
                    <div className="password-input-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter new password (optional)"
                        value={formData.newPassword}
                        onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      />
                      <div className="password-toggle-btn">
                        {!showPassword ? (
                          <EyeOpen size="20px" handleClick={() => setShowPassword(true)} />
                        ) : (
                          <EyeClosed size="20px" handleClick={() => setShowPassword(false)} />
                        )}
                      </div>
                    </div>
                    <span className="field-hint">Leave blank to keep current password. Minimum 6 characters.</span>
                  </div>
                </div>

                {/* Right Column: Roles & Designated Responsables */}
                <div className="modal-col-right">
                  {/* Multi-Roles Selection Section */}
                  <div className="form-section-title">Roles & Access Level</div>
                  <div className="roles-cards-grid">
                    <div
                      className={`role-toggle-card ${formData.roles.includes('collaborateur') ? 'active-collaborateur' : ''}`}
                      onClick={() => handleRoleToggle('collaborateur')}
                    >
                      <div className="role-toggle-header">
                        <span className="role-icon">👥</span>
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('collaborateur')}
                          onChange={() => {}}
                        />
                      </div>
                      <span className="role-toggle-title">COLLABORATEUR</span>
                      <span className="role-toggle-desc">Standard member access</span>
                    </div>

                    <div
                      className={`role-toggle-card ${formData.roles.includes('responsable') ? 'active-responsable' : ''}`}
                      onClick={() => handleRoleToggle('responsable')}
                    >
                      <div className="role-toggle-header">
                        <span className="role-icon">💼</span>
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('responsable')}
                          onChange={() => {}}
                        />
                      </div>
                      <span className="role-toggle-title">RESPONSABLE</span>
                      <span className="role-toggle-desc">Team lead / Manager</span>
                    </div>

                    <div
                      className={`role-toggle-card ${formData.roles.includes('admin') ? 'active-admin' : ''}`}
                      onClick={() => handleRoleToggle('admin')}
                    >
                      <div className="role-toggle-header">
                        <span className="role-icon">👑</span>
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('admin')}
                          onChange={() => {}}
                        />
                      </div>
                      <span className="role-toggle-title">ADMIN</span>
                      <span className="role-toggle-desc">Full administration</span>
                    </div>
                  </div>

                  {/* Designated Responsables Section */}
                  <div className="form-section-title flex-between mt-3">
                    <span>Designated Responsables / Managers</span>
                    {(formData.roles.includes('collaborateur') || formData.roles.includes('responsable')) && (
                      <span className="badge-required">At least 1 required</span>
                    )}
                  </div>
                  <p className="field-hint mb-1">
                    Select one or more managers. Mutual responsibility is forbidden.
                  </p>

                  {potentialManagers.length === 0 ? (
                    <div className="no-managers-card">No eligible Responsables or Admins available.</div>
                  ) : (
                    <div className="managers-cards-grid">
                      {potentialManagers.map((mgr) => {
                        const isMutual = isUserManagedBy(mgr, editingUser.id)
                        const isChecked = formData.responsableIds.includes(mgr.id)

                        return (
                          <div
                            key={mgr.id}
                            className={`manager-card ${isChecked ? 'selected' : ''} ${isMutual ? 'disabled' : ''}`}
                            onClick={() => {
                              if (!isMutual) handleResponsableToggle(mgr.id)
                            }}
                          >
                            <div className="manager-card-left">
                              <div className="manager-avatar">
                                {mgr.avatarUrl ? (
                                  <img src={`${API_URL}${mgr.avatarUrl}`} alt="Avatar" />
                                ) : (
                                  <span>{mgr.firstName ? mgr.firstName[0].toUpperCase() : mgr.email[0].toUpperCase()}</span>
                                )}
                              </div>
                              <div className="manager-details">
                                <span className="manager-name">{getUserDisplayName(mgr)}</span>
                                <span className="manager-email">{mgr.email}</span>
                                {isMutual && (
                                  <span className="mutual-warning-pill">
                                    ⚠️ Mutual responsibility forbidden
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="manager-card-right">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isMutual}
                                onChange={() => {}}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={handleCloseModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn-save" disabled={saving}>
                  {saving ? 'Saving...' : '✓ Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
