import API_URL from '../../config/api'

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}/api${path}`, options)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message || 'Une erreur est survenue.')
  }
  return data
}

/** Réunions de l'utilisateur connecté, éventuellement bornées dans le temps. */
export async function fetchMyMeetings(token, { from, to, includeCancelled } = {}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (includeCancelled) params.set('includeCancelled', 'true')
  const suffix = params.toString() ? `?${params}` : ''
  return request(`/meetings/me${suffix}`, { headers: getHeaders(token) })
}

export async function fetchMeeting(id, token) {
  return request(`/meetings/${id}`, { headers: getHeaders(token) })
}

export async function createMeeting(payload, token) {
  return request('/meetings', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(payload),
  })
}

export async function updateMeeting(id, payload, token) {
  return request(`/meetings/${id}`, {
    method: 'PATCH',
    headers: getHeaders(token),
    body: JSON.stringify(payload),
  })
}

export async function cancelMeeting(id, token) {
  return request(`/meetings/${id}`, { method: 'DELETE', headers: getHeaders(token) })
}

export async function respondToMeeting(id, response, token) {
  return request(`/meetings/${id}/response`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ response }),
  })
}

/**
 * Réunions déjà programmées qui chevauchent le créneau, pour les participants
 * indiqués. Sert à avertir l'organisateur, pas à l'empêcher de valider.
 */
export async function fetchConflicts({ startsAt, endsAt, userIds, exclude }, token) {
  const params = new URLSearchParams({ startsAt, endsAt })
  if (userIds?.length) params.set('userIds', userIds.join(','))
  if (exclude) params.set('exclude', exclude)
  return request(`/meetings/conflicts?${params}`, { headers: getHeaders(token) })
}

/** Mémorise le canal de discussion ouvert pour une réunion à plus de deux. */
export async function attachMeetingChannel(id, channelId, token) {
  return request(`/meetings/${id}/channel`, {
    method: 'PATCH',
    headers: getHeaders(token),
    body: JSON.stringify({ channelId }),
  })
}
