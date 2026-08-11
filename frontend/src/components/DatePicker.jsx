import { useEffect, useRef, useState } from 'react'
import { formatDate } from '../lib/dateFormat'
import './DatePicker.css'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Dark-themed calendar dropdown — same trigger-button-plus-popover shape as
// Dropdown.jsx, but for date selection with month/year navigation instead
// of a flat option list. No existing date-input precedent in this app.
export default function DatePicker({
  value, // Date | null
  onChange, // (Date) => void
  min, // Date | null — dates before this are shown disabled
  className,
  placeholder = 'Select a date…',
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => value ?? min ?? new Date())
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function handleOpen() {
    if (!open) setViewMonth(value ?? min ?? new Date())
    setOpen(o => !o)
  }

  function pick(day) {
    onChange(day)
    setOpen(false)
  }

  const minDay = min ? startOfDay(min) : null
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = firstOfMonth.getDay()
  const days = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  return (
    <div className={`date-picker ${className || ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`date-picker-trigger ${open ? 'date-picker-trigger--open' : ''}`}
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={`date-picker-trigger-value ${value ? '' : 'date-picker-trigger-placeholder'}`}>
          {value ? formatDate(value) : placeholder}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      </button>

      {open && (
        <div className="date-picker-popover" role="dialog">
          <div className="date-picker-nav">
            <button
              type="button"
              className="date-picker-nav-btn"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="date-picker-nav-label">{MONTH_NAMES[month]} {year}</span>
            <button
              type="button"
              className="date-picker-nav-btn"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="date-picker-weekdays">
            {WEEKDAY_LABELS.map((w, i) => <span key={i}>{w}</span>)}
          </div>

          <div className="date-picker-grid">
            {days.map((day, i) => {
              if (day === null) return <span key={i} className="date-picker-cell date-picker-cell--blank" />
              const disabled = minDay !== null && day < minDay
              const selected = value != null && isSameDay(day, value)
              return (
                <button
                  key={i}
                  type="button"
                  className={`date-picker-cell date-picker-cell--day ${selected ? 'date-picker-cell--selected' : ''}`}
                  disabled={disabled}
                  onClick={() => pick(day)}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
