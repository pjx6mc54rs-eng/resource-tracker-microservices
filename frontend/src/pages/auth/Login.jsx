import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from './Auth.module.css'
import EyeOpen from "../../components/EyeOpen.jsx";
import EyeClosed from "../../components/EyeClosed.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Login() {
  const { login } = useAuth()
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
      await login(values.email.trim(), values.password)
      navigate('/dashboard')
    } catch (err) {
      setFormError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img
            src="/norsys_afrique_logo.png"
            alt="Norsys"
            className={`${styles.logo} ${styles.logoLight}`}
          />
          <img
            src="/norsys_afrique_logo_dark.png"
            alt="Norsys"
            className={`${styles.logo} ${styles.logoDark}`}
          />
          <div className={styles.headerText}>
            <h1 className={styles.title}>Welcome  back back</h1>
            <p className={styles.subtitle}>Sign in to your account to continue.</p>
          </div>
        </div>

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
                className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                value={values.password}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={!!errors.password}
              />
              <div className={styles.reveal}>
                {!showPassword ? <EyeOpen size="25px" handleClick={() => setShowPassword(true)}/> :
                    <EyeClosed size="25px" handleClick={() => setShowPassword(false)}/> }
              </div>

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
          Don&apos;t have an account ?{' '}
          <Link className={styles.link} to="/signup">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Login
