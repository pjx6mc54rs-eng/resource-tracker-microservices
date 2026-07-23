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
    throw new Error(data?.message || 'An error occurred.')
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

export async function createChatGroup(name, memberIds, token, avatarUrl) {
  return request('/chat/groups', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ name, memberIds, avatarUrl }),
  })
}

export async function clearChatChannel(channelId, token) {
  return request(`/chat/channels/${channelId}/clear`, {
    method: 'POST',
    headers: getHeaders(token),
  })
}

export async function deleteChatChannel(channelId, token) {
  return request(`/chat/channels/${channelId}`, {
    method: 'DELETE',
    headers: getHeaders(token),
  })
}

export async function addGroupMember(channelId, userId, token) {
  return request(`/chat/channels/${channelId}/members`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ userId }),
  })
}

export async function updateChatChannelName(channelId, name, token, avatarUrl) {
  return request(`/chat/channels/${channelId}`, {
    method: 'PATCH',
    headers: getHeaders(token),
    body: JSON.stringify({ name, avatarUrl }),
  })
}

export async function leaveChatGroup(channelId, token) {
  return request(`/chat/channels/${channelId}/leave`, {
    method: 'POST',
    headers: getHeaders(token),
  })
}

export async function removeGroupMember(channelId, userId, token) {
  return request(`/chat/channels/${channelId}/members/${userId}`, {
    method: 'DELETE',
    headers: getHeaders(token),
  })
}

export async function makeMemberAdmin(channelId, userId, token) {
  return request(`/chat/channels/${channelId}/members/${userId}/admin`, {
    method: 'POST',
    headers: getHeaders(token),
  })
}

export async function uploadChatImage(file, token) {
  const formData = new FormData()
  formData.append('image', file)
  const response = await fetch(`${API_URL}/api/chat/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || "Failed to upload image.")
  }
  return data
}
