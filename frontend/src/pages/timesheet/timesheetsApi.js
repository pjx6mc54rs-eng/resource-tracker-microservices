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

/* ── Monthly validation workflow ─────────────────────────────────────────── */

/** Validation state of my own month (status, reviewers, totals, permissions). */
export function getMyPeriod(token, year, month) {
  return request(`/api/timesheets/periods/me?year=${year}&month=${month}`, { token })
}

export function getMyPeriodHistory(token) {
  return request('/api/timesheets/periods/me/history', { token })
}

/** Send the month to my responsables — freezes every entry of that month. */
export function submitPeriodForValidation(token, year, month) {
  return request('/api/timesheets/periods/me/submit', {
    method: 'POST',
    body: { year, month },
    token,
  })
}

/** Take back a submission that has not been reviewed yet. */
export function recallPeriod(token, year, month) {
  return request('/api/timesheets/periods/me/recall', {
    method: 'POST',
    body: { year, month },
    token,
  })
}

/** Timesheets awaiting (or already handled by) me as a responsable/admin. */
export function getPeriodsToReview(token, statuses = ['pending']) {
  return request(`/api/timesheets/periods/review?status=${statuses.join(',')}`, { token })
}

export function getPeriodDetail(token, periodId) {
  return request(`/api/timesheets/periods/${periodId}`, { token })
}

export function approvePeriod(token, periodId, comment) {
  return request(`/api/timesheets/periods/${periodId}/approve`, {
    method: 'POST',
    body: { comment: comment ?? null },
    token,
  })
}

export function rejectPeriod(token, periodId, comment) {
  return request(`/api/timesheets/periods/${periodId}/reject`, {
    method: 'POST',
    body: { comment },
    token,
  })
}

/* ── Downloads ───────────────────────────────────────────────────────────── */

function fileNameFromDisposition(header, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(header || '')
  return match ? match[1] : fallback
}

async function downloadFile(path, token, fallbackName) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
  } catch (err) {
    console.error('[timesheetsApi] download error:', err)
    throw new Error('Unable to reach the server. Please try again.')
  }

  if (!res.ok) {
    let message = `Download failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message
      }
    } catch {
      // binary/empty error body — keep the generic message
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const name = fileNameFromDisposition(res.headers.get('content-disposition'), fallbackName)

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)

  return name
}

/** format: 'xlsx' | 'pdf' */
export function downloadMyPeriod(token, year, month, format) {
  return downloadFile(
    `/api/timesheets/periods/me/export?year=${year}&month=${month}&format=${format}`,
    token,
    `timesheet-${year}-${String(month).padStart(2, '0')}.${format}`,
  )
}

export function downloadPeriodById(token, periodId, format, fallbackName) {
  return downloadFile(
    `/api/timesheets/periods/${periodId}/export?format=${format}`,
    token,
    fallbackName ?? `timesheet.${format}`,
  )
}
