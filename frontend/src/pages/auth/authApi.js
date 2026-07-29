import API_URL from '../../config/api'

async function request(path, { method = 'POST', body, token } = {}) {
  let res
  try {
    console.log('[authApi] Making request to:', `${API_URL}${path}`)
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    console.log('[authApi] Response status:', res.status)
  } catch (err) {
    console.error('[authApi] fetch error:', err)
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
  return request('/api/auth/login', { body: { email, password } })
}

export function register(formData) {
  return fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    body: formData,
  }).then(async (res) => {
    let data = null
    try {
      data = await res.json()
    } catch {
      // ignore
    }
    if (!res.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(', ')
        : (data?.message ?? `Request failed (${res.status})`)
      throw new Error(message)
    }
    return data
  })
}

// Récupère le profil de l'utilisateur connecté (route protégée par JWT).
export function getMe(token) {
  return request('/api/auth/me', { method: 'GET', token })
}

// Met à jour le profil de l'utilisateur connecté (PATCH partiel).
export function updateMe(token, changes) {
  return request('/api/auth/me', { method: 'PATCH', token, body: changes })
}

// Téléverse ou remplace la photo de profil (multipart, hors helper `request`
// car il force Content-Type: application/json).
export function uploadAvatar(token, file) {
  const formData = new FormData()
  formData.append('avatar', file)
  return fetch(`${API_URL}/api/auth/me/avatar`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (res) => {
    let data = null
    try {
      data = await res.json()
    } catch {
      // ignore
    }
    if (!res.ok) {
      const message = Array.isArray(data?.message)
        ? data.message.join(', ')
        : (data?.message ?? `Request failed (${res.status})`)
      throw new Error(message)
    }
    return data
  })
}

// Supprime la photo de profil de l'utilisateur connecté.
export function deleteAvatar(token) {
  return request('/api/auth/me/avatar', { method: 'DELETE', token })
}

// Change le mot de passe de l'utilisateur connecté.
// N'envoyer que currentPassword/newPassword : le backend rejette tout champ inconnu.
export function changePassword(token, { currentPassword, newPassword }) {
  return request('/api/auth/me/password', {
    method: 'PATCH',
    token,
    body: { currentPassword, newPassword },
  })
}

// Liste tous les utilisateurs — réservé aux admins (le backend vérifie le rôle).
export function listUsers(token) {
  return request('/api/auth/users', { method: 'GET', token })
}
