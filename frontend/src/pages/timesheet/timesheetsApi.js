import API_URL from '../../config/api'

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
    console.error('[timesheetsApi] fetch error:', err)
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

export function submitTimesheet(data, token) {
  return request('/api/timesheets', { method: 'POST', body: data, token })
}

export function bulkSubmitTimesheets(entries, token) {
  return request('/api/timesheets/bulk', { method: 'POST', body: { entries }, token })
}

export function getMyTimesheets(token, year, month) {
  const queryParams = new URLSearchParams()
  if (year) queryParams.append('year', year)
  if (month) queryParams.append('month', month)

  const queryString = queryParams.toString()
  const path = `/api/timesheets/me${queryString ? `?${queryString}` : ''}`
  return request(path, { token })
}

export function deleteTimesheetEntry(id, token) {
  return request(`/api/timesheets/${id}`, { method: 'DELETE', token })
}
