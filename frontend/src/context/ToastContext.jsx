import { createContext, useContext, useState, useCallback } from 'react'
import '../components/Toast.css'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type }])

    setTimeout(() => {
      removeToast(id)
    }, duration)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-card toast-${toast.type}`}
            role={toast.onClick ? 'button' : undefined}
            tabIndex={toast.onClick ? 0 : undefined}
            onClick={() => toast.onClick?.()}
            style={{ cursor: toast.onClick ? 'pointer' : 'default' }}
          >
            <div className="toast-icon-wrapper">
              <span className="toast-icon">
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✗'}
                {toast.type === 'info' && 'ℹ'}
                {toast.type === 'warning' && '⚠'}
              </span>
            </div>
            <div className="toast-content">
              <span className="toast-message">{toast.message}</span>
            </div>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              &times;
            </button>
            <div className="toast-progress-bar" style={{ animationDuration: '4000ms' }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
