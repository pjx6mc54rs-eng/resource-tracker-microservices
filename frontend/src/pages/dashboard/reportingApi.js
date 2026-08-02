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
    console.error('[reportingApi] fetch error:', err)
    throw new Error('Unable to reach the server. Please try again.', { cause: err })
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

/**
 * Single consolidated payload backing the whole dashboard page: my month, my
 * projects/tasks, the manager block and the admin block. The server decides
 * which sections are populated — `manager` and `admin` come back as null when
 * the caller is not entitled to them.
 *
 * `year` / `month` are optional: omitting them lets the server fall back to
 * its own current month.
 */
export function getDashboard(token, year, month) {
  const queryParams = new URLSearchParams()
  if (year) queryParams.append('year', year)
  if (month) queryParams.append('month', month)

  const queryString = queryParams.toString()
  const path = `/api/reporting/dashboard${queryString ? `?${queryString}` : ''}`
  return request(path, { token })
}
