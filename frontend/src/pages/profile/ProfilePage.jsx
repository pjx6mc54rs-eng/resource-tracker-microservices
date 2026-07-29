import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import API_URL from '../../config/api'
import { updateMe, uploadAvatar, deleteAvatar } from '../auth/authApi'
import ProfileIcon from '../../components/ProfileIcon'
import './ProfilePage.css'

const EDITABLE_FIELDS = ['firstName', 'lastName', 'phone', 'jobTitle', 'bio']
const AVATAR_MAX_SIZE = 5 * 1024 * 1024
const AVATAR_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ProfilePage() {
  const { user, token, updateUser } = useAuth()
  const { showToast } = useToast()

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const fileInputRef = useRef(null)

  if (!user) {
    return <div className="profile-page"><p>Loading profile...</p></div>
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  const startEditing = () => {
    setForm(Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, user[f] ?? ''])))
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleAvatarSelect = async (e) => {
    const file = e.target.files?.[0]
    // Réinitialise l'input pour pouvoir re-sélectionner le même fichier
    e.target.value = ''
    if (!file) return

    if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
      showToast('Only PNG, JPEG, WebP or GIF images are allowed.', 'error')
      return
    }
    if (file.size > AVATAR_MAX_SIZE) {
      showToast('Image must be smaller than 5 MB.', 'error')
      return
    }

    setAvatarBusy(true)
    try {
      const updated = await uploadAvatar(token, file)
      updateUser(updated)
      showToast('Profile photo updated.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleAvatarRemove = async () => {
    setConfirmRemoveOpen(false)
    setAvatarBusy(true)
    try {
      const updated = await deleteAvatar(token)
      updateUser(updated)
      showToast('Profile photo removed.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // N'envoie que les champs modifiés pour rester compatible avec le PATCH partiel
      const changes = Object.fromEntries(
        EDITABLE_FIELDS
          .filter((f) => form[f].trim() !== (user[f] ?? ''))
          .map((f) => [f, form[f].trim()])
      )

      if (Object.keys(changes).length === 0) {
        setIsEditing(false)
        showToast('No changes to save.', 'info')
        return
      }

      const updated = await updateMe(token, changes)
      updateUser(updated)
      setIsEditing(false)
      showToast('Profile updated successfully.', 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="profile-page">
      <h1>My Profile</h1>

      <div className="profile-header-card">
        <div className="profile-avatar-block">
          {user.avatarUrl ? (
            <img
              src={`${API_URL}${user.avatarUrl}`}
              alt="Avatar"
              className="profile-avatar"
            />
          ) : (
            <div className="profile-avatar profile-avatar-placeholder">
              <ProfileIcon size="64px" />
            </div>
          )}
          <div className="profile-avatar-actions">
            <button
              type="button"
              className="avatar-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
            >
              {avatarBusy ? 'Uploading...' : user.avatarUrl ? 'Change Photo' : 'Add Photo'}
            </button>
            {user.avatarUrl && (
              <button
                type="button"
                className="avatar-action-btn avatar-action-danger"
                onClick={() => setConfirmRemoveOpen(true)}
                disabled={avatarBusy}
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_ACCEPTED_TYPES.join(',')}
            onChange={handleAvatarSelect}
            hidden
          />
        </div>
        <div className="profile-header-info">
          <h2>{fullName || user.email}</h2>
          {user.jobTitle && <p className="profile-job-title">{user.jobTitle}</p>}
          <span className={`role-badge role-${user.role}`}>{user.role}</span>
        </div>
        {!isEditing && (
          <button className="btn btn-primary profile-edit-btn" onClick={startEditing}>
            Edit Profile
          </button>
        )}
      </div>

      {isEditing ? (
        <form className="profile-card" onSubmit={handleSubmit}>
          <h3>Edit Information</h3>
          <div className="profile-form-grid">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                maxLength={100}
                value={form.firstName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                maxLength={100}
                value={form.lastName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="jobTitle">Job Title</label>
              <input
                id="jobTitle"
                name="jobTitle"
                type="text"
                maxLength={100}
                value={form.jobTitle}
                onChange={handleChange}
              />
            </div>
            <div className="form-group profile-form-full">
              <label htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                name="bio"
                rows={4}
                maxLength={500}
                value={form.bio}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className="profile-form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={cancelEditing} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="profile-grid">
          <div className="profile-card">
            <h3>Contact Information</h3>
            <dl className="profile-details">
              <div className="profile-detail-row">
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Phone</dt>
                <dd>{user.phone || '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="profile-card">
            <h3>Work</h3>
            <dl className="profile-details">
              <div className="profile-detail-row">
                <dt>Job Title</dt>
                <dd>{user.jobTitle || '—'}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
            </dl>
          </div>

          <div className="profile-card profile-card-full">
            <h3>Bio</h3>
            <p className="profile-bio">{user.bio || 'No bio provided yet.'}</p>
          </div>

          <div className="profile-card profile-card-full">
            <h3>Account</h3>
            <dl className="profile-details">
              <div className="profile-detail-row">
                <dt>Member since</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div className="profile-detail-row">
                <dt>Last updated</dt>
                <dd>{formatDate(user.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {confirmRemoveOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmRemoveOpen(false)}
        >
          <div
            className="modal-content confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Remove Photo</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirmRemoveOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="confirm-modal-body">
              <p className="confirm-message">Remove your profile photo?</p>
              <p className="confirm-submessage">
                Your photo will be deleted and replaced by the default icon.
              </p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmRemoveOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleAvatarRemove}
                >
                  Remove Photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
