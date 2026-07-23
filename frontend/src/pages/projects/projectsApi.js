import API_URL from '../../config/api'

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
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

export function getProjects(headers) {
  return request('/api/projects', { headers })
}

export function createProject(body, headers) {
  return request('/api/projects', { method: 'POST', body, headers })
}

export function addTaskToProject(projectId, body, headers) {
  return request(`/api/projects/${projectId}/tasks`, { method: 'POST', body, headers })
}

export function assignUserToProject(projectId, body, headers) {
  return request(`/api/projects/${projectId}/assign`, { method: 'POST', body, headers })
}

export function getProjectDetail(projectId, headers) {
  return request(`/api/projects/${projectId}`, { headers })
}

export function getMyTasks(projectId, headers) {
  return request(`/api/projects/${projectId}/my-tasks`, { headers })
}

export function getProjectTeam(projectId, headers) {
  return request(`/api/projects/${projectId}/team`, { headers })
}

export function updateTaskStatus(projectId, taskId, bodyOrStatus, headers) {
  const body = typeof bodyOrStatus === 'string' ? { status: bodyOrStatus } : bodyOrStatus
  return request(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body,
    headers,
  })
}

export function unassignUserFromProject(projectId, userId, headers) {
  return request(`/api/projects/${projectId}/assign/${userId}`, {
    method: 'DELETE',
    headers,
  })
}

export function deleteTaskFromProject(projectId, taskId, headers) {
  return request(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
    headers,
  })
}

