const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3005'

export async function getProjectMessages(projectId, token) {
  const response = await fetch(
    `${API_URL}/api/chat/${projectId}/messages?limit=50&offset=0`,
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
