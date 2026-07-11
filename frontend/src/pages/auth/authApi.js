// Base URL of the API gateway. Override with VITE_API_URL at build time.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3005'

async function request(path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  return request('/auth/login', { email, password })
}

export function register({ email, password }) {
  return request('/auth/register', { email, password })
}
