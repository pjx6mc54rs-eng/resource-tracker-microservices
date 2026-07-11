import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from './authApi'
import styles from './Auth.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Login() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ email: '', password: '' })
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
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setFormError('')
    try {
      const data = await login(values)
      if (data?.access_token) {
        localStorage.setItem('access_token', data.access_token)
      }
      navigate('/')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

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

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to your account to continue.</p>

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
                autoComplete="current-password"
                placeholder="Enter your password"
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
            <span className={styles.fieldError}>{errors.password}</span>
          </div>

          <div className={styles.row}>
            <label className={styles.checkbox}>
              <input type="checkbox" name="remember" />
              Remember me
            </label>
            <Link className={styles.link} to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link className={styles.link} to="/signup">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
