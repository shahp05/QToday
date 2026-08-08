import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useProfileStore } from '../../store/profileStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentParentsStore } from '../../store/studentParentsStore'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useClassQuizProgressStore } from '../../store/classQuizProgressStore'
import { topicSummaryStatus } from '../../lib/topicStatus'
import { resolveFileUrl } from '../../lib/api'
import { uploadMyPhoto, uploadStudentPhoto } from '../../services/photoService'
import EditablePhoto from '../../components/EditablePhoto'
import { Toast } from '../../components/ui/Toast'
import PageHeader from '../../components/PageHeader'
import './StudentsList.css'

const NO_SECTION = '—'

// Same bands/wording as StudentProgressChart's legend (subjects page), plus
// a 4th 'not played' band that chart doesn't need — kept local rather than
// shared since the two legends live on otherwise-unrelated components.
const STATUS_LEGEND_BANDS = [
  { label: '75% or more', color: 'var(--color-green-light)' },
  { label: '40-75%', color: 'var(--color-yellow)' },
  { label: 'Below 40%', color: 'var(--color-red)' },
  { label: 'Not played', color: 'var(--color-grey-light)' },
]

function StatusLegend() {
  return (
    <div className="students-status-legend">
      {STATUS_LEGEND_BANDS.map(band => (
        <span key={band.label} className="students-status-legend-item">
          <span className="students-status-legend-swatch" style={{ background: band.color }} />
          {band.label}
        </span>
      ))}
    </div>
  )
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

    const grades = new Map() // grade_name -> { gradeId, sections: section -> rows[] }
    for (const student of students) {
      const grade = gradeByStudent.get(student.student_id)
      if (!grade) continue
      const gradeName = grade.grade_name
      const section = grade.section || NO_SECTION

      if (!grades.has(gradeName)) grades.set(gradeName, { gradeId: grade.grade_id, sections: new Map() })
      const { sections } = grades.get(gradeName)
      if (!sections.has(section)) sections.set(section, [])
      sections.get(section).push({
        student_id: student.student_id,
        grade_id: grade.grade_id,
        org_id: student.org_id,
        name: student.name,
        photo_url: student.photo_url,
        parent_emails: parentsByStudent.get(student.student_id) ?? [],
      })
    }

    return [...grades.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gradeName, { gradeId, sections }]) => ({
        gradeName,
        gradeId,
        sections: [...sections.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([section, rows]) => ({
            section,
            rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
          })),
      }))
  }, [students, studentGrades, parents])
}

export default function StudentsList({
  onUploadNew, onBack, onSubjectClick, loadingChip,
  selectedGrade, onSelectedGradeChange, selectedSection, onSelectedSectionChange,
}) {
  const isAdmin = useProfileStore(s => s.is_school_admin)
  const isSchoolTeacher = useProfileStore(s => s.is_school_teacher)
  const isStudentViewer = useProfileStore(s => s.is_student)
  const grades = useGroupedStudents()

  // Not fetched here — Dashboard.jsx already kicks this off once per
  // session on /dashboard mount, and this component just reads whatever's
  // in the store (loading/loaded/error handled there, not per-page).
  const subjectsTaught = useSubjectsTaughtStore(s => s.subjects)
  const progressByStudent = useClassQuizProgressStore(s => s.progressByStudent)
  const fetchClassProgress = useClassQuizProgressStore(s => s.fetchClassProgress)
  const updateStudentPhoto = useStudentsStore(s => s.updateStudentPhoto)

  const [photoError, setPhotoError] = useState('')
  // A teacher/admin may set any visible student's photo; a student viewer
  // only ever sees their own single row (students_query_service.py scopes
  // it that way server-side), so this one flag covers every row for them.
  const canEditPhoto = isAdmin || isSchoolTeacher || isStudentViewer

  async function handlePhotoUpload(studentId, file) {
    const data = isStudentViewer
      ? await uploadMyPhoto(file)
      : await uploadStudentPhoto(studentId, file)
    updateStudentPhoto(studentId, data.photo_url)
  }

  // Default to the first grade/section once data is available, and re-pick
  // if the previously selected grade disappears (e.g. after a re-upload).
  // Done directly during render (not in an effect) since the guard clauses
  // above already make repeated calls a no-op — a state adjustment, not a
  // sync with an external system.
  if (grades.length > 0 && !(selectedGrade != null && grades.some(g => g.gradeName === selectedGrade))) {
    onSelectedGradeChange(grades[0].gradeName)
    onSelectedSectionChange(grades[0].sections[0]?.section ?? null)
  }

  const hasSections = grades.some(g => g.sections.some(s => s.section !== NO_SECTION))
  const currentGrade = grades.find(g => g.gradeName === selectedGrade)
  const currentSection = currentGrade?.sections.find(s => s.section === selectedSection)
  const rows = currentSection?.rows ?? []

  // Refetches whenever the visible grade/section (and therefore its student
  // roster) changes — keyed on the actual id list, not just selectedGrade/
  // selectedSection, so a roster edit within the same grade/section refetches too.
  const rowStudentIdsKey = rows.map(r => r.student_id).join(',')
  useEffect(() => {
    if (rows.length > 0) fetchClassProgress(rows.map(r => r.student_id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowStudentIdsKey, fetchClassProgress])

  // Every subject taught to this grade, with just the topic ids each row
  // needs to count against — filtered from the school-wide subjects-taught
  // tree (whole-school scope for a teacher/admin, see list_subjects_taught)
  // down to whichever grade is currently selected.
  const gradeSubjects = useMemo(() => {
    if (currentGrade?.gradeId == null) return []
    return subjectsTaught
      .map(subject => ({
        subject_id: subject.subject_id,
        subject_name: subject.subject_name,
        topicIds: subject.topics
          .filter(topic => topic.grades.some(g => g.grade_id === currentGrade.gradeId))
          .map(topic => topic.topic_id),
      }))
      .filter(subject => subject.topicIds.length > 0)
  }, [subjectsTaught, currentGrade])

  function subjectChipsForStudent(studentId) {
    const statsByTopic = progressByStudent[studentId]
    return gradeSubjects.map(subject => {
      const counts = { green: 0, amber: 0, red: 0, none: 0 }
      for (const topicId of subject.topicIds) {
        const stats = statsByTopic?.[topicId]
        counts[stats ? topicSummaryStatus(stats) : 'none']++
      }
      return { subject_id: subject.subject_id, subject_name: subject.subject_name, ...counts }
    })
  }

  function selectGrade(gradeName) {
    onSelectedGradeChange(gradeName)
    const grade = grades.find(g => g.gradeName === gradeName)
    onSelectedSectionChange(grade?.sections[0]?.section ?? null)
  }

  return (
    <div className="students-list">
      <PageHeader
        title="Students"
        onBack={onBack}
        actions={isAdmin && (
          <button className="students-list-upload-btn" onClick={onUploadNew}>
            Upload new file
          </button>
        )}
        filter={(
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
                      onClick={() => onSelectedSectionChange(section)}
                      aria-pressed={section === selectedSection}
                    >
                      {section}
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>
            <StatusLegend />
          </div>
        )}
      />

      <div className="students-list-body">
        <div className="students-rows">
          {rows.map(row => {
            const subjectChips = subjectChipsForStudent(row.student_id)
            const isRowLoading = loadingChip?.studentId === row.student_id
            return (
              <div className="students-row" key={row.org_id}>
                <div className="students-row-top">
                  <span className="students-row-photo">
                    <EditablePhoto
                      editable={canEditPhoto}
                      thumbClassName="students-thumb"
                      placeholderClassName="students-thumb--placeholder"
                      name={row.name}
                      photoUrl={resolveFileUrl(row.photo_url)}
                      onUpload={file => handlePhotoUpload(row.student_id, file)}
                      onError={setPhotoError}
                    />
                  </span>
                  <span className="students-row-id">{row.org_id}</span>
                  <span className="students-row-name">{row.name}</span>
                  <ParentsPopover emails={row.parent_emails} />
                </div>
                {subjectChips.length > 0 && (
                  <div className="students-row-status">
                    {subjectChips.map(chip => {
                      return (
                        <span
                          className="students-subject-chip students-subject-chip--clickable"
                          key={chip.subject_id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSubjectClick?.(row, chip.subject_id)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSubjectClick?.(row, chip.subject_id) } }}
                        >
                          <span className="students-subject-chip-name">{chip.subject_name}</span>
                          <span className="students-status-count students-status-count--green">{chip.green}</span>
                          <span className="students-status-count students-status-count--amber">{chip.amber}</span>
                          <span className="students-status-count students-status-count--red">{chip.red}</span>
                          <span className="students-status-count students-status-count--none">{chip.none}</span>
                        </span>
                      )
                    })}
                  </div>
                )}

                {isRowLoading && (
                  <div className="students-row-overlay">
                    <span className="students-row-spinner" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Toast message={photoError} onDismiss={() => setPhotoError('')} />
    </div>
  )
}
