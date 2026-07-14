import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Auth.module.css'
import EyeOpen from '../../components/EyeOpen.jsx'
import EyeClosed from '../../components/EyeClosed.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordScore(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}

function SignUp() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({
    email: '',
    password: '',
    confirm: '',
    role: 'collaborateur',
    firstName: '',
    lastName: '',
    phone: '',
    jobTitle: '',
  })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((err) => ({ ...err, [name]: undefined }))
    setFormError('')
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors((err) => ({ ...err, avatar: 'L\'avatar doit être un fichier image.' }))
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrors((err) => ({ ...err, avatar: 'L\'image doit faire moins de 5 Mo.' }))
        return
      }
      setAvatarFile(file)
      setErrors((err) => ({ ...err, avatar: undefined }))

      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const validate = () => {
    const next = {}
    if (!values.email) next.email = 'Email is required.'
    else if (!EMAIL_RE.test(values.email)) next.email = 'Enter a valid email address.'

    if (!values.password) next.password = 'Password is required.'
    else if (values.password.length < 8)
      next.password = 'Password must be at least 8 characters.'

    if (!values.confirm) next.confirm = 'Please confirm your password.'
    else if (values.confirm !== values.password)
      next.confirm = 'Passwords do not match.'

    if (values.firstName && values.firstName.length > 100)
      next.firstName = 'First name must be under 100 characters.'

    if (values.lastName && values.lastName.length > 100)
      next.lastName = 'Last name must be under 100 characters.'

    if (values.phone && values.phone.length > 30)
      next.phone = 'Phone number must be under 30 characters.'

    if (values.jobTitle && values.jobTitle.length > 100)
      next.jobTitle = 'Job title must be under 100 characters.'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setFormError('')

    const formData = new FormData()
    formData.append('email', values.email)
    formData.append('password', values.password)
    formData.append('role', values.role)
    formData.append('firstName', values.firstName)
    formData.append('lastName', values.lastName)
    formData.append('phone', values.phone)
    formData.append('jobTitle', values.jobTitle)
    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }

    try {
      await register(formData)
      navigate('/dashboard')
    } catch (err) {
      setFormError(err.message)
      setSubmitting(false)
    }
  }

  const score = passwordScore(values.password)

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img
            src="/norsys_afrique_logo.png"
            alt="Norsys Afrique"
            className={`${styles.logo} ${styles.logoLight}`}
          />
          <img
            src="/norsys_afrique_logo_dark.png"
            alt="Norsys Afrique"
            className={`${styles.logo} ${styles.logoDark}`}
          />
          <div className={styles.headerText}>
            <h1 className={styles.title}>Create your account</h1>
            <p className={styles.subtitle}>Start tracking your team&apos;s resources.</p>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="firstName">
                Prénom (First name)
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  className={`${styles.input} ${errors.firstName ? styles.inputError : ''}`}
                  value={values.firstName}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.firstName}
                />
              </div>
              <span className={styles.fieldError}>{errors.firstName}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="lastName">
                Nom (Last name)
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  className={`${styles.input} ${errors.lastName ? styles.inputError : ''}`}
                  value={values.lastName}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.lastName}
                />
              </div>
              <span className={styles.fieldError}>{errors.lastName}</span>
            </div>

            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label className={styles.label} htmlFor="email">
                Email
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                  value={values.email}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.email}
                />
              </div>
              <span className={styles.fieldError}>{errors.email}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="password">
                Password
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                  value={values.password}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.password}
                />
                <div className={styles.reveal}>
                  {!showPassword
                    ? <EyeOpen size="25px" handleClick={() => setShowPassword(true)} />
                    : <EyeClosed size="25px" handleClick={() => setShowPassword(false)} />}
                </div>
              </div>
              {values.password && (
                <div className={styles.strength} aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`${styles.strengthBar} ${i < score ? styles.strengthOn : ''}`}
                    />
                  ))}
                </div>
              )}
              <span className={styles.fieldError}>{errors.password}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm">
                Confirm password
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="confirm"
                  name="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`${styles.input} ${errors.confirm ? styles.inputError : ''}`}
                  value={values.confirm}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.confirm}
                />
                <div className={styles.reveal}>
                  {!showConfirm
                    ? <EyeOpen size="25px" handleClick={() => setShowConfirm(true)} />
                    : <EyeClosed size="25px" handleClick={() => setShowConfirm(false)} />}
                </div>
              </div>
              <span className={styles.fieldError}>{errors.confirm}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="phone">
                Téléphone (Phone)
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className={`${styles.input} ${errors.phone ? styles.inputError : ''}`}
                  value={values.phone}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.phone}
                />
              </div>
              <span className={styles.fieldError}>{errors.phone}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="jobTitle">
                Poste (Job title)
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="jobTitle"
                  name="jobTitle"
                  type="text"
                  className={`${styles.input} ${errors.jobTitle ? styles.inputError : ''}`}
                  value={values.jobTitle}
                  onChange={handleChange}
                  disabled={submitting}
                  aria-invalid={!!errors.jobTitle}
                />
              </div>
              <span className={styles.fieldError}>{errors.jobTitle}</span>
            </div>

            <div className={`${styles.field} ${styles.fullWidth}`}>
              <label className={styles.label} htmlFor="avatar">
                Photo de profil (Profile picture)
              </label>
              <div className={styles.inputWrap}>
                <label htmlFor="avatar" className={styles.fileInputLabel}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>{avatarFile ? 'Changer de photo' : 'Choisir une photo...'}</span>
                </label>
                <input
                  id="avatar"
                  name="avatar"
                  type="file"
                  accept="image/*"
                  className={styles.fileInput}
                  onChange={handleFileChange}
                  disabled={submitting}
                />
              </div>
              {errors.avatar && <span className={styles.fieldError}>{errors.avatar}</span>}
              {avatarFile && (
                <div className={styles.fileInfo}>
                  {avatarPreview && (
                    <img
                      src={avatarPreview}
                      alt="Avatar Preview"
                      className={styles.avatarPreview}
                    />
                  )}
                  <span>{avatarFile.name} ({(avatarFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>
          </div>

          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account?{' '}
          <Link className={styles.link} to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default SignUp
