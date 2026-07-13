import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { submitTimesheet, getMyTimesheets } from './timesheetsApi'
import './TimesheetForm.css'

export default function TimesheetForm() {
  const { token } = useAuth()

  const [formData, setFormData] = useState({
    task_id: '',
    date: '',
    hours_spent: '',
  })
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)

  const [timesheets, setTimesheets] = useState([])
  const [loadingTimesheets, setLoadingTimesheets] = useState(true)
  const [timesheetsError, setTimesheetsError] = useState(null)

  const fetchTimesheets = async () => {
    setLoadingTimesheets(true)
    setTimesheetsError(null)
    try {
      const data = await getMyTimesheets(token)
      setTimesheets(Array.isArray(data) ? data : [])
    } catch (err) {
      setTimesheetsError(err.message)
    } finally {
      setLoadingTimesheets(false)
    }
  }

  useEffect(() => {
    fetchTimesheets()
  }, [token])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSuccessMessage(null)

    if (!formData.task_id.trim()) {
      setFormError('Task ID is required')
      return
    }
    if (!formData.date.trim()) {
      setFormError('Date is required')
      return
    }
    if (!formData.hours_spent || Number(formData.hours_spent) <= 0) {
      setFormError('Hours must be greater than 0')
      return
    }

    setSubmitting(true)
    try {
      await submitTimesheet(
        {
          task_id: formData.task_id,
          date: formData.date,
          hours_spent: Number(formData.hours_spent),
        },
        token
      )
      setFormData({ task_id: '', date: '', hours_spent: '' })
      setSuccessMessage('Timesheet submitted successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
      await fetchTimesheets()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="timesheet-container">
      <div className="timesheet-form-section">
        <h1>Log Time</h1>
        <form onSubmit={handleSubmit} className="timesheet-form">
          <div className="form-group">
            <label htmlFor="task_id">Task ID *</label>
            <input
              id="task_id"
              type="text"
              name="task_id"
              value={formData.task_id}
              onChange={handleInputChange}
              disabled={submitting}
              placeholder="Enter task ID"
            />
          </div>

          <div className="form-group">
            <label htmlFor="date">Date *</label>
            <input
              id="date"
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="hours_spent">Hours Spent *</label>
            <input
              id="hours_spent"
              type="number"
              name="hours_spent"
              step="0.5"
              min="0.5"
              value={formData.hours_spent}
              onChange={handleInputChange}
              disabled={submitting}
              placeholder="e.g., 2.5"
            />
          </div>

          {formError && <div className="error-message">{formError}</div>}
          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Timesheet'}
          </button>
        </form>
      </div>

      <div className="timesheet-history-section">
        <h2>Your Timesheets</h2>
        {timesheetsError && (
          <div className="error-message">{timesheetsError}</div>
        )}

        {loadingTimesheets ? (
          <p>Loading timesheets...</p>
        ) : timesheets.length === 0 ? (
          <p>No timesheets recorded yet.</p>
        ) : (
          <div className="timesheets-table-wrapper">
            <table className="timesheets-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Task ID</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {timesheets.map((ts) => (
                  <tr key={ts.id}>
                    <td>{ts.date}</td>
                    <td>{ts.taskId}</td>
                    <td>{ts.hoursSpent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
