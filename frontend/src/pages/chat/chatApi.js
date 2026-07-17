const CHAT_URL = import.meta.env.VITE_CHAT_URL ?? 'http://localhost:3007'

export async function getProjectMessages(projectId, token) {
  const response = await fetch(
    `${CHAT_URL}/chat/${projectId}/messages?limit=50&offset=0`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message ?? 'Impossible de charger les messages.')
  }
  return Array.isArray(data) ? data : []
}
