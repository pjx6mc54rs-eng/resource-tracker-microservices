import { createContext, useReducer, useCallback, useContext, useEffect } from 'react'

const AuthContext = createContext()
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004'

const tokenFromStorage = localStorage.getItem('access_token')

const initialState = {
  user: null,
  token: tokenFromStorage || null,
  loading: !!tokenFromStorage,
  error: null,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null }
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      }
    case 'LOGIN_FAILURE':
      return { ...state, loading: false, error: action.payload }
    case 'LOGOUT':
      return {
        user: null,
        token: null,
        loading: false,
        error: null,
      }
    case 'SET_USER':
      return { ...state, user: action.payload }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token')
      if (token) {
        try {
          const profileResponse = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (!profileResponse.ok) {
            throw new Error('Session expired')
          }

          const user = await profileResponse.json()
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: { token, user },
          })
        } catch (err) {
          localStorage.removeItem('access_token')
          dispatch({ type: 'LOGOUT' })
        }
      }
    };
    initializeAuth()
  }, [])

  const login = useCallback(async (email, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Login failed')
      }

      const { access_token } = await response.json()

      // Fetch user profile
      const profileResponse = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch profile')
      }

      const user = await profileResponse.json()

      localStorage.setItem('access_token', access_token)

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { token: access_token, user },
      })
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE', payload: err.message })
      throw err
    }
  }, [])

  const register = useCallback(async (email, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const regResponse = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!regResponse.ok) {
        const data = await regResponse.json().catch(() => ({}))
        throw new Error(data.message || 'Registration failed')
      }

      // Automatically log in after registration
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Login after registration failed')
      }

      const { access_token } = await response.json()

      // Fetch user profile
      const profileResponse = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch profile')
      }

      const user = await profileResponse.json()

      localStorage.setItem('access_token', access_token)

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { token: access_token, user },
      })
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE', payload: err.message })
      throw err
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    dispatch({ type: 'LOGOUT' })
  }, [])

  const value = {
    ...state,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
