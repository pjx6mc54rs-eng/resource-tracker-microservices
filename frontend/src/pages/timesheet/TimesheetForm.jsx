import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getProjects } from '../projects/projectsApi'
import {
  getMyTimesheets,
  submitTimesheet,
  bulkSubmitTimesheets,
  deleteTimesheetEntry,
  getMyPeriod,
  submitPeriodForValidation,
  recallPeriod,
  downloadMyPeriod,
} from './timesheetsApi'
import ExcelIcon from '../../components/ExcelIcon'
import PdfIcon from '../../components/PdfIcon'
import PencilIcon from '../../components/PencilIcon'
import ClockIcon from '../../components/ClockIcon'
import CheckCircleIcon from '../../components/CheckCircleIcon'
import XCircleIcon from '../../components/XCircleIcon'
import CalendarIcon from '../../components/CalendarIcon'
import ChartBarIcon from '../../components/ChartBarIcon'
import ClipboardIcon from '../../components/ClipboardIcon'
import BoltIcon from '../../components/BoltIcon'
import SaveIcon from '../../components/SaveIcon'
import WarningIcon from '../../components/WarningIcon'
import SendIcon from '../../components/SendIcon'
import UmbrellaIcon from '../../components/UmbrellaIcon'
import LockIcon from '../../components/LockIcon'
import FolderIcon from '../../components/FolderIcon'
import './TimesheetForm.css'

const STATUS_META = {
  not_validated: { label: 'Not validated', icon: PencilIcon, hint: 'Not sent for validation yet.' },
  pending: { label: 'Pending validation', icon: ClockIcon, hint: 'Locked while your responsable reviews it.' },
  approved: { label: 'Validated', icon: CheckCircleIcon, hint: 'Validated — this month is final and can be downloaded.' },
  rejected: { label: 'Rejected', icon: XCircleIcon, hint: 'Returned by your responsable — fix it and send it again.' },
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function TimesheetForm() {
  const { token } = useAuth()
  const { showToast } = useToast()

  // Month navigation state (default: current year & month)
  const today = new Date()
  const [selectedYear, setSelectedYear] = useState(today.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1) // 1-12

  // Display Unit Mode: 'hours' | 'days' (1 day = 8 hours)
  const [unitMode, setUnitMode] = useState('hours') // 'hours' or 'days'

  // View state: 'calendar' | 'matrix' | 'history'
  const [viewMode, setViewMode] = useState('calendar')

  // Projects & Timesheets state
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectsError, setProjectsError] = useState(null)

  const [timesheets, setTimesheets] = useState([])
  const [loadingTimesheets, setLoadingTimesheets] = useState(true)
  const [timesheetsError, setTimesheetsError] = useState(null)

  // Submitting status
  const [submitting, setSubmitting] = useState(false)

  // Monthly validation workflow (not validated → pending → approved / rejected)
  const [period, setPeriod] = useState(null)
  const [periodBusy, setPeriodBusy] = useState(false)
  const isLocked = !!period?.locked

  // Multi-Card Selection state: Set of date strings 'YYYY-MM-DD'
  const [selectedDates, setSelectedDates] = useState(new Set())
  const [lastSelectedDate, setLastSelectedDate] = useState(null)

  // Day Modal / Editing state for SINGLE DAY MULTI-PROJECT input
  const [activeDay, setActiveDay] = useState(null) // date string 'YYYY-MM-DD'
  const [modalIsHoliday, setModalIsHoliday] = useState(false)
  const [modalHolidayHours, setModalHolidayHours] = useState('8')
  const [modalHolidayNote, setModalHolidayNote] = useState('Holiday / Congé')

  // Multi-project rows for activeDay: array of { id, projectId, hoursSpent, note }
  const [dayRows, setDayRows] = useState([])

  // Batch multi-day modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchDayRows, setBatchDayRows] = useState([])

  // Custom App Confirm Modal state (replaces DOM window.confirm)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    subMessage: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false,
    onConfirm: null,
  })

  // Batch matrix state: object keyed by `${projectId || 'holiday'}_${dateStr}` => value (in hours)
  const [matrixData, setMatrixData] = useState({})

  // Helper conversions between hours and days (1 day = 8 hours)
  const hoursToDays = (hrs) => {
    const num = Number(hrs) || 0
    return Math.round((num / 8) * 100) / 100
  }

  const daysToHours = (days) => {
    const num = Number(days) || 0
    return Math.round(num * 8 * 100) / 100
  }

  // Format value depending on active unitMode
  const formatValue = (hours) => {
    const hrs = Number(hours) || 0
    if (unitMode === 'days') {
      const d = hoursToDays(hrs)
      return `${d}d`
    }
    return `${hrs}h`
  }

  // Fetch Assigned Projects
  const fetchAssignedProjects = async () => {
    setLoadingProjects(true)
    setProjectsError(null)
    try {
      const data = await getProjects({ Authorization: `Bearer ${token}` })
      const list = Array.isArray(data) ? data : []
      setProjects(list)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjectsError(err.message)
      showToast(err.message || 'Failed to fetch assigned projects', 'error')
    } finally {
      setLoadingProjects(false)
    }
  }

  // Fetch Month Timesheets
  const fetchTimesheets = async () => {
    setLoadingTimesheets(true)
    setTimesheetsError(null)
    try {
      const data = await getMyTimesheets(token, selectedYear, selectedMonth)
      const list = Array.isArray(data) ? data : []
      setTimesheets(list)

      // Sync matrix data
      const initialMatrix = {}
      list.forEach((ts) => {
        const dateKey = typeof ts.date === 'string' ? ts.date.split('T')[0] : ''
        if (!dateKey) return
        const key = ts.isHoliday
          ? `holiday_${dateKey}`
          : `${ts.projectId || 'unassigned'}_${dateKey}`
        initialMatrix[key] = ts.hoursSpent
      })
      setMatrixData(initialMatrix)
    } catch (err) {
      console.error('Failed to fetch timesheets:', err)
      setTimesheetsError(err.message)
      showToast(err.message || 'Failed to fetch monthly timesheets', 'error')
    } finally {
      setLoadingTimesheets(false)
    }
  }

  // Fetch the validation state of the displayed month
  const fetchPeriod = async () => {
    try {
      const data = await getMyPeriod(token, selectedYear, selectedMonth)
      setPeriod(data)
    } catch (err) {
      console.error('Failed to fetch timesheet validation status:', err)
      setPeriod(null)
    }
  }

  useEffect(() => {
    if (token) {
      fetchAssignedProjects()
    }
  }, [token])

  useEffect(() => {
    if (token) {
      fetchTimesheets()
      fetchPeriod()
      setSelectedDates(new Set())
      setLastSelectedDate(null)
    }
  }, [token, selectedYear, selectedMonth])

  // Any edit attempt on a submitted / validated month is refused up-front, so
  // the user gets an explanation instead of a 403 from the API.
  const blockIfLocked = () => {
    if (!isLocked) return false
    showToast(
      period?.status === 'approved'
        ? 'This timesheet has been validated and can no longer be modified.'
        : 'This timesheet is pending validation. Cancel the submission to edit it again.',
      'warning'
    )
    return true
  }

  const handleSubmitForValidation = () => {
    if (!period || period.entriesCount === 0) {
      showToast('Log at least one day before requesting validation.', 'warning')
      return
    }

    setConfirmModal({
      isOpen: true,
      title: 'Send for validation',
      message: `Send ${monthNames[selectedMonth - 1]} ${selectedYear} to your responsable for validation?`,
      subMessage:
        'The month will be locked while it is being reviewed. Once validated it can no longer be modified.',
      confirmText: 'Send for validation',
      cancelText: 'Cancel',
      isDanger: false,
      onConfirm: async () => {
        setPeriodBusy(true)
        try {
          const updated = await submitPeriodForValidation(token, selectedYear, selectedMonth)
          setPeriod(updated)
          const reviewers = (updated.reviewers || []).map((r) => r.name).join(', ')
          showToast(
            reviewers
              ? `Timesheet sent for validation to ${reviewers}.`
              : 'Timesheet sent for validation.',
            'success'
          )
          await fetchTimesheets()
        } catch (err) {
          showToast(err.message || 'Failed to send the timesheet for validation', 'error')
        } finally {
          setPeriodBusy(false)
        }
      },
    })
  }

  const handleRecallSubmission = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Cancel submission',
      message: 'Take this timesheet back so you can edit it again?',
      subMessage: 'Your responsable will no longer see it in their validation queue.',
      confirmText: 'Cancel submission',
      cancelText: 'Keep it submitted',
      isDanger: true,
      onConfirm: async () => {
        setPeriodBusy(true)
        try {
          const updated = await recallPeriod(token, selectedYear, selectedMonth)
          setPeriod(updated)
          showToast('Submission cancelled — the month is editable again.', 'info')
        } catch (err) {
          showToast(err.message || 'Failed to cancel the submission', 'error')
        } finally {
          setPeriodBusy(false)
        }
      },
    })
  }

  const handleDownloadPeriod = async (format) => {
    setPeriodBusy(true)
    try {
      const name = await downloadMyPeriod(token, selectedYear, selectedMonth, format)
      showToast(`Downloaded ${name}`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to download the timesheet', 'error')
    } finally {
      setPeriodBusy(false)
    }
  }

  // Navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12)
      setSelectedYear((prev) => prev - 1)
    } else {
      setSelectedMonth((prev) => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear((prev) => prev + 1)
    } else {
      setSelectedMonth((prev) => prev + 1)
    }
  }

  const handleTodayMonth = () => {
    const d = new Date()
    setSelectedYear(d.getFullYear())
    setSelectedMonth(d.getMonth() + 1)
  }

  // Generate Monday-to-Friday Weekdays for Selected Month
  const monthWeekdays = useMemo(() => {
    const days = []
    const totalDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate()

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateObj = new Date(selectedYear, selectedMonth - 1, day)
      const dayOfWeek = dateObj.getDay()

      // Monday (1) to Friday (5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const monthStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`
        const dayStr = day < 10 ? `0${day}` : `${day}`
        const dateString = `${selectedYear}-${monthStr}-${dayStr}`
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

        days.push({
          dateString,
          dayNumber: day,
          dayName: dayNames[dayOfWeek],
          dateObj,
        })
      }
    }
    return days
  }, [selectedYear, selectedMonth])

  // Group weekdays by calendar week for Series / Week Presets
  const monthWeeks = useMemo(() => {
    const weeks = []
    let currentWeek = []

    monthWeekdays.forEach((w, idx) => {
      currentWeek.push(w)
      if (w.dayName === 'Fri' || idx === monthWeekdays.length - 1) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    })

    return weeks
  }, [monthWeekdays])

  // Map entries by dateString for quick access
  const entriesByDate = useMemo(() => {
    const map = {}
    timesheets.forEach((ts) => {
      const d = typeof ts.date === 'string' ? ts.date.split('T')[0] : ''
      if (!d) return
      if (!map[d]) map[d] = []
      map[d].push(ts)
    })
    return map
  }, [timesheets])

  // Per-weekday derived status (entries, holiday flag, validity) — the single
  // source of truth for both the desktop grid cards and the mobile day strip.
  const dayStatusList = useMemo(() => {
    return monthWeekdays.map((w) => {
      const dayEntries = entriesByDate[w.dateString] || []
      const isHoliday = dayEntries.some((x) => x.isHoliday)
      const hasProjectWork = dayEntries.some(
        (x) => !x.isHoliday && Number(x.hoursSpent) > 0
      )
      const totalDayHours = dayEntries.reduce(
        (acc, cur) => acc + (Number(cur.hoursSpent) || 0),
        0
      )
      const isValidDayTotal = totalDayHours === 0 || Math.abs(totalDayHours - 8) < 0.01
      return { ...w, dayEntries, isHoliday, hasProjectWork, totalDayHours, isValidDayTotal }
    })
  }, [monthWeekdays, entriesByDate])

  const todayDateString = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    const mm = m < 10 ? `0${m}` : `${m}`
    const dd = d < 10 ? `0${d}` : `${d}`
    return `${y}-${mm}-${dd}`
  }, [])

  // MOBILE DAY-STRIP NAVIGATION: which single day the compact mobile view shows.
  // Falls back to "today" (or the 1st weekday) whenever the override doesn't
  // belong to the currently displayed month — i.e. right after navigating months.
  const [mobileActiveDateOverride, setMobileActiveDateOverride] = useState(null)

  const mobileActiveDate = useMemo(() => {
    if (
      mobileActiveDateOverride &&
      dayStatusList.some((w) => w.dateString === mobileActiveDateOverride)
    ) {
      return mobileActiveDateOverride
    }
    const hasToday = dayStatusList.some((w) => w.dateString === todayDateString)
    return hasToday ? todayDateString : (dayStatusList[0]?.dateString ?? null)
  }, [mobileActiveDateOverride, dayStatusList, todayDateString])

  const activeDayStatus = dayStatusList.find((w) => w.dateString === mobileActiveDate) || null
  const activeDayIndex = dayStatusList.findIndex((w) => w.dateString === mobileActiveDate)

  // Callback ref (not a plain useRef + effect): the strip only mounts once
  // projects/timesheets finish loading, at which point `mobileActiveDate`
  // itself hasn't changed — a dependency-based effect would never re-fire.
  // Attaching via callback fires exactly when the active pill's node appears,
  // whether that's from the initial load or a later day/month change.
  // Memoized so its identity is stable — otherwise React would detach/reattach
  // (re-triggering the scroll) on every unrelated re-render of this page.
  const scrollPillIntoView = useCallback((node) => {
    node?.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' })
  }, [])

  const handleStripStepDay = (direction) => {
    if (activeDayIndex === -1) return
    const nextIdx = activeDayIndex + direction
    if (nextIdx < 0 || nextIdx >= dayStatusList.length) return
    setMobileActiveDateOverride(dayStatusList[nextIdx].dateString)
  }

  // MULTI-CARD & SERIES RANGE SELECTION HANDLERS
  const handleToggleDateSelection = (dateString, e) => {
    if (e) e.stopPropagation()

    // SHIFT-CLICK SERIES RANGE SELECTION
    if (e && e.shiftKey && lastSelectedDate) {
      const lastIdx = monthWeekdays.findIndex((w) => w.dateString === lastSelectedDate)
      const currIdx = monthWeekdays.findIndex((w) => w.dateString === dateString)

      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx)
        const end = Math.max(lastIdx, currIdx)
        const rangeDates = monthWeekdays.slice(start, end + 1).map((w) => w.dateString)

        setSelectedDates((prev) => {
          const next = new Set(prev)
          rangeDates.forEach((d) => next.add(d))
          return next
        })
        setLastSelectedDate(dateString)
        return
      }
    }

    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateString)) {
        next.delete(dateString)
      } else {
        next.add(dateString)
      }
      return next
    })
    setLastSelectedDate(dateString)
  }

  const handleSelectDateRange = (startDateStr, endDateStr) => {
    const startIdx = monthWeekdays.findIndex((w) => w.dateString === startDateStr)
    const endIdx = monthWeekdays.findIndex((w) => w.dateString === endDateStr)

    if (startIdx !== -1 && endIdx !== -1) {
      const min = Math.min(startIdx, endIdx)
      const max = Math.max(startIdx, endIdx)
      const rangeDates = monthWeekdays.slice(min, max + 1).map((w) => w.dateString)

      setSelectedDates((prev) => {
        const next = new Set(prev)
        rangeDates.forEach((d) => next.add(d))
        return next
      })
      setLastSelectedDate(endDateStr)
    }
  }

  const handleSelectAllWeekdays = () => {
    setSelectedDates(new Set(monthWeekdays.map((w) => w.dateString)))
  }

  const handleDeselectAllDates = () => {
    setSelectedDates(new Set())
    setLastSelectedDate(null)
  }

  // Handle Card Click (Supports Shift-Click for series range selection)
  const handleCardClick = (dateString, e) => {
    if (e && e.shiftKey && lastSelectedDate) {
      handleToggleDateSelection(dateString, e)
    } else if (selectedDates.size > 0) {
      handleToggleDateSelection(dateString, e)
    } else {
      handleOpenDayModal(dateString)
      setLastSelectedDate(dateString)
    }
  }

  // BATCH ACTIONS ON SELECTED DATES
  const handleBatchSetHoliday = async () => {
    if (selectedDates.size === 0) return
    if (blockIfLocked()) return

    const payload = Array.from(selectedDates).map((dateStr) => ({
      date: dateStr,
      hoursSpent: 8,
      isHoliday: true,
      note: 'Holiday / Congé',
    }))

    setSubmitting(true)
    try {
      await bulkSubmitTimesheets(payload, token)
      showToast(`Successfully marked ${selectedDates.size} selected days as Holiday (1.0d / 8h)!`, 'success')
      setSelectedDates(new Set())
      setLastSelectedDate(null)
      await fetchTimesheets()
    } catch (err) {
      showToast(err.message || 'Failed to mark holidays', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBatchClearSelected = () => {
    if (selectedDates.size === 0) return
    if (blockIfLocked()) return

    setConfirmModal({
      isOpen: true,
      title: 'Clear Selected Days',
      message: `Are you sure you want to clear all logged time and holidays for the ${selectedDates.size} selected days?`,
      subMessage: 'All entries recorded for these dates will be reset to 0.',
      confirmText: `Clear ${selectedDates.size} Days`,
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        const entriesToClear = []
        Array.from(selectedDates).forEach((dateStr) => {
          const existing = entriesByDate[dateStr] || []
          if (existing.length > 0) {
            existing.forEach((ts) => {
              entriesToClear.push({
                id: ts.id,
                date: dateStr,
                projectId: ts.projectId || undefined,
                hoursSpent: 0,
                isHoliday: ts.isHoliday,
              })
            })
          }
        })

        if (entriesToClear.length === 0) {
          showToast('Selected days were already empty.', 'info')
          setSelectedDates(new Set())
          setLastSelectedDate(null)
          return
        }

        setSubmitting(true)
        try {
          await bulkSubmitTimesheets(entriesToClear, token)
          showToast(`Successfully cleared logged entries for ${selectedDates.size} selected days!`, 'success')
          setSelectedDates(new Set())
          setLastSelectedDate(null)
          await fetchTimesheets()
        } catch (err) {
          showToast(err.message || 'Failed to clear selected days', 'error')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const handleOpenBatchModal = () => {
    if (selectedDates.size === 0) return
    if (blockIfLocked()) return
    if (projects.length === 0) {
      showToast('No project assigned to apply hours.', 'error')
      return
    }
    setBatchDayRows([
      {
        projectId: projects[0].id,
        hoursSpent: '8',
        note: '',
      },
    ])
    setBatchModalOpen(true)
  }

  const handleAddBatchRow = () => {
    if (projects.length === 0) return
    const usedProjectIds = new Set(batchDayRows.map((r) => r.projectId))
    const unusedProject = projects.find((p) => !usedProjectIds.has(p.id)) || projects[0]

    setBatchDayRows((prev) => [
      ...prev,
      {
        projectId: unusedProject.id,
        hoursSpent: '4',
        note: '',
      },
    ])
  }

  const handleRemoveBatchRow = (index) => {
    setBatchDayRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateBatchRow = (index, field, value) => {
    setBatchDayRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleSaveBatchModal = async (e) => {
    e.preventDefault()
    if (selectedDates.size === 0) return

    let totalHrsPerDay = 0
    for (const r of batchDayRows) {
      if (!r.projectId) {
        showToast('Please select a project for all rows.', 'error')
        return
      }
      const hrs = Number(r.hoursSpent)
      if (isNaN(hrs) || hrs < 0 || hrs > 24) {
        showToast('Hours spent must be between 0 and 24.', 'error')
        return
      }
      totalHrsPerDay += hrs
    }

    if (Math.abs(totalHrsPerDay - 8) > 0.01) {
      showToast(
        `Total allocation per day must equal exactly 1 day (8 hours). Current total: ${totalHrsPerDay}h (${hoursToDays(
          totalHrsPerDay
        )}d).`,
        'warning'
      )
      return
    }

    const payload = []
    Array.from(selectedDates).forEach((dateStr) => {
      batchDayRows.forEach((r) => {
        payload.push({
          date: dateStr,
          projectId: r.projectId,
          hoursSpent: Number(r.hoursSpent),
          isHoliday: false,
          note: r.note ? r.note.trim() : null,
        })
      })
    })

    setSubmitting(true)
    try {
      await bulkSubmitTimesheets(payload, token)
      showToast(
        `Successfully applied project entries to ${selectedDates.size} selected days! Total per day: 1 day (8h).`,
        'success'
      )
      setBatchModalOpen(false)
      setSelectedDates(new Set())
      setLastSelectedDate(null)
      await fetchTimesheets()
    } catch (err) {
      showToast(err.message || 'Failed to apply project entries', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate Live Matrix Day Sums & Invalid Dates
  const matrixDaySums = useMemo(() => {
    const sums = {}
    Object.entries(matrixData).forEach(([key, value]) => {
      const hrs = Number(value) || 0
      if (hrs > 0) {
        let dateStr = ''
        if (key.startsWith('holiday_')) {
          dateStr = key.replace('holiday_', '')
        } else {
          const underscoreIdx = key.lastIndexOf('_')
          dateStr = key.substring(underscoreIdx + 1)
        }
        if (dateStr) {
          sums[dateStr] = (sums[dateStr] || 0) + hrs
        }
      }
    })
    return sums
  }, [matrixData])

  // Set of dates where matrix total > 0 and total !== 8 hours (1 day)
  const invalidMatrixDates = useMemo(() => {
    const invalidSet = new Set()
    Object.entries(matrixDaySums).forEach(([dateStr, totalHrs]) => {
      if (totalHrs > 0 && Math.abs(totalHrs - 8) > 0.01) {
        invalidSet.add(dateStr)
      }
    })
    return invalidSet
  }, [matrixDaySums])

  // Calculate Monthly Summary Stats
  const summaryStats = useMemo(() => {
    let totalWorkHours = 0
    let totalHolidayDays = 0
    const workedDaysSet = new Set()

    timesheets.forEach((ts) => {
      const hrs = Number(ts.hoursSpent) || 0
      const d = typeof ts.date === 'string' ? ts.date.split('T')[0] : ''
      if (ts.isHoliday) {
        totalHolidayDays += 1
      } else {
        totalWorkHours += hrs
      }
      if (hrs > 0 || ts.isHoliday) {
        workedDaysSet.add(d)
      }
    })

    const totalWeekdaysCount = monthWeekdays.length
    const filledDaysCount = monthWeekdays.filter((w) => workedDaysSet.has(w.dateString)).length
    const completionRate =
      totalWeekdaysCount > 0 ? Math.round((filledDaysCount / totalWeekdaysCount) * 100) : 0

    return {
      totalWorkHours,
      totalWorkDays: hoursToDays(totalWorkHours),
      totalHolidayDays,
      totalWeekdaysCount,
      filledDaysCount,
      completionRate,
    }
  }, [timesheets, monthWeekdays])

  // Open Edit Modal for specific weekday (Single Day Multi-Project Support)
  const handleOpenDayModal = (dateString) => {
    if (blockIfLocked()) return
    setActiveDay(dateString)

    const existing = entriesByDate[dateString] || []
    const holidayEntry = existing.find((x) => x.isHoliday)

    if (holidayEntry) {
      setModalIsHoliday(true)
      setModalHolidayHours(String(holidayEntry.hoursSpent || 8))
      setModalHolidayNote(holidayEntry.note || 'Holiday / Congé')
      setDayRows([])
    } else {
      setModalIsHoliday(false)
      setModalHolidayHours('8')
      setModalHolidayNote('Holiday / Congé')

      const projectEntries = existing.filter((x) => !x.isHoliday)
      if (projectEntries.length > 0) {
        setDayRows(
          projectEntries.map((pe) => ({
            id: pe.id,
            projectId: pe.projectId || (projects[0]?.id ?? ''),
            hoursSpent: String(pe.hoursSpent || 8),
            note: pe.note || '',
          }))
        )
      } else {
        setDayRows([
          {
            id: null,
            projectId: projects[0]?.id ?? '',
            hoursSpent: '8',
            note: '',
          },
        ])
      }
    }
  }

  // Row handlers in Single Day Modal
  const handleAddDayRow = () => {
    if (projects.length === 0) return
    const usedProjectIds = new Set(dayRows.map((r) => r.projectId))
    const unusedProject = projects.find((p) => !usedProjectIds.has(p.id)) || projects[0]

    setDayRows((prev) => [
      ...prev,
      {
        id: null,
        projectId: unusedProject.id,
        hoursSpent: '4',
        note: '',
      },
    ])
  }

  const handleRemoveDayRow = (index) => {
    setDayRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateDayRow = (index, field, value) => {
    setDayRows((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleSetRowPreset = (index, hoursVal) => {
    handleUpdateDayRow(index, 'hoursSpent', String(hoursVal))
  }

  // Save All Entries for Single Day
  const handleSaveDayEntries = async (e) => {
    e.preventDefault()
    if (!activeDay) return
    if (blockIfLocked()) return

    if (modalIsHoliday) {
      const hNum = Number(modalHolidayHours)
      if (Math.abs(hNum - 8) > 0.01) {
        showToast('Holiday total for a day must equal exactly 1 day (8 hours).', 'warning')
        return
      }
      setSubmitting(true)
      try {
        await submitTimesheet(
          {
            date: activeDay,
            hoursSpent: hNum,
            isHoliday: true,
            note: modalHolidayNote || 'Holiday / Congé',
          },
          token
        )
        showToast(`Marked ${activeDay} as Holiday (1.0 day / 8h)!`, 'success')
        setActiveDay(null)
        await fetchTimesheets()
      } catch (err) {
        showToast(err.message || 'Failed to save holiday', 'error')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (dayRows.length === 0) {
      showToast('Please add at least one project entry or mark as Holiday.', 'error')
      return
    }

    let dayTotalHours = 0
    const payloadEntries = []

    for (const r of dayRows) {
      if (!r.projectId) {
        showToast('Please select a project for all rows.', 'error')
        return
      }
      const hrs = Number(r.hoursSpent)
      if (isNaN(hrs) || hrs < 0 || hrs > 24) {
        showToast('Hours spent must be between 0 and 24.', 'error')
        return
      }
      dayTotalHours += hrs
      payloadEntries.push({
        id: r.id || undefined,
        date: activeDay,
        projectId: r.projectId,
        hoursSpent: hrs,
        isHoliday: false,
        note: r.note ? r.note.trim() : null,
      })
    }

    if (Math.abs(dayTotalHours - 8) > 0.01) {
      showToast(
        `Total allocation for ${activeDay} must equal exactly 1 day (8 hours). Current total: ${dayTotalHours}h (${hoursToDays(
          dayTotalHours
        )}d).`,
        'warning'
      )
      return
    }

    setSubmitting(true)
    try {
      await bulkSubmitTimesheets(payloadEntries, token)
      showToast(`Successfully saved timesheet for ${activeDay}! Total: 1 day (8h).`, 'success')
      setActiveDay(null)
      await fetchTimesheets()
    } catch (err) {
      showToast(err.message || 'Failed to save entries', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Quick Toggle Holiday on Day Card
  const handleQuickToggleHoliday = async (dateString, e) => {
    e.stopPropagation()
    if (blockIfLocked()) return

    const existing = entriesByDate[dateString] || []
    const isCurrentlyHoliday = existing.some((x) => x.isHoliday)

    setSubmitting(true)
    try {
      if (isCurrentlyHoliday) {
        const holidayEntry = existing.find((x) => x.isHoliday)
        if (holidayEntry) {
          await deleteTimesheetEntry(holidayEntry.id, token)
        }
        showToast(`Removed holiday for ${dateString}`, 'info')
      } else {
        await submitTimesheet(
          {
            date: dateString,
            hoursSpent: 8,
            isHoliday: true,
            note: 'Holiday / Congé',
          },
          token
        )
        showToast(`Marked ${dateString} as Holiday (1 day / 8h)!`, 'success')
      }
      await fetchTimesheets()
    } catch (err) {
      showToast(err.message || 'Failed to toggle holiday', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete an entry with custom confirmation modal
  const handleDeleteEntry = (id, e) => {
    e.stopPropagation()
    if (blockIfLocked()) return

    setConfirmModal({
      isOpen: true,
      title: 'Delete Entry',
      message: 'Are you sure you want to delete this timesheet entry?',
      subMessage: 'This logged entry will be removed from your timesheet.',
      confirmText: 'Delete Entry',
      cancelText: 'Cancel',
      isDanger: true,
      onConfirm: async () => {
        setSubmitting(true)
        try {
          await deleteTimesheetEntry(id, token)
          showToast('Entry deleted successfully.', 'success')
          await fetchTimesheets()
        } catch (err) {
          showToast(err.message || 'Failed to delete entry', 'error')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  // Handle matrix input change
  const handleMatrixInputChange = (key, rawVal) => {
    let hrsVal = 0
    if (rawVal !== '' && rawVal !== null) {
      hrsVal = unitMode === 'days' ? daysToHours(rawVal) : Number(rawVal)
    }
    setMatrixData((prev) => ({
      ...prev,
      [key]: hrsVal,
    }))
  }

  // INSTANT BLUR VALIDATION FOR MATRIX VIEW CELLS
  const handleMatrixCellBlur = (dateString) => {
    const totalHrs = matrixDaySums[dateString] || 0
    if (totalHrs > 0 && Math.abs(totalHrs - 8) > 0.01) {
      showToast(
        `⚠️ Validation Alert: Total input for ${dateString} is ${totalHrs}h (${hoursToDays(
          totalHrs
        )}d). Each filled day must equal exactly 1 day (8 hours).`,
        'warning'
      )
    }
  }

  // Get matrix cell display value based on unitMode
  const getMatrixDisplayVal = (key) => {
    const rawVal = matrixData[key]
    if (rawVal === undefined || rawVal === '' || rawVal === null || Number(rawVal) === 0) return ''
    if (unitMode === 'days') {
      return hoursToDays(rawVal)
    }
    return rawVal
  }

  // Save full monthly matrix including 0-hour cleanups
  const handleSaveMatrix = async () => {
    if (blockIfLocked()) return

    const entriesToSave = []
    const allKeysToProcess = new Set(Object.keys(matrixData))

    timesheets.forEach((ts) => {
      const dateKey = typeof ts.date === 'string' ? ts.date.split('T')[0] : ''
      if (!dateKey) return
      const k = ts.isHoliday
        ? `holiday_${dateKey}`
        : `${ts.projectId || 'unassigned'}_${dateKey}`
      allKeysToProcess.add(k)
    })

    allKeysToProcess.forEach((key) => {
      const value = matrixData[key]
      const hrs = Number(value) || 0

      if (key.startsWith('holiday_')) {
        const dateStr = key.replace('holiday_', '')
        const hasExistingHoliday = entriesByDate[dateStr]?.some((x) => x.isHoliday)
        if (hrs > 0 || hasExistingHoliday) {
          entriesToSave.push({
            date: dateStr,
            hoursSpent: hrs,
            isHoliday: true,
            note: 'Holiday / Congé',
          })
        }
      } else {
        const underscoreIdx = key.lastIndexOf('_')
        const projId = key.substring(0, underscoreIdx)
        const dateStr = key.substring(underscoreIdx + 1)
        if (projId !== 'unassigned') {
          const hasExistingProject = entriesByDate[dateStr]?.some((x) => x.projectId === projId)
          if (hrs > 0 || hasExistingProject) {
            entriesToSave.push({
              date: dateStr,
              projectId: projId,
              hoursSpent: hrs,
              isHoliday: false,
            })
          }
        }
      }
    })

    if (entriesToSave.length === 0) {
      showToast('No hours entered to save in matrix.', 'warning')
      return
    }

    if (invalidMatrixDates.size > 0) {
      const datesList = Array.from(invalidMatrixDates).join(', ')
      showToast(
        `Validation Error: Please fix highlighted date column(s) [${datesList}]. Every filled day must equal exactly 1 day (8 hours).`,
        'error'
      )
      return
    }

    setSubmitting(true)
    try {
      await bulkSubmitTimesheets(entriesToSave, token)
      showToast(`Saved monthly timesheet! All filled days equal exactly 1 day (8h).`, 'success')
      await fetchTimesheets()
    } catch (err) {
      showToast(err.message || 'Failed to save monthly matrix', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Quick Auto-fill 8h (1d) weekdays for first project
  const handleAutoFillMonth = () => {
    if (blockIfLocked()) return
    if (projects.length === 0) {
      showToast('No project assigned to auto-fill.', 'error')
      return
    }
    const targetProject = projects[0]
    const updated = { ...matrixData }

    monthWeekdays.forEach((w) => {
      const holidayKey = `holiday_${w.dateString}`
      const projKey = `${targetProject.id}_${w.dateString}`
      if (!updated[holidayKey]) {
        updated[projKey] = 8
      }
    })

    setMatrixData(updated)
    showToast(`Auto-filled 8h (1d) weekdays for project "${targetProject.name}". Click "Save Monthly Matrix" to submit.`, 'info')
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const activeDayTotalHours = useMemo(() => {
    if (modalIsHoliday) return Number(modalHolidayHours) || 8
    return dayRows.reduce((sum, r) => sum + (Number(r.hoursSpent) || 0), 0)
  }, [modalIsHoliday, modalHolidayHours, dayRows])

  const batchModalTotalHours = useMemo(() => {
    return batchDayRows.reduce((sum, r) => sum + (Number(r.hoursSpent) || 0), 0)
  }, [batchDayRows])

  const isDayModalValid = Math.abs(activeDayTotalHours - 8) < 0.01
  const isBatchModalValid = Math.abs(batchModalTotalHours - 8) < 0.01

  // Renders one weekday's card. Shared by the desktop grid (one per weekday)
  // and the mobile single-day detail panel (just the active day) so both stay
  // in sync automatically.
  const renderDayCard = (w) => {
    const {
      dateString,
      dayName,
      dayNumber,
      dayEntries,
      isHoliday,
      hasProjectWork,
      totalDayHours,
      isValidDayTotal,
    } = w
    const isSelected = selectedDates.has(dateString)

    return (
      <div
        key={dateString}
        className={`calendar-day-card ${isHoliday ? 'is-holiday' : ''} ${
          dayEntries.length > 0 ? 'has-entries' : 'empty'
        } ${!isValidDayTotal ? 'invalid-total' : ''} ${isSelected ? 'selected' : ''} ${
          isLocked ? 'ts-card-locked' : ''
        }`}
        onClick={(e) => handleCardClick(dateString, e)}
      >
        <div className="day-card-header">
          <div className="day-date-box">
            <input
              type="checkbox"
              className="card-select-checkbox"
              checked={isSelected}
              disabled={isLocked}
              onChange={(e) => handleToggleDateSelection(dateString, e)}
              onClick={(e) => e.stopPropagation()}
              title="Select day or Shift-click for range selection"
            />
            <span className="day-name">{dayName}</span>
            <span className="day-number">{dayNumber}</span>
          </div>

          {!isLocked && (isHoliday || !hasProjectWork) && (
            <button
              type="button"
              className={`holiday-toggle-chip ${isHoliday ? 'active' : ''}`}
              title={isHoliday ? 'Remove Holiday' : 'Mark as Holiday'}
              onClick={(e) => handleQuickToggleHoliday(dateString, e)}
            >
              🌴 {isHoliday ? 'Holiday' : 'Set Holiday'}
            </button>
          )}
        </div>

        <div className="day-card-body">
          {isHoliday ? (
            <div className="holiday-banner">
              <span className="holiday-icon">🌴</span>
              <span className="holiday-text">Holiday / Congé</span>
              <span className="holiday-hours">
                ({formatValue(totalDayHours || 8)})
              </span>
            </div>
          ) : dayEntries.length === 0 ? (
            <div className="no-entries-placeholder">
              <span>+ Log project hours</span>
            </div>
          ) : (
            <div className="entries-list">
              {dayEntries.map((entry) => {
                const matchedProj = projects.find((p) => p.id === entry.projectId)
                return (
                  <div key={entry.id} className="entry-pill">
                    <div className="pill-info">
                      <span className="proj-tag">
                        {matchedProj ? matchedProj.name : 'Project'}
                      </span>
                      {entry.note && (
                        <span className="entry-note-preview">- {entry.note}</span>
                      )}
                    </div>
                    <div className="pill-meta">
                      <span className="hours-badge">{formatValue(entry.hoursSpent)}</span>
                      {!isLocked && (
                        <button
                          type="button"
                          className="delete-entry-btn"
                          title="Delete entry"
                          onClick={(e) => handleDeleteEntry(entry.id, e)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="day-card-footer">
          <span className="day-total-hours">
            Total:{' '}
            <strong className={!isValidDayTotal ? 'text-warn' : ''}>
              {totalDayHours}h ({hoursToDays(totalDayHours)}d)
            </strong>
          </span>
          {isLocked ? (
            <span className="edit-hint">
              {period?.status === 'approved' ? '🔒 Validated' : '🔒 Pending validation'}
            </span>
          ) : !isValidDayTotal ? (
            <span className="warn-hint">⚠️ Must be 1d (8h)</span>
          ) : (
            <span className="edit-hint">
              {isSelected ? '✓ Selected' : 'Click to edit'}
            </span>
          )}
        </div>
      </div>
    )
  }

  const StatusIcon = period ? STATUS_META[period.status]?.icon : null

  return (
    <div className="timesheet-hub-container">
      {/* HEADER & NAVIGATOR */}
      <div className="timesheet-header">
        <div className="header-title-group">
          <h1>Monthly Timesheet Calendar</h1>
          <p className="subtitle">
            Log multi-project hours & holidays across weekdays (Monday – Friday). Day inputs must equal 1 day (8h).
          </p>
        </div>

        <div className="month-navigator">
          <button className="nav-btn" onClick={handlePrevMonth} title="Previous Month">
            ‹ Prev
          </button>
          <div className="current-month-display">
            <span className="month-name">{monthNames[selectedMonth - 1]}</span>
            <span className="year-number">{selectedYear}</span>
          </div>
          <button className="nav-btn" onClick={handleNextMonth} title="Next Month">
            Next ›
          </button>
          <button className="nav-btn today-btn" onClick={handleTodayMonth}>
            Today
          </button>
        </div>
      </div>

      {/* SUMMARY STATS BAR */}
      <div className="summary-stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Weekdays</span>
          <span className="stat-value">{summaryStats.totalWeekdaysCount}</span>
          <span className="stat-desc">Mon - Fri days in {monthNames[selectedMonth - 1]}</span>
        </div>
        <div className="stat-card highlight-green">
          <span className="stat-label">Logged Work</span>
          <span className="stat-value">
            {summaryStats.totalWorkHours}h <small>({summaryStats.totalWorkDays}d)</small>
          </span>
          <span className="stat-desc">Project working time</span>
        </div>
        <div className="stat-card highlight-purple">
          <span className="stat-label">Holidays / Leave</span>
          <span className="stat-value">{summaryStats.totalHolidayDays} days</span>
          <span className="stat-desc">Paid leave & off days</span>
        </div>
        <div className="stat-card highlight-teal">
          <span className="stat-label">Month Coverage</span>
          <span className="stat-value">{summaryStats.completionRate}%</span>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${summaryStats.completionRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* MONTHLY VALIDATION WORKFLOW BAR */}
      {period && (
        <div className={`ts-validation-bar ts-status-${period.status}`}>
          <div className="ts-validation-main">
            <span className="ts-status-pill">
              <span className="ts-status-icon">
                {StatusIcon && <StatusIcon size="16px" />}
              </span>
              {STATUS_META[period.status]?.label ?? period.status}
            </span>

            <div className="ts-validation-text">
              <strong className="ts-validation-title">
                {monthNames[selectedMonth - 1]} {selectedYear} — {period.totalDays}d ({period.totalHours}h)
                {' '}on {period.filledDays} day{period.filledDays > 1 ? 's' : ''}
              </strong>
              <span className="ts-validation-hint">{STATUS_META[period.status]?.hint}</span>

              {period.status === 'not_validated' && period.reviewers.length > 0 && (
                <span className="ts-validation-meta">
                  Will be sent to {period.reviewers.map((r) => r.name).join(', ')}
                </span>
              )}
              {period.status === 'pending' && (
                <span className="ts-validation-meta">
                  Sent {formatDateTime(period.submittedAt)}
                  {period.reviewers.length > 0 &&
                    ` · waiting for ${period.reviewers.map((r) => r.name).join(', ')}`}
                </span>
              )}
              {period.status === 'approved' && (
                <span className="ts-validation-meta">
                  Validated by {period.reviewer?.name ?? '—'} on {formatDateTime(period.reviewedAt)}
                </span>
              )}
              {period.status === 'rejected' && (
                <span className="ts-validation-meta">
                  Rejected by {period.reviewer?.name ?? '—'} on {formatDateTime(period.reviewedAt)}
                </span>
              )}
              {period.reviewComment && (
                <span className="ts-validation-comment">💬 “{period.reviewComment}”</span>
              )}
            </div>
          </div>

          <div className="ts-validation-actions">
            {(period.status === 'not_validated' || period.status === 'rejected') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitForValidation}
                disabled={periodBusy || period.entriesCount === 0}
                title={
                  period.entriesCount === 0
                    ? 'Log at least one day first'
                    : 'Send this month to your responsable'
                }
              >
                {periodBusy ? 'Sending...' : <><SendIcon size="16px" /> Send for validation</>}
              </button>
            )}
            {period.status === 'pending' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRecallSubmission}
                disabled={periodBusy}
              >
                ↩️ Cancel submission
              </button>
            )}
            {period.status === 'approved' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon-only"
                  onClick={() => handleDownloadPeriod('xlsx')}
                  disabled={periodBusy}
                  aria-label="Download Excel"
                  data-tooltip="Download Excel"
                >
                  <ExcelIcon size="16px" />
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-icon-only"
                  onClick={() => handleDownloadPeriod('pdf')}
                  disabled={periodBusy}
                  aria-label="Download PDF"
                  data-tooltip="Download PDF"
                >
                  <PdfIcon size="16px" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE TOGGLE & UNIT MODE SWITCH */}
      <div className="view-mode-bar">
        <div className="mode-tabs">
          <button
            className={`tab-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarIcon size="16px" /> <span className="tab-label-full">Weekday Calendar View</span>
            <span className="tab-label-short">Calendar</span>
          </button>
          <button
            className={`tab-btn ${viewMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setViewMode('matrix')}
          >
            <ChartBarIcon size="16px" /> <span className="tab-label-full">Monthly Matrix View</span>
            <span className="tab-label-short">Matrix</span>
          </button>
          <button
            className={`tab-btn ${viewMode === 'history' ? 'active' : ''}`}
            onClick={() => setViewMode('history')}
          >
            <ClipboardIcon size="16px" /> <span className="tab-label-full">Logged History List</span>
            <span className="tab-label-short">History</span>
          </button>
        </div>

        {/* INPUT UNIT SELECTOR (HOURS vs DAYS) */}
        <div className="unit-toggle-container">
          <span className="unit-label">Input Unit:</span>
          <div className="unit-switch">
            <button
              type="button"
              className={`unit-btn ${unitMode === 'hours' ? 'active' : ''}`}
              onClick={() => setUnitMode('hours')}
              title="Input in Hours (2h, 4h, 6h, 8h)"
            >
              Hours (h)
            </button>
            <button
              type="button"
              className={`unit-btn ${unitMode === 'days' ? 'active' : ''}`}
              onClick={() => setUnitMode('days')}
              title="Input in Days Fraction (0.25d, 0.5d, 0.75d, 1d)"
            >
              Days (d)
            </button>
          </div>
        </div>

        {viewMode === 'matrix' && (
          <div className="matrix-actions">
            <button
              className="btn btn-secondary"
              onClick={handleAutoFillMonth}
              disabled={isLocked}
            >
              <BoltIcon size="16px" /> Fill 8h (1d) Weekdays
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSaveMatrix}
              disabled={submitting || isLocked || invalidMatrixDates.size > 0}
            >
              {submitting ? 'Saving...' : <><SaveIcon size="16px" /> Save Monthly Matrix</>}
            </button>
          </div>
        )}
      </div>

      {/* 1. WEEKDAY CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="calendar-view-container">
          {/* QUICK SERIES / WEEK PRESET RANGE SELECTOR */}
          <div className="series-range-bar">
            <span className="series-label">Series Selection:</span>
            <div className="week-preset-list">
              {monthWeeks.map((week, idx) => {
                const startStr = week[0].dateString
                const endStr = week[week.length - 1].dateString
                return (
                  <button
                    key={idx}
                    type="button"
                    className="week-preset-btn"
                    onClick={() => handleSelectDateRange(startStr, endStr)}
                    title={`Select all weekdays from ${week[0].dayName} ${week[0].dayNumber} to ${week[week.length - 1].dayName} ${week[week.length - 1].dayNumber}`}
                  >
                    Week {idx + 1} ({week[0].dayNumber}–{week[week.length - 1].dayNumber})
                  </button>
                )
              })}
            </div>
            <span className="shift-hint">💡 Tip: Hold <strong>Shift</strong> and click any 2 cards to select a series of consecutive days!</span>
          </div>

          {/* MULTI-CARD SELECTION FLOATING BATCH TOOLBAR */}
          {selectedDates.size > 0 && (
            <div className="batch-action-bar">
              <div className="batch-info">
                <span className="batch-count-badge">
                  ✓ {selectedDates.size} day{selectedDates.size > 1 ? 's' : ''} selected
                </span>
                <button
                  type="button"
                  className="batch-link-btn"
                  onClick={handleSelectAllWeekdays}
                >
                  Select All ({monthWeekdays.length})
                </button>
                <button
                  type="button"
                  className="batch-link-btn"
                  onClick={handleDeselectAllDates}
                >
                  Deselect All
                </button>
              </div>

              <div className="batch-buttons">
                <button
                  type="button"
                  className="btn btn-secondary-sm batch-btn-item"
                  onClick={handleBatchSetHoliday}
                  disabled={submitting || isLocked}
                >
                  🌴 Set as Holiday (1d)
                </button>
                <button
                  type="button"
                  className="btn btn-primary-sm batch-btn-item"
                  onClick={handleOpenBatchModal}
                  disabled={submitting || isLocked || projects.length === 0}
                >
                  📁 Apply Project Hours...
                </button>
                <button
                  type="button"
                  className="btn btn-danger-sm batch-btn-item"
                  onClick={handleBatchClearSelected}
                  disabled={submitting || isLocked}
                >
                  🗑️ Clear Selected ({selectedDates.size})
                </button>
              </div>
            </div>
          )}

          {loadingProjects || loadingTimesheets ? (
            <div className="loading-spinner">Loading monthly calendar data...</div>
          ) : (
            <>
              {/* MOBILE: compact day strip + single-day detail, instead of scrolling ~23 cards */}
              <div className="mobile-day-nav">
                <button
                  type="button"
                  className="strip-arrow"
                  onClick={() => handleStripStepDay(-1)}
                  disabled={activeDayIndex <= 0}
                  aria-label="Previous day"
                >
                  ‹
                </button>
                <div className="day-strip-nav" role="tablist" aria-label="Select a day to edit">
                  {dayStatusList.map((w) => {
                    const isActive = w.dateString === mobileActiveDate
                    let dotClass = 'strip-dot-empty'
                    if (w.isHoliday) dotClass = 'strip-dot-holiday'
                    else if (w.dayEntries.length > 0 && !w.isValidDayTotal) dotClass = 'strip-dot-invalid'
                    else if (w.dayEntries.length > 0) dotClass = 'strip-dot-done'

                    return (
                      <button
                        key={w.dateString}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        ref={isActive ? scrollPillIntoView : null}
                        className={`day-strip-pill ${isActive ? 'active' : ''} ${
                          w.dateString === todayDateString ? 'is-today' : ''
                        }`}
                        onClick={() => setMobileActiveDateOverride(w.dateString)}
                      >
                        <span className="strip-day-name">{w.dayName}</span>
                        <span className="strip-day-number">{w.dayNumber}</span>
                        <span className={`strip-dot ${dotClass}`} aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="strip-arrow"
                  onClick={() => handleStripStepDay(1)}
                  disabled={activeDayIndex === -1 || activeDayIndex >= dayStatusList.length - 1}
                  aria-label="Next day"
                >
                  ›
                </button>
              </div>

              <div className="mobile-day-detail">
                {activeDayStatus && renderDayCard(activeDayStatus)}
              </div>

              {/* DESKTOP / TABLET: full grid of every weekday */}
              <div className="calendar-grid">
                {dayStatusList.map((w) => renderDayCard(w))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. MONTHLY MATRIX VIEW WITH LIVE BLUR VALIDATION & ERROR COLUMN HIGHLIGHTING */}
      {viewMode === 'matrix' && (
        <div className="matrix-view-container">
          <div className="matrix-table-wrapper">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="project-col">Project / Type</th>
                  {monthWeekdays.map((w) => {
                    const isInvalid = invalidMatrixDates.has(w.dateString)
                    const dayTotal = matrixDaySums[w.dateString] || 0
                    return (
                      <th
                        key={w.dateString}
                        className={`day-col ${isInvalid ? 'th-error-column' : ''}`}
                        title={
                          isInvalid
                            ? `Total: ${dayTotal}h (${hoursToDays(
                                dayTotal
                              )}d) - Must equal 1 day (8h)`
                            : ''
                        }
                      >
                        <div className="th-day-name">{w.dayName}</div>
                        <div className="th-day-num">{w.dayNumber}</div>
                        {isInvalid && <span className="col-error-badge"><WarningIcon size="14px" /></span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {/* 1. HOLIDAY ROW */}
                <tr className="holiday-row">
                  <td className="project-cell holiday-cell-title">
                    <span className="cell-icon"><UmbrellaIcon size="14px" /></span> Holiday (Congé)
                  </td>
                  {monthWeekdays.map((w) => {
                    const key = `holiday_${w.dateString}`
                    const displayVal = getMatrixDisplayVal(key)
                    const isInvalid = invalidMatrixDates.has(w.dateString)
                    return (
                      <td
                        key={w.dateString}
                        className={`matrix-cell holiday-cell ${
                          isInvalid ? 'td-error-column' : ''
                        }`}
                      >
                        <input
                          type="number"
                          step={unitMode === 'days' ? '0.25' : '1'}
                          min="0"
                          max={unitMode === 'days' ? '3' : '24'}
                          className="cell-input holiday-input"
                          placeholder="0"
                          value={displayVal}
                          disabled={isLocked}
                          onChange={(e) => handleMatrixInputChange(key, e.target.value)}
                          onBlur={() => handleMatrixCellBlur(w.dateString)}
                        />
                      </td>
                    )
                  })}
                </tr>

                {/* 2. PROJECTS ROWS */}
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={monthWeekdays.length + 1} className="empty-projects-cell">
                      No assigned projects found. Ask your administrator to assign you to a project.
                    </td>
                  </tr>
                ) : (
                  projects.map((proj) => (
                    <tr key={proj.id} className="project-row">
                      <td className="project-cell">
                        <span className="proj-dot"></span>
                        <div className="proj-meta">
                          <span className="proj-name">{proj.name}</span>
                          <span className="proj-code">{proj.code ?? 'Project'}</span>
                        </div>
                      </td>
                      {monthWeekdays.map((w) => {
                        const key = `${proj.id}_${w.dateString}`
                        const displayVal = getMatrixDisplayVal(key)
                        const isInvalid = invalidMatrixDates.has(w.dateString)
                        return (
                          <td
                            key={w.dateString}
                            className={`matrix-cell ${
                              isInvalid ? 'td-error-column' : ''
                            }`}
                          >
                            <input
                              type="number"
                              step={unitMode === 'days' ? '0.25' : '0.5'}
                              min="0"
                              max={unitMode === 'days' ? '3' : '24'}
                              className="cell-input"
                              placeholder="0"
                              value={displayVal}
                              disabled={isLocked}
                              onChange={(e) =>
                                handleMatrixInputChange(key, e.target.value)
                              }
                              onBlur={() => handleMatrixCellBlur(w.dateString)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. LOGGED HISTORY LIST */}
      {viewMode === 'history' && (
        <div className="history-view-container">
          {loadingTimesheets ? (
            <div className="loading-spinner">Loading history...</div>
          ) : timesheets.length === 0 ? (
            <div className="empty-state">No timesheets recorded for {monthNames[selectedMonth - 1]} {selectedYear}.</div>
          ) : (
            <div className="timesheets-table-wrapper">
              <table className="timesheets-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type / Project</th>
                    <th>Hours logged</th>
                    <th>Days fraction</th>
                    <th>Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map((ts) => {
                    const matchedProj = projects.find((p) => p.id === ts.projectId)
                    const hrs = Number(ts.hoursSpent) || 0
                    return (
                      <tr key={ts.id}>
                        <td data-label="Date">
                          {typeof ts.date === 'string' ? ts.date.split('T')[0] : ts.date}
                        </td>
                        <td data-label="Type / Project">
                          {ts.isHoliday ? (
                            <span className="badge badge-holiday"><UmbrellaIcon size="14px" /> Holiday / Congé</span>
                          ) : (
                            <span className="badge badge-project">
                              <FolderIcon size="14px" /> {matchedProj ? matchedProj.name : 'Project Work'}
                            </span>
                          )}
                        </td>
                        <td data-label="Hours logged">
                          <strong>{hrs} hrs</strong>
                        </td>
                        <td data-label="Days fraction">
                          <strong>{hoursToDays(hrs)} day(s)</strong>
                        </td>
                        <td data-label="Note">{ts.note || '—'}</td>
                        <td data-label="Action">
                          {isLocked ? (
                            <span className="badge badge-locked"><LockIcon size="14px" /> Locked</span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-danger-sm"
                              onClick={(e) => handleDeleteEntry(ts.id, e)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SINGLE DAY MULTI-PROJECT EDITING MODAL */}
      {activeDay && (
        <div className="modal-backdrop" onClick={() => setActiveDay(null)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Log Time for {activeDay}</h2>
                <span className="modal-subtitle">
                  Total day input must equal exactly 1 day (8 hours).
                </span>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActiveDay(null)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveDayEntries} className="modal-form">
              {/* HOLIDAY VS MULTI-PROJECT TOGGLE */}
              <div className="form-group">
                <label>Day Classification</label>
                <div className="type-toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${!modalIsHoliday ? 'selected' : ''}`}
                    onClick={() => setModalIsHoliday(false)}
                  >
                    📁 Working Day (Multi-Projects)
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${modalIsHoliday ? 'selected' : ''}`}
                    onClick={() => {
                      setModalIsHoliday(true)
                      setModalHolidayHours('8')
                    }}
                  >
                    🌴 Holiday / Congé (1d / 8h)
                  </button>
                </div>
              </div>

              {/* HOLIDAY INPUT SECTION */}
              {modalIsHoliday ? (
                <div className="holiday-form-block">
                  <div className="form-group">
                    <label>Holiday Duration</label>
                    <div className="preset-chip-group">
                      <button
                        type="button"
                        className={`chip ${modalHolidayHours === '8' ? 'active' : ''}`}
                        onClick={() => setModalHolidayHours('8')}
                      >
                        ✓ Full Holiday (1 Day / 8h)
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="modalHolidayNote">Note / Description</label>
                    <input
                      id="modalHolidayNote"
                      type="text"
                      className="form-input"
                      value={modalHolidayNote}
                      onChange={(e) => setModalHolidayNote(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                /* MULTI-PROJECT ROWS SECTION */
                <div className="multi-project-block">
                  <div className="block-header">
                    <label>Project Allocations for {activeDay}</label>
                    <button
                      type="button"
                      className="btn btn-secondary-sm"
                      onClick={handleAddDayRow}
                      disabled={projects.length === 0}
                    >
                      + Add Project
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <p className="form-warning">
                      No assigned projects found. Contact your administrator to be assigned to a project.
                    </p>
                  ) : dayRows.length === 0 ? (
                    <p className="no-rows-msg">No projects added yet for this day. Click "+ Add Project".</p>
                  ) : (
                    <div className="project-rows-list">
                      {dayRows.map((row, idx) => {
                        const hrs = Number(row.hoursSpent) || 0
                        return (
                          <div key={idx} className="project-row-item">
                            <div className="row-main">
                              <div className="row-field proj-select-field">
                                <label className="row-label">Project</label>
                                <select
                                  className="form-select"
                                  value={row.projectId}
                                  onChange={(e) =>
                                    handleUpdateDayRow(idx, 'projectId', e.target.value)
                                  }
                                >
                                  {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.code || 'PRJ'})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="row-field hours-field">
                                <label className="row-label">Time</label>
                                <div className="hours-input-wrapper">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    max="24"
                                    className="form-input"
                                    value={row.hoursSpent}
                                    onChange={(e) =>
                                      handleUpdateDayRow(
                                        idx,
                                        'hoursSpent',
                                        e.target.value
                                      )
                                    }
                                  />
                                  <span className="unit-tag">
                                    hrs ({hoursToDays(hrs)}d)
                                  </span>
                                </div>
                              </div>

                              {dayRows.length > 1 && (
                                <button
                                  type="button"
                                  className="remove-row-btn"
                                  title="Remove project entry"
                                  onClick={() => handleRemoveDayRow(idx)}
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {/* PRESET FRACTION BUTTONS */}
                            <div className="row-presets">
                              <span className="preset-title">Presets:</span>
                              <button
                                type="button"
                                className={`preset-btn ${hrs === 8 ? 'selected' : ''}`}
                                onClick={() => handleSetRowPreset(idx, 8)}
                              >
                                1d (8h)
                              </button>
                              <button
                                type="button"
                                className={`preset-btn ${hrs === 6 ? 'selected' : ''}`}
                                onClick={() => handleSetRowPreset(idx, 6)}
                              >
                                0.75d (6h)
                              </button>
                              <button
                                type="button"
                                className={`preset-btn ${hrs === 4 ? 'selected' : ''}`}
                                onClick={() => handleSetRowPreset(idx, 4)}
                              >
                                0.5d (4h)
                              </button>
                              <button
                                type="button"
                                className={`preset-btn ${hrs === 2 ? 'selected' : ''}`}
                                onClick={() => handleSetRowPreset(idx, 2)}
                              >
                                0.25d (2h)
                              </button>
                            </div>

                            <div className="row-note">
                              <input
                                type="text"
                                className="form-input note-input"
                                placeholder="Note / task description (optional)"
                                value={row.note}
                                onChange={(e) =>
                                  handleUpdateDayRow(idx, 'note', e.target.value)
                                }
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* LIVE DAY TOTAL STATUS BAR */}
              <div
                className={`modal-total-bar ${
                  isDayModalValid
                    ? 'valid'
                    : activeDayTotalHours < 8
                    ? 'under'
                    : 'over'
                }`}
              >
                <span>Day Total:</span>
                <strong>
                  {isDayModalValid
                    ? `✓ ${activeDayTotalHours}h (${hoursToDays(activeDayTotalHours)}d) - Perfect`
                    : activeDayTotalHours < 8
                    ? `⚠️ ${activeDayTotalHours}h (${hoursToDays(activeDayTotalHours)}d) - Must equal 1 day (8h)`
                    : `❌ ${activeDayTotalHours}h (${hoursToDays(activeDayTotalHours)}d) - Exceeds 1 day (8h)`}
                </strong>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveDay(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !isDayModalValid}
                >
                  {submitting ? 'Saving...' : 'Save Day Entries'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH APPLY PROJECT TIME MODAL (FOR MULTIPLE SELECTED DAYS) */}
      {batchModalOpen && (
        <div className="modal-backdrop" onClick={() => setBatchModalOpen(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Apply Time to {selectedDates.size} Selected Days</h2>
                <span className="modal-subtitle">
                  Configure project allocation to apply across all {selectedDates.size} selected weekdays.
                </span>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setBatchModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveBatchModal} className="modal-form">
              <div className="multi-project-block">
                <div className="block-header">
                  <label>Project Allocations per Selected Day</label>
                  <button
                    type="button"
                    className="btn btn-secondary-sm"
                    onClick={handleAddBatchRow}
                    disabled={projects.length === 0}
                  >
                    + Add Project
                  </button>
                </div>

                <div className="project-rows-list">
                  {batchDayRows.map((row, idx) => {
                    const hrs = Number(row.hoursSpent) || 0
                    return (
                      <div key={idx} className="project-row-item">
                        <div className="row-main">
                          <div className="row-field proj-select-field">
                            <label className="row-label">Project</label>
                            <select
                              className="form-select"
                              value={row.projectId}
                              onChange={(e) =>
                                handleUpdateBatchRow(idx, 'projectId', e.target.value)
                              }
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.code || 'PRJ'})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="row-field hours-field">
                            <label className="row-label">Time per Day</label>
                            <div className="hours-input-wrapper">
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                max="24"
                                className="form-input"
                                value={row.hoursSpent}
                                onChange={(e) =>
                                  handleUpdateBatchRow(
                                    idx,
                                    'hoursSpent',
                                    e.target.value
                                  )
                                }
                              />
                              <span className="unit-tag">
                                hrs ({hoursToDays(hrs)}d)
                              </span>
                            </div>
                          </div>

                          {batchDayRows.length > 1 && (
                            <button
                              type="button"
                              className="remove-row-btn"
                              title="Remove row"
                              onClick={() => handleRemoveBatchRow(idx)}
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className="row-note">
                          <input
                            type="text"
                            className="form-input note-input"
                            placeholder="Note / task description (optional)"
                            value={row.note}
                            onChange={(e) =>
                              handleUpdateBatchRow(idx, 'note', e.target.value)
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* BATCH DAY TOTAL BAR */}
              <div
                className={`modal-total-bar ${
                  isBatchModalValid
                    ? 'valid'
                    : batchModalTotalHours < 8
                    ? 'under'
                    : 'over'
                }`}
              >
                <span>Total Per Day:</span>
                <strong>
                  {isBatchModalValid
                    ? `✓ ${batchModalTotalHours}h (${hoursToDays(batchModalTotalHours)}d) - Perfect`
                    : batchModalTotalHours < 8
                    ? `⚠️ ${batchModalTotalHours}h (${hoursToDays(batchModalTotalHours)}d) - Must equal 1 day (8h)`
                    : `❌ ${batchModalTotalHours}h (${hoursToDays(batchModalTotalHours)}d) - Exceeds 1 day (8h)`}
                </strong>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setBatchModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !isBatchModalValid}
                >
                  {submitting ? 'Applying...' : `Apply to ${selectedDates.size} Days`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM APPLICATION CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="modal-content confirm-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{confirmModal.title}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
              >
                ×
              </button>
            </div>
            <div className="confirm-modal-body">
              <p className="confirm-message">{confirmModal.message}</p>
              {confirmModal.subMessage && (
                <p className="confirm-submessage">{confirmModal.subMessage}</p>
              )}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }))
                  }
                >
                  {confirmModal.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  className={`btn ${
                    confirmModal.isDanger ? 'btn-danger' : 'btn-primary'
                  }`}
                  onClick={async () => {
                    const fn = confirmModal.onConfirm
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }))
                    if (fn) await fn()
                  }}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
