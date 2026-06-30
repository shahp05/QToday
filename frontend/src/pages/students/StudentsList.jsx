import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useProfileStore } from '../../store/profileStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentParentsStore } from '../../store/studentParentsStore'
import './StudentsList.css'

const NO_SECTION = '—'

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

// Placeholder avatar until students can upload their own photo — shows
// initials over the real <img> once photo_url is set, no separate component
// needed since the table only ever needs this one thumbnail size.
function StudentThumbnail({ name, photoUrl }) {
  if (photoUrl) {
    return <img className="students-thumb" src={photoUrl} alt={name} />
  }
  return <span className="students-thumb students-thumb--placeholder">{initials(name)}</span>
}

function IconContact() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16v16H4z" opacity="0" />
      <path d="M3 6l9 6 9-6" />
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  )
}

function IconEmail() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6l9 6 9-6" />
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  )
}

// Only rendered when parent emails exist — hidden entirely otherwise rather
// than shown disabled, since there's nothing useful to click into.
function IconInfo() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeWidth="3" strokeLinecap="round" />
      <line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  )
}

function ParentsPopover({ emails }) {
  const [open, setOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false)
        setShowHint(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  if (emails.length === 0) return null

  const mailtoHref = `mailto:${emails.join(',')}?subject=${encodeURIComponent('QToday')}`

  function handleOpen() {
    if (open) { setOpen(false); setShowHint(false); return }
    const rect = btnRef.current.getBoundingClientRect()
    setPopoverPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
    setOpen(true)
  }

  return (
    <span className="students-contact-wrap">
      <button
        ref={btnRef}
        type="button"
        className="students-contact-btn"
        onClick={handleOpen}
        aria-label="Show parent emails"
      >
        <IconContact />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="students-contact-popover"
          style={{ top: popoverPos.top, right: popoverPos.right }}
        >
          {emails.map(email => (
            <span key={email} className="students-contact-email">
              <span>{email}</span>
            </span>
          ))}
          <div className="students-contact-mailto-row">
            <a className="students-contact-mailto-btn" href={mailtoHref}>
              Send Email
            </a>
            <button
              type="button"
              className="students-contact-info-btn"
              onClick={() => setShowHint(h => !h)}
              aria-label="How to set default email app"
            >
              <IconInfo />
            </button>
          </div>
          {showHint && (
            <span className="students-contact-mailto-hint">
              Opens your default email app. If nothing happens, set your email app as the default for mailto links in your browser settings.
            </span>
          )}
        </div>
      )}
    </span>
  )
}

// Groups the flat students/grades/parents slices into grade -> section ->
// rows, computed here rather than stored, since it's a pure projection of
// the three stores and would otherwise need to be kept in sync by hand.
function useGroupedStudents() {
  const students = useStudentsStore(s => s.students)
  const studentGrades = useStudentGradesStore(s => s.studentGrades)
  const parents = useStudentParentsStore(s => s.parents)

  return useMemo(() => {
    const gradeByStudent = new Map(studentGrades.map(g => [g.student_id, g]))
    const parentsByStudent = new Map()
    for (const p of parents) {
      const list = parentsByStudent.get(p.student_id) ?? []
      list.push(p.email_id)
      parentsByStudent.set(p.student_id, list)
    }

    const grades = new Map() // grade_name -> section -> rows[]
    for (const student of students) {
      const grade = gradeByStudent.get(student.student_id)
      if (!grade) continue
      const gradeName = grade.grade_name
      const section = grade.section || NO_SECTION

      if (!grades.has(gradeName)) grades.set(gradeName, new Map())
      const sections = grades.get(gradeName)
      if (!sections.has(section)) sections.set(section, [])
      sections.get(section).push({
        org_id: student.org_id,
        name: student.name,
        photo_url: student.photo_url,
        parent_emails: parentsByStudent.get(student.student_id) ?? [],
      })
    }

    return [...grades.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gradeName, sections]) => ({
        gradeName,
        sections: [...sections.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([section, rows]) => ({
            section,
            rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
          })),
      }))
  }, [students, studentGrades, parents])
}

export default function StudentsList({ onUploadNew }) {
  const isAdmin = useProfileStore(s => s.is_school_admin)
  const grades = useGroupedStudents()

  const [selectedGrade, setSelectedGrade] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)

  // Default to the first grade/section once data is available, and re-pick
  // if the previously selected grade disappears (e.g. after a re-upload).
  useEffect(() => {
    if (grades.length === 0) return
    if (selectedGrade != null && grades.some(g => g.gradeName === selectedGrade)) return
    setSelectedGrade(grades[0].gradeName)
    setSelectedSection(grades[0].sections[0]?.section ?? null)
  }, [grades, selectedGrade])

  const hasSections = grades.some(g => g.sections.some(s => s.section !== NO_SECTION))
  const currentGrade = grades.find(g => g.gradeName === selectedGrade)
  const currentSection = currentGrade?.sections.find(s => s.section === selectedSection)
  const rows = currentSection?.rows ?? []

  function selectGrade(gradeName) {
    setSelectedGrade(gradeName)
    const grade = grades.find(g => g.gradeName === gradeName)
    setSelectedSection(grade?.sections[0]?.section ?? null)
  }

  return (
    <div className="students-list">
      <div className="students-list-header">
        <h2 className="students-list-title">Students</h2>
        {isAdmin && (
          <button className="students-list-upload-btn" onClick={onUploadNew}>
            Upload new file
          </button>
        )}
      </div>

      <div className="students-filter-bar">
        <div className="students-filter-row">
          {grades.map(({ gradeName, sections }) => (
            <Fragment key={gradeName}>
              <button
                className={`students-grade-pill ${gradeName === selectedGrade ? 'students-grade-pill--active' : ''}`}
                onClick={() => selectGrade(gradeName)}
              >
                {gradeName}
              </button>

              {hasSections && gradeName === selectedGrade && sections.map(({ section }) => (
                <button
                  key={section}
                  className={`students-section-pill ${section === selectedSection ? 'students-section-pill--active' : ''}`}
                  onClick={() => setSelectedSection(section)}
                  aria-pressed={section === selectedSection}
                >
                  {section}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="students-list-body">
        <div className="students-rows">
          {rows.map(row => (
            <div className="students-row" key={row.org_id}>
              <span className="students-row-photo">
                <StudentThumbnail name={row.name} photoUrl={row.photo_url} />
              </span>
              <span className="students-row-id">{row.org_id}</span>
              <span className="students-row-name">{row.name}</span>
              <ParentsPopover emails={row.parent_emails} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
