import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from './authApi'
import styles from './Auth.module.css'

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
  const navigate = useNavigate()
  const [values, setValues] = useState({ email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((err) => ({ ...err, [name]: undefined }))
    setFormError('')
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

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setFormError('')
    try {
      await register({ email: values.email, password: values.password })
      navigate('/login')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const score = passwordScore(values.password)

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img
          src="/norsys_afrique_logo.jpeg"
          alt="Norsys Afrique"
          className={styles.logo}
          width="360"
          height="120"
        />

        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.subtitle}>Start tracking your team&apos;s resources.</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <div className={styles.inputWrap}>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
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
                placeholder="At least 8 characters"
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                value={values.password}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
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
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                className={`${styles.input} ${errors.confirm ? styles.inputError : ''}`}
                value={values.confirm}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={!!errors.confirm}
              />
            </div>
            <span className={styles.fieldError}>{errors.confirm}</span>
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
