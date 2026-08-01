import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import {
  getPeriodsToReview,
  getPeriodDetail,
  approvePeriod,
  rejectPeriod,
  downloadPeriodById,
} from './timesheetsApi'
import ExcelIcon from '../../components/ExcelIcon'
import PdfIcon from '../../components/PdfIcon'
import ClockIcon from '../../components/ClockIcon'
import CheckCircleIcon from '../../components/CheckCircleIcon'
import XCircleIcon from '../../components/XCircleIcon'
import './TimesheetValidation.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TABS = [
  { key: 'pending', label: 'Awaiting validation', icon: ClockIcon },
  { key: 'approved', label: 'Validated', icon: CheckCircleIcon },
  { key: 'rejected', label: 'Rejected', icon: XCircleIcon },
]

const ALL_STATUSES = TABS.map((t) => t.key)

const formatDateTime = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

export default function TimesheetValidation() {
  const { token } = useAuth()
  const { showToast } = useToast()

  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [activeTab, setActiveTab] = useState('pending')
  const [search, setSearch] = useState('')

  // Review modal
  const [detail, setDetail] = useState(null) // { period, entries }
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')

  const fetchPeriods = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await getPeriodsToReview(token, ALL_STATUSES)
      setPeriods(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load timesheets to review:', err)
      setLoadError(err.message)
      showToast(err.message || 'Failed to load timesheets to review', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchPeriods()
  }, [token])

  const counts = useMemo(() => {
    const result = { pending: 0, approved: 0, rejected: 0 }
    periods.forEach((p) => {
      if (result[p.status] !== undefined) result[p.status] += 1
    })
    return result
  }, [periods])

  const visiblePeriods = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return periods
      .filter((p) => p.status === activeTab)
      .filter((p) => {
        if (!needle) return true
        const haystack = `${p.owner?.name ?? ''} ${p.owner?.email ?? ''} ${
          MONTH_NAMES[p.month - 1]
        } ${p.year}`.toLowerCase()
        return haystack.includes(needle)
      })
  }, [periods, activeTab, search])

  const openDetail = async (period) => {
    setDetailLoading(true)
    setRejecting(false)
    setComment('')
    setDetail({ period, entries: null })
    try {
      const data = await getPeriodDetail(token, period.id)
      setDetail(data)
    } catch (err) {
      showToast(err.message || 'Failed to load the timesheet detail', 'error')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setRejecting(false)
    setComment('')
  }

  const handleDecision = async (decision) => {
    if (!detail?.period?.id) return
    if (decision === 'reject' && !comment.trim()) {
      showToast('Please explain why the timesheet is rejected.', 'warning')
      return
    }

    setBusy(true)
    try {
      const updated =
        decision === 'approve'
          ? await approvePeriod(token, detail.period.id, comment.trim() || null)
          : await rejectPeriod(token, detail.period.id, comment.trim())

      setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      showToast(
        decision === 'approve'
          ? `Timesheet of ${updated.owner.name} validated — it is now locked and downloadable.`
          : `Timesheet of ${updated.owner.name} returned for correction.`,
        decision === 'approve' ? 'success' : 'info'
      )
      closeDetail()
      setActiveTab(decision === 'approve' ? 'approved' : 'rejected')
    } catch (err) {
      showToast(err.message || 'Failed to record your decision', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async (period, format, event) => {
    if (event) event.stopPropagation()
    setBusy(true)
    try {
      const name = await downloadPeriodById(token, period.id, format)
      showToast(`Downloaded ${name}`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to download the timesheet', 'error')
    } finally {
      setBusy(false)
    }
  }

  const detailEntriesByDate = useMemo(() => {
    if (!detail?.entries) return []
    const map = new Map()
    detail.entries.forEach((entry) => {
      if (!map.has(entry.date)) map.set(entry.date, [])
      map.get(entry.date).push(entry)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, entries]) => ({
        date,
        entries,
        total: entries.reduce((sum, e) => sum + (Number(e.hoursSpent) || 0), 0),
      }))
  }, [detail])

  return (
    <div className="tsv-container">
      <div className="tsv-header">
        <div className="tsv-header-titles">
          <h1>Timesheet Validation</h1>
          <p className="tsv-subtitle">
            Review and validate the monthly timesheets of the collaborateurs you are
            responsable for. A validated timesheet is locked and can be downloaded in
            Excel or PDF.
          </p>
        </div>
        <button
          type="button"
          className="tsv-btn tsv-btn-secondary"
          onClick={fetchPeriods}
          disabled={loading}
        >
          🔄 Refresh
        </button>
      </div>

      <div className="tsv-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tsv-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tsv-tab-icon"><tab.icon size="16px" /></span>
            <span className="tsv-tab-label">{tab.label}</span>
            <span className="tsv-tab-count">{counts[tab.key] ?? 0}</span>
          </button>
        ))}

        <input
          type="search"
          className="tsv-search"
          placeholder="Search a collaborateur or a month..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="tsv-placeholder">Loading timesheets...</div>
      ) : loadError ? (
        <div className="tsv-placeholder tsv-error">{loadError}</div>
      ) : visiblePeriods.length === 0 ? (
        <div className="tsv-placeholder">
          {activeTab === 'pending'
            ? 'No timesheet is waiting for your validation. 🎉'
            : `No ${activeTab} timesheet yet.`}
        </div>
      ) : (
        <div className="tsv-grid">
          {visiblePeriods.map((period) => (
            <article
              key={period.id}
              className={`tsv-card tsv-card-${period.status}`}
              onClick={() => openDetail(period)}
            >
              <header className="tsv-card-head">
                <div className="tsv-avatar">{initials(period.owner?.name ?? '?')}</div>
                <div className="tsv-owner">
                  <span className="tsv-owner-name">{period.owner?.name}</span>
                  <span className="tsv-owner-meta">
                    {period.owner?.jobTitle || period.owner?.email || '—'}
                  </span>
                </div>
                <span className={`tsv-pill tsv-pill-${period.status}`}>
                  {TABS.find((t) => t.key === period.status)?.label ?? period.status}
                </span>
              </header>

              <div className="tsv-period">
                {MONTH_NAMES[period.month - 1]} {period.year}
              </div>

              <div className="tsv-metrics">
                <div className="tsv-metric">
                  <span className="tsv-metric-value">{period.totalDays}d</span>
                  <span className="tsv-metric-label">{period.totalHours}h logged</span>
                </div>
                <div className="tsv-metric">
                  <span className="tsv-metric-value">{period.filledDays}</span>
                  <span className="tsv-metric-label">days filled</span>
                </div>
                <div className="tsv-metric">
                  <span className="tsv-metric-value">{period.holidayDays}</span>
                  <span className="tsv-metric-label">holidays</span>
                </div>
              </div>

              <footer className="tsv-card-foot">
                <span className="tsv-timestamp">
                  {period.status === 'pending'
                    ? `Sent ${formatDateTime(period.submittedAt)}`
                    : `${period.status === 'approved' ? 'Validated' : 'Rejected'} ${formatDateTime(
                        period.reviewedAt
                      )}`}
                </span>
                <div className="tsv-card-actions">
                  {period.status === 'pending' ? (
                    <span className="tsv-review-hint">Click to review →</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="tsv-icon-btn"
                        aria-label="Download Excel"
                        data-tooltip="Download Excel"
                        onClick={(e) => handleDownload(period, 'xlsx', e)}
                        disabled={busy}
                      >
                        <ExcelIcon size="16px" />
                      </button>
                      <button
                        type="button"
                        className="tsv-icon-btn"
                        aria-label="Download PDF"
                        data-tooltip="Download PDF"
                        onClick={(e) => handleDownload(period, 'pdf', e)}
                        disabled={busy}
                      >
                        <PdfIcon size="16px" />
                      </button>
                    </>
                  )}
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* REVIEW MODAL */}
      {detail && (
        <div className="tsv-modal-backdrop" onClick={closeDetail}>
          <div className="tsv-modal" onClick={(e) => e.stopPropagation()}>
            <header className="tsv-modal-head">
              <div>
                <h2>
                  {detail.period.owner?.name} — {MONTH_NAMES[detail.period.month - 1]}{' '}
                  {detail.period.year}
                </h2>
                <span className="tsv-modal-sub">
                  {detail.period.totalDays}d ({detail.period.totalHours}h) over{' '}
                  {detail.period.filledDays} days · {detail.period.holidayDays} holiday(s) ·
                  sent {formatDateTime(detail.period.submittedAt)}
                </span>
              </div>
              <button type="button" className="tsv-modal-close" onClick={closeDetail}>
                ×
              </button>
            </header>

            <div className="tsv-modal-body">
              {detailLoading || !detail.entries ? (
                <div className="tsv-placeholder">Loading entries...</div>
              ) : detailEntriesByDate.length === 0 ? (
                <div className="tsv-placeholder">No entry recorded for this month.</div>
              ) : (
                <div className="tsv-table-wrapper">
                  <table className="tsv-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type / Project</th>
                        <th>Note</th>
                        <th className="tsv-right">Hours</th>
                        <th className="tsv-right">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailEntriesByDate.map((day) =>
                        day.entries.map((entry, idx) => (
                          <tr key={entry.id}>
                            {idx === 0 && (
                              <td rowSpan={day.entries.length} className="tsv-date-cell">
                                <strong>{day.date}</strong>
                                <span
                                  className={`tsv-day-total ${
                                    Math.abs(day.total - 8) > 0.01 ? 'tsv-day-warn' : ''
                                  }`}
                                >
                                  {day.total}h
                                </span>
                              </td>
                            )}
                            <td>
                              {entry.isHoliday ? (
                                <span className="tsv-tag tsv-tag-holiday">🌴 Holiday</span>
                              ) : (
                                <span className="tsv-tag tsv-tag-project">
                                  📁 {entry.projectName || entry.projectId || 'Project'}
                                </span>
                              )}
                            </td>
                            <td className="tsv-note">{entry.note || '—'}</td>
                            <td className="tsv-right">{entry.hoursSpent}h</td>
                            <td className="tsv-right">
                              {Math.round((entry.hoursSpent / 8) * 100) / 100}d
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.period.status !== 'pending' && detail.period.reviewComment && (
                <div className="tsv-existing-comment">
                  💬 “{detail.period.reviewComment}” — {detail.period.reviewer?.name ?? '—'},{' '}
                  {formatDateTime(detail.period.reviewedAt)}
                </div>
              )}

              {detail.period.status === 'pending' && (
                <div className="tsv-decision">
                  <label htmlFor="tsv-comment">
                    {rejecting ? 'Reason for rejection (required)' : 'Comment (optional)'}
                  </label>
                  <textarea
                    id="tsv-comment"
                    className="tsv-textarea"
                    rows={3}
                    placeholder={
                      rejecting
                        ? 'Explain what the collaborateur must correct...'
                        : 'Add a note for the collaborateur (optional)'
                    }
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}
            </div>

            <footer className="tsv-modal-foot">
              {detail.period.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-secondary"
                    onClick={closeDetail}
                    disabled={busy}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-danger"
                    onClick={() => (rejecting ? handleDecision('reject') : setRejecting(true))}
                    disabled={busy}
                  >
                    {rejecting ? 'Confirm rejection' : '✋ Reject'}
                  </button>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-primary"
                    onClick={() => handleDecision('approve')}
                    disabled={busy || rejecting}
                  >
                    {busy ? 'Saving...' : '✅ Validate timesheet'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-secondary"
                    onClick={closeDetail}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-secondary tsv-btn-icon-only"
                    onClick={() => handleDownload(detail.period, 'xlsx')}
                    disabled={busy}
                    aria-label="Download Excel"
                    data-tooltip="Download Excel"
                  >
                    <ExcelIcon size="16px" />
                  </button>
                  <button
                    type="button"
                    className="tsv-btn tsv-btn-primary tsv-btn-icon-only"
                    onClick={() => handleDownload(detail.period, 'pdf')}
                    disabled={busy}
                    aria-label="Download PDF"
                    data-tooltip="Download PDF"
                  >
                    <PdfIcon size="16px" />
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
