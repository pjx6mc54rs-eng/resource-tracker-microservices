import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { changePassword } from '../auth/authApi'
import EyeOpen from '../../components/EyeOpen.jsx'
import EyeClosed from '../../components/EyeClosed.jsx'
import './ProfilePage.css'
import './ChangePassword.css'

const MIN_PASSWORD_LENGTH = 8

const FIELDS = [
  { name: 'currentPassword', label: 'Current Password', autoComplete: 'current-password' },
  { name: 'newPassword', label: 'New Password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm New Password', autoComplete: 'new-password' },
]

export default function ChangePassword() {
  const { token } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [visible, setVisible] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((err) => ({ ...err, [name]: undefined }))
  }

  const toggleVisible = (name) => {
    setVisible((v) => ({ ...v, [name]: !v[name] }))
  }

  const validate = () => {
    const next = {}
    if (!values.currentPassword) {
      next.currentPassword = 'Current password is required.'
    }
    if (!values.newPassword) {
      next.newPassword = 'New password is required.'
    } else if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    } else if (values.newPassword === values.currentPassword) {
      next.newPassword = 'New password must be different from the current one.'
    }
    if (!values.confirmPassword) {
      next.confirmPassword = 'Please confirm your new password.'
    } else if (values.confirmPassword !== values.newPassword) {
      next.confirmPassword = 'Passwords do not match.'
    }
    return next
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nextErrors = validate()
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSubmitting(true)
    try {
      await changePassword(token, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      showToast('Password updated successfully.', 'success')
      navigate('/profile')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="profile-page change-password-page">
      <h1>Change Password</h1>

      <form className="profile-card" onSubmit={handleSubmit}>
        <h3>Update your password</h3>
        <p className="change-password-hint">
          Choose a new password of at least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {FIELDS.map(({ name, label, autoComplete }) => (
          <div className="form-group change-password-group" key={name}>
            <label htmlFor={name}>{label}</label>
            <div className="password-input-wrapper">
              <input
                id={name}
                name={name}
                type={visible[name] ? 'text' : 'password'}
                autoComplete={autoComplete}
                value={values[name]}
                onChange={handleChange}
                aria-invalid={!!errors[name]}
              />
              <div className="password-reveal">
                {!visible[name] ? (
                  <EyeOpen size="22px" handleClick={() => toggleVisible(name)} />
                ) : (
                  <EyeClosed size="22px" handleClick={() => toggleVisible(name)} />
                )}
              </div>
            </div>
            {errors[name] && <span className="field-error">{errors[name]}</span>}
          </div>
        ))}

        <div className="profile-form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/profile')}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
