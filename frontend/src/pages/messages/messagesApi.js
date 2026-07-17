const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3004'

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
    throw new Error(data?.message || 'Une erreur est survenue.')
  }
  return data
}

export async function fetchChatChannels(token) {
  return request('/chat/channels', {
    headers: getHeaders(token),
  })
}

export async function createDirectChatChannel(peerId, token) {
  return request('/chat/channels/direct', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ peerId }),
  })
}

export async function fetchChannelMessages(channelId, token, limit = 50, offset = 0) {
  return request(`/chat/channels/${channelId}/messages?limit=${limit}&offset=${offset}`, {
    headers: getHeaders(token),
  })
}

export async function markChannelAsRead(channelId, token) {
  return request(`/chat/channels/${channelId}/read-all`, {
    method: 'POST',
    headers: getHeaders(token),
  })
}

export async function createChatGroup(name, memberIds, token) {
  return request('/chat/groups', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ name, memberIds }),
  })
}
