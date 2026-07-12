// Base URL of the API gateway. Override with VITE_API_URL at build time.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3005'

async function request(path, { method = 'POST', body, token } = {}) {
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
  } catch {
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

export function login({ email, password }) {
  return request('/auth/login', { body: { email, password } })
}

export function register({ email, password, role }) {
  return request('/auth/register', { body: { email, password, role } })
}

// Récupère le profil de l'utilisateur connecté (route protégée par JWT).
export function getMe(token) {
  return request('/auth/me', { method: 'GET', token })
}

// Liste tous les utilisateurs — réservé aux admins (le backend vérifie le rôle).
export function listUsers(token) {
  return request('/auth/users', { method: 'GET', token })
}