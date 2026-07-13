const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004'

async function request(path, { method = 'GET', body, token } = {}) {
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
  } catch (err) {
    console.error('[projectsApi] fetch error:', err)
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

export function getProjects(token) {
  return request('/api/projects', { token })
}

export function createProject(data, token) {
  return request('/api/projects', { method: 'POST', body: data, token })
}

export function getProjectDetail(id, token) {
  return request(`/api/projects/${id}`, { token })
}

export function addTaskToProject(projectId, data, token) {
  return request(`/api/projects/${projectId}/tasks`, { method: 'POST', body: data, token })
}

export function assignUserToProject(projectId, data, token) {
  return request(`/api/projects/${projectId}/assignments`, { method: 'POST', body: data, token })
}
