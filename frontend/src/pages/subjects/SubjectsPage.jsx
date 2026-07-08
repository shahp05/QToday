import { useState, useRef, useEffect } from 'react'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useProfileStore } from '../../store/profileStore'
import { fetchOrGenerateQA } from '../../services/qaService'
import './SubjectsPage.css'

function useShake() {
  const [shaking, setShaking] = useState(false)
  const timer = useRef(null)
  function shake() {
    clearTimeout(timer.current)
    setShaking(true)
    timer.current = setTimeout(() => setShaking(false), 450)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return [shaking, shake]
}

// Parse a free-form "grade [section]" string using store data for maximum accuracy.
// Strategy:
//   1. Find all 1–2 digit numbers in the input; prefer one that matches a known grade.
//   2. Strip known noise words (grade, class, std, section, sec, div, …).
//   3. Collect remaining alphabetic tokens; match them against known sections for
//      the resolved grade (case-insensitive). Fall back to the first short alpha
//      token if no store match.
function parseGradeSection(raw, availableGrades, studentGrades) {
  if (!raw.trim()) return { grade: null, section: null }

  // Strip noise words first
  const cleaned = raw.replace(/\b(grade|class|std|standard|section|sec|div|division)\b/gi, ' ')

  // Extract all 1–2 digit numbers (handles glued patterns like "10a", "9B")
  const nums = [...cleaned.matchAll(/(\d{1,2})/g)].map(m => Number(m[1]))

  // Prefer a number that matches a known grade; fallback to first number found
  const grade = nums.find(n => availableGrades.includes(n)) ?? nums[0] ?? null

  // Known sections for this grade from store
  const knownSections = grade !== null
    ? [...new Set(
        studentGrades
          .filter(g => g.is_active && g.grade_name === grade && g.section)
          .map(g => g.section)
      )]
    : []

  // Remove the grade digits and collect remaining alphabetic tokens
  // Replace only the first occurrence of those digit(s) to avoid eating a section like "11"→"1"
  const afterGrade = grade !== null
    ? cleaned.replace(String(grade), ' ')
    : cleaned
  const tokens = afterGrade.replace(/[^a-zA-Z]/g, ' ').trim().split(/\s+/).filter(Boolean)

  // Match tokens against known sections first (case-insensitive)
  let section = null
  for (const token of tokens) {
    const match = knownSections.find(s => s.toLowerCase() === token.toLowerCase())
    if (match) { section = match; break }
  }

  // Fallback: first short alpha token (1–3 chars) as a section candidate
  if (!section && tokens.length > 0) {
    const candidate = tokens.find(t => /^[a-zA-Z]{1,3}$/.test(t))
    if (candidate) section = candidate.toUpperCase()
  }

  return { grade, section }
}

// Builds a section error that always shows a real example section for this
// grade (from the store), rather than a hardcoded or missing placeholder.
function buildSectionErrorMsg(grade, section, gradeSections) {
  const example = `${grade}${gradeSections[0]}`
  if (!section) return `Enter section also (e.g. ${example})`
  return `Section ${section} does not exist in Grade ${grade} (e.g. ${example})`
}

export default function SubjectsPage({ onShowList, onGenerated }) {
  const [subject, setSubject] = useState('')
  const [subjectError, setSubjectError] = useState(false)
  const [committedSubject, setCommittedSubject] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [topic, setTopic] = useState('')
  const [topicError, setTopicError] = useState(false)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeError, setGradeError] = useState(false)
  const [gradeErrorMsg, setGradeErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [warning, setWarning] = useState('')

  const subjectsTaught = useSubjectsTaughtStore(s => s.subjects)
  const refetchSubjectsTaught = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const topicsCoveredCount = subjectsTaught.reduce((acc, subject) => acc + subject.topics.length, 0)

  const [subjectShaking, shakeSubject] = useShake()
  const [topicShaking, shakeTopic] = useShake()
  const [gradeShaking, shakeGrade] = useShake()

  const studentGrades = useStudentGradesStore(s => s.studentGrades)
  const customerAcronym = useProfileStore(s => s.customer_acronym)

  const availableGrades = [...new Set(
    studentGrades.filter(g => g.is_active).map(g => g.grade_name)
  )].sort((a, b) => a - b)

  const customerHasSections = studentGrades.some(g => g.is_active && g.section)

  const gradePlaceholder = (() => {
    const example = studentGrades.find(g => g.is_active && g.grade_name && g.section)
    if (example) return `e.g. ${example.grade_name}${example.section}`
    const gradeOnly = studentGrades.find(g => g.is_active && g.grade_name)
    if (gradeOnly) return `e.g. ${gradeOnly.grade_name}`
    return 'e.g. 9'
  })()

  const parsed = parseGradeSection(gradeInput, availableGrades, studentGrades)
  const gradeValid = parsed.grade !== null && availableGrades.includes(parsed.grade)

  const gradeSections = gradeValid
    ? [...new Set(
        studentGrades
          .filter(g => g.is_active && g.grade_name === parsed.grade && g.section)
          .map(g => g.section)
      )]
    : []
  const gradeHasSections = gradeSections.length > 0

  // Section is valid if: the grade has no sections, OR the parsed section matches a known one
  const sectionValid = !gradeHasSections ||
    (parsed.section !== null &&
      gradeSections.some(s => s.toLowerCase() === parsed.section.toLowerCase()))

  const subjectRef = useRef(null)

  useEffect(() => { subjectRef.current?.focus() }, [])

  function handleNext() {
    if (!subject.trim()) {
      setSubjectError(true)
      shakeSubject()
      subjectRef.current?.focus()
      return
    }
    setSubjectError(false)
    setCommittedSubject(subject.trim())
    setShowDetails(true)
  }

  function handleGradeBlur() {
    if (!gradeInput.trim()) return
    if (!gradeValid) {
      setGradeErrorMsg(`No grade ${parsed.grade ?? gradeInput.trim()} students in ${customerAcronym}`)
      setGradeError(true)
      shakeGrade()
    } else if (!sectionValid) {
      setGradeErrorMsg(buildSectionErrorMsg(parsed.grade, parsed.section, gradeSections))
      setGradeError(true)
      shakeGrade()
    } else {
      setGradeError(false)
      setGradeErrorMsg('')
    }
  }

  function handleGradeChange(e) {
    setGradeInput(e.target.value)
    setGradeError(false)
    setGradeErrorMsg('')
  }

  async function handleGenerate() {
    let hasError = false

    if (!topic.trim()) {
      setTopicError(true)
      shakeTopic()
      hasError = true
    }

    if (!gradeInput.trim() || !gradeValid) {
      setGradeError(true)
      if (gradeInput.trim() && !gradeValid)
        setGradeErrorMsg(`No grade ${parsed.grade ?? gradeInput.trim()} students in ${customerAcronym}`)
      shakeGrade()
      hasError = true
    } else if (!sectionValid) {
      setGradeErrorMsg(buildSectionErrorMsg(parsed.grade, parsed.section, gradeSections))
      setGradeError(true)
      shakeGrade()
      hasError = true
    }

    if (hasError) return

    setSubmitError('')
    setWarning('')
    setSubmitting(true)
    try {
      const data = await fetchOrGenerateQA({
        subjectName: committedSubject,
        topicName: topic.trim(),
        grade: parsed.grade,
        section: (customerHasSections && gradeHasSections) ? parsed.section : null,
      })
      await refetchSubjectsTaught()
      if (data.items.length > 0) {
        onGenerated?.({ subjectId: data.subject_id, topicId: data.topic_id, gradeId: data.grade_id })
      } else {
        setWarning(data.warning || '')
      }
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleArrowClick() {
    if (showDetails) {
      handleGenerate()
    } else {
      handleNext()
    }
  }

  return (
    <div className="teach-today">

      <div className="teach-today-content">

        <div className={`teach-today-row${subjectShaking ? ' ui-shake' : ''}`}>
          <div className="teach-today-header">
            <label className="teach-today-label">Which subject did you teach today?</label>
            {onShowList && topicsCoveredCount > 0 && (
              <button className="teach-today-list-btn" onClick={onShowList}>
                Topics Covered
                <span className="teach-today-list-count">{topicsCoveredCount}</span>
              </button>
            )}
          </div>
          <input
            ref={subjectRef}
            className={`teach-today-input${subjectError ? ' teach-today-input--error' : ''}`}
            type="text"
            value={subject}
            onChange={e => { setSubject(e.target.value); setSubjectError(false) }}
            onKeyDown={e => { if (e.key === 'Enter') handleNext() }}
            placeholder="e.g. Mathematics"
          />
        </div>

        {showDetails && (
          <>
            <div className="teach-today-row teach-today-row--inline">
              <div className={`teach-today-field${topicShaking ? ' ui-shake' : ''}`}>
                <label className="teach-today-label">Which topic in {committedSubject}?</label>
                <input
                  className={`teach-today-input${topicError ? ' teach-today-input--error' : ''}`}
                  type="text"
                  value={topic}
                  onChange={e => { setTopic(e.target.value); setTopicError(false) }}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
                  placeholder="e.g. Quadratic Equations"
                />
              </div>
              <div className={`teach-today-field teach-today-field--grade${gradeShaking ? ' ui-shake' : ''}`}>
                <label className="teach-today-label">Grade</label>
                <input
                  className={`teach-today-input${gradeError ? ' teach-today-input--error' : ''}`}
                  type="text"
                  value={gradeInput}
                  onChange={handleGradeChange}
                  onBlur={handleGradeBlur}
                  onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
                  placeholder={gradePlaceholder}
                />
              </div>
            </div>

            {gradeError && gradeErrorMsg && (
              <div className="teach-today-row">
                <p className="teach-today-error">{gradeErrorMsg}</p>
              </div>
            )}

            {submitError && (
              <div className="teach-today-row">
                <p className="teach-today-error">{submitError}</p>
              </div>
            )}

            {warning && (
              <div className="teach-today-row">
                <p className="teach-today-warning">{warning}</p>
              </div>
            )}

          </>
        )}

      </div>

      <div className="teach-today-arrow-row">
        <button
          className="teach-today-arrow-btn"
          onClick={handleArrowClick}
          disabled={submitting}
          aria-label={showDetails ? 'Generate Questions' : 'Continue'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>

    </div>
  )
}
