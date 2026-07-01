import { useState, useRef, useEffect } from 'react'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import './TeachTodayPage.css'

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

export default function TeachTodayPage() {
  const [subject, setSubject] = useState('')
  const [committedSubject, setCommittedSubject] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [topic, setTopic] = useState('')
  const [topicError, setTopicError] = useState(false)
  const [gradeInput, setGradeInput] = useState('')
  const [gradeError, setGradeError] = useState(false)
  const [gradeErrorMsg, setGradeErrorMsg] = useState('')

  const [topicShaking, shakeTopic] = useShake()
  const [gradeShaking, shakeGrade] = useShake()

  const studentGrades = useStudentGradesStore(s => s.studentGrades)

  const availableGrades = [...new Set(
    studentGrades.filter(g => g.is_active).map(g => g.grade_name)
  )].sort((a, b) => a - b)

  const customerHasSections = studentGrades.some(g => g.is_active && g.section)

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

  const showButton = topic.trim() !== '' && gradeInput.trim() !== ''

  const buttonLabel = (() => {
    if (!gradeValid) return 'Generate Questions'
    const g = parsed.grade
    const s = (customerHasSections && gradeHasSections && parsed.section) ? ` ${parsed.section}` : ''
    return `Generate Questions for ${g}${s}`
  })()

  const subjectRef = useRef(null)

  useEffect(() => { subjectRef.current?.focus() }, [])

  function handleGradeBlur() {
    if (!gradeInput.trim()) return
    if (!gradeValid) {
      setGradeErrorMsg(`Grade "${gradeInput.trim()}" is not recognised.`)
      setGradeError(true)
      shakeGrade()
    } else if (!sectionValid) {
      setGradeErrorMsg(`Section "${parsed.section}" does not exist in Grade ${parsed.grade}.`)
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

  function handleGenerate() {
    let hasError = false

    if (!topic.trim()) {
      setTopicError(true)
      shakeTopic()
      hasError = true
    }

    if (!gradeInput.trim() || !gradeValid) {
      setGradeError(true)
      if (gradeInput.trim() && !gradeValid)
        setGradeErrorMsg(`Grade "${gradeInput.trim()}" is not recognised.`)
      shakeGrade()
      hasError = true
    } else if (!sectionValid) {
      setGradeErrorMsg(`Section "${parsed.section}" does not exist in Grade ${parsed.grade}.`)
      setGradeError(true)
      shakeGrade()
      hasError = true
    }

    if (hasError) return
    // TODO: submit
  }

  return (
    <div className="teach-today">

      <div className="teach-today-content">

        <div className="teach-today-row">
          <label className="teach-today-label">Which subject did you teach today?</label>
          <input
            ref={subjectRef}
            className="teach-today-input"
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
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
                  placeholder={customerHasSections ? 'e.g. 9B or 9 B' : 'e.g. 9'}
                />
              </div>
            </div>

            {gradeError && gradeErrorMsg && (
              <div className="teach-today-row">
                <p className="teach-today-error">{gradeErrorMsg}</p>
              </div>
            )}

            {showButton && (
              <div className="teach-today-row">
                <button className="teach-today-btn" onClick={handleGenerate}>
                  {buttonLabel}
                </button>
                <p className="teach-today-note">
                  The questions will auto create assignments for students to practice.
                  Their score will tell you which students have understood the topic and those who need help.
                </p>
              </div>
            )}

          </>
        )}

      </div>

      <div className="teach-today-arrow-row">
        <button
          className="teach-today-arrow-btn"
          onClick={() => { if (subject.trim()) { setCommittedSubject(subject.trim()); setShowDetails(true) } else { subjectRef.current?.focus() } }}
          aria-label="Continue"
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
