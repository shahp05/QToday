import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import './TeachLogCalendar.css'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function IconChevronLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthCells(viewDate) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1
    const date = new Date(year, month, dayNum)
    cells.push({ date, inMonth: dayNum >= 1 && dayNum <= daysInMonth, key: toKey(date) })
  }
  return cells
}

// Subjects -> topics -> grades -> logs (the shape subjectsTaughtStore already
// holds) flattened into one row per (date, section) teach_log entry — the
// calendar only cares about "what was taught, to whom, when", not the
// subject/topic/grade nesting the list view needs.
function flattenEntries(subjects) {
  const rows = []
  for (const subject of subjects) {
    for (const topic of subject.topics) {
      for (const grade of topic.grades) {
        for (const log of grade.logs) {
          rows.push({
            date: log.date,
            section: log.section,
            subject_id: subject.subject_id,
            subject_name: subject.subject_name,
            icon_key: subject.icon_key,
            topic_id: topic.topic_id,
            topic_name: topic.topic_name,
            grade_id: grade.grade_id,
            grade_name: grade.grade_name,
          })
        }
      }
    }
  }
  return rows
}

// A multi-select dropdown where "all selected" is represented as null (rather
// than an explicit Set of every option) so the UI can start in an "All X"
// state before the option list has even loaded.
function useToggleSet() {
  const [selected, setSelected] = useState(null)
  function toggle(id, allIds) {
    setSelected(prev => {
      const base = prev === null ? new Set(allIds) : new Set(prev)
      if (base.has(id)) base.delete(id)
      else base.add(id)
      return base
    })
  }
  function isChecked(id) {
    return selected === null || selected.has(id)
  }
  function reset() {
    setSelected(null)
  }
  return { selected, toggle, isChecked, reset }
}

function FilterDropdown({ label, options, isChecked, onToggle, renderOption }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  return (
    <div className="teach-log-cal-dropdown" ref={ref}>
      <button className="teach-log-cal-dropdown-btn" onClick={() => setOpen(o => !o)}>
        {label}
        <IconChevronDown />
      </button>
      {open && (
        <div className="teach-log-cal-dropdown-panel">
          {options.length === 0 && <p className="teach-log-cal-dropdown-empty">Nothing to show</p>}
          {options.map(opt => (
            <label key={opt.id} className="teach-log-cal-dropdown-item">
              <input
                type="checkbox"
                checked={isChecked(opt.id)}
                onChange={() => onToggle(opt.id)}
              />
              {renderOption ? renderOption(opt) : opt.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeachLogCalendar({ onEmptyDayClick }) {
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const status = useSubjectsTaughtStore(s => s.status)
  const error = useSubjectsTaughtStore(s => s.error)

  const entries = useMemo(() => flattenEntries(subjects), [subjects])

  // Grade -> its distinct sections, same grouping StudentsList.jsx uses for
  // the students roster — grade and section are shown as one combined pill
  // row, not two independent filters.
  const grades = useMemo(() => {
    const map = new Map() // grade_id -> { grade_id, grade_name, sections: Set }
    entries.forEach(e => {
      if (!map.has(e.grade_id)) map.set(e.grade_id, { grade_id: e.grade_id, grade_name: e.grade_name, sections: new Set() })
      if (e.section) map.get(e.grade_id).sections.add(e.section)
    })
    return [...map.values()]
      .map(g => ({ ...g, sections: [...g.sections].sort() }))
      .sort((a, b) => a.grade_name - b.grade_name)
  }, [entries])

  const hasSections = grades.some(g => g.sections.length > 0)

  const [selectedGradeId, setSelectedGradeId] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)

  // Default to the first grade/section once data is available, and re-pick
  // if the previously selected grade disappears.
  useEffect(() => {
    if (grades.length === 0) return
    if (selectedGradeId != null && grades.some(g => g.grade_id === selectedGradeId)) return
    setSelectedGradeId(grades[0].grade_id)
    setSelectedSection(grades[0].sections[0] ?? null)
  }, [grades, selectedGradeId])

  function selectGrade(gradeId) {
    setSelectedGradeId(gradeId)
    const grade = grades.find(g => g.grade_id === gradeId)
    setSelectedSection(grade?.sections[0] ?? null)
  }

  const subjectFilter = useToggleSet()
  const topicFilter = useToggleSet()

  // A different grade/section combination means a different set of
  // subjects/topics were taught — stale filter selections shouldn't carry over.
  useEffect(() => {
    subjectFilter.reset()
    topicFilter.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGradeId, selectedSection])

  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })

  const entriesForGradeSection = useMemo(
    () => entries.filter(e => e.grade_id === selectedGradeId && (!hasSections || e.section === selectedSection)),
    [entries, selectedGradeId, selectedSection, hasSections]
  )

  const subjectOptions = useMemo(() => {
    const map = new Map()
    entriesForGradeSection.forEach(e => {
      if (!map.has(e.subject_id)) {
        map.set(e.subject_id, { id: e.subject_id, name: e.subject_name, icon_key: e.icon_key })
      }
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [entriesForGradeSection])

  const entriesForSubjects = useMemo(
    () => entriesForGradeSection.filter(e => subjectFilter.isChecked(e.subject_id)),
    [entriesForGradeSection, subjectFilter.selected] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const topicOptions = useMemo(() => {
    const map = new Map()
    entriesForSubjects.forEach(e => {
      if (!map.has(e.topic_id)) map.set(e.topic_id, { id: e.topic_id, name: e.topic_name })
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [entriesForSubjects])

  const visibleEntries = useMemo(
    () => entriesForSubjects.filter(e => topicFilter.isChecked(e.topic_id)),
    [entriesForSubjects, topicFilter.selected] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // A topic taught twice the same day to the same grade/section shouldn't
  // show as two identical chips — dedupe by (date, topic).
  const entriesByDate = useMemo(() => {
    const map = new Map()
    const seen = new Set()
    visibleEntries.forEach(e => {
      const dedupeKey = `${e.date}::${e.topic_id}`
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    })
    return map
  }, [visibleEntries])

  const monthCells = useMemo(() => buildMonthCells(viewDate), [viewDate])
  const today = new Date()
  const isCurrentMonth = viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth()

  function shiftMonth(delta) {
    setViewDate(d => {
      const next = new Date(d.getFullYear(), d.getMonth() + delta, 1)
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      return next > currentMonthStart ? currentMonthStart : next
    })
  }

  const subjectLabel = subjectFilter.selected === null
    ? 'Subjects'
    : `${subjectFilter.selected.size} subject${subjectFilter.selected.size === 1 ? '' : 's'}`
  const topicLabel = topicFilter.selected === null
    ? 'Topics'
    : `${topicFilter.selected.size} topic${topicFilter.selected.size === 1 ? '' : 's'}`

  return (
    <div className="teach-log-calendar">
      {status === 'error' && <p className="teach-log-list-empty">{error}</p>}

      {status === 'loaded' && grades.length === 0 && (
        <p className="teach-log-list-empty">Nothing logged yet — log the first topic you taught today.</p>
      )}

      {status === 'loaded' && grades.length > 0 && (
        <>
          <div className="teach-log-filter-row">
            {grades.map(g => (
              <Fragment key={g.grade_id}>
                <button
                  className={`teach-log-grade-pill ${g.grade_id === selectedGradeId ? 'teach-log-grade-pill--active' : ''}`}
                  onClick={() => selectGrade(g.grade_id)}
                >
                  {g.grade_name}
                </button>

                {hasSections && g.grade_id === selectedGradeId && g.sections.map(section => (
                  <button
                    key={section}
                    className={`teach-log-section-pill ${section === selectedSection ? 'teach-log-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection(section)}
                    aria-pressed={section === selectedSection}
                  >
                    {section}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>

          <div className="teach-log-cal-toolbar">
            <div className="teach-log-cal-nav">
              <button aria-label="Previous month" onClick={() => shiftMonth(-1)}><IconChevronLeft /></button>
              <span className="teach-log-cal-month">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
              <button aria-label="Next month" onClick={() => shiftMonth(1)} disabled={isCurrentMonth}><IconChevronRight /></button>
            </div>

            <FilterDropdown
              label={subjectLabel}
              options={subjectOptions}
              isChecked={subjectFilter.isChecked}
              onToggle={id => subjectFilter.toggle(id, subjectOptions.map(o => o.id))}
            />

            <FilterDropdown
              label={topicLabel}
              options={topicOptions}
              isChecked={topicFilter.isChecked}
              onToggle={id => topicFilter.toggle(id, topicOptions.map(o => o.id))}
            />
          </div>

          <div className="teach-log-cal-grid-scroll">
            <div className="teach-log-cal-weekdays">
              {WEEKDAYS.map(d => <div key={d} className="teach-log-cal-weekday">{d}</div>)}
            </div>

            <div className="teach-log-cal-grid">
              {monthCells.map(cell => {
                const dayEvents = entriesByDate.get(cell.key) || []
                const taught = dayEvents.length > 0
                const shown = dayEvents.slice(0, 3)
                const overflow = dayEvents.length - shown.length
                const isClickable = onEmptyDayClick && cell.inMonth && !taught && cell.date <= today
                return (
                  <div
                    key={cell.key}
                    className={`teach-log-cal-day ${taught ? 'teach-log-cal-day--taught' : ''} ${!cell.inMonth ? 'teach-log-cal-day--outside' : ''} ${isSameDay(cell.date, today) ? 'teach-log-cal-day--today' : ''} ${isClickable ? 'teach-log-cal-day--clickable' : ''}`}
                    onClick={isClickable ? () => onEmptyDayClick(cell.date) : undefined}
                  >
                    <span className="teach-log-cal-day-num">{cell.date.getDate()}</span>
                    {shown.map(ev => (
                      <div key={ev.topic_id} className="teach-log-cal-chip" title={ev.topic_name}>
                        {ev.topic_name}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="teach-log-cal-more">+{overflow} more</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
